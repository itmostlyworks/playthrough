// A review's scenes: where they're written, how to write them, and running them on the app the way a person would use it.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Glimpse, Reading } from "@playthrough/page";
import { list, quote, Refused, type Did, type Scene } from "@playthrough/review";
import { changesByThemselves, type Recorded as Compared } from "./compare.ts";
import { HERE } from "./pictures.ts";
import { keepRunning } from "./app.ts";
import { glimpsesOf, readingsOf, type Failed, type Recorded, type Written } from "./reporter.ts";
import { repo, type App, type Repo } from "./repo.ts";
import { giveBackLeft, setupIn } from "./setup.ts";
import { trySetup } from "./try-setup.ts";

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
export type Browser = { dark: boolean; still: boolean; languages: string[] };
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

// Scenes are modules whatever the app's own package.json says, so they load the same way in every repo.
export async function makeScenesFolder(repo: Repo, id: string) {
  await mkdir(repo.scenes(id), { recursive: true });
  await writeFile(join(repo.scenes(id), "package.json"), `{ "type": "module" }\n`, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
}

// Scenes named in a sentence: by name while they're few, and past three, how many, as each has a line of its own by it.
export const called = (names: string[]) => (names.length > 3 ? `${names.length} scenes` : list(names.map(quote)));

export const isScene = (name: string) => /\.[cm]?[jt]s$/.test(name);

export function howToWriteScenes(repo: Repo, id: string): string {
  const setupMissing = !existsSync(repo.setup);
  const missing = !existsSync(repo.appFile)
    ? `, and how to start the app in playthrough/app.json. This app has ${setupMissing ? "neither" : "no app.json"} yet: run playthrough alone for how. Playthrough tries them before it records anything.`
    : setupMissing
      ? ", which this app doesn't have yet: run playthrough alone for how."
      : ".";
  return `Each scene is one situation the change meets: someone, with what they'd really have, there to do one thing, shown as far as the change reaches, with a step for each part worth looking at. Another scene is another scene, like someone the change treats differently or a long list where the first had an empty one, never the same person, things and way again. Each is a Playwright test in a .ts file in ${repo.show(repo.scenes(id))}:

  import { test, expect } from "playthrough/test";

  test("Export a quarter", async ({ page, setup }) => {
    await test.step("Open the invoices", async () => {
      await page.goto(\`/accounts/\${setup.account}/invoices\`);
    });
    await test.step("Export the third quarter", async () => {
      await page.getByRole("button", { name: "Export" }).click();
    });
  });

The test's name is the scene's, and steps are matched across rounds by their names. Each step ends on what it shows,
so it can be looked at by itself: the person sees each step's end beside the same step on Before. What every scene starts from, like
the account it opens, is made in playthrough/setup.ts${missing}`;
}

// The review's scenes folder, once there's a scene in it.
export async function scenesOf(repo: Repo, id: string): Promise<string> {
  const scenes = repo.scenes(id);
  if (!(await readdir(scenes).catch(() => [])).some(isScene)) throw new Refused([`${id} has no scenes yet. ${howToWriteScenes(repo, id)}`]);
  await makeScenesFolder(repo, id);
  return scenes;
}

// Runs every scene of the review on the app, the way a person would use it, for a round: each scene with its files, its
// recording and what was read at the end of each step, and each scene that failed with the step it failed at, the page
// it failed on kept for the agent. On Before, round 0, the scenes a round names are run by themselves, each recorded as
// far as it went, step by step as the round goes. A scene new to the review, until its round is handed over, is recorded
// twice, and what changes by itself between the two is unsteady. A round runs the scenes that failed last time first, and
// one failing again stops it there, rather than costing the whole run.
export async function runScenes(
  repo: Repo,
  id: string,
  round: number,
  { before, first = () => false }: { before?: { scenes: string[]; taken: string[]; doneInRound: Record<string, DoneOn> }; first?: (scene: string) => boolean },
): Promise<Ran> {
  const scenes = await scenesOf(repo, id);
  const app = await repo.app();
  // Before runs on the setup the round has tried already.
  if (!before) await trySetup(repo, `playthrough record ${id}`);
  const { started, rounds } = await repo.reviews.get(id);
  // The scenes as long as they were last round, longest first, so the round ends close to when its longest scene does.
  const longest = (rounds.filter((kept) => kept.number < round).at(-1)?.scenes ?? []).toSorted((a, b) => b.length - a.length).map((scene) => scene.name);
  const run = (only?: string[], results?: string) =>
    runOnce({ scenes, only, longest, results, app, root: repo.root, recorder, before: !!before, taken: before?.taken ?? [], started, ...(before && { doneInRound: before.doneInRound }) });

  if (before) {
    console.log(`Recording ${called(before.scenes)} on Before, the app as it was…`);
    // Where Before stops is how far the app as it was went, not a mistake: nothing of it is kept for the agent.
    return run(before.scenes);
  }

  const last = await failedLastTime(repo, id);
  if (last.length) {
    console.log(`Running ${called(last)} first: ${last.length > 1 ? "they" : "it"} failed last time…`);
    const { recorded, failed } = await run(last, repo.failed(id));
    await keepFailed(repo, id, failed);
    const [one] = failed;
    if (failed.length > 1)
      throw new Refused([`\nThese scenes failed again, so the other scenes weren't run:`, ...failed.map(failedAt), `Fix them and record again. ${whereItStopped(repo, id, failed)}`]);
    if (one)
      throw new Refused([`\n${quote(one.scene)} failed again${one.at ? `, at the step ${quote(one.at)}` : ""}, so the other scenes weren't run.`, `Fix it and record again. ${whereItStopped(repo, id, failed)}`]);
    // One whose file is gone since neither passes nor fails: it isn't a scene any more.
    const gone = !recorded.length;
    console.log(`\n${last.length > 1 ? (gone ? "They aren't scenes any more" : "They pass now") : gone ? "It isn't a scene any more" : "It passes now"}, so every scene is recorded.\n`);
  }

  console.log(`Recording round ${round} of ${id}…`);
  const once = await run(undefined, repo.failed(id));
  await keepFailed(repo, id, once.failed);
  const again = once.recorded.filter(({ scene }) => first(scene.name));
  // A round with a scene that failed isn't recorded, so there's nothing to record twice.
  if (!again.length || once.failed.length) return once;

  console.log(`\nRecording ${called(again.map(({ scene }) => scene.name))} again, to see what changes by itself…`);
  const twice = await run(again.map(({ scene }) => scene.name), repo.failed(id));
  await keepFailed(repo, id, twice.failed);
  const unlike = again.filter(({ scene }) => !twice.recorded.some((kept) => kept.scene.name === scene.name));
  if (unlike.length)
    throw new Refused([
      `\n${list(unlike.map(({ scene }) => quote(scene.name)))} didn't go the same way twice on the same app:`,
      ...unlike.map(({ scene }) => `  ${quote(scene.name)}: the first time, ${went(once, scene.name)}; the second, ${went(twice, scene.name)}.`),
      `So ${unlike.length > 1 ? "they don't" : "it doesn't"} start from the same place each time. ${
        app.oneAtATime
          ? "Make what every scene starts from in playthrough/setup.ts, the same each time and new for each run, and run this again."
          : `Scenes run several at once on the one app, so what one makes, another can meet: make what every scene starts from in playthrough/setup.ts, the same each time and new for each run. Where a page shows what every run made, as a blog's index lists every post, say "oneAtATime": true in playthrough/app.json instead. Then run this again.`
      }`,
    ]);
  const byThemselves = await changesByThemselves(inMemory(round, again), inMemory(round, twice.recorded.filter(({ scene }) => first(scene.name))));
  for (const { scene } of again) {
    const unsteady = byThemselves.filter((change) => change.seen.some((place) => place.scene === scene.name));
    if (!unsteady.length) continue;
    scene.unsteady = [...new Set(unsteady.flatMap((change) => change.pieces))];
    // A part of a picture known only by where it is is left out only here (compare.ts).
    const here = unsteady.filter((change) => change.pieces.every((piece) => piece.startsWith(HERE)));
    const everywhere = unsteady.filter((change) => !here.includes(change));
    const listed = (changes: typeof unsteady) => changes.map((change) => `  ${change.words}`).join("\n");
    if (everywhere.length) console.log(`\nIn ${quote(scene.name)}, this changes by itself, so it's left out of every comparison, in every scene:\n${listed(everywhere)}`);
    if (here.length) console.log(`\nIn ${quote(scene.name)}, this part of a picture changes by itself, so it's left out of this scene's comparisons, where it's known only by its place:\n${listed(here)}`);
    console.log("If it can be made the same each time, in playthrough/setup.ts, do that and record again: a real change to it won't be seen.");
  }
  return once;
}

// How a scene went in one run: to its end, or where it stopped, in Playwright's words.
function went(ran: Ran, name: string): string {
  const failure = ran.failed.find((failed) => failed.scene === name);
  if (!failure) return "it went to its end";
  const because = failure.why ? `, where Playwright says “${failure.why}”` : "";
  return failure.at ? `it stopped at ${quote(failure.at)}${because}` : `it stopped before its first step${because}`;
}

// A round with a scene that failed keeps what Playwright wrote of the page it failed on, and names it, to run first next
// time; one with none lets it go.
export async function keepFailed(repo: Repo, id: string, failed: Failed[]) {
  const folder = repo.failed(id);
  if (!failed.length) return rm(folder, { recursive: true, force: true });
  // Playwright makes a folder for every scene, and notes its own run beside them: only what it wrote of a failed one stays.
  for (const entry of await readdir(folder).catch(() => [])) {
    const path = join(folder, entry);
    if (entry === ".last-run.json" || !(await readdir(path)).length) await rm(path, { recursive: true });
  }
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, FAILED), JSON.stringify(failed.map(({ scene }) => scene)));
}

