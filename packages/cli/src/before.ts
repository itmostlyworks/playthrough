// Before is the app as it was before the work. It's kept as a commit when it's recorded, with whatever wasn't committed
// yet, so a flow the agent adds later can be recorded on it too. That happens in the agent's own working copy, the one
// copy known to run: its env files, installed packages and local data stay as they are, since git leaves what it ignores
// alone. The agent's work is set aside with git stash meanwhile, and put back after, even when recording fails or
// Vantage is stopped.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { list, quote, Refused, type Flow } from "@vantage/review";
import { failedAt, runFlows } from "./flows.ts";
import type { Failed } from "./reporter.ts";
import type { Repo } from "./repo.ts";

// Keeps what the working copy holds as a commit, with whatever isn't committed yet, through an index of its own so what
// the agent staged stays as it was. A ref keeps the commit, so git never cleans it away. Outside git, there's none.
export function keepBefore(repo: Repo, id: string): string | undefined {
  if (!attempt(() => git(repo, ["rev-parse", "--is-inside-work-tree"]))) return undefined;
  const folder = mkdtempSync(join(tmpdir(), "vantage-"));
  try {
    const index = join(folder, "index");
    // Starting from the agent's index, git only reads the files that changed.
    attempt(() => copyFileSync(resolve(repo.root, git(repo, ["rev-parse", "--git-path", "index"])), index));
    const env = { ...process.env, GIT_INDEX_FILE: index, ...VANTAGE };
    git(repo, ["add", "--all", ":/"], env);
    const tree = git(repo, ["write-tree"], env);
    const head = attempt(() => git(repo, ["rev-parse", "--verify", "--quiet", "HEAD"]));
    const commit = git(repo, ["commit-tree", "--no-gpg-sign", ...(head ? ["-p", head] : []), "-m", `Before, of the review ${id}: the app as it was, with what wasn't committed`, tree], env);
    git(repo, ["update-ref", `refs/vantage/${id}/before`, commit]);
    return commit;
  } catch (error) {
    throw new Refused(["Before can't be kept as a commit, because git says:", `  ${said(error)}`, "Fix that and run this again."]);
  } finally {
    rmSync(folder, { recursive: true });
  }
}

// The commit is Vantage's, whoever's git this is.
const VANTAGE = { GIT_AUTHOR_NAME: "Vantage", GIT_AUTHOR_EMAIL: "vantage@localhost", GIT_COMMITTER_NAME: "Vantage", GIT_COMMITTER_EMAIL: "vantage@localhost" };

// Each flow Before hasn't been tried on is recorded on it too, as far as the app as it was can take it, so every flow is
// compared with how the app was. Where the app as it was can't start one, Before says so, and it isn't tried again.
export async function recordOnBefore(repo: Repo, id: string, number: number, flows: string[]) {
  const before = (await repo.reviews.get(id)).rounds.find((round) => round.number === 0);
  if (!before) return;
  const later = flows.filter((name) => !before.flows.some((flow) => flow.name === name) && !before.cantStart?.includes(name));
  if (!later.length) return;
  const named = list(later.map(quote));
  const [are, have, they] = later.length > 1 ? ["are", "have", "they're"] : ["is", "has", "it's"];
  if (!before.commit) return console.log(`\n${named} ${have} no Before: Before wasn't kept as a commit, so the app as it was can't be put back.`);
  // Left running, the agent's own server would go on serving its work, not the app as it was.
  const { url } = await repo.app();
  if (await serving(url))
    throw new Refused([
      `Round ${number} wasn't recorded: ${named} ${are} new, so ${they} recorded on Before too, and Vantage starts the app as it was itself, on ${url}. Something is serving there already: stop it, then record again.`,
    ]);

  console.log(`\n${named} ${are} new, so ${they} recorded on Before too. Your work is set aside with git stash meanwhile.`);
  const taken = before.flows.map((flow) => flow.recording);
  // An app as it was that doesn't start, for the reason Playwright gives, can't start any of them.
  const ran = await asItWas(repo, number, before.commit, () =>
    runFlows(repo, id, 0, { flows: later, taken }).catch((error) => {
      if (error instanceof Refused) return { recorded: [], failed: later.map((flow) => ({ flow })) };
      throw error;
    }),
  );
  refuseIfBroken(ran.failed, `Round ${number} wasn't recorded`, "Record again.");
  await repo.reviews.addToBefore(id, { flows: ran.recorded.map(({ flow }) => flow), cantStart: cantStart(ran.recorded, ran.failed), files: ran.recorded.flatMap(({ files }) => files) });
  for (const line of howFar(ran.recorded, ran.failed, "the app as it was")) console.log(line);
}

// A flow the browser stopped, not the app, says nothing about how far the app goes, so nothing of the run is kept, and
// recording again tries again.
export function refuseIfBroken(failed: Failed[], unrecorded: string, again: string) {
  const broken = failed.filter((failure) => failure.broken);
  if (broken.length)
    throw new Refused([`${unrecorded}, because the browser stopped ${broken.length > 1 ? "these flows" : "a flow"}, not the app:`, ...broken.map(failedAt), `Playwright says why above. ${again}`]);
}

// The flows Before has nothing of: they didn't take a step.
export const cantStart = (recorded: { flow: Flow }[], failed: Failed[]) =>
  failed.map(({ flow }) => flow).filter((flow) => !recorded.some((kept) => kept.flow.name === flow));

