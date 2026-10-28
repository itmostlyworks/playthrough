// A review's flows: where they're written, how to write them, and running them on the app the way a person would use it.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { list, quote, Refused, type Did, type Flow } from "@mostlyworks/vantage-review";
import { changesByThemselves, type Recorded as Compared } from "./compare.ts";
import { readingsOf, type Failed, type Recorded } from "./reporter.ts";
import type { App, Repo } from "./repo.ts";

// What the run needs to know, passed to Playwright whole: where the flows are and which of them to run, the folder the
// recordings go to, the app, rrweb's recorder, which goes into every page, whether it's Before, and the recordings the
// round has already, so a flow added to it is named apart from them. And when the review started, which every round's
// clock starts from. Or where a person takes a flow over, which a run in the background is told, and told again, in
// `orders`.
export type Run = { flows: string; only?: string[]; folder: string; app: App; root: string; recorder: string; before: boolean; taken: string[]; started: string; to?: To; orders?: string };

// Where a person takes a flow over: the end of one of its steps, or of the whole flow, or within a step, after as many of
// its actions. Followed, it's as far as the run may go, and the playhead rests there once it's to be handed over.
export type To = { flow: string; step?: string; actions?: number; rests?: boolean };
// The flow's page there, as a browser keeps it: its address, its cookies, what the app kept in the browser, how far it
// was scrolled, how far its clock, the recordings', is ahead of the real one, in milliseconds, and what its browser said
// of itself. And partway through a step, the actions to do again there, which changed only what was in the page's
// memory. Taken over on a person's branch, what they did there, done again after them.
export type Handed = { url: string; cookies: Cookie[]; local: Record<string, string>; session: Record<string, string>; scroll: { x: number; y: number }; clock: number; browser: Browser; again?: Action[]; did?: Did[] };
// Whether it asked for dark and for little motion, and the languages it read in.
export type Browser = { dark: boolean; still: boolean; languages: string[] };
// An action of the flow's, done again in the person's browser: what it did, on the element at that path, with what.
export type Action = { does: string; on: string; with?: string | boolean | string[] };
export type Cookie = { name: string; value: string; path: string; expires: number; httpOnly: boolean };
export const HANDED = "handed.json";
// A flow pauses this long after each action, so its result can be seen: the pace every recording is watched at.
export const BEAT = 650;

