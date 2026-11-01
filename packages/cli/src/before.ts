// Before is the app as it was before the work. It's kept as a commit when it's recorded, with whatever wasn't committed
// yet, so a flow the agent adds later can be recorded on it too. That happens in the agent's own working copy, the one
// copy known to run: its env files, installed packages and local data stay as they are, since git leaves what it ignores
// alone. The agent's work is set aside with git stash meanwhile, and put back after, even when recording fails or
// Playthrough is stopped. It's recorded on whatever serves the app, as every round is: a server already running follows the
// working copy, as a dev server does, so for that minute it serves the app as it was, and one Playthrough started is
// started again on it. There, playthrough/ is as it is now: it goes with the flows, not with the work.

import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { list, quote, Refused, type Flow } from "@playthrough/review";
import { stopApp } from "./app.ts";
import { failedAt, runFlows, whereItStopped } from "./flows.ts";
import type { Failed } from "./reporter.ts";
import type { Repo } from "./repo.ts";
import { trySetup } from "./try-setup.ts";

// Keeps what the working copy holds as a commit, with whatever isn't committed yet, through an index of its own so what
// the agent staged stays as it was. A ref keeps the commit, so git never cleans it away. Outside git, there's none.
export function keepBefore(repo: Repo, id: string): string | undefined {
  if (!attempt(() => git(repo, ["rev-parse", "--is-inside-work-tree"]))) return undefined;
  try {
    const head = headOf(repo);
    return keep(repo, id, treeNow(repo), head ? [head] : []);
  } catch (error) {
    throw new Refused(["Before can't be kept as a commit, because git says:", `  ${said(error)}`, "Fix that and run this again."]);
  }
}

// Before's commit again, with playthrough/ as the working copy holds it now, once Before is recorded again on it.
const keptWithOursNow = (repo: Repo, id: string, commit: string) =>
  keep(repo, id, treeNow(repo, { commit, paths: ["playthrough"] }), git(repo, ["rev-list", "--parents", "--max-count=1", commit]).split(" ").slice(1));

function keep(repo: Repo, id: string, tree: string, parents: string[]): string {
  const commit = git(repo, ["commit-tree", "--no-gpg-sign", ...parents.flatMap((parent) => ["-p", parent]), "-m", `Before, of the review ${id}: the app as it was, with what wasn't committed`, tree], { ...process.env, ...PLAYTHROUGH });
  git(repo, ["update-ref", `refs/playthrough/${id}/before`, commit]);
  return commit;
}

// What the working copy holds, committed or not, as a git tree, through an index of its own so what the agent staged
// stays as it was; or onto a commit, what it holds in some of its folders.
function treeNow(repo: Repo, onto?: { commit: string; paths: string[] }): string {
  const folder = mkdtempSync(join(tmpdir(), "playthrough-"));
  try {
    const index = join(folder, "index");
    const env = { ...process.env, GIT_INDEX_FILE: index };
    if (onto) {
      git(repo, ["read-tree", onto.commit], env);
      git(repo, ["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", "--", ...onto.paths], env);
      git(repo, ["add", "--all", "--", ...onto.paths], env);
    } else {
      // Starting from the agent's index, git only reads the files that changed.
      attempt(() => copyFileSync(resolve(repo.root, git(repo, ["rev-parse", "--git-path", "index"])), index));
      git(repo, ["add", "--all", ":/"], env);
    }
    return git(repo, ["write-tree"], env);
  } finally {
    rmSync(folder, { recursive: true });
  }
}

// Whether what the working copy holds there, committed or not, differs from the commit.
const changedSince = (repo: Repo, commit: string, paths: string[]) =>
  attempt(() => git(repo, ["diff", "--quiet", `${commit}^{tree}`, treeNow(repo), "--", ...paths])) === undefined;

