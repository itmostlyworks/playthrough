// Before is the app as it was before the work, for the person: this moment as it was, beside how it is now, so the
// difference is the change. It's kept as a commit when the review starts, with whatever wasn't committed yet, and each
// flow is recorded on it with the round it's first recorded in, as far as the app as it was takes it, doing what the round
// does, step by step. That happens in the agent's own working copy, the one copy known to run: its env files, installed
// packages and local data stay as they are, since git leaves what it ignores alone. The agent's work is set aside with
// git stash meanwhile, and put back after, even when recording fails or Playthrough is stopped. It's recorded on whatever
// serves the app, as every round is: a server already running follows the working copy, as a dev server does, so for that
// minute it serves the app as it was, and one Playthrough started is started again on it. There, playthrough/ is as it is
// now: it goes with the flows, not with the work.

import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Refused, type Flow, type Review } from "@playthrough/review";
import { serves, stopApp } from "./app.ts";
import { called, failedAt, runFlows, type Ran } from "./flows.ts";
import type { Failed } from "./reporter.ts";
import type { Repo } from "./repo.ts";
import { writtenNow } from "./try-setup.ts";

// Keeps what the working copy holds as a commit, with whatever isn't committed yet, through an index of its own so what
// the agent staged stays as it was. A ref keeps the commit, so git never cleans it away. Outside git, or before the repo
// has a commit, there's none: git can set the work aside to put the app as it was back only once it has one.
export function keepBefore(repo: Repo, id: string): string | undefined {
  if (!attempt(() => git(repo, ["rev-parse", "--is-inside-work-tree"]))) return undefined;
  const head = headOf(repo);
  if (!head) return undefined;
  try {
    const commit = git(repo, ["commit-tree", "--no-gpg-sign", "-p", head, "-m", `Before, of the review ${id}: the app as it was, with what wasn't committed`, treeNow(repo)], { ...process.env, ...PLAYTHROUGH });
    git(repo, ["update-ref", `refs/playthrough/${id}/before`, commit]);
    return commit;
  } catch (error) {
    throw new Refused(["Before can't be kept as a commit, because git says:", `  ${said(error)}`, "Fix that and run this again."]);
  }
}

// What the working copy holds, committed or not, as a git tree, through an index of its own so what the agent staged
// stays as it was. Starting from the agent's index, git only reads the files that changed.
function treeNow(repo: Repo): string {
  const folder = mkdtempSync(join(tmpdir(), "playthrough-"));
  try {
    const index = join(folder, "index");
    attempt(() => copyFileSync(resolve(repo.root, git(repo, ["rev-parse", "--git-path", "index"])), index));
    git(repo, ["add", "--all", ":/"], { ...process.env, GIT_INDEX_FILE: index });
    return git(repo, ["write-tree"], { ...process.env, GIT_INDEX_FILE: index });
  } finally {
    rmSync(folder, { recursive: true });
  }
}

// The commit is Playthrough's, whoever's git this is.
const PLAYTHROUGH = { GIT_AUTHOR_NAME: "Playthrough", GIT_AUTHOR_EMAIL: "playthrough@localhost", GIT_COMMITTER_NAME: "Playthrough", GIT_COMMITTER_EMAIL: "playthrough@localhost" };

// Whether a round the flow is in has been handed over: it's been compared with Before then, and Before keeps it as it is.
export const handedOver = (review: Review, flow: string) => review.rounds.some((round) => round.number > 0 && round.finished && round.flows.some((kept) => kept.name === flow));

