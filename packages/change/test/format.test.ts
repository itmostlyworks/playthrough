// What's kept in an older shape comes over once, showing what it showed: each piece as it would be kept had it been
// made now.

import assert from "node:assert/strict";
import { test } from "node:test";
import { momentNow, wayNow, type Moment } from "../src/index.ts";

// A moment kept before moments had a start: everything done in its one step, with no `from`.
const kept = (began: [string, number, number][], length = 10): Moment =>
  ({
    name: "“BS-WEB” is refused",
    length,
    recording: "bs-web.json",
    steps: [{ title: "“BS-WEB” is refused", at: 0, actions: began.map(([, , at]) => at), began: began.map(([action, at]) => ({ action, at })) }],
  }) as unknown as Moment;

test("a moment kept before moments had a start is given the one it was shown from, a little before its first thing", () => {
  const moment = kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3], ["type textbox “Card prefix”", 4.5, 5.5], ["click button “Update”", 6.5, 7]]);
  assert.equal(momentNow(moment).from, 3.5);
});

test("one kept before that ends on a page arrived at by a link, with nothing done there, is a still: where its end holds", () => {
  assert.equal(momentNow(kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3]])).from, 8.5);
  assert.equal(momentNow(kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3]], 4)).from, 3.1, "and never before the last thing done");
});

test("never from before the thing done before the first shown", () => {
  assert.equal(momentNow(kept([["click link “Settings”", 1, 1.5], ["press Enter textbox “Search”", 1.8, 2]])).from, 1.5);
});

test("one kept before with nothing done in it at all is a still where its end holds", () => {
  assert.equal(momentNow(kept([], 30)).from, 28.5);
});

test("one an older again gave 0, by its step starting the recording, is given where it was shown from too", () => {
  const moment = { ...kept([["click", 7.25, 7.29], ["click link “Workspace”", 8.88, 8.92]], 11.603), from: 0 };
  assert.equal(momentNow(moment).from, 10.103);
});

test("one with a start keeps it, and one already brought along comes back as it is", () => {
  assert.equal(momentNow({ ...kept([["click link “Settings”", 1, 1.5]]), from: 0.4 }).from, 0.4);
  const once = momentNow(kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3]]));
  assert.equal(momentNow(once), once);
});

test("what an older moment did in its one step is one list: each thing done, what it was and when it began", () => {
  assert.deepEqual(momentNow(kept([["click link “Settings”", 1, 1.5]])).actions, [{ at: 1.5, what: "click link “Settings”", began: 1 }]);
  const unnamed = { name: "Pick Ana", length: 4, recording: "a.json", from: 0.5, steps: [{ title: "Pick Ana", at: 0, actions: [1, 3] }] } as unknown as Moment;
  assert.deepEqual(momentNow(unnamed), { name: "Pick Ana", length: 4, recording: "a.json", from: 0.5, actions: [{ at: 1 }, { at: 3 }] }, "one kept without what each was, as it is");
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
const prefix = (from: number): Moment => ({ ...momentNow(kept([["click", 7.25, 7.29], ["click link “Workspace”", 8.88, 8.92]], 11.603)), from });

test("a moment's way kept doing everything in its step does what comes before where it's shown from before its step", () => {
  const still = wayNow(old, prefix(10.103));
  assert.match(still, /^test\(.*\n {2}await page\.waitForURL.*\n {2}await page.*Settings.*\n {2}await page.*Workspace.*\n {2}await test\.step\(.*\n {4}await expect/m);
  const moving = wayNow(old, prefix(8));
  assert.match(moving, /^test\(.*\n {2}await page\.waitForURL.*\n {2}await page.*Settings.*\n {2}await test\.step\(.*\n {4}await page.*Workspace/m);
  assert.equal(wayNow(still, prefix(10.103)), still, "and a way already before its step stays as it is");
});

test("a way whose things done its recording counted otherwise is left as it is", () => {
  assert.equal(wayNow(old, { ...prefix(10.103), actions: [{ at: 1 }] }), old);
});
