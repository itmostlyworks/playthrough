// A review's flows: where they're written, how to write them, and running them on the app the way a person would use it.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { list, quote, Refused, type Flow } from "@vantage/review";
import { changesByThemselves, type Recorded as Compared } from "./compare.ts";
import { readingsOf, type Failed, type Recorded } from "./reporter.ts";
import type { App, Repo } from "./repo.ts";

// What the run needs to know, passed to Playwright whole: where the flows are and which of them to run, the folder the
// recordings go to, the app, rrweb's recorder, which goes into every page, whether it's Before, and the recordings the
// round has already, so a flow added to it is named apart from them. And when the review started, which every round's
// clock starts from.
export type Run = { flows: string; only?: string[]; folder: string; app: App; root: string; recorder: string; before: boolean; taken: string[]; started: string };

// Flows are modules whatever the app's own package.json says, so they load the same way in every repo.
export async function makeFlowsFolder(repo: Repo, id: string) {
  await mkdir(repo.flows(id), { recursive: true });
  await writeFile(join(repo.flows(id), "package.json"), `{ "type": "module" }\n`, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
}

export function howToWriteFlows(repo: Repo, id: string): string {
  const setupMissing = !existsSync(repo.setup);
  return `Each flow is a Playwright test in ${repo.show(repo.flows(id))}, one for each thing a person does, with a step for each part of it:

  import { test, expect } from "@vantage/cli/test";

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
  if (!(await readdir(flows).catch(() => [])).some((name) => /\.[cm]?[jt]s$/.test(name)))
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

function playwright(run: Run): Promise<boolean> {
  const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
  const config = fileURLToPath(new URL("./playwright.config.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", "--config", config], {
      cwd: run.root,
      stdio: "inherit",
      env: { ...process.env, VANTAGE_RUN: JSON.stringify(run) },
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code === 0));
  });
}
