// Running a change's moments on the app, the way a person would use it, each its way there and its one step, as Playwright
// moments; and what the recorder, the runner and taking over share.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Refused, type Moment } from "@playthrough/change";
import { findingsByThemselves, type Recorded as Compared } from "./compare.ts";
import { keepRunning } from "./app.ts";
import { glimpsesOf, readingsOf, type Failed, type Recorded } from "./reporter.ts";
import { repo, type App } from "./repo.ts";
import { giveBackLeft, setupIn } from "./setup.ts";

// rrweb's recorder, which goes into every page a moment opens, and every page of the app taken over.
export const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");

// What the run needs to know, passed to Playwright whole: where the moments are and which of them to run, the folder the
// recordings go to, the app, rrweb's recorder, which goes into every page, and when the change started, which every
// hand-back's clock starts from.
export type Run = { moments: string; only?: string[]; folder: string; app: App; root: string; recorder: string; started: string };

// What an action was done on, as a person points at it: its role and name, as getByRole finds it.
export type On = { role: string; name: string };

// What a dev server draws over the app of its own, as Next's "N" badge, isn't the app: it's hidden in every page a moment
// records and every page of the app taken over, never in the app itself. A sheet the page adopts, not an element in it,
// so nothing the app renders is changed.
export const QUIET_DEV_CHROME = `{
  const quiet = new CSSStyleSheet();
  quiet.replaceSync("nextjs-portal { display: none !important; }");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, quiet];
}`;

// Where a person takes over a moment: after so many things done in its step, counting those of its way there that the
// step does (doneAt, doneBefore); or, with none said, at its end, everything done.
export type To = { moment: string; after?: number };
// The moment's page there, as a browser keeps it: its address, its cookies, what the app kept in the browser, how far it
// was scrolled, how far its clock, the recordings', is ahead of the real one, in milliseconds, and what its browser said
// of itself. And partway through a step, the actions to do again there, which changed only what was in the page's
// memory.
export type Handed = { url: string; cookies: Cookie[]; local: Record<string, string>; session: Record<string, string>; scroll: { x: number; y: number }; clock: number; browser: Browser; again?: Action[] };
// Whether it asked for dark and for little motion, and the languages it read in.
export type Browser = { dark: boolean; still: boolean; languages: string[]; touch?: boolean };
// An action of the moment's, done again in the person's browser: what it did, on the element at that path, with what,
// and a click with which button, where it wasn't the left.
export type Action = { does: string; on: string; with?: string | boolean | string[]; button?: "right" | "middle" };
export type Cookie = { name: string; value: string; path: string; expires: number; httpOnly: boolean };
// Set in Playthrough before it loads what moments import, so test() there keeps each moment to take over (following.ts).
export const ALONGSIDE = Symbol.for("playthrough: moments taken over here");
// A moment pauses this long after each action, so its result can be seen: the pace every recording is watched at.
export const BEAT = 650;
// How long an action waits for what it acts on.
export const WAITS = 10_000;

export const isMomentFile = (name: string) => /\.[cm]?[jt]s$/.test(name);

// The same moments recorded twice on the same app: what differs between the two changes by itself, and is kept on each
// moment it's in as unsteady, so it's left out of every comparison. Said, a change at a time.
export async function markUnsteady(handBack: number, once: Ran["recorded"], twice: Ran["recorded"]) {
  const byThemselves = await findingsByThemselves(inMemory(handBack, once), inMemory(handBack, twice));
  for (const { moment } of once) {
    const pieces = byThemselves.filter((finding) => finding.seen.some((place) => place.moment === moment.name)).flatMap((finding) => finding.pieces);
    if (pieces.length) moment.unsteady = [...new Set(pieces)];
  }
  return byThemselves;
}

// A run as it came, read from its files rather than from what's kept.
function inMemory(number: number, recorded: Ran["recorded"]): Compared {
  const moments = recorded.map(({ moment }) => moment);
  const file = (name: string) => recorded.flatMap(({ files }) => files).find((file) => file.name === name)!.bytes;
  const glimpses = async (moment: Moment) => {
    const bytes = recorded.flatMap(({ files }) => files).find((file) => file.name === glimpsesOf(moment))?.bytes;
    return bytes ? JSON.parse(bytes.toString()) : [];
  };
  return { number, moments, readings: async (moment) => JSON.parse(file(readingsOf(moment)).toString()), glimpses, picture: async (name) => file(name) };
}

// What a run recorded, and what failed.
export type Ran = { recorded: { moment: Moment; files: { name: string; bytes: Buffer }[] }[]; failed: Failed[] };

export async function runOnce(run: Omit<Run, "folder">): Promise<Ran> {
  const folder = await mkdtemp(join(tmpdir(), "playthrough-"));
  try {
    const ran = await playwright({ ...run, folder });
    const text = await readFile(join(folder, "moments.json"), "utf8").catch(() => undefined);
    const { recorded, failed }: { recorded: Recorded[]; failed: Failed[] } = text ? JSON.parse(text) : { recorded: [], failed: [] };
    if (!ran && !failed.length) throw new Refused(["\nIt didn't run, for the reason Playwright gives above. Fix that and run this again."]);
    const withFiles = ({ files, ...recorded }: Recorded) => Promise.all(files.map(async (name) => ({ name, bytes: await readFile(join(folder, name)) }))).then((files) => ({ ...recorded, files }));
    return { recorded: await Promise.all(recorded.map(withFiles)), failed };
  } finally {
    await rm(folder, { recursive: true });
  }
}

async function playwright(run: Run): Promise<boolean> {
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
