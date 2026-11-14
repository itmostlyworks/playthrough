// The app, as playthrough/app.json starts it, or the one already running there. One for each copy, shared by everyone
// using it: the person stepping in, the agent's browser, and each moment run, each in a world of its own, as the app
// always runs the working copy as it is now. Whoever wants it first starts it, on its own, so it outlives the command that
// started it while anyone else is using it; it's stopped once nobody is. With Playthrough open, which keeps every copy's,
// once nobody has used it for fifteen minutes; without, as the last one using it ends. Given a port, each copy of the app
// is started on its own; at the address it always has, one already running is used only where it can't be another copy's.

import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { join } from "node:path";
import { quote, Refused } from "@playthrough/change";
import { stillAt, thisCommand, type Command } from "./command.ts";
import { machine } from "./machine.ts";
import { inWorktree, PORTED, repo, type App } from "./repo.ts";
import { giveBackOwn, setupIn } from "./setup.ts";

// The app running in a copy, as every command there sees it: the process that started it, the app's own (the head of
// everything it runs), where it answers, and when it was last let go of. Nothing yet where it's still being started.
type Running = Command & { app?: number; url: string; used: number };

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
      // There, what answers in the main folder is the app as you run it, following the work, as a dev server does; in a
      // worktree, it's as likely another copy's, and recording that would show the wrong work.
      if (app.port !== undefined || !inWorktree(root)) return;
      throw new Refused([
        `Something else answers at ${app.url}, most likely the app running from another folder. This is a worktree, so Playthrough runs this copy of the app there itself: whoever started what's there can stop it, then try again.`,
        `Or give each copy a port of its own in playthrough/app.json: ${PORTED}.`,
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
  // What it last said, for when it doesn't answer, without a stack trace's frames, which would hide its error.
  const saying = () => {
    const said = readFileSync(log, "utf8").split("\n").filter((line) => line.trim() && !/^\s+at /.test(line)).slice(-10);
    return said.length ? ["It said, last:", ...said.map((line) => `  ${line}`)] : [];
  };
  while (Date.now() - began < STARTING) {
    if (await answers(app.url)) return Date.now() - began;
    if (ended) {
      rmSync(runningFile(root), { force: true });
      throw new Refused([`${quote(app.start)} ended before the app answered at ${app.url}.`, ...saying(), "Check that playthrough/app.json starts the app there."]);
    }
    await new Promise((wait) => setTimeout(wait, 250));
  }
  stop(root);
  throw new Refused([`The app didn't answer at ${app.url} within three minutes of ${quote(app.start)}.`, ...saying(), "Check that playthrough/app.json starts it there."]);
}
const STARTING = 180_000;

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

// Playthrough open on this machine, which keeps every copy's app until it's been unused a while: its own step ins let go
// of too, as stopping it at once would make the next one start it again.
export const openFile = () => join(machine(), "open.json");
function keptOpen(): boolean {
  try {
    const open: Command = JSON.parse(readFileSync(openFile(), "utf8"));
    return stillAt(open);
  } catch {
    return false;
  }
}

const runningFile = (root: string) => join(root, ".playthrough", "running.json");
const usingFolder = (root: string) => join(root, ".playthrough", "using");

// The copy's app, while it, or the command starting it, is running on this start of the machine; one that's gone is
// forgotten.
function runningIn(root: string): Running | undefined {
  let now: Running;
  try {
    now = JSON.parse(readFileSync(runningFile(root), "utf8"));
  } catch {
    return undefined;
  }
  if (stillAt(now.app ? { ...now, by: now.app } : now)) return now;
  rmSync(runningFile(root), { force: true });
}

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
// ten seconds; what isn't, the next command gives back. Then it exits, letting go of the app.
const ending = new Set<string>();
function endsWithPlaythrough(root: string) {
  if (ending.size) return void ending.add(root);
  ending.add(root);
  const giveBack = () => Promise.all([...ending].map((root) => setupIn(repo(root).setup).then((setup) => giveBackOwn(setup, repo(root).borrowed))));
  const end = (signal: NodeJS.Signals) => void Promise.race([giveBack(), new Promise((wait) => setTimeout(wait, 10_000))]).finally(() => process.exit(128 + constants.signals[signal]));
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, end);
}

// Whether something serves there: it answers, or it took the request and is still at it after two seconds, as a dev
// server building a page for the first time is. Taken for nothing there, it was started again beside itself.
export const answers = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(2000) }).then(
    (response) => (response.body?.cancel(), true),
    (error) => (error as Error)?.name === "TimeoutError",
  );
