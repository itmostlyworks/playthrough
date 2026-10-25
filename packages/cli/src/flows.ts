// A review's flows: where they're written, how to write them, and running them on the app the way a person would use it.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Refused, type Flow } from "@vantage/review";
import type { App, Repo } from "./repo.ts";

// What the run needs to know, passed to Playwright whole: where the flows are, the folder the recordings go to, the app,
// and rrweb's recorder, which goes into every page.
export type Run = { flows: string; folder: string; app: App; root: string; recorder: string };

// Flows are modules whatever the app's own package.json says, so they load the same way in every repo.
export async function makeFlowsFolder(repo: Repo, id: string) {
  await mkdir(repo.flows(id), { recursive: true });
  await writeFile(join(repo.flows(id), "package.json"), `{ "type": "module" }\n`, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
}

export function howToWriteFlows(repo: Repo, id: string): string {
  return `Each flow is a Playwright test in ${repo.show(repo.flows(id))}, one for each thing a person does, with a step for each part of it:

  import { test, expect } from "@vantage/cli/test";

  test("Export a quarter", async ({ page }) => {
    await test.step("Open the invoices", async () => {
      await page.goto("/");
    });
    await test.step("Export the third quarter", async () => {
      await page.getByRole("button", { name: "Export" }).click();
    });
  });

The test's name is the flow's, and steps are matched across rounds by their names.`;
}

// Runs every flow of the review on the app, the way a person would use it, and gives back each one's recording and the
// name of each one that failed.
export async function runFlows(repo: Repo, id: string, saying: string): Promise<{ recorded: { flow: Flow; bytes: Buffer }[]; failed: string[] }> {
  const flows = repo.flows(id);
  if (!(await readdir(flows).catch(() => [])).some((name) => /\.[cm]?[jt]s$/.test(name)))
    throw new Refused([`${id} has no flows yet. ${howToWriteFlows(repo, id)}`]);
  await makeFlowsFolder(repo, id);
  const app = await repo.app();

  const folder = await mkdtemp(join(tmpdir(), "vantage-"));
  try {
    console.log(saying);
    const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");
    const ran = await playwright({ flows, folder, app, root: repo.root, recorder });
    const text = await readFile(join(folder, "flows.json"), "utf8").catch(() => undefined);
    const { recorded, failed }: { recorded: Flow[]; failed: string[] } = text ? JSON.parse(text) : { recorded: [], failed: [] };
    if (!ran && !failed.length) throw new Refused(["The flows didn't run, for the reason Playwright gives above. Fix that and run this again."]);
    return { recorded: await Promise.all(recorded.map(async (flow) => ({ flow, bytes: await readFile(join(folder, flow.recording)) }))), failed };
  } finally {
    await rm(folder, { recursive: true });
  }
}

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
