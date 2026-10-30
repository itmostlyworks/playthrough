// How `vantage record` runs a review's flows: one at a time, in Chromium at 1280×800, against the app vantage/app.json
// starts, or the one already running there.

import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import type { Run } from "./flows.ts";

const run: Run = JSON.parse(process.env.VANTAGE_RUN ?? "null");

export default defineConfig({
  testDir: run.flows,
  testMatch: /\.[cm]?[jt]s$/,
  // Playwright empties it first, and writes the page a flow failed on there, as error-context.md and a picture.
  outputDir: run.results ?? `${run.folder}/results`,
  workers: 1,
  reporter: [["list"], [fileURLToPath(new URL("./reporter.ts", import.meta.url)), { folder: run.folder, before: run.before, taken: run.taken }]],
  // An action that can't happen fails in seconds rather than at the test's end: recording Before, a flow that shows
  // what's new stops at the first thing the app as it is doesn't have.
  use: { baseURL: run.app.url, viewport: { width: 1280, height: 800 }, actionTimeout: 10_000, screenshot: "only-on-failure" },
  webServer: { command: run.app.start, url: run.app.url, cwd: run.root, reuseExistingServer: true },
});