// Flows are modules whatever the app's own package.json says, so they load the same way in every repo.
export async function makeFlowsFolder(repo: Repo, id: string) {
  await mkdir(repo.flows(id), { recursive: true });
  await writeFile(join(repo.flows(id), "package.json"), `{ "type": "module" }\n`, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
}

const isFlow = (name: string) => /\.[cm]?[jt]s$/.test(name);

export function howToWriteFlows(repo: Repo, id: string): string {
  const setupMissing = !existsSync(repo.setup);
  return `Each flow is a Playwright test in ${repo.show(repo.flows(id))}, one for each thing a person does, with a step for each part of it:

  import { test, expect } from "@mostlyworks/vantage/test";

  test("Export a quarter", async ({ page, setup }) => {
    await test.step("Open the invoices", async () => {
      await page.goto(\`/accounts/\${setup.account}/invoices\`);
    });
    await test.step("Export the third quarter", async () => {
      await page.getByRole("button", { name: "Export" }).click();
    });
  });

The test's name is the flow's, and steps are matched across rounds by their names. What every flow starts from, like
the account it opens, is made in vantage/setup.ts${setupMissing ? ", which this app doesn't have yet" : ""}: run vantage alone for how.`;
}

// Runs every flow of the review on the app, the way a person would use it, for a round: each flow with its files, its
// recording and what was read at the end of each step, and each flow that failed with the step it failed at. On Before,
// round 0, a flow that stops is recorded as far as it went. Flows added later are run on Before by themselves. A flow
// recorded for the first time is recorded twice, and what changes by itself between the two is unsteady.
export async function runFlows(
  repo: Repo,
  id: string,
  round: number,
  { later, first }: { later?: { flows: string[]; taken: string[] }; first: (flow: string) => boolean },
): Promise<Ran> {
  const flows = repo.flows(id);
  if (!(await readdir(flows).catch(() => [])).some(isFlow))
    throw new Refused([`${id} has no flows yet. ${howToWriteFlows(repo, id)}`]);
  await makeFlowsFolder(repo, id);
  const app = await repo.app();
  const { started } = await repo.reviews.get(id);
  const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");
  const run = (only?: string[]) => runOnce({ flows, only, app, root: repo.root, recorder, before: round === 0, taken: later?.taken ?? [], started });

  console.log(
    later
      ? `Recording ${list(later.flows.map(quote))} on Before, the app as it was…`
      : round === 0
        ? `Recording Before: each flow of ${id} on the app as it is…`
        : `Recording round ${round} of ${id}…`,
  );
  const once = await run(later?.flows);
  const again = once.recorded.filter(({ flow }) => first(flow.name));
  if (!again.length) return once;

  console.log(`\nRecording ${list(again.map(({ flow }) => quote(flow.name)))} again, to see what changes by itself…`);
  const twice = await run(again.map(({ flow }) => flow.name));
  const unlike = again.filter(({ flow }) => {
    const failed = (ran: typeof once) => ran.failed.find((failure) => failure.flow === flow.name)?.at;
    return !twice.recorded.some((kept) => kept.flow.name === flow.name) || failed(once) !== failed(twice);
  });
  if (unlike.length)
    throw new Refused([
      `${list(unlike.map(({ flow }) => quote(flow.name)))} didn't go the same way twice on the same app, so ${unlike.length > 1 ? "they don't" : "it doesn't"} start from the same place each time. Make what every flow starts from in vantage/setup.ts, the same each time, and run this again.`,
    ]);
  const byThemselves = await changesByThemselves(inMemory(round, again), inMemory(round, twice.recorded));
  for (const { flow } of again) {
    const unsteady = byThemselves.filter((change) => change.seen.some((place) => place.flow === flow.name));
    if (!unsteady.length) continue;
    flow.unsteady = unsteady.map((change) => change.id);
    console.log(`\nIn ${quote(flow.name)}, this changes by itself, so it's left out of every comparison of the flow:\n${unsteady.map((change) => `  ${change.words}`).join("\n")}\nIf it can be made the same each time, in vantage/setup.ts, do that and record again: a real change to it won't be seen.`);
  }
  return once;
}

// Runs one flow to where a person takes it over, on the app as it is now: quickly and unrecorded, from what every flow
// starts from, so they carry on from a fresh copy of the moment rather than a picture of it. The run that has followed
// the playhead there is there already; one that went past it, the playhead having gone back, is run again.
export async function runTo(repo: Repo, id: string, to: To): Promise<Handed> {
  const where = !to.step ? "its end" : to.actions ? `action ${to.actions} of ${quote(to.step)}` : `the end of ${quote(to.step)}`;
  try {
    for (const fresh of [false, true]) {
      const one = await inTurn(repo, id, async () => {
        const one = await followingFor(repo, id, to.flow, fresh);
        following.delete(key(repo, id));
        return one;
      });
      try {
        await order(one, { ...to, rests: true });
        await one.ran;
        const text = await readFile(join(one.folder, HANDED), "utf8").catch(() => undefined);
        if (text) return JSON.parse(text);
        const { failed }: { failed: Failed[] } = JSON.parse(await readFile(join(one.folder, "flows.json"), "utf8").catch(() => `{ "failed": [] }`));
        if (failed.length) throw new Refused([`${quote(to.flow)} didn't get to ${where}:\n${failed.map(failedAt).join("\n")}`]);
      } finally {
        await rm(one.folder, { recursive: true, force: true });
      }
    }
    throw new Refused([`${quote(to.flow)} didn't get to ${where}, for the reason Playwright gives above.`]);
  } finally {
    // The next one starts there while the person looks, in case they play on.
    void follow(repo, id, { flow: to.flow, step: to.step, actions: to.actions }).catch(() => {});
  }
}

// While the latest round plays, a run of the flow keeps up with the playhead, as far as it has gone and no further, so
// the moment it comes to rest on is there already.
export const follow = (repo: Repo, id: string, to: To) => inTurn(repo, id, async () => order(await followingFor(repo, id, to.flow), to));

// A run of one flow in the background, its browser open, told how far it may go. One that's over, or for flows or a
// setup that have changed since, or for another flow, is stopped, and a spare takes its place: starting one takes most
// of a second, and the playhead going back to a flow's start, which no run can follow, is common.
type Following = { folder: string; orders: string; ran: Promise<boolean>; stop: () => void; over?: boolean; written: number; flow: string };
const following = new Map<string, Following>();
const spares = new Map<string, Following>();
const key = (repo: Repo, id: string) => `${repo.root}\n${id}`;

async function followingFor(repo: Repo, id: string, flow: string, fresh = false): Promise<Following> {
  const files = [...(await readdir(repo.flows(id))).filter(isFlow).map((name) => join(repo.flows(id), name)), repo.setup];
  const written = Math.max(...(await Promise.all(files.map((file) => stat(file).then((it) => it.mtimeMs, () => 0)))));
  const one = following.get(key(repo, id));
  if (one && !one.over && !fresh && one.written === written && one.flow === flow) return one;
  if (one) done(one);
  let spare = spares.get(key(repo, id));
  if (!spare || spare.over || spare.written !== written) {
    if (spare) done(spare);
    spare = await start(repo, id, written);
  }
  following.set(key(repo, id), Object.assign(spare, { flow }));
  spares.set(key(repo, id), await start(repo, id, written));
  return spare;
}

async function start(repo: Repo, id: string, written: number): Promise<Following> {
  const app = await repo.app();
  const { started } = await repo.reviews.get(id);
  const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");
  const folder = await mkdtemp(join(tmpdir(), "vantage-"));
  const orders = join(folder, "orders.json");
  const made: Following = { folder, orders, written, flow: "", stop: () => {}, ran: Promise.resolve(false) };
  made.ran = playwright({ flows: repo.flows(id), folder, app, root: repo.root, recorder, before: false, taken: [], started, to: { flow: "" }, orders }, (child) => {
    made.stop = () => child.kill();
  }).finally(() => (made.over = true));
  return made;
}

function done(one: Following) {
  one.stop();
  void one.ran.then(() => rm(one.folder, { recursive: true, force: true }));
}

// Told whole, so it never reads half of it.
async function order({ orders }: Following, to: To) {
  await writeFile(`${orders}.part`, JSON.stringify(to));
  await rename(`${orders}.part`, orders);
}

// One at a time for each review, as the playhead moves faster than a run starts.
const turns = new Map<string, Promise<unknown>>();
function inTurn<T>(repo: Repo, id: string, then: () => Promise<T>): Promise<T> {
  const done = (turns.get(key(repo, id)) ?? Promise.resolve()).then(then);
  turns.set(key(repo, id), done.catch(() => {}));
  return done;
}

// A run as it came, read from its files rather than from what's kept.
function inMemory(number: number, recorded: Ran["recorded"]): Compared {
  const flows = recorded.map(({ flow }) => flow);
  const file = (name: string) => recorded.flatMap(({ files }) => files).find((file) => file.name === name)!.bytes;
  return { number, flows, readings: async (flow) => JSON.parse(file(readingsOf(flow)).toString()), picture: async (name) => file(name) };
}

type Ran = { recorded: { flow: Flow; files: { name: string; bytes: Buffer }[] }[]; failed: Failed[] };

async function runOnce(run: Omit<Run, "folder">): Promise<Ran> {
  const folder = await mkdtemp(join(tmpdir(), "vantage-"));
  try {
    const ran = await playwright({ ...run, folder });
    const text = await readFile(join(folder, "flows.json"), "utf8").catch(() => undefined);
    const { recorded, failed }: { recorded: Recorded[]; failed: Failed[] } = text ? JSON.parse(text) : { recorded: [], failed: [] };
    if (!ran && !failed.length) throw new Refused(["The flows didn't run, for the reason Playwright gives above. Fix that and run this again."]);
    const withFiles = ({ flow, files }: Recorded) => Promise.all(files.map(async (name) => ({ name, bytes: await readFile(join(folder, name)) }))).then((files) => ({ flow, files }));
    return { recorded: await Promise.all(recorded.map(withFiles)), failed };
  } finally {
    await rm(folder, { recursive: true });
  }
}

// A flow that failed, at the step it failed at, as a line of a refusal.
export const failedAt = ({ flow, at }: Failed) => `  ${quote(flow)}${at ? `, at the step ${quote(at)}` : ""}`;

function playwright(run: Run, started?: (child: ChildProcess) => void): Promise<boolean> {
  const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
  const config = fileURLToPath(new URL("./playwright.config.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", "--config", config], {
      cwd: run.root,
      stdio: "inherit",
      env: { ...process.env, VANTAGE_RUN: JSON.stringify(run) },
    });
    // It goes when Vantage does, waiting or not.
    const stop = () => child.kill();
    process.once("exit", stop);
    started?.(child);
    child.on("error", reject);
    child.on("exit", (code) => {
      process.off("exit", stop);
      resolve(code === 0);
    });
  });
}
