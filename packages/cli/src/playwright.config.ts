// How `vantage record` runs a review's flows: one at a time, in Chromium at 1280×800, against the app vantage/app.json
// starts, or the one already running there.

import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import type { Run } from "./record.ts";

const run: Run = JSON.parse(process.env.VANTAGE_RUN ?? "null");

export default defineConfig({
  testDir: run.flows,
  testMatch: /\.[cm]?[jt]s$/,
  outputDir: `${run.folder}/results`,
  workers: 1,
  reporter: [["list"], [fileURLToPath(new URL("./reporter.ts", import.meta.url)), { folder: run.folder }]],
  use: { baseURL: run.app.url, viewport: { width: 1280, height: 800 } },
  webServer: { command: run.app.start, url: run.app.url, cwd: run.root, reuseExistingServer: true },
});
