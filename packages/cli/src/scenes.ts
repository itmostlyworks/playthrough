// Running a change's moments on the app, the way a person would use it, each its way there and its one step, as Playwright
// scenes; and what the recorder, the runner and stepping in share.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Refused, type Scene } from "@playthrough/review";
import { findingsByThemselves, type Recorded as Compared } from "./compare.ts";
import { keepRunning } from "./app.ts";
import { glimpsesOf, readingsOf, type Failed, type Recorded } from "./reporter.ts";
import { repo, type App } from "./repo.ts";
import { giveBackLeft, setupIn } from "./setup.ts";

// rrweb's recorder, which goes into every page a scene opens, and every page of the app taken over.
export const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");

// What the run needs to know, passed to Playwright whole: where the scenes are and which of them to run, the folder the
// recordings go to, the app, rrweb's recorder, which goes into every page, and when the change started, which every
// hand-back's clock starts from.
export type Run = { scenes: string; only?: string[]; folder: string; app: App; root: string; recorder: string; started: string };

// What an action was done on, as a person points at it: its role and name, as getByRole finds it.
export type On = { role: string; name: string };

// What a dev server draws over the app of its own, as Next's "N" badge, isn't the app: it's hidden in every page a scene
// records and every page of the app taken over, never in the app itself. A sheet the page adopts, not an element in it,
// so nothing the app renders is changed.
export const QUIET_DEV_CHROME = `{
  const quiet = new CSSStyleSheet();
  quiet.replaceSync("nextjs-portal { display: none !important; }");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, quiet];
}`;

// Where a person steps into a moment: after so many things done in its step, counting those of its way there that the
// step does (doneAt, doneBefore); or, with none said, at its end, everything done.
export type To = { scene: string; after?: number };
// The scene's page there, as a browser keeps it: its address, its cookies, what the app kept in the browser, how far it
// was scrolled, how far its clock, the recordings', is ahead of the real one, in milliseconds, and what its browser said
// of itself. And partway through a step, the actions to do again there, which changed only what was in the page's
// memory.
export type Handed = { url: string; cookies: Cookie[]; local: Record<string, string>; session: Record<string, string>; scroll: { x: number; y: number }; clock: number; browser: Browser; again?: Action[] };
// Whether it asked for dark and for little motion, and the languages it read in.
export type Browser = { dark: boolean; still: boolean; languages: string[]; touch?: boolean };
// An action of the scene's, done again in the person's browser: what it did, on the element at that path, with what.
export type Action = { does: string; on: string; with?: string | boolean | string[] };
export type Cookie = { name: string; value: string; path: string; expires: number; httpOnly: boolean };
// Set in Playthrough before it loads what scenes import, so test() there keeps each scene to take over (following.ts).
export const ALONGSIDE = Symbol.for("playthrough: scenes taken over here");
// A scene pauses this long after each action, so its result can be seen: the pace every recording is watched at.
export const BEAT = 650;
// How long an action waits for what it acts on.
export const WAITS = 10_000;

export const isScene = (name: string) => /\.[cm]?[jt]s$/.test(name);

// The same scenes recorded twice on the same app: what differs between the two changes by itself, and is kept on each
// scene it's in as unsteady, so it's left out of every comparison. Said, a change at a time.
export async function markUnsteady(round: number, once: Ran["recorded"], twice: Ran["recorded"]) {
  const byThemselves = await findingsByThemselves(inMemory(round, once), inMemory(round, twice));
  for (const { scene } of once) {
    const pieces = byThemselves.filter((finding) => finding.seen.some((place) => place.scene === scene.name)).flatMap((finding) => finding.pieces);
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

// What a run recorded, and what failed.
export type Ran = { recorded: { scene: Scene; files: { name: string; bytes: Buffer }[] }[]; failed: Failed[] };

export async function runOnce(run: Omit<Run, "folder">): Promise<Ran> {
  const folder = await mkdtemp(join(tmpdir(), "playthrough-"));
  try {
    const ran = await playwright({ ...run, folder });
    const text = await readFile(join(folder, "scenes.json"), "utf8").catch(() => undefined);
    const { recorded, failed }: { recorded: Recorded[]; failed: Failed[] } = text ? JSON.parse(text) : { recorded: [], failed: [] };
    if (!ran && !failed.length) throw new Refused(["\nIt didn't run, for the reason Playwright gives above. Fix that and run this again."]);
    const withFiles = ({ files, ...recorded }: Recorded) => Promise.all(files.map(async (name) => ({ name, bytes: await readFile(join(folder, name)) }))).then((files) => ({ ...recorded, files }));
    return { recorded: await Promise.all(recorded.map(withFiles)), failed };
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