export const failedLastTime = (repo: Repo, id: string): Promise<string[]> =>
  readFile(join(repo.failed(id), FAILED), "utf8").then(JSON.parse).catch(() => []);
const FAILED = "scenes.json";

// The last line of a refusal over scenes that failed: where to see what they stopped on.
export const whereItStopped = (repo: Repo, id: string, failed: Failed[]) =>
  `What the page held where ${failed.length > 1 ? "each" : "it"} stopped is in ${repo.show(repo.failed(id))}/.`;

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

async function runOnce(run: Omit<Run, "folder">): Promise<Ran> {
  const folder = await mkdtemp(join(tmpdir(), "playthrough-"));
  try {
    const ran = await playwright({ ...run, folder });
    const text = await readFile(join(folder, "scenes.json"), "utf8").catch(() => undefined);
    const { recorded, failed, written }: { recorded: Recorded[]; failed: Failed[]; written: Record<string, Written> } = text ? JSON.parse(text) : { recorded: [], failed: [], written: {} };
    if (!ran && !failed.length) throw new Refused(["\nThe scenes didn't run, for the reason Playwright gives above. Fix that and run this again."]);
    const withFiles = ({ files, ...recorded }: Recorded) => Promise.all(files.map(async (name) => ({ name, bytes: await readFile(join(folder, name)) }))).then((files) => ({ ...recorded, files }));
    return { recorded: await Promise.all(recorded.map(withFiles)), failed, written };
  } finally {
    await rm(folder, { recursive: true });
  }
}

