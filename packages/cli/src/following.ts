// Stepping in: a run of the moment's scene to where the person steps in, only once that's asked for, as watching a
// recording does nothing to the app, and nothing is made ready ahead of being asked. The scenes run here, in Playthrough,
// each in a window of its own, with its own cookies and storage, in one browser kept open while Playthrough runs: a window
// opens in a moment, where a run of its own took a second and half a gigabyte.

import { chromium, request as requests, type Browser } from "@playwright/test";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { list, quote, Refused } from "@playthrough/review";
import { ALONGSIDE, isScene, type Handed, type To } from "./scenes.ts";
import { firstLine } from "./reporter.ts";
import type { Repo } from "./repo.ts";
import { giveBackLeft, setupIn, type Made, type Setup } from "./setup.ts";
import type { Kept } from "./test.ts";

// Runs one scene to where a person steps in, on the app as it is now: quickly and unrecorded, from what every scene
// starts from, so they carry on from a fresh copy of the moment rather than a picture of it.
// With what the run made for it (setup.ts), which is the app the person has, theirs to give back.
export async function runTo(repo: Repo, id: string, to: To): Promise<{ handed: Handed; made?: Made }> {
  const where = !to.step ? "its end" : to.actions ? `action ${to.actions} of ${quote(to.step)}` : to.actions === 0 ? `the start of ${quote(to.step)}` : `the end of ${quote(to.step)}`;
  const { files, written } = await writtenOf(repo, id);
  const began = Date.now();
  const { handed, stopped, made } = await run(repo, id, to, files, written);
  if (handed) {
    took.set(timeOf(repo, id, to, written), Date.now() - began);
    return { handed, made };
  }
  void made?.giveBack();
  throw new Refused([`${quote(to.scene)} didn't get to ${where}${stopped ? `: ${stoppedAt(stopped)}` : "."}`]);
}

// How long until a moment asked for is ready, in milliseconds: as long as the last run to it took, for scenes and a
// setup written as they are now. Nothing until one has got there.
export async function readyIn(repo: Repo, id: string, to: To) {
  const { written } = await writtenOf(repo, id);
  return took.get(timeOf(repo, id, to, written));
}
const took = new Map<string, number>();
const timeOf = (repo: Repo, id: string, { scene, step, actions }: To, written: number) => JSON.stringify([repo.root, id, scene, step, actions, written]);
const key = (repo: Repo, id: string) => `${repo.root}\n${id}`;

async function run(repo: Repo, id: string, to: To, files: string[], written: number) {
  const app = await repo.app();
  const { started } = await repo.reviews.get(id);
  const { runAlongside, pageFor } = await alongside();
  const { scenes, setup } = await loadedOf(repo, id, files, written);
  const kept = scenes.get(to.scene);
  if (!kept) throw new Refused([`${id} has no scene called ${quote(to.scene)} any more. Its scenes: ${list([...scenes.keys()].map(quote))}.`]);
  // As the scene is recorded: in the window its file asks for with test.use, like a phone's screen and touch, where an
  // action that can't happen fails in seconds. What else the file says with test.use, Playwright leaves aside.
  const { context, page } = await pageFor(await browser(), app.url, kept.use, setup.use);
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(0);
  quickArrivals(page);
  const request = await requests.newContext({ baseURL: app.url });
  try {
    return await runAlongside(page, { request, baseURL: app.url, started, setup, borrowed: repo.borrowed, person: kept.use.person }, kept.body, { to }, kept.forks).catch((error) => ({
      stopped: { why: firstLine(String(error?.message ?? error)) },
      handed: undefined,
      made: undefined,
    }));
  } finally {
    void Promise.all([context.close(), request.dispose()]).catch(() => {});
  }
}

// The way there, written as “wait to be there, else go” (way.ts), waits three seconds for an address the page may never
// reach by itself. Stepping in, nobody sees the way: on a page nothing has loaded in yet, nothing done can lead anywhere,
// so it goes at once; anywhere else, it waits a second for where it's led, then goes. Going is always to the same
// address, so the next thing done finds the page it needs either way: only the waiting is cut.
function quickArrivals(page: import("@playwright/test").Page) {
  const waitFor = page.waitForURL.bind(page);
  page.waitForURL = (url, options) =>
    page.url() === "about:blank" ? Promise.reject(new Error("Nothing has loaded yet.")) : waitFor(url, { ...options, timeout: Math.min(options?.timeout ?? WAITED, WAITED) });
}
const WAITED = 1000;

// What every scene imports, loaded here once Playthrough has said it's taking scenes over, not running them as tests.
type Alongside = typeof import("./test.ts");
let loading: Promise<Alongside> | undefined;
const alongside = () => (loading ??= (((globalThis as Record<symbol, unknown>)[ALONGSIDE] = true), import("./test.ts")));

// One browser for every run, opened the first time one starts, and again if it closes.
let opened: Promise<Browser> | undefined;
function browser(): Promise<Browser> {
  // Ctrl+C is Playthrough's to answer, not Playwright's, which would end it before what the runs made is given back.
  opened ??= chromium.launch({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false }).then(
    (browser) => (browser.on("disconnected", () => (opened = undefined)), browser),
    (error) => ((opened = undefined), Promise.reject(error)),
  );
  return opened;
}

// The review's scenes and the app's setup as they're written now, loaded once each time they're written again: a scene file
// added or taken away changes its folder's time, and a module of their own that they import, once loaded, its own.
async function writtenOf(repo: Repo, id: string) {
  const files = (await readdir(repo.scenes(id))).filter(isScene).map((name) => join(repo.scenes(id), name));
  const { imported } = await alongside();
  const written = Math.max(...(await Promise.all([repo.scenes(id), ...files, repo.setup, ...imported].map((file) => stat(file).then((it) => it.mtimeMs, () => 0)))));
  return { files, written };
}

const loaded = new Map<string, { written: number; scenes: Promise<{ scenes: Map<string, Kept>; setup: Setup }> }>();
function loadedOf(repo: Repo, id: string, files: string[], written: number) {
  const kept = loaded.get(key(repo, id));
  if (kept?.written === written) return kept.scenes;
  // A file that doesn't load is named, in Node's words: one that Playwright loads may not load here, where test() keeps
  // less than Playwright's does.
  const load = <T>(file: string, by: (file: string, written: number) => Promise<T>) =>
    by(file, written).catch((error) => {
      if (error instanceof Refused) throw error;
      throw new Refused([`${repo.show(file)} couldn't be loaded, because Node says “${firstLine(String(error?.message ?? error))}”, so no scene of ${id} can be taken over. Fix it, then take the scene over again.`]);
    });
  const scenes = alongside().then(({ scenesIn }) => Promise.all([Promise.all(files.map((file) => load(file, scenesIn))), load(repo.setup, setupIn)])).then(
    ([each, setup]) => {
      // What a Playthrough that has ended left, given back the first time this one runs a scene.
      if (!sweptFor.has(repo.root)) void giveBackLeft(setup, repo.borrowed);
      sweptFor.add(repo.root);
      return { scenes: new Map(each.flatMap((scenes) => [...scenes])), setup };
    },
    (error) => {
      loaded.delete(key(repo, id));
      throw error;
    },
  );
  loaded.set(key(repo, id), { written, scenes });
  return scenes;
}

const sweptFor = new Set<string>();

// Where a scene taken over stopped, and why, in Playwright's words: read in the viewer too, where there's no terminal
// above it to point to.
const stoppedAt = ({ at, why }: { at?: string; why?: string }) => `it stopped${at ? ` at ${quote(at)}` : ""}${why ? `, where Playwright says “${why}”` : ""}.`;
