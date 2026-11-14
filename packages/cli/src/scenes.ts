// Running a change's moments on the app, the way a person would use it, each its way there and its one step, as Playwright
// scenes; and what the recorder, the runner and stepping in share.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Refused, type Did, type Scene } from "@playthrough/review";
import { changesByThemselves, type Recorded as Compared } from "./compare.ts";
import { keepRunning } from "./app.ts";
import { glimpsesOf, readingsOf, type Failed, type Recorded, type Written } from "./reporter.ts";
import { repo, type App } from "./repo.ts";
import { giveBackLeft, setupIn } from "./setup.ts";

// rrweb's recorder, which goes into every page a scene opens, and every page of the app taken over.
export const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");

// What the run needs to know, passed to Playwright whole: where the scenes are and which of them to run, the folder the
// recordings go to, the app, rrweb's recorder, which goes into every page, whether it's Before, and the recordings the
// round has already, so a scene added to it is named apart from them. And when the review started, which every round's
// clock starts from, where Playwright writes what it keeps of a failed scene, when it's for the agent to see, and on
// Before, what each scene's actions were done on in the round it's recorded with, by the scene's name.
export type Run = { scenes: string; only?: string[]; longest?: string[]; folder: string; results?: string; app: App; root: string; recorder: string; before: boolean; taken: string[]; started: string; fork?: ForkRun; doneInRound?: Record<string, DoneOn> };

// What an action was done on, as a person points at it: its role and name, as getByRole finds it.
export type On = { role: string; name: string };
// What a scene's actions were done on, in order, by the step they're in: nothing, for something with no role or name.
export type DoneOn = Record<string, (On | null)[]>;

// A note made in the app run again on the app as it is now: the scene recorded to where the person took it over (a step,
// and how far into it), then the fork the agent wrote of what they did there, for those notes (test.fork).
export type ForkRun = { scene: string; step: string; actions?: number; notes: string[] };
// How far it got, in seconds of its recording: when the fork began, and each of its steps' start; the fork's name, or
// none where the agent hasn't written one; and where it failed, in Playwright's words.
export type ForkRan = { from: number; fork?: string; steps: { title: string; at: number }[]; failed?: { at?: string; why: string } };
export const FORK_RAN = "fork.json";

// What a dev server draws over the app of its own, as Next's "N" badge, isn't the app: it's hidden in every page a scene
// records and every page of the app taken over, never in the app itself. A sheet the page adopts, not an element in it,
// so nothing the app renders is changed.
export const QUIET_DEV_CHROME = `{
  const quiet = new CSSStyleSheet();
  quiet.replaceSync("nextjs-portal { display: none !important; }");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, quiet];
}`;

// Where a person takes a scene over: the end of one of its steps, or of the whole scene, or within a step, after as many of
// its actions. Followed, it's as far as the run may go, and the playhead rests there once it's to be handed over. Taken
// over on a note's fork, the fork written for those notes, run before it's handed over, and what they did there, kept;
// where they were on the round they made it, with no fork yet, what they did there, done before it's handed over.
export type To = { scene: string; step?: string; actions?: number; rests?: boolean; did?: Did[]; notes?: string[] };
// The scene's page there, as a browser keeps it: its address, its cookies, what the app kept in the browser, how far it
// was scrolled, how far its clock, the recordings', is ahead of the real one, in milliseconds, and what its browser said
// of itself. And partway through a step, the actions to do again there, which changed only what was in the page's
// memory. Taken over on a person's branch, what they did there, done again after them.
export type Handed = { url: string; cookies: Cookie[]; local: Record<string, string>; session: Record<string, string>; scroll: { x: number; y: number }; clock: number; browser: Browser; again?: Action[]; did?: Did[] };
// Whether it asked for dark and for little motion, and the languages it read in.
export type Browser = { dark: boolean; still: boolean; languages: string[]; touch?: boolean };
// An action of the scene's, done again in the person's browser: what it did, on the element at that path, with what.
export type Action = { does: string; on: string; with?: string | boolean | string[] };
export type Cookie = { name: string; value: string; path: string; expires: number; httpOnly: boolean };
// Set in Playthrough before it loads what scenes import, so test() there keeps each scene to take over (following.ts).
export const ALONGSIDE = Symbol.for("playthrough: scenes taken over here");
// What a scene's file says, as a Playwright annotation, when its steps do something outside the app that running it again
// would do again: test("Invite Sam", { annotation: { type: "reaches outside", description: "sends Sam an email" } }, …).
export const REACHES_OUTSIDE = "reaches outside";
// A scene pauses this long after each action, so its result can be seen: the pace every recording is watched at.
export const BEAT = 650;
// How long an action waits for what it acts on. On Before, a scene that shows what's new stops at the first thing the app
// as it was doesn't have, so that's given up on in seconds, rather than waited for as a slow page is.
export const waitsFor = ({ before }: Pick<Run, "before">) => (before ? 3000 : 10_000);