// The round's flows are recorded on Before too, each doing what the round did, as far as the app as it was takes it: so
// every flow is compared with how the app was along its own way. Until its round is handed over, a flow's Before follows
// it, recorded again once its file, playthrough/ or what the round does has changed, and one that's gone goes from Before.
export async function recordOnBefore(repo: Repo, id: string, number: number, { recorded, written }: Ran) {
  const review = await repo.reviews.get(id);
  const before = review.rounds.find((round) => round.number === 0);
  if (!before) return;
  const ran: Record<string, string> = await readFile(repo.ranOnBefore(id), "utf8").then(JSON.parse).catch(() => ({}));
  // What its Before follows: the flow's file as it ran, what every flow starts from, and what the round did.
  const setup = await writtenNow(repo);
  const follows = Object.fromEntries(recorded.map(({ flow, doneOn }) => [flow.name, createHash("sha256").update(JSON.stringify([written[flow.name]?.hash, setup, doneOn ?? {}])).digest("hex")]));
  const on = [...before.flows.map((flow) => flow.name), ...(before.cantStart ?? [])];
  const flows = recorded.filter(({ flow }) => !on.includes(flow.name) || (!handedOver(review, flow.name) && ran[flow.name] !== follows[flow.name]));
  const gone = on.filter((name) => !handedOver(review, name) && !recorded.some(({ flow }) => flow.name === name));
  if (!flows.length && !gone.length) return;

  const names = flows.map(({ flow }) => flow.name);
  const unrecorded = `Round ${number} wasn't recorded`;
  const why = !before.commit ? "Before wasn't kept as a commit, so the app as it was can't be put back" : !headOf(repo) ? UNBORN : undefined;
  if (why) return void (names.length && console.log(`\n${called(names)} ${names.length > 1 ? "have" : "has"} no Before: ${why}.`));
  // Named apart from every recording Before holds, one a flow recorded again no longer uses among them.
  const taken = await repo.reviews.files(id, 0);
  const doneInRound = Object.fromEntries(flows.map(({ flow, doneOn }) => [flow.name, doneOn ?? {}]));
  // An app as it was that doesn't start, for the reason Playwright gives, can't start any of them.
  const run = () =>
    runFlows(repo, id, 0, { before: { flows: names, taken, doneInRound } }).catch((error): Ran => {
      if (error instanceof Refused) return { recorded: [], failed: names.map((flow) => ({ flow })), written: {} };
      throw error;
    });
  let kept: Ran = { recorded: [], failed: [], written: {} };
  if (names.length) {
    const { url } = await repo.app();
    // The app Playthrough started serves the work: it's started again on the app as it was, and stopped before the work
    // comes back.
    await stopApp(url);
    const shared = await serves(url);
    console.log(`\nYour work is set aside with git stash while ${names.length > 1 ? "they record" : "it records"} on Before${shared ? `, and what serves ${url} serves the app as it was` : ""}.`);
    kept = await asItWas(repo, unrecorded, before.commit!, shared, async () => {
      if (shared) await caughtUp(url);
      try {
        return await run();
      } finally {
        await stopApp(url);
      }
    });
    // And back to the work, before the round is compared.
    if (shared) await caughtUp(url);
    refuseIfBroken(kept.failed, unrecorded, "Record again.");
  }
  await repo.reviews.addToBefore(id, { flows: kept.recorded.map(({ flow }) => flow), cantStart: cantStart(kept.recorded, kept.failed), files: kept.recorded.flatMap(({ files }) => files), gone });
  for (const name of names) ran[name] = follows[name]!;
  for (const name of gone) delete ran[name];
  await writeFile(repo.ranOnBefore(id), JSON.stringify(ran));
}

// A flow the browser stopped, not the app, says nothing about how far the app goes, so nothing of the run is kept, and
// recording again tries again.
export function refuseIfBroken(failed: Failed[], unrecorded: string, again: string) {
  const broken = failed.filter((failure) => failure.broken);
  if (broken.length)
    throw new Refused([`\n${unrecorded}, because the browser stopped ${broken.length > 1 ? "these flows" : "a flow"}, not the app:`, ...broken.map(failedAt), again]);
}

// The flows Before has nothing of: they didn't take a step.
const cantStart = (recorded: { flow: Flow }[], failed: Failed[]) =>
  failed.map(({ flow }) => flow).filter((flow) => !recorded.some((kept) => kept.flow.name === flow));

// Where the agent's work is while the working copy holds the app as it was: the branch or commit to come back to, the
// stash it's set aside in, by its message, the command that set it aside, and whether a server of the agent's was
// already serving the app, following the working copy.
type SetAside = { back: string; stash: string; by: number; shared?: boolean };
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

