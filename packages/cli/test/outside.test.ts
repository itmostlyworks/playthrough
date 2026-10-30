// A flow whose steps do something outside the app, an email sent or a card charged, says so in its file, and Vantage runs
// it only when it's taken over: ahead of the playhead, each pause would do it again.

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { ALONGSIDE } from "../src/flows.ts";

let folder = "";
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "vantage-outside-"));
  const test = pathToFileURL(join(import.meta.dirname, "../src/test.ts")).href;
  await writeFile(
    join(folder, "team.spec.ts"),
    `import { test } from "${test}";
test("Invite Sam", { annotation: { type: "reaches outside", description: "sends Sam an email" } }, async () => {});
test("Rename the team", { annotation: { type: "issue", description: "#12" } }, async () => {});
test("Look at the team", async () => {});
`,
  );
});
after(() => rm(folder, { recursive: true }));

test("a flow's file says what it does outside the app, and only that flow is kept as reaching outside", async () => {
  (globalThis as Record<symbol, unknown>)[ALONGSIDE] = true;
  const { flowsIn } = await import("../src/test.ts");
  const flows = await flowsIn([join(folder, "team.spec.ts")], 1);
  assert.deepEqual(
    [...flows].map(([name, kept]) => [name, kept.outside]),
    [
      ["Invite Sam", "sends Sam an email"],
      ["Rename the team", undefined],
      ["Look at the team", undefined],
    ],
  );
});