// How far Before goes with each flow that didn't run to its end on the app as it is, or was.
export function howFar(recorded: { flow: Flow }[], failed: Failed[], app: string): string[] {
  return failed.map(({ flow, at }) =>
    !recorded.some((kept) => kept.flow.name === flow)
      ? `${quote(flow)} can't start on ${app}, so it has no Before.`
      : `${quote(flow)} ${at ? `stops at ${quote(at)}, which ${app} can't do` : "stops after its last step"}, so its Before goes as far as that.`,
  );
}

// Where the agent's work is while the working copy holds the app as it was: the branch or commit to come back to, the
// stash it's set aside in, by its message, and the command that set it aside.
type SetAside = { back: string; stash: string; by: number };
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

// The working copy holds the app as it was while `run` runs, then the agent's work again. Where the work is goes in
// .vantage/ first, so if Vantage is stopped halfway the next command puts it back; stopped by a signal, it puts it back
// itself before it ends.
async function asItWas<T>(repo: Repo, number: number, commit: string, run: () => Promise<T>): Promise<T> {
  await repo.keepOutOfGit();
  const aside: SetAside = { back: here(repo), stash: `Vantage: your work, set aside while flows record on Before, ${new Date().toISOString()}`, by: process.pid };
  writeFileSync(repo.setAside, JSON.stringify(aside));
  // Listened for until the work is back, so a second signal can't end it halfway.
  let stopping = false;
  const stopped = (signal: (typeof SIGNALS)[number]) => {
    if (stopping) return;
    stopping = true;
    const problem = putWorkBack(repo, aside, true);
    console.error(problem ? stillAside(repo, aside, problem).message : "\nStopped, with your work back.");
    process.exit(128 + constants.signals[signal]);
  };
  for (const signal of SIGNALS) process.on(signal, stopped);
  let moved = false;
  try {
    try {
      git(repo, ["stash", "push", "--include-untracked", "--message", aside.stash]);
      git(repo, ["checkout", "--quiet", "--detach", commit]);
      moved = true;
    } catch (error) {
      throw new Refused([`Round ${number} wasn't recorded: git couldn't put the app as it was in place, because it says:`, `  ${said(error)}`, "Fix that, then record again."]);
    }
    return await run();
  } finally {
    for (const signal of SIGNALS) process.off(signal, stopped);
    // What the app as it was wrote into files git keeps goes: the agent's own changes are in the stash.
    const problem = putWorkBack(repo, aside, true);
    if (problem) throw stillAside(repo, aside, problem);
    if (moved) console.log("Your work is back.");
  }
}

// A command that finds the work still set aside, by one that was stopped halfway, puts it back before anything else.
// Stopped hard, it can leave the app as it was serving, which the next round mustn't be recorded on.
export async function putBack(repo: Repo) {
  const aside: SetAside | undefined = attempt(() => JSON.parse(readFileSync(repo.setAside, "utf8")));
  if (!aside || running(aside.by)) return;
  const toDo = here(repo) !== aside.back || !!stashOf(repo, aside);
  const problem = putWorkBack(repo, aside, false);
  if (problem) throw stillAside(repo, aside, problem);
  if (!toDo) return;
  const back = `Vantage was stopped while your work was set aside for a flow to record on Before. It's back now, on ${aside.back}.`;
  const url = (await repo.app().catch(() => undefined))?.url;
  if (url && (await serving(url))) throw new Refused([back, `Something is still serving ${url}, most likely the app as it was, left running: stop it, then run this again.`]);
  console.log(`${back}\n`);
}

// Back on its branch or commit, then what was set aside, each only if it's still to do, so it's right to run again. Forced,
// whatever the app as it was changed in the files git keeps is let go. Says what git said, if it couldn't.
function putWorkBack(repo: Repo, aside: SetAside, force: boolean): string | undefined {
  try {
    if (here(repo) !== aside.back) git(repo, ["checkout", "--quiet", ...(force ? ["--force"] : []), aside.back]);
    const stash = stashOf(repo, aside);
    if (stash) git(repo, ["stash", "pop", "--index", "--quiet", stash]);
    rmSync(repo.setAside, { force: true });
  } catch (error) {
    return said(error);
  }
}

function stillAside(repo: Repo, aside: SetAside, problem: string): Refused {
  const stash = stashOf(repo, aside);
  return new Refused([
    "Your work is still set aside, from recording a flow on Before, and git couldn't put it back by itself, because it says:",
    `  ${problem}`,
    `Put it back with git checkout ${aside.back}${stash ? `, then git stash pop --index ${stash}` : ""}. Vantage carries on once it's back.`,
  ]);
}

// The branch the working copy is on, or the commit if it's on none.
const here = (repo: Repo) => attempt(() => git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])) ?? git(repo, ["rev-parse", "HEAD"]);

// The stash the work was set aside in, as git names it now, while it's there.
function stashOf(repo: Repo, aside: SetAside): string | undefined {
  const stashes = git(repo, ["stash", "list", "--format=%gd %gs"]).split("\n");
  return stashes.find((stash) => stash.endsWith(aside.stash))?.split(" ")[0];
}

// Whether anything answers there.
const serving = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(2000) }).then(
    (response) => (response.body?.cancel(), true),
    () => false,
  );

function running(pid: number): boolean {
  try {
    return process.kill(pid, 0);
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}

function git(repo: Repo, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, { cwd: repo.root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// What git said, in its own words: the first line it wrote.
const said = (error: unknown) => {
  const { stderr, message } = error as { stderr?: string; message?: string };
  return (stderr || message || "").trim().split("\n")[0]!;
};

function attempt<T>(act: () => T): T | undefined {
  try {
    return act();
  } catch {
    return undefined;
  }
}
