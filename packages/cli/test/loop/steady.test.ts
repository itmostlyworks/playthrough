// What the command line promises about a steady start, run for real: every flow starts from the same moment and what the
// app's vantage/setup.ts makes, a recording keeps the images it shows, and what changes by itself between two recordings
// of the same app is found once and left out of every comparison. In a copy of the example app of its own, recording in
// Chromium beside the other stories.

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { example, type Example } from "./example.ts";

let app: Example;
before(async () => void (app = await example(4473)));
after(() => app.remove());

// A pixel, for an image the page shows.
const DOT = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhQGAWjR9awAAAABJRU5ErkJggg==", "base64");

// What the flow shows: the day, a random number, the setup's word, the image, and how long the page has been open, which
// is never the same twice.
const shows = `import { test } from "@vantage/cli/test";

test("Look at the invoices", async ({ page, setup }) => {
  await test.step("Open the invoices", async () => {
    await page.goto("/");
    await page.evaluate((word) => {
      const say = (text) => document.querySelector("h1").insertAdjacentHTML("afterend", \`<p>\${text}</p>\`);
      say(\`Today is \${new Date().toISOString().slice(0, 10)}\`);
      say(\`Drawn \${Math.random().toFixed(6)}\`);
      say(\`Set up for \${word}\`);
      say(\`Open for \${performance.now().toFixed(3)} ms\`);
      document.querySelector("h1").insertAdjacentHTML("beforeend", '<img src="/dot.png" alt="" width="8" height="8">');
    }, setup.word);
  });
});
`;

describe("The command line, as an agent uses it, from a steady start", { timeout: 300_000 }, () => {
  test("each flow starts on the day the review started, from what vantage/setup.ts makes, and is recorded twice to find what changes by itself", async () => {
    await app.run(["start", "overdue", "Show only the overdue invoices"]);
    await mkdir(join(app.repo, "vantage"));
    await writeFile(join(app.repo, "vantage/app.json"), JSON.stringify(app.app));
    await writeFile(join(app.repo, "vantage/setup.ts"), `export default async function ({ page }) {\n  return { word: "Ana" };\n}\n`);
    await writeFile(join(app.repo, "app/dot.png"), DOT);
    await writeFile(join(app.flows, "look.ts"), shows);
    const { said, code } = await app.run(["start", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Recording “Look at the invoices” again, to see what changes by itself…/);
    assert.match(said, /In “Look at the invoices”, this changes by itself, so it's left out of every comparison of the flow:\n  .*Open for/);
    assert.doesNotMatch(said, /changes by itself[^]*(Today is|Drawn|Set up for)/, "the day and the random number are the same both times");

    const [flow] = (await app.round(0)).flows;
    const [reading] = await app.readings(0, flow!);
    const words = reading!.things.map((thing) => thing.name).join(" | ");
    const started = (await app.reviews.get("overdue")).started.slice(0, 10);
    assert.match(words, new RegExp(`Today is ${started}`));
    assert.match(words, /Set up for Ana/);
    assert.equal(flow!.unsteady?.length, 1);
  });

  test("a recording keeps the images it shows, so it plays the same with the app gone", async () => {
    const [flow] = (await app.round(0)).flows;
    const kept: Record<string, string> = JSON.parse((await app.file(0, `assets/${flow!.recording}`)).toString());
    const dot = kept[`${app.app.url}/dot.png`];
    assert.ok(dot, `the image is kept: ${JSON.stringify(kept)}`);
    assert.deepEqual(await app.file(0, dot), DOT);
  });

  test("what changes by itself isn't a change in any round after", async () => {
    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Nothing changed since Before\./);
    assert.doesNotMatch(said, /again, to see what changes by itself/, "a flow is recorded twice only the first time");
  });
});