// The commit is Playthrough's, whoever's git this is.
const PLAYTHROUGH = { GIT_AUTHOR_NAME: "Playthrough", GIT_AUTHOR_EMAIL: "playthrough@localhost", GIT_COMMITTER_NAME: "Playthrough", GIT_COMMITTER_EMAIL: "playthrough@localhost" };

// Each flow Before hasn't been tried on is recorded on it too, as far as the app as it was can take it, so every flow is
// compared with how the app was. Where the app as it was can't start one, Before says so, and it isn't tried again.
export async function recordOnBefore(repo: Repo, id: string, number: number, flows: string[]) {
  const before = (await repo.reviews.get(id)).rounds.find((round) => round.number === 0);
  if (!before) return;
  const later = flows.filter((name) => !before.flows.some((flow) => flow.name === name) && !before.cantStart?.includes(name));
  if (!later.length) return;
  const [are, they, have] = later.length > 1 ? ["are", "they're", "have"] : ["is", "it's", "has"];
  const named = list(later.map(quote));
  await onBefore(repo, id, later, `${named} ${are} new, so ${they} recorded on Before too`, `Round ${number} wasn't recorded`, "Record again.", (why) => `${named} ${have} no Before: ${why}.`);
}

// The flows Before cut short or couldn't start, tried on it again, as playthrough start does once Before is recorded: a flow
// that stopped for its own mistake, not the app's, goes as far as the app as it was can take it once it's fixed.
export async function tryBeforeAgain(repo: Repo, id: string, flows: string[]) {
  const [them, they] = flows.length > 1 ? ["them", "they"] : ["it", "it"];
  const named = list(flows.map(quote));
  await onBefore(repo, id, flows, `Before cut ${named} short, so ${they} ${flows.length > 1 ? "are" : "is"} tried on it again, in place of what it has of ${them}`, "Before wasn't recorded again", "Run this again.", (why) => `Before can't try ${named} again: ${why}.`);
}

// Until round 1 is handed over, nothing has been compared with Before, so Before follows what every flow starts from:
// once playthrough/ has changed since Before was recorded, each flow Before has is recorded on it again, in place of what
// it had, as start does, and record before round 1, once the setup's been tried. Says whether it was. Command is the one
// to run again once the agent has looked at what the setup was tried on, and again, once something's fixed.
export async function recordBeforeAgain(repo: Repo, id: string, command: string, again: string): Promise<boolean> {
  const review = await repo.reviews.get(id);
  const before = review.rounds.find((round) => round.number === 0);
  if (!before?.commit || review.rounds.some((round) => round.number > 0 && round.finished) || !changedSince(repo, before.commit, ["playthrough"])) return false;
  await trySetup(repo, command);
  const flows = [...before.flows.map((flow) => flow.name), ...(before.cantStart ?? [])];
  return onBefore(repo, id, flows, `playthrough/ has changed since Before was recorded, so Before is recorded again on it, in place of what it has`, "Before wasn't recorded again", again, (why) => `Before stays as it was recorded, on playthrough/ as it was then: ${why}.`, true);
}

