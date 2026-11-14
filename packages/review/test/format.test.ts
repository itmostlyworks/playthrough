// What's kept in an older shape comes over once, showing what it showed: each piece as it would be kept had it been
// made now.

import assert from "node:assert/strict";
import { test } from "node:test";
import { sceneNow, wayNow, type Scene } from "../src/index.ts";

// A moment kept before moments had a start: everything done in its one step, with no `from`.
const kept = (began: [string, number, number][], length = 10): Scene =>
  ({
    name: "“BS-WEB” is refused",
    length,
    recording: "bs-web.json",
    steps: [{ title: "“BS-WEB” is refused", at: 0, actions: began.map(([, , at]) => at), began: began.map(([action, at]) => ({ action, at })) }],
  }) as unknown as Scene;

test("a moment kept before moments had a start is given the one it was shown from, a little before its first thing", () => {
  const scene = kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3], ["type textbox “Card prefix”", 4.5, 5.5], ["click button “Update”", 6.5, 7]]);
  assert.equal(sceneNow(scene).from, 3.5);
});

test("one kept before that ends on a page arrived at by a link, with nothing done there, is a still: where its end holds", () => {
  assert.equal(sceneNow(kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3]])).from, 8.5);
  assert.equal(sceneNow(kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3]], 4)).from, 3.1, "and never before the last thing done");
});

test("never from before the thing done before the first shown", () => {
  assert.equal(sceneNow(kept([["click link “Settings”", 1, 1.5], ["press Enter textbox “Search”", 1.8, 2]])).from, 1.5);
});

test("one kept before with nothing done in it at all is a still where its end holds", () => {
  assert.equal(sceneNow(kept([], 30)).from, 28.5);
});

test("one an older again gave 0, by its step starting the recording, is given where it was shown from too", () => {
  const scene = { ...kept([["click", 7.25, 7.29], ["click link “Workspace”", 8.88, 8.92]], 11.603), from: 0 };
  assert.equal(sceneNow(scene).from, 10.103);
});

test("one with a start keeps it, so bringing it along again changes nothing", () => {
  const scene = { ...kept([["click link “Settings”", 1, 1.5]]), from: 0.4 };
  assert.equal(sceneNow(scene), scene);
  const once = sceneNow(kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3]]));
  assert.deepEqual(sceneNow(once), once);
});

const old = `import { expect, test } from "playthrough/test";

test.use({ person: "Sam" });

test("The prefix shows but can't be changed", async ({ page, setup, baseURL }) => {
  await test.step("The prefix shows but can't be changed", async () => {
    await page.waitForURL(\`\${baseURL}/login\`, { timeout: 3000 }).catch(() => page.goto(\`\${baseURL}/login\`));
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("link", { name: "Workspace", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Card prefix", exact: true })).toBeVisible();
  });
});
`;
const prefix = (from: number): Scene => ({ ...kept([["click", 7.25, 7.29], ["click link “Workspace”", 8.88, 8.92]], 11.603), from });

test("a moment's way kept doing everything in its step does what comes before where it's shown from before its step", () => {
  const still = wayNow(old, prefix(10.103));
  assert.match(still, /^test\(.*\n {2}await page\.waitForURL.*\n {2}await page.*Settings.*\n {2}await page.*Workspace.*\n {2}await test\.step\(.*\n {4}await expect/m);
  const moving = wayNow(old, prefix(8));
  assert.match(moving, /^test\(.*\n {2}await page\.waitForURL.*\n {2}await page.*Settings.*\n {2}await test\.step\(.*\n {4}await page.*Workspace/m);
  assert.equal(wayNow(still, prefix(10.103)), still, "and a way already before its step stays as it is");
});

test("a way whose things done its recording counted otherwise is left as it is", () => {
  assert.equal(wayNow(old, { ...prefix(10.103), steps: [{ title: "x", at: 0, actions: [1] }] }), old);
});
