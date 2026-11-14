// A moment's file says with test.use what window its moments are recorded in, like a phone's screen and touch, and a
// describe() in it what holds for the moments in it. Taken over, each moment is kept with what holds for it, as Playwright
// gives it, and its window is opened with that.

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { ALONGSIDE } from "../src/run.ts";

let folder = "";
let windows: Record<string, unknown> = {};
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "playthrough-window-"));
  const test = pathToFileURL(join(import.meta.dirname, "../src/test.ts")).href;
  await writeFile(
    join(folder, "pay.spec.ts"),
    `import { test } from "${test}";
test("Pay on a phone", async () => {});
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.describe("In Swedish", () => {
  test("Pay in Swedish", async () => {});
  test.describe(() => {
    test.use({ hasTouch: false });
    test("Pay with a mouse, in Swedish", async () => {});
  });
  test.use({ locale: "sv-SE", timezoneId: "Europe/Stockholm" });
});
`,
  );
  (globalThis as Record<symbol, unknown>)[ALONGSIDE] = true;
  const { momentsIn } = await import("../src/test.ts");
  const moments = await momentsIn(join(folder, "pay.spec.ts"), 1);
  windows = Object.fromEntries([...moments].map(([name, kept]) => [name, kept.use]));
});
after(() => rm(folder, { recursive: true }));

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const swedish = { locale: "sv-SE", timezoneId: "Europe/Stockholm" };

test("stepped into, a moment is kept with what its file says with test.use, before the moment or after it", () => {
  assert.deepEqual(windows["Pay on a phone"], phone);
});

test("what a describe() says holds for the moments in it, over what's said around it", () => {
  assert.deepEqual(windows["Pay in Swedish"], { ...phone, ...swedish });
  assert.deepEqual(windows["Pay with a mouse, in Swedish"], { ...phone, ...swedish, hasTouch: false });
});
