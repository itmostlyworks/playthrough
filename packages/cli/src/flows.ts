// A review's flows: where they're written, how to write them, and running them on the app the way a person would use it.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { list, quote, Refused, type Did, type Flow } from "@playthrough/review";
import { changesByThemselves, type Recorded as Compared } from "./compare.ts";
import { keepRunning } from "./app.ts";
import { glimpsesOf, readingsOf, type Failed, type Recorded } from "./reporter.ts";
import { repo, type App, type Repo } from "./repo.ts";
import { giveBackLeft, setupIn } from "./setup.ts";
import { trySetup } from "./try-setup.ts";

// What the run needs to know, passed to Playwright whole: where the flows are and which of them to run, the folder the
// recordings go to, the app, rrweb's recorder, which goes into every page, whether it's Before, and the recordings the
// round has already, so a flow added to it is named apart from them. And when the review started, which every round's
// clock starts from, where Playwright writes what it keeps of a failed flow, when it's for the agent to see, and recorded
// again, the step each flow stopped at the first time, by the flow's name.
export type Run = { flows: string; only?: string[]; longest?: string[]; folder: string; results?: string; app: App; root: string; recorder: string; before: boolean; taken: string[]; started: string; walk?: Walk; stops?: Record<string, string> };

// A person's fork walked again on the app as it is now: the flow recorded to where they took it over (a step, and how
// far into it), what they did there done again after it, and after so many of their steps, what each of their notes is
// on looked for, by its path.
export type Walk = { flow: string; step: string; actions?: number; did: Did[]; look: { after: number; css?: string }[] };
// How far it got, in seconds of its recording: when their steps began, when each was done, and what each note is on, by
// its node in the recording; and the step it couldn't do, by its words.
export type Walked = { from: number; done: number[]; found: (number | null)[]; stopped?: string };
export const WALKED = "walked.json";

// Where a person takes a flow over: the end of one of its steps, or of the whole flow, or within a step, after as many of
// its actions. Followed, it's as far as the run may go, and the playhead rests there once it's to be handed over. Taken
// over where they were on their fork, what they did there, done before it's handed over.
export type To = { flow: string; step?: string; actions?: number; rests?: boolean; did?: Did[] };
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
// Set in Playthrough before it loads what flows import, so test() there keeps each flow to take over (following.ts).
export const ALONGSIDE = Symbol.for("playthrough: flows taken over here");
// What a flow's file says, as a Playwright annotation, when its steps do something outside the app that running it again
// would do again: test("Invite Sam", { annotation: { type: "reaches outside", description: "sends Sam an email" } }, …).
export const REACHES_OUTSIDE = "reaches outside";
// A flow pauses this long after each action, so its result can be seen: the pace every recording is watched at.
export const BEAT = 650;
// How long an action waits for what it acts on. On Before, a flow that shows what's new stops at the first thing the app
// as it is doesn't have, so that's given up on in seconds, rather than waited for as a slow page is.
export const waitsFor = ({ before }: Pick<Run, "before">) => (before ? 3000 : 10_000);

