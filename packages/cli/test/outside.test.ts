// A flow whose steps do something outside the app, an email sent or a card charged, says so in its file, and Playthrough runs
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
  folder = await mkdtemp(join(tmpdir(), "playthrough-outside-"));
  const test = pathToFileURL(join(import.meta.dirname, "../src/test.ts")).href;
  await writeFile(
    join(folder, "team.spec.ts"),
    `import { test } from "${test}";
test("Invite Sam", { annotation: { type: "reaches outside", description: "sends Sam an email" } }, async () => {});
test("Rename the team", { annotation: { type: "issue", description: "#12" } }, async () => {});
test("Look at the team", async () => {});
`,
  );
  await writeFile(
    join(folder, "invites.spec.ts"),
    `import { test } from "${test}";
test.describe("Invites", { annotation: { type: "reaches outside", description: "sends an email" } }, () => {
  test("Invite Kim", async () => {});
  test("Invite Lee", { annotation: { type: "reaches outside", description: "sends Lee a text" } }, async () => {});
});
test("Look at the invites", async () => {});
`,
  );
});
after(() => rm(folder, { recursive: true }));

async function flowsOf(file: string) {
  (globalThis as Record<symbol, unknown>)[ALONGSIDE] = true;
  const { flowsIn } = await import("../src/test.ts");
  const flows = await flowsIn(join(folder, file), 1);
  return [...flows].map(([name, kept]) => [name, kept.outside]);
}

test("a flow's file says what it does outside the app, and only that flow is kept as reaching outside", async () => {
  assert.deepEqual(await flowsOf("team.spec.ts"), [
    ["Invite Sam", "sends Sam an email"],
    ["Rename the team", undefined],
    ["Look at the team", undefined],
  ]);
});

test("a describe() says it for each flow in it, unless the flow says it for itself", async () => {
  assert.deepEqual(await flowsOf("invites.spec.ts"), [
    ["Invite Kim", "sends an email"],
    ["Invite Lee", "sends Lee a text"],
    ["Look at the invites", undefined],
  ]);
});
