// The app, as playthrough/app.json starts it, kept running for as long as Playthrough runs, or the one already running:
// Playwright would stop one it started itself as soon as the flow was done.

import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:os";
import { quote, Refused } from "@playthrough/review";
import { repo, type App } from "./repo.ts";
import { giveBackOwn, setupIn } from "./setup.ts";

let started: ChildProcess | undefined;
let ending = false;

// How long it took to answer, in milliseconds, when it's started here; nothing when it was running already.
export async function keepRunning(app: App, root: string): Promise<number | undefined> {
  // Stopped by a signal, Node ends without saying it's exiting, and what it started here runs on, orphaned: the flows
  // kept ready and the app. Told, they go with it.
  if (!ending) {
    ending = true;
    // What its runs made is given back first, for as long as ten seconds: what isn't, the next command gives back.
    const { setup, borrowed } = repo(root);
    const giveBack = () => setupIn(setup).then((setup) => giveBackOwn(setup, borrowed));
    const end = (signal: NodeJS.Signals) => void Promise.race([giveBack(), new Promise((wait) => setTimeout(wait, 10_000))]).finally(() => process.exit(128 + constants.signals[signal]));
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, end);
  }
  if (await answers(app.url)) return;
  console.log(`Starting the app: ${app.start}`);
  const began = Date.now();
  started = spawn(app.start, { cwd: root, shell: true, stdio: "ignore", detached: true });
  // Nor does it keep Playthrough running once its work is done.
  started.unref();
  let ended = false;
  started.once("exit", () => (ended = true));
  // The app goes when Playthrough does, with everything its command started.
  const stop = () => {
    try {
      process.kill(-started!.pid!);
    } catch {}
  };
  process.once("exit", stop);
  while (Date.now() - began < 180_000) {
    if (await answers(app.url)) return Date.now() - began;
    if (ended) throw new Refused([`${quote(app.start)} ended before the app answered at ${app.url}. Run it yourself to see why, and check that playthrough/app.json starts the app there.`]);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  stop();
  throw new Refused([`The app didn't answer at ${app.url} within three minutes of ${quote(app.start)}. Check that playthrough/app.json starts it there.`]);
}

const answers = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(2000) }).then(
    () => true,
    () => false,
  );