// The working copy holds the app as it was while `run` runs, then the agent's work again. Where the work is goes in
// .playthrough/ first, so if Playthrough is stopped halfway the next command puts it back; stopped by a signal, it puts it back
// itself before it ends.
async function asItWas<T>(repo: Repo, unrecorded: string, commit: string, shared: boolean, run: () => Promise<T>): Promise<T> {
  await repo.keepOutOfGit();
  const aside: SetAside = { back: here(repo), stash: `Playthrough: your work, set aside while flows record on Before, ${new Date().toISOString()}`, by: process.pid, ...(shared && { shared }) };
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
  // The app as it was gets flows in as the app does now: playthrough/ goes with the flows, not with the work, so a setup
  // fixed since Before is the one Before is recorded on.
  const ours = join(repo.root, "playthrough");
  const today = existsSync(ours) ? mkdtempSync(join(tmpdir(), "playthrough-")) : undefined;
  if (today) cpSync(ours, today, { recursive: true });
  let moved = false;
  try {
    try {
      // As Playthrough, as the commit Before is kept in: a git that knows no one can still set the work aside.
      git(repo, ["stash", "push", "--include-untracked", "--message", aside.stash], { ...process.env, ...PLAYTHROUGH });
      git(repo, ["checkout", "--quiet", "--detach", commit]);
      moved = true;
    } catch (error) {
      throw new Refused([`${unrecorded}: git couldn't put the app as it was in place, because it says:`, `  ${said(error)}`, "Fix that, then try again."]);
    }
    if (today) {
      rmSync(ours, { recursive: true, force: true });
      cpSync(today, ours, { recursive: true });
    }
    return await run();
  } finally {
    if (today) rmSync(today, { recursive: true, force: true });
    for (const signal of SIGNALS) process.off(signal, stopped);
    // What the app as it was wrote into files git keeps goes: the agent's own changes are in the stash.
    const problem = putWorkBack(repo, aside, true);
    if (problem) throw stillAside(repo, aside, problem);
    if (moved) console.log("Your work is back.");
  }
}

// A command that finds the work still set aside, by one that was stopped halfway, puts it back before anything else.
// Stopped hard, it can leave the app as it was serving, if Playthrough started it, which the next round mustn't be recorded
// on; a server of the agent's follows the work back.
export async function putBack(repo: Repo) {
  const aside: SetAside | undefined = attempt(() => JSON.parse(readFileSync(repo.setAside, "utf8")));
  if (!aside || running(aside.by)) return;
  const toDo = here(repo) !== aside.back || !!stashOf(repo, aside);
  const problem = putWorkBack(repo, aside, false);
  if (problem) throw stillAside(repo, aside, problem);
  if (!toDo) return;
  const back = `Playthrough was stopped while your work was set aside for a flow to record on Before. It's back now, on ${aside.back}.`;
  const url = (await repo.app().catch(() => undefined))?.url;
  if (url && !aside.shared && (await serves(url))) throw new Refused([back, `Something is still serving ${url}, most likely the app as it was, left running: stop it, then run this again.`]);
  console.log(`${back}\n`);
}

// Back on its branch or commit, then what was set aside, each only if it's still to do, so it's right to run again. Forced,
// whatever the app as it was changed in the files git keeps is let go. Says what git said, if it couldn't.
function putWorkBack(repo: Repo, aside: SetAside, force: boolean): string | undefined {
  try {
    if (here(repo) !== aside.back) {
      // playthrough/ as the app as it was had it, so nothing of what it was given in its place is in the work's way.
      attempt(() => git(repo, ["checkout", "--quiet", "HEAD", "--", "playthrough"]));
      git(repo, ["clean", "--force", "-d", "--quiet", "--", "playthrough"]);
      git(repo, ["checkout", "--quiet", ...(force ? ["--force"] : []), aside.back]);
    }
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
    `Put it back with git checkout ${aside.back}${stash ? `, then git stash pop --index ${stash}` : ""}. Playthrough carries on once it's back.`,
  ]);
}

// The commit the working copy is on, if the repo has one yet. Before it does, git can't stash.
const headOf = (repo: Repo) => attempt(() => git(repo, ["rev-parse", "--verify", "--quiet", "HEAD"]));
const UNBORN = "this repo has no commits yet, and git can set your work aside to put the app as it was back only once it has one";

// The branch the working copy is on, or the commit if it's on none.
const here = (repo: Repo) => attempt(() => git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])) ?? git(repo, ["rev-parse", "HEAD"]);

// The stash the work was set aside in, as git names it now, while it's there.
function stashOf(repo: Repo, aside: SetAside): string | undefined {
  const stashes = git(repo, ["stash", "list", "--format=%gd %gs"]).split("\n");
  return stashes.find((stash) => stash.endsWith(aside.stash))?.split(" ")[0];
}

// A server following the working copy has seen it change once it's had a moment to notice, and answered once more: a dev
// server builds what was asked for again before it answers.
async function caughtUp(url: string) {
  await new Promise((done) => setTimeout(done, 1000));
  await fetch(url, { signal: AbortSignal.timeout(60_000) }).then((response) => response.body?.cancel(), () => {});
}

function running(pid: number): boolean {
  try {
    return process.kill(pid, 0);
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}

// Without the repo's hooks: Playthrough's checkouts and stashes aren't anyone's work, and a hook that fails, or installs
// packages on every checkout, would stop Before or slow it, for nothing.
function git(repo: Repo, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo.root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
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
