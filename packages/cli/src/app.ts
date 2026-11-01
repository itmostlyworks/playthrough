// The app, as playthrough/app.json starts it, or the one already running there. Every run of flows, trying the setup
// and taking a flow over start it here when nothing answers, rather than Playwright: one it started itself would go on
// running, orphaned, when Playthrough is stopped by a signal, and as soon as the flow was done when it isn't. Started
// here, it goes when Playthrough does, whatever stops it. Given a port, each copy of the app is started on its own;
// at the address it always has, one already running is used only where it can't be another copy's.

import { spawn, type ChildProcess } from "node:child_process";
import type { Socket } from "node:net";
import { constants } from "node:os";
import { quote, Refused } from "@playthrough/review";
import { inWorktree, PORTED, repo, type App } from "./repo.ts";
import { giveBackOwn, setupIn } from "./setup.ts";

// What Playthrough started, by the address it answers at, and the folder of the copy it was started from.
const started = new Map<string, { app: ChildProcess; root: string }>();
let ending = false;

// How long it took to answer, in milliseconds, when it's started here; nothing when it was running already.
export async function keepRunning(app: App, root: string): Promise<number | undefined> {
  // Stopped by a signal, Node ends without saying it's exiting, and what it started here runs on, orphaned: the flows
  // being recorded, the flows kept ready and the app. Told, they go with it.
  if (!ending) {
    ending = true;
    // What its runs made is given back first, for as long as ten seconds: what isn't, the next command gives back.
    const { setup, borrowed } = repo(root);
    const giveBack = () => setupIn(setup).then((setup) => giveBackOwn(setup, borrowed));
    const end = (signal: NodeJS.Signals) => void Promise.race([giveBack(), new Promise((wait) => setTimeout(wait, 10_000))]).finally(() => process.exit(128 + constants.signals[signal]));
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, end);
    // The app goes when Playthrough does, with everything its command started.
    process.once("exit", () => [...started.keys()].forEach(stop));
  }
  const ours = started.get(app.url);
  // At the address the app always has, a copy started here from another folder gives way to this one.
  if (ours && ours.root !== root) await stopApp(app.url);
  if (await serves(app.url)) {
    // There, what answers in the main folder is the app as you run it, following the work, as a dev server does; in a
    // worktree, it's as likely another copy's, and recording that would show the wrong work.
    if (ours?.root === root || app.port !== undefined || !inWorktree(root)) return;
    throw new Refused([
      `Something else answers at ${app.url}, most likely the app running from another folder. This is a worktree, so Playthrough runs this copy of the app there itself: whoever started what's there can stop it, then try again.`,
      `Or give each copy a port of its own in playthrough/app.json: ${PORTED}.`,
    ]);
  }
  console.log(`Starting the app: ${app.start}`);
  const began = Date.now();
  const running = spawn(app.start, { cwd: root, shell: true, stdio: ["ignore", "pipe", "pipe"], detached: true });
  started.set(app.url, { app: running, root });
  // What it last said, for when it doesn't answer, without a stack trace's frames, which would hide its error.
  const said: string[] = [];
  for (const output of [running.stdout!, running.stderr!]) {
    output.on("data", (chunk: Buffer) => {
      said.push(...chunk.toString().split("\n").filter((line) => line.trim() && !/^\s+at /.test(line)));
      said.splice(0, said.length - 10);
    });
    // Nor does what it says keep Playthrough running.
    (output as Socket).unref();
  }
  // Nor does it keep Playthrough running once its work is done.
  running.unref();
  let ended = false;
  running.once("exit", () => (ended = true));
  const saying = () => (said.length ? ["It said, last:", ...said.map((line) => `  ${line}`)] : []);
  while (Date.now() - began < 180_000) {
    if (await serves(app.url)) return Date.now() - began;
    if (ended) throw new Refused([`${quote(app.start)} ended before the app answered at ${app.url}.`, ...saying(), "Check that playthrough/app.json starts the app there."]);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  stop(app.url);
  throw new Refused([`The app didn't answer at ${app.url} within three minutes of ${quote(app.start)}.`, ...saying(), "Check that playthrough/app.json starts it there."]);
}

// The app Playthrough started, stopped, so the next run starts it again on the working copy as it is then; one that was
// running already is left as it is. Stopped, it no longer answers.
export async function stopApp(url: string) {
  if (!stop(url)) return;
  const began = Date.now();
  while (Date.now() - began < 10_000 && (await serves(url))) await new Promise((resolve) => setTimeout(resolve, 250));
}

function stop(url: string): boolean {
  const ours = started.get(url);
  if (!ours) return false;
  try {
    process.kill(-ours.app.pid!);
  } catch {}
  started.delete(url);
  return true;
}

// Whether something serves there: it answers, or it took the request and is still at it after two seconds, as a dev
// server building a page for the first time is. Taken for nothing there, it was started again beside itself.
export const serves = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(2000) }).then(
    (response) => (response.body?.cancel(), true),
    (error) => (error as Error)?.name === "TimeoutError",
  );