// Flows are modules whatever the app's own package.json says, so they load the same way in every repo.
export async function makeFlowsFolder(repo: Repo, id: string) {
  await mkdir(repo.flows(id), { recursive: true });
  await writeFile(join(repo.flows(id), "package.json"), `{ "type": "module" }\n`, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
}

// Flows named in a sentence: by name while they're few, and past three, how many, as each has a line of its own by it.
export const called = (names: string[]) => (names.length > 3 ? `${names.length} flows` : list(names.map(quote)));

export const isFlow = (name: string) => /\.[cm]?[jt]s$/.test(name);

export function howToWriteFlows(repo: Repo, id: string): string {
  const setupMissing = !existsSync(repo.setup);
  const missing = !existsSync(repo.appFile)
    ? `, and how to start the app in playthrough/app.json. This app has ${setupMissing ? "neither" : "no app.json"} yet: run playthrough alone for how. Playthrough tries them before it records anything.`
    : setupMissing
      ? ", which this app doesn't have yet: run playthrough alone for how."
      : ".";
  return `Each flow is a Playwright test in a .ts file in ${repo.show(repo.flows(id))}, one for each thing a person does, with a step for each part of it:

  import { test, expect } from "playthrough/test";

  test("Export a quarter", async ({ page, setup }) => {
    await test.step("Open the invoices", async () => {
      await page.goto(\`/accounts/\${setup.account}/invoices\`);
    });
    await test.step("Export the third quarter", async () => {
      await page.getByRole("button", { name: "Export" }).click();
    });
  });

The test's name is the flow's, and steps are matched across rounds by their names. What every flow starts from, like
the account it opens, is made in playthrough/setup.ts${missing}`;
}

// Runs every flow of the review on the app, the way a person would use it, for a round: each flow with its files, its
// recording and what was read at the end of each step, and each flow that failed with the step it failed at, the page
// it failed on kept for the agent. On Before, round 0, a flow that stops is recorded as far as it went. Flows added later
// are run on Before by themselves. A flow recorded for the first time is recorded twice, and what changes by itself
// between the two is unsteady. A round runs the flows that failed last time first, and one failing again stops it there,
// rather than costing the whole run.
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
  // A flow recorded on Before later runs on the setup the command has tried already.
  if (!later) await trySetup(repo, round === 0 ? `playthrough start ${id}` : `playthrough record ${id}`);
  const { started, rounds } = await repo.reviews.get(id);
  const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");
  // The flows as long as they were last round, longest first, so the round ends close to when its longest flow does.
  const longest = (rounds.filter((kept) => kept.number < round).at(-1)?.flows ?? []).toSorted((a, b) => b.length - a.length).map((flow) => flow.name);
  const run = (only?: string[], results?: string, stops?: Run["stops"]) => runOnce({ flows, only, longest, results, app, root: repo.root, recorder, before: round === 0, taken: later?.taken ?? [], started, stops });

  const last = round > 0 ? await failedLastTime(repo, id) : [];
  if (last.length) {
    console.log(`Running ${called(last)} first: ${last.length > 1 ? "they" : "it"} failed last time…`);
    const { failed } = await run(last, repo.failed(id));
    await keepFailed(repo, id, round, failed);
    const [one] = failed;
    if (failed.length > 1)
      throw new Refused([`\nThese flows failed again, so the other flows weren't run:`, ...failed.map(failedAt), `Fix them and record again. ${whereItStopped(repo, id, failed)}`]);
    if (one)
      throw new Refused([`\n${quote(one.flow)} failed again${one.at ? `, at the step ${quote(one.at)}` : ""}, so the other flows weren't run.`, `Fix it and record again. ${whereItStopped(repo, id, failed)}`]);
    console.log(`\n${last.length > 1 ? "They pass" : "It passes"} now, so every flow is recorded.\n`);
  }

  console.log(
    later
      ? `Recording ${called(later.flows)} on Before, the app as it was…`
      : round === 0
        ? `Recording Before: each flow of ${id} on the app as it is…`
        : `Recording round ${round} of ${id}…`,
  );
  const once = await run(later?.flows, repo.failed(id));
  await keepFailed(repo, id, round, once.failed);
  const again = once.recorded.filter(({ flow }) => first(flow.name));
  // A round with a flow that failed isn't recorded, so there's nothing to record twice.
  if (!again.length || (round > 0 && once.failed.length)) return once;

  console.log(`\nRecording ${called(again.map(({ flow }) => flow.name))} again, to see what changes by itself…`);
  // A flow that stopped the first time, as on Before, stops there again at once, rather than waiting as long again: what
  // it recorded up to there is what's compared. Playwright empties the folder it writes a failed flow's page to, so then
  // the second run's pages aren't kept, and the first run's stay.
  const stops = Object.fromEntries(once.failed.flatMap(({ flow, at }) => (at ? [[flow, at]] : [])));
  const results = once.failed.length ? undefined : repo.failed(id);
  const twice = await run(again.map(({ flow }) => flow.name), results, stops);
  if (results) await keepFailed(repo, id, round, twice.failed);
  const unlike = again.filter(({ flow }) => {
    const failed = (ran: typeof once) => ran.failed.find((failure) => failure.flow === flow.name)?.at;
    return !twice.recorded.some((kept) => kept.flow.name === flow.name) || failed(once) !== failed(twice);
  });
  if (unlike.length)
    throw new Refused([
      `\n${list(unlike.map(({ flow }) => quote(flow.name)))} didn't go the same way twice on the same app:`,
      ...unlike.map(({ flow }) => `  ${quote(flow.name)}: the first time, ${went(once, flow.name)}; the second, ${went(twice, flow.name)}.`),
      `So ${unlike.length > 1 ? "they don't" : "it doesn't"} start from the same place each time. ${
        app.oneAtATime
          ? "Make what every flow starts from in playthrough/setup.ts, the same each time and new for each run, and run this again."
          : `Flows run several at once on the one app, so what one makes, another can meet: make what every flow starts from in playthrough/setup.ts, the same each time and new for each run. Where a page shows what every run made, as a blog's index lists every post, say "oneAtATime": true in playthrough/app.json instead. Then run this again.`
      }`,
    ]);
  const byThemselves = await changesByThemselves(inMemory(round, again), inMemory(round, twice.recorded.filter(({ flow }) => first(flow.name))));
  for (const { flow } of again) {
    const unsteady = byThemselves.filter((change) => change.seen.some((place) => place.flow === flow.name));
    if (!unsteady.length) continue;
    flow.unsteady = unsteady.map((change) => change.id);
    console.log(`\nIn ${quote(flow.name)}, this changes by itself, so it's left out of every comparison, in every flow:\n${unsteady.map((change) => `  ${change.words}`).join("\n")}\nIf it can be made the same each time, in playthrough/setup.ts, do that and record again: a real change to it won't be seen.`);
  }
  return once;
}

// How a flow went in one run: to its end, or where it stopped, in Playwright's words.
function went(ran: Ran, name: string): string {
  const failure = ran.failed.find((failed) => failed.flow === name);
  if (!failure) return "it went to its end";
  const because = failure.why ? `, where Playwright says “${failure.why}”` : "";
  return failure.at ? `it stopped at ${quote(failure.at)}${because}` : `it stopped before its first step${because}`;
}

// A run with a flow that failed keeps what Playwright wrote of the page it failed on, and one with none lets it go. A
// round's are named there too, to run first next time; on Before, a flow stopping is how far the app went, not a mistake.
export async function keepFailed(repo: Repo, id: string, round: number, failed: Failed[]) {
  const folder = repo.failed(id);
  if (!failed.length) return rm(folder, { recursive: true, force: true });
  // Playwright makes a folder for every flow, and notes its own run beside them: only what it wrote of a failed one stays.
  for (const entry of await readdir(folder).catch(() => [])) {
    const path = join(folder, entry);
    if (entry === ".last-run.json" || !(await readdir(path)).length) await rm(path, { recursive: true });
  }
  if (round === 0) return;
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, FAILED), JSON.stringify(failed.map(({ flow }) => flow)));
}

export const failedLastTime = (repo: Repo, id: string): Promise<string[]> =>
  readFile(join(repo.failed(id), FAILED), "utf8").then(JSON.parse, () => []);
const FAILED = "flows.json";

// The last line of a refusal over flows that failed: where to see what they stopped on.
export const whereItStopped = (repo: Repo, id: string, failed: Failed[]) =>
  `What the page held where ${failed.length > 1 ? "each" : "it"} stopped is in ${repo.show(repo.failed(id))}/.`;

// A run as it came, read from its files rather than from what's kept.
function inMemory(number: number, recorded: Ran["recorded"]): Compared {
  const flows = recorded.map(({ flow }) => flow);
  const file = (name: string) => recorded.flatMap(({ files }) => files).find((file) => file.name === name)!.bytes;
  const glimpses = async (flow: Flow) => {
    const bytes = recorded.flatMap(({ files }) => files).find((file) => file.name === glimpsesOf(flow))?.bytes;
    return bytes ? JSON.parse(bytes.toString()) : [];
  };
  return { number, flows, readings: async (flow) => JSON.parse(file(readingsOf(flow)).toString()), glimpses, picture: async (name) => file(name) };
}

type Ran = { recorded: { flow: Flow; files: { name: string; bytes: Buffer }[]; wrote?: string }[]; failed: Failed[] };

async function runOnce(run: Omit<Run, "folder">): Promise<Ran> {
  const folder = await mkdtemp(join(tmpdir(), "playthrough-"));
  try {
    const ran = await playwright({ ...run, folder });
    const text = await readFile(join(folder, "flows.json"), "utf8").catch(() => undefined);
    const { recorded, failed }: { recorded: Recorded[]; failed: Failed[] } = text ? JSON.parse(text) : { recorded: [], failed: [] };
    if (!ran && !failed.length) throw new Refused(["\nThe flows didn't run, for the reason Playwright gives above. Fix that and run this again."]);
    const withFiles = ({ flow, files, wrote }: Recorded) => Promise.all(files.map(async (name) => ({ name, bytes: await readFile(join(folder, name)) }))).then((files) => ({ flow, files, ...(wrote && { wrote }) }));
    return { recorded: await Promise.all(recorded.map(withFiles)), failed };
  } finally {
    await rm(folder, { recursive: true });
  }
}

// A person's fork walked again on the app as it is now (test.ts): its recording, what was read after each of their
// steps, the fonts and pictures it loaded, a picture for each note looked for, and how far it got. Nothing when the flow
// never got to where they took it over.
export type WalkedRun = Walked & { events: { timestamp: number }[]; readings: unknown[]; assets: Record<string, string>; files: { name: string; bytes: Buffer }[]; pictures: (Buffer | undefined)[] };

export async function walkFork(repo: Repo, id: string, walk: Walk): Promise<WalkedRun | undefined> {
  const app = await repo.app();
  const { started } = await repo.reviews.get(id);
  const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");
  const folder = await mkdtemp(join(tmpdir(), "playthrough-"));
  try {
    await playwright({ flows: repo.flows(id), folder, app, root: repo.root, recorder, before: false, taken: [], started, walk });
    const text = await readFile(join(folder, WALKED), "utf8").catch(() => undefined);
    if (!text) return undefined;
    const walked = JSON.parse(text);
    const files = await Promise.all([...new Set(Object.values(walked.assets as Record<string, string>))].map(async (name) => ({ name, bytes: await readFile(join(folder, name)) })));
    const pictures = await Promise.all(walk.look.map((_, i) => readFile(join(folder, `look-${i}.png`)).catch(() => undefined)));
    return { ...walked, files, pictures };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

// A flow that failed, at the step it failed at, and why, as a line of a refusal.
export const failedAt = ({ flow, at, why }: Failed) => `  ${quote(flow)}${at ? `, at the step ${quote(at)}` : ""}${why ? `, where Playwright says “${why}”` : ""}`;
async function playwright(run: Run): Promise<boolean> {
  // Flows import playthrough/test from the app, so it has to be one of the app's packages.
  try {
    createRequire(join(run.root, "package.json")).resolve("playthrough/test");
  } catch {
    throw new Refused(["Playthrough isn't installed in this app, so its flows can't import playthrough/test. Install it as a dev dependency (npm install --save-dev playthrough), then run this again."]);
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
