// How `playthrough record` runs a review's flows: a quarter as many at once as the machine has cores, or one at a time
// where app.json says so, in Chromium at 1280×800, against the app Playthrough keeps running (app.ts).

import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import { waitsFor, type Run } from "./flows.ts";

const run: Run = JSON.parse(process.env.PLAYTHROUGH_RUN ?? "null");

export default defineConfig({
  testDir: run.flows,
  testMatch: /\.[cm]?[jt]s$/,
  // Playwright empties it first, and writes the page a flow failed on there, as error-context.md and a picture.
  outputDir: run.results ?? `${run.folder}/results`,
  // Each flow plays in real time, is recorded and read, and the app serves them all on the same machine: at a quarter of
  // the cores, each runs at most about a tenth slower than alone (Kan's five, 126 s one at a time, take 50 s).
  workers: run.app.oneAtATime ? 1 : Math.max(1, Math.floor(availableParallelism() / 4)),
  reporter: [[fileURLToPath(new URL("./reporter.ts", import.meta.url)), { folder: run.folder, before: run.before, taken: run.taken }]],
  // An action that can't happen fails in seconds rather than at the test's end (test.ts).
  use: { baseURL: run.app.url, viewport: { width: 1280, height: 800 }, actionTimeout: waitsFor(run), screenshot: "only-on-failure" },
  // Playwright starts flows in the order of their projects: one for each flow not yet timed, which may be long, then one
  // for each flow by its last length, longest first.
  ...(run.longest?.length && {
    projects: [{ name: "new", grepInvert: run.longest.map(titled) }, ...run.longest.map((name) => ({ name, grep: titled(name) }))],
  }),
});

// A flow by its title, which Playwright matches after its file's name and before any tags.
function titled(name: string): RegExp {
  return new RegExp(`\\.[cm]?[jt]s ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( @\\S+)*$`);
}