export const isScene = (name: string) => /\.[cm]?[jt]s$/.test(name);

// The same scenes recorded twice on the same app: what differs between the two changes by itself, and is kept on each
// scene it's in as unsteady, so it's left out of every comparison. Said, a change at a time.
export async function markUnsteady(round: number, once: Ran["recorded"], twice: Ran["recorded"]) {
  const byThemselves = await changesByThemselves(inMemory(round, once), inMemory(round, twice));
  for (const { scene } of once) {
    const pieces = byThemselves.filter((change) => change.seen.some((place) => place.scene === scene.name)).flatMap((change) => change.pieces);
    if (pieces.length) scene.unsteady = [...new Set(pieces)];
  }
  return byThemselves;
}

// A run as it came, read from its files rather than from what's kept.
function inMemory(number: number, recorded: Ran["recorded"]): Compared {
  const scenes = recorded.map(({ scene }) => scene);
  const file = (name: string) => recorded.flatMap(({ files }) => files).find((file) => file.name === name)!.bytes;
  const glimpses = async (scene: Scene) => {
    const bytes = recorded.flatMap(({ files }) => files).find((file) => file.name === glimpsesOf(scene))?.bytes;
    return bytes ? JSON.parse(bytes.toString()) : [];
  };
  return { number, scenes, readings: async (scene) => JSON.parse(file(readingsOf(scene)).toString()), glimpses, picture: async (name) => file(name) };
}

// What a run recorded, what failed, and the file each scene is written in, as it was when it ran, by the scene's name.
export type Ran = { recorded: { scene: Scene; files: { name: string; bytes: Buffer }[]; wrote?: string; doneOn?: DoneOn }[]; failed: Failed[]; written: Record<string, Written> };

export async function runOnce(run: Omit<Run, "folder">): Promise<Ran> {
  const folder = await mkdtemp(join(tmpdir(), "playthrough-"));
  try {
    const ran = await playwright({ ...run, folder });
    const text = await readFile(join(folder, "scenes.json"), "utf8").catch(() => undefined);
    const { recorded, failed, written }: { recorded: Recorded[]; failed: Failed[]; written: Record<string, Written> } = text ? JSON.parse(text) : { recorded: [], failed: [], written: {} };
    if (!ran && !failed.length) throw new Refused(["\nIt didn't run, for the reason Playwright gives above. Fix that and run this again."]);
    const withFiles = ({ files, ...recorded }: Recorded) => Promise.all(files.map(async (name) => ({ name, bytes: await readFile(join(folder, name)) }))).then((files) => ({ ...recorded, files }));
    return { recorded: await Promise.all(recorded.map(withFiles)), failed, written };
  } finally {
    await rm(folder, { recursive: true });
  }
}

async function playwright(run: Run): Promise<boolean> {
  // Scenes import playthrough/test from the app, so it has to be one of the app's packages.
  try {
    createRequire(join(run.root, "package.json")).resolve("playthrough/test");
  } catch {
    throw new Refused(["Playthrough isn't installed in this app. Install it as a dev dependency, with the app's own package manager (npm install --save-dev playthrough), then run this again."]);
  }
  await keepRunning(run.app, run.root);
  // What an earlier command made and didn't give back, it gives back first, now the app is there to take it.
  const { setup, borrowed } = repo(run.root);
  await giveBackLeft(await setupIn(setup), borrowed);
  const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
  const config = fileURLToPath(new URL("./playwright.config.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", "--config", config], {
      cwd: run.root,
      stdio: "inherit",
      env: { ...process.env, PLAYTHROUGH_RUN: JSON.stringify(run) },
    });
    // It goes when Playthrough does.
    const stop = () => child.kill();
    process.once("exit", stop);
    child.on("error", reject);
    child.on("exit", (code) => {
      process.off("exit", stop);
      resolve(code === 0);
    });
  });
}
