// The app, as playthrough/app.json starts it, or the one already running from the copy's folder (repo.ts says where).
// One for each copy, shared by everyone using it: the person taking over, the agent's browser, and each moment run, each
// in a world of its own, as the app always runs the working copy as it is now. Whoever wants it first starts it, on its
// own, so it outlives the command that started it while anyone else is using it; it's stopped once nobody is. With
// Playthrough open, which keeps every copy's, once nobody has used it for fifteen minutes; without, as the last one using
// it ends. One Playthrough didn't start, it never stops.

import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { join } from "node:path";
import { quote, Refused } from "@playthrough/change";
import { stillAt, thisCommand, type Command } from "./command.ts";
import { machine } from "./machine.ts";
import { copyServing, inWorktree, PORTED, repo, runningFile, runningIn, servingHere, type App, type Running } from "./repo.ts";
import { answers, serving } from "./serving.ts";
import { giveBackOwn, setupIn } from "./setup.ts";

// For a command: the app, used until the command ends. How long it took to answer, in milliseconds, when it's started
// here; nothing when it was running already.
export async function keepRunning(app: App, root: string): Promise<number | undefined> {
  const done = using(root);
  process.once("exit", done);
  return running(app, root);
}

// The app, started if it isn't running. Whoever asks says how long they use it (`using`).
export async function running(app: App, root: string): Promise<number | undefined> {
  endsWithPlaythrough(root);
  const here = repo(root);
  await here.keepOutOfGit();
  const asked = Date.now();
  for (;;) {
    const now = runningIn(root);
    if (now?.url === app.url) {
      if (await answers(app.url)) return;
      // Another command is starting it: it's waited for, as it can't start twice.
      if (Date.now() - asked > STARTING) throw new Refused([`The app didn't answer at ${app.url} within three minutes of being started. Look at .playthrough/app.log for why.`]);
      await new Promise((wait) => setTimeout(wait, 250));
      continue;
    }
    if (await answers(app.url)) {
      // Running from this copy's folder, it's this copy's app, used where it is, and never stopped by Playthrough, which
      // didn't start it. Another copy's would show the wrong work. Where its folder can't be known, what answers in the
      // main folder is the app as you run it, following the work, as a dev server does; in a worktree, it's as likely
      // another copy's.
      const from = copyServing(app.url, root);
      if (from === realpathSync(root)) return;
      if (from === undefined && (app.port !== undefined || !inWorktree(root))) return;
      throw new Refused([
        from
          ? `The app answering at ${app.url} is another copy's, running from ${from}. Whoever started it there can stop it, then try again.`
          : `Something else answers at ${app.url}, most likely the app running from another folder. This is a worktree, so Playthrough runs this copy of the app there itself: whoever started what's there can stop it, then try again.`,
        ...(app.port === undefined ? [`Or give each copy a port of its own in playthrough/app.json: ${PORTED}.`] : []),
      ]);
    }
    // Taken, so nobody else starts it meanwhile.
    try {
      writeFileSync(runningFile(root), JSON.stringify({ ...thisCommand(), url: app.url, used: Date.now() } satisfies Running), { flag: "wx" });
      break;
    } catch {
      await new Promise((wait) => setTimeout(wait, 250));
    }
  }
  console.log(`Starting the app: ${app.start}`);
  const began = Date.now();
  // What it says goes to a file, not to whoever started it, which may end long before it does.
  const log = join(root, ".playthrough", "app.log");
  const output = openSync(log, "w");
  const started = spawn(app.start, { cwd: root, shell: true, stdio: ["ignore", output, output], detached: true });
  closeSync(output);
  started.unref();
  writeFileSync(runningFile(root), JSON.stringify({ ...thisCommand(), app: started.pid!, url: app.url, used: Date.now() } satisfies Running));
  let ended = false;
  started.once("exit", () => (ended = true));
  // What it last said, for when it doesn't answer, without a stack trace's frames, which would hide its error, or what
  // only moves a terminal's cursor or colours its words. Then what to do.
  const saying = async () => {
    const said = readFileSync(log, "utf8")
      .replace(/\x1b\[[\d;?]*[A-Za-z]/g, "")
      .split("\n")
      .filter((line) => line.trim() && !/^\s+at /.test(line))
      .slice(-10);
    return [...(said.length ? ["It said, last:", ...said.map((line) => `  ${line}`)] : []), await whatNext(app, root)];
  };
  while (Date.now() - began < STARTING) {
    if (await answers(app.url)) return Date.now() - began;
    if (ended) {
      rmSync(runningFile(root), { force: true });
      throw new Refused([`${quote(app.start)} ended before the app answered at ${app.url}.`, ...(await saying())]);
    }
    await new Promise((wait) => setTimeout(wait, 250));
  }
  stop(root);
  throw new Refused([`The app didn't answer at ${app.url} within three minutes of ${quote(app.start)}.`, ...(await saying())]);
}
const STARTING = 180_000;

// After the app didn't start: an app already running from this folder that couldn't be told for this one may be why, as
// one that won't run twice says. Where nothing says which folder a running app is from (Windows), it may be too.
async function whatNext(app: App, root: string): Promise<string> {
  const stopIt = "whoever started it stops it, then try again";
  if (!serving()) return `If the app is already running, as it may be saying, Playthrough can't tell here which folder it runs from, so it can't use it: ${stopIt}.`;
  const here = await servingHere(root, app.url);
  if (here.length > 1) return `Serving pages from this folder already: ${here.map((one) => one.url).join(", ")}. If one is the app, Playthrough can't tell which, so it can't use it: ${stopIt}.`;
  return "Check that playthrough/app.json starts the app there.";
}

// This process using the copy's app, until what's given back is called: a file for each process using it, as the
// agents waiting are, so every command and Playthrough open sees who is. Let go of by the last one using it, it's stopped,
// unless Playthrough is open to keep it a while.
const uses = new Map<string, number>();
export function using(root: string): () => void {
  const count = (uses.get(root) ?? 0) + 1;
  uses.set(root, count);
  if (count === 1) {
    mkdirSync(usingFolder(root), { recursive: true });
    writeFileSync(join(usingFolder(root), String(process.pid)), JSON.stringify(thisCommand()));
  }
  let given = false;
  return () => {
    if (given) return;
    given = true;
    const left = uses.get(root)! - 1;
    uses.set(root, left);
    if (left) return;
    rmSync(join(usingFolder(root), String(process.pid)), { force: true });
    const now = runningIn(root);
    if (now?.app) writeFileSync(runningFile(root), JSON.stringify({ ...now, used: Date.now() }));
    if (!keptOpen()) stopUnused(root, 0);
  };
}

// The copy's app stopped where nobody has used it for so long: nobody is using it now, and the last let go of it that
// long ago. One running already when Playthrough came is left as it is.
export function stopUnused(root: string, since: number) {
  const now = runningIn(root);
  if (!now?.app || Date.now() - now.used < since || usersOf(root).length) return;
  stop(root);
}
export const UNUSED = 15 * 60_000;

function stop(root: string) {
  const now = runningIn(root);
  try {
    if (now?.app) process.kill(-now.app);
  } catch {}
  rmSync(runningFile(root), { force: true });
}

// Playthrough open on this machine, which keeps every copy's app until it's been unused a while: its own take-overs let go
// of too, as stopping it at once would make the next one start it again. Where it answers, too.
export const openFile = (home = machine()) => join(home, "open.json");
function keptOpen(): boolean {
  try {
    const open: Command = JSON.parse(readFileSync(openFile(), "utf8"));
    return stillAt(open);
  } catch {
    return false;
  }
}

const usingFolder = (root: string) => join(root, ".playthrough", "using");

// Everyone else using the copy's app now.
function usersOf(root: string): number[] {
  const names = (() => {
    try {
      return readdirSync(usingFolder(root));
    } catch {
      return [];
    }
  })();
  return names.flatMap((name) => {
    try {
      const user: Command = JSON.parse(readFileSync(join(usingFolder(root), name), "utf8"));
      if (user.by !== process.pid && stillAt(user)) return [user.by];
    } catch {}
    rmSync(join(usingFolder(root), name), { force: true });
    return [];
  });
}

// Stopped by a signal, Node ends without saying it's exiting, and what it made is left: given back first, for as long as
// ten seconds; what isn't, the next command gives back. Then it exits, letting go of the app. Given no copy, it's only that
// it exits as it would on its own, as the page does when it's closed, letting go of the apps it kept.
const ending = new Set<string>();
let endsSo = false;
export function endsWithPlaythrough(root?: string) {
  if (root) ending.add(root);
  if (endsSo) return;
  endsSo = true;
  const giveBack = () => Promise.all([...ending].map((root) => setupIn(repo(root).setup).then((setup) => giveBackOwn(setup, repo(root).borrowed))));
  const end = (signal: NodeJS.Signals) => void Promise.race([giveBack(), new Promise((wait) => setTimeout(wait, 10_000))]).finally(() => process.exit(128 + constants.signals[signal]));
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, end);
}