// A note's fork run on the app as it is now (test.ts): its recording, what was read at each of its steps' ends and after
// each action, the fonts and pictures it loaded, a picture of where it ended, and how far it got. When the scene never got
// to where the person took it over, where it stopped instead, in Playwright's words, as record says it.
export type ForkRecorded = ForkRan & { events: { timestamp: number }[]; readings: Reading[]; glimpses: Glimpse[]; assets: Record<string, string>; files: { name: string; bytes: Buffer }[]; picture?: Buffer };

export async function runFork(repo: Repo, id: string, fork: ForkRun): Promise<ForkRecorded | { stopped: Failed | undefined }> {
  const app = await repo.app();
  const { started } = await repo.reviews.get(id);
  const folder = await mkdtemp(join(tmpdir(), "playthrough-"));
  try {
    await playwright({ scenes: repo.scenes(id), folder, app, root: repo.root, recorder, before: false, taken: [], started, fork });
    const text = await readFile(join(folder, FORK_RAN), "utf8").catch(() => undefined);
    if (!text) {
      const scenes = await readFile(join(folder, "scenes.json"), "utf8").then(JSON.parse).catch(() => undefined);
      return { stopped: (scenes?.failed as Failed[] | undefined)?.find((failed) => failed.scene === fork.scene) };
    }
    const ran = JSON.parse(text);
    const files = await Promise.all([...new Set(Object.values(ran.assets as Record<string, string>))].map(async (name) => ({ name, bytes: await readFile(join(folder, name)) })));
    return { ...ran, files, picture: await readFile(join(folder, "end.png")).catch(() => undefined) };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

// A scene that failed, at the step it failed at, and why, as a line of a refusal.
export const failedAt = ({ scene, at, why }: Failed) => `  ${quote(scene)}${at ? `, at the step ${quote(at)}` : ""}${why ? `, where Playwright says “${why}”` : ""}`;
async function playwright(run: Run): Promise<boolean> {
  // Scenes import playthrough/test from the app, so it has to be one of the app's packages.
  try {
    createRequire(join(run.root, "package.json")).resolve("playthrough/test");
  } catch {
    throw new Refused(["Playthrough isn't installed in this app, so its scenes can't import playthrough/test. Install it as a dev dependency (npm install --save-dev playthrough), then run this again."]);
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
