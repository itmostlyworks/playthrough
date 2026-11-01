// What the command line promises about a steady start, run for real: every flow starts from the same moment and what the
// app's playthrough/setup.ts makes, a recording keeps the images it shows, and what changes by itself between two recordings
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
const shows = `import { test } from "playthrough/test";

test("Look at the invoices", async ({ page, setup }) => {
  await test.step("Open the invoices", async () => {
    await page.goto("/");
    await page.evaluate((word) => {
      const say = (text) => document.querySelector("h1").insertAdjacentHTML("afterend", \`<p>\${text}</p>\`);
      say(\`Today is \${new Date().toISOString().slice(0, 10)}\`);
      say(\`Drawn \${Math.random().toFixed(6)}\`);
      say(\`Set up for \${word}\`);
      say(\`Seen as \${navigator.userAgent}\`);
      // On a line of its own at the end, so it pushes nothing else along when its length changes.
      document.body.insertAdjacentHTML("beforeend", \`<p>Open for \${performance.now().toFixed(3)} ms</p>\`);
      document.querySelector("h1").insertAdjacentHTML("beforeend", '<img src="/dot.png" alt="" width="8" height="8">');
    }, setup.word);
  });
});
`;

describe("The command line, as an agent uses it, from a steady start", { timeout: 300_000 }, () => {
  test("each flow starts on the day the review started, from what playthrough/setup.ts makes, in a browser opened as it says, and is recorded twice to find what changes by itself", async () => {
    await app.run(["start", "overdue", "Show only overdue invoices", "Can the invoices list show just the overdue ones?"]);
    await mkdir(join(app.repo, "playthrough"));
    await writeFile(join(app.repo, "playthrough/app.json"), JSON.stringify(app.app));
    await writeFile(join(app.repo, "playthrough/setup.ts"), `export const use = { userAgent: "Steady browser" };\n\nexport default async function ({ page }) {\n  return { word: "Ana" };\n}\n`);
    await writeFile(join(app.repo, "app/dot.png"), DOT);
    await writeFile(join(app.flows, "look.ts"), shows);
    // The first time flows run in the app, its setup is tried by itself, and nothing's recorded yet.
    assert.match((await app.run(["start", "overdue"])).said, /Nothing's recorded yet\./);
    assert.equal((await app.run(["start", "overdue"])).code, 0);
    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Recording “Look at the invoices” again, to see what changes by itself…/);
    assert.match(said, /In “Look at the invoices”, this changes by itself, so it's left out of every comparison, in every flow:\n  .*Open for/);
    assert.doesNotMatch(said, /changes by itself[^]*(Today is|Drawn|Set up for)/, "the day and the random number are the same both times");

    const [flow] = (await app.round(1)).flows;
    const [reading] = await app.readings(1, flow!);
    const words = reading!.things.map((thing) => thing.name).join(" | ");
    const started = (await app.reviews.get("overdue")).started.slice(0, 10);
    assert.match(words, new RegExp(`Today is ${started}`));
    assert.match(words, /Set up for Ana/);
    assert.match(words, /Seen as Steady browser/);
    assert.equal(flow!.unsteady?.length, 1);
  });

  test("a recording keeps the images it shows, so it plays the same with the app gone", async () => {
    const [flow] = (await app.round(1)).flows;
    const kept: Record<string, string> = JSON.parse((await app.file(1, `assets/${flow!.recording}`)).toString());
    const dot = kept[`${app.app.url}/dot.png`];
    assert.ok(dot, `the image is kept: ${JSON.stringify(kept)}`);
    assert.deepEqual(await app.file(1, dot), DOT);
  });

  test("what changes by itself isn't a change, on Before or in any round after, and once its round is handed over, a flow is recorded once", async () => {
    assert.deepEqual((await app.compared(1, 0)).changes, []);
    await app.reviews.finish("overdue", 1);
    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Nothing changed since round 1\./);
    assert.doesNotMatch(said, /again, to see what changes by itself/);
  });
});
