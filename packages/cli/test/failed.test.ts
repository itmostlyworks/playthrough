// A flow that fails costs the agent one look at the page it stopped on, not a whole run to see it again: what Playwright
// wrote of it stays in the review's folder, and the next round runs it first.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { failedLastTime, keepFailed, whereItStopped } from "../src/flows.ts";
import { repo, type Repo } from "../src/repo.ts";

let root = "";
let app: Repo;
const was = process.cwd();

// What Playwright leaves after a run: the page a flow failed on, an empty folder for one that passed, and its own notes.
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vantage-failed-"));
  process.chdir(root);
  app = repo(root);
  await mkdir(join(app.failed("list-counts"), "filter-copy"), { recursive: true });
  await mkdir(join(app.failed("list-counts"), "count-cards"));
  await writeFile(join(app.failed("list-counts"), "filter-copy", "error-context.md"), "- button “Clear filters”");
  await writeFile(join(app.failed("list-counts"), ".last-run.json"), "{}");
});
const left = async () => (await readdir(app.failed("list-counts"))).sort();
afterEach(async () => {
  process.chdir(was);
  await rm(root, { recursive: true });
});

const copy = { flow: "Filter the board to the Copy cards", at: "Clear the filter" };

describe("A flow that fails", () => {
  test("in a round, the page it stopped on is kept, and it's run first next time", async () => {
    await keepFailed(app, "list-counts", 2, [copy]);
    assert.deepEqual(await left(), ["filter-copy", "flows.json"], "and nothing of the flows that passed");
    assert.deepEqual(await failedLastTime(app, "list-counts"), [copy.flow]);
  });

  test("on Before, the page it stopped on is kept, but it isn't run first: stopping there is how far the app went", async () => {
    await keepFailed(app, "list-counts", 0, [copy]);
    assert.deepEqual(await left(), ["filter-copy"]);
    assert.deepEqual(await failedLastTime(app, "list-counts"), []);
  });

  test("once a run has none failed, what was kept goes", async () => {
    await keepFailed(app, "list-counts", 2, [copy]);
    await keepFailed(app, "list-counts", 3, []);
    assert.equal(existsSync(app.failed("list-counts")), false);
    assert.deepEqual(await failedLastTime(app, "list-counts"), []);
  });

  test("the refusal ends with where to look, as a person in the app's folder would type it", () => {
    assert.equal(whereItStopped(app, "list-counts", [copy]), "What the page held where it stopped is in .vantage/list-counts/failed/.");
    assert.equal(whereItStopped(app, "list-counts", [copy, { flow: "Count the cards" }]), "What the page held where each stopped is in .vantage/list-counts/failed/.");
  });
});
