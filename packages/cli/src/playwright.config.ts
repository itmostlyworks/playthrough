// How a change's moments run, each its way there and its step: a quarter as many at once as the machine has cores, or one at a time
// where app.json says so, in Chromium at 1280×800, against the app Playthrough keeps running (app.ts).

import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import { WAITS, type Run } from "./scenes.ts";

const run: Run = JSON.parse(process.env.PLAYTHROUGH_RUN ?? "null");

export default defineConfig({
  testDir: run.scenes,
  testMatch: /\.[cm]?[jt]s$/,
  // Playwright empties it first, and writes the page a scene failed on there, as error-context.md and a picture.
  outputDir: `${run.folder}/results`,
  // Each scene plays in real time, is recorded and read, and the app serves them all on the same machine: at a quarter of
  // the cores, each runs at most about a tenth slower than alone (Kan's five, 126 s one at a time, take 50 s).
  workers: run.app.oneAtATime ? 1 : Math.max(1, Math.floor(availableParallelism() / 4)),
  reporter: [[fileURLToPath(new URL("./reporter.ts", import.meta.url)), { folder: run.folder }]],
  // An action that can't happen fails in seconds rather than at the test's end (test.ts).
  use: { baseURL: run.app.url, viewport: { width: 1280, height: 800 }, actionTimeout: WAITS, screenshot: "only-on-failure" },
});
