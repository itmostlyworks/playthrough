// Starts a review: what was asked, in the person's words, and a folder for the flows that will show it.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Repo } from "./repo.ts";

export async function start(repo: Repo, id: string, title: string) {
  await repo.reviews.start(id, title);
  await makeFlowsFolder(repo, id);
  console.log(`Started ${id}: “${title}”.\n\n${howToWriteFlows(repo, id)}\n\nThen record round 1: vantage record ${id}`);
}

// Flows are modules whatever the app's own package.json says, so they load the same way in every repo.
export async function makeFlowsFolder(repo: Repo, id: string) {
  await mkdir(repo.flows(id), { recursive: true });
  await writeFile(join(repo.flows(id), "package.json"), `{ "type": "module" }\n`, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
}

export function howToWriteFlows(repo: Repo, id: string): string {
  return `Write its flows in ${repo.show(repo.flows(id))}, one Playwright test for each thing a person does, with a step for each part of it:

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