// Recorded on what playthrough/ holds now, Before's commit is kept with it too, if it's Before as a whole, so it's known
// to be what Before was recorded on. Where the app as it was can't be put back, cant says what that means, and nothing's
// recorded. Says whether it was.
async function onBefore(repo: Repo, id: string, flows: string[], doing: string, unrecorded: string, again: string, cant: (why: string) => string, whole = false): Promise<boolean> {
  const before = (await repo.reviews.get(id)).rounds.find((round) => round.number === 0)!;
  // Nothing changed since Before but playthrough/, which is how flows get into the app and goes with them, the app as it
  // is is the app as it was, and nothing needs setting aside.
  const unchanged = !!before.commit && !changedSince(repo, before.commit, [":/", ":(exclude)playthrough"]);
  const why = !before.commit ? "Before wasn't kept as a commit, so the app as it was can't be put back" : !unchanged && !headOf(repo) ? UNBORN : undefined;
  if (why) {
    console.log(`\n${cant(why)}`);
    return false;
  }
  const later = flows;
  // Named apart from every recording Before holds, one a flow tried again no longer uses among them.
  const taken = await repo.reviews.files(id, 0);
  // An app as it was that doesn't start, for the reason Playwright gives, can't start any of them.
  const run = () =>
    runFlows(repo, id, 0, { later: { flows: later, taken }, first: () => true }).catch((error) => {
      if (error instanceof Refused) return { recorded: [], failed: later.map((flow) => ({ flow })) };
      throw error;
    });
  let ran: Awaited<ReturnType<typeof run>>;
  if (unchanged) {
    console.log(`\n${doing}, on the app as it is: nothing has changed since Before.`);
    ran = await run();
  } else {
    const { url } = await repo.app();
    // The app Playthrough started serves the work as it was when it started: it's started again on the app as it was,
    // and stopped before the work comes back.
    await stopApp(url);
    const shared = await serving(url);
    console.log(`\n${doing}. Your work is set aside with git stash meanwhile${shared ? `, and what serves ${url} serves the app as it was` : ""}.`);
    ran = await asItWas(repo, unrecorded, before.commit!, shared, async () => {
      if (shared) await caughtUp(url);
      try {
        return await run();
      } finally {
        await stopApp(url);
      }
    });
  }
  refuseIfBroken(ran.failed, unrecorded, again);
  const commit = whole ? keptWithOursNow(repo, id, before.commit!) : undefined;
  await repo.reviews.addToBefore(id, { flows: ran.recorded.map(({ flow }) => flow), cantStart: cantStart(ran.recorded, ran.failed), files: ran.recorded.flatMap(({ files }) => files), ...(commit && { commit }) });
  for (const line of howFar(repo, id, ran.recorded, ran.failed, "the app as it was")) console.log(line);
  return true;
}

// A flow the browser stopped, not the app, says nothing about how far the app goes, so nothing of the run is kept, and
// recording again tries again.
export function refuseIfBroken(failed: Failed[], unrecorded: string, again: string) {
  const broken = failed.filter((failure) => failure.broken);
  if (broken.length)
    throw new Refused([`\n${unrecorded}, because the browser stopped ${broken.length > 1 ? "these flows" : "a flow"}, not the app:`, ...broken.map(failedAt), again]);
}

// The flows Before has nothing of: they didn't take a step.
export const cantStart = (recorded: { flow: Flow }[], failed: Failed[]) =>
  failed.map(({ flow }) => flow).filter((flow) => !recorded.some((kept) => kept.flow.name === flow));

// How far Before goes with each flow that didn't run to its end on the app as it is, or was.
// Playwright's reason is said with it: the flow's own mistake reads the same as something the app can't do yet.
export function howFar(repo: Repo, id: string, recorded: { flow: Flow }[], failed: Failed[], app: string): string[] {
  const lines = failed.map(({ flow, at, why }) => {
    const because = why ? `, where Playwright says “${why}”` : "";
    return !recorded.some((kept) => kept.flow.name === flow)
      ? `${quote(flow)} can't start on ${app}${because}, so it has no Before.`
      : `${quote(flow)} ${at ? `stops at ${quote(at)}${because}` : "stops after its last step"}, so its Before goes as far as that.`;
  });
  // An app as it was that didn't start left no page to see.
  const where = existsSync(repo.failed(id)) ? ` ${whereItStopped(repo, id, failed)}` : "";
  if (lines.length)
    lines.push(`If that's the app as it was, that's Before. If it's the flow's own mistake, fix the flow and run playthrough start ${id} again: it tries the flows Before cut short again.${where}`);
  return lines;
}

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
  if (url && !aside.shared && (await serving(url))) throw new Refused([back, `Something is still serving ${url}, most likely the app as it was, left running: stop it, then run this again.`]);
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

// Whether anything answers there.
const serving = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(2000) }).then(
    (response) => (response.body?.cancel(), true),
    () => false,
  );

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
