// What the command line promises an agent, run for real: the commands as an agent types them, in a copy of the example
// app, recording in Chromium. The steps build on each other, like a review does.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { newId, Reviews, type Round } from "@vantage/review";
import { folder } from "@vantage/review/folder";

const core = fileURLToPath(new URL("../../..", import.meta.url));
const vantage = join(core, "packages/cli/src/vantage.ts");
const PORT = 4471; // not the example's own, which may be running
let repo = "";
let reviews: Reviews;

before(async () => {
  repo = await mkdtemp(join(tmpdir(), "vantage-repo-"));
  await cp(join(core, "example/app"), join(repo, "app"), { recursive: true });
  await cp(join(core, "example/serve.ts"), join(repo, "serve.ts"));
  await writeFile(join(repo, "serve.ts"), (await readFile(join(repo, "serve.ts"), "utf8")).replaceAll("4400", String(PORT)));
  await symlink(join(core, "node_modules"), join(repo, "node_modules"));
  reviews = new Reviews(folder(join(repo, ".vantage")));
});
after(() => rm(repo, { recursive: true }));

// Runs a command in the repo and gives back what it said. One that doesn't end by itself is stopped after `stopAfter`.
function run(args: string[], stopAfter?: number): Promise<{ said: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [vantage, ...args], { cwd: repo });
    let said = "";
    child.stdout.on("data", (chunk) => (said += chunk));
    child.stderr.on("data", (chunk) => (said += chunk));
    const stop = stopAfter && setTimeout(() => child.kill(), stopAfter);
    child.on("exit", (code) => {
      if (stop) clearTimeout(stop);
      resolve({ said, code });
    });
  });
}

const flow = (name: string, steps: string) => `import { test, expect } from "@vantage/cli/test";

test(${JSON.stringify(name)}, async ({ page }) => {
${steps}
});
`;
const seeOverdue = flow(
  "See what's overdue",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
  });
  await test.step("Show only the overdue ones", async () => {
    await page.getByRole("button", { name: "Overdue" }).click();
    await expect(page.getByRole("row")).toHaveCount(3);
  });`,
);
const seePaid = flow(
  "See what's paid",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
  });
  await test.step("Show only the paid ones", async () => {
    await page.getByRole("button", { name: "Paid" }).click();
  });`,
);
const flows = () => join(repo, ".vantage/overdue/flows");
const round = async (n: number): Promise<Round> => JSON.parse(await readFile(join(repo, `.vantage/overdue/rounds/${n}/round.json`), "utf8"));

describe("The command line, as an agent uses it", { timeout: 120_000 }, () => {
  test("start begins a review and says how to write its flows", async () => {
    const { said, code } = await run(["start", "overdue", "Show", "only", "the", "overdue", "invoices"]);
    assert.equal(code, 0);
    assert.match(said, /Write its flows in \.vantage\/overdue\/flows/);
    assert.equal((await reviews.get("overdue")).title, "Show only the overdue invoices");
  });

  test("record says what it needs before recording anything: flows, then how to start the app", async () => {
    let { said, code } = await run(["record", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /overdue has no flows yet/);

    await writeFile(join(flows(), "overdue.ts"), seeOverdue);
    ({ said, code } = await run(["record", "overdue"]));
    assert.equal(code, 1);
    assert.match(said, /Say how to start the app in vantage\/app\.json/);
  });

  test("a flow that fails records nothing", async () => {
    await mkdir(join(repo, "vantage"));
    await writeFile(join(repo, "vantage/app.json"), JSON.stringify({ start: "node serve.ts", url: `http://localhost:${PORT}` }));
    await writeFile(join(flows(), "overdue.ts"), seeOverdue.replace("toHaveCount(3)", "toHaveCount(30)"));
    const { said, code } = await run(["record", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /Round 1 wasn't recorded, because a flow failed/);
    assert.deepEqual((await reviews.get("overdue")).rounds, []);
  });

  test("record keeps every flow's recording, with where each of its steps starts, in the order the flows are written", async () => {
    await writeFile(join(flows(), "overdue.ts"), seeOverdue);
    await writeFile(join(flows(), "paid.ts"), seePaid);
    const { said, code } = await run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Recorded round 1: “See what's overdue” \(\d+s\) and “See what's paid” \(\d+s\)/);

    const recorded = await round(1);
    assert.deepEqual(recorded.flows.map((flow) => flow.name), ["See what's overdue", "See what's paid"]);
    for (const flow of recorded.flows) {
      assert.deepEqual(flow.steps.map((step) => step.title), ["Open the invoices", flow.name === "See what's paid" ? "Show only the paid ones" : "Show only the overdue ones"]);
      assert.ok(flow.length > 1.5, "it holds its end long enough to be seen");
      assert.ok((flow.steps[1]?.at ?? 0) >= (flow.steps[0]?.at ?? 0));
      assert.ok((await stat(join(repo, `.vantage/overdue/rounds/1/files/${flow.recording}`))).size > 1000);
    }
    assert.deepEqual(recorded.flows.map((flow) => flow.recording), ["see-whats-overdue.json", "see-whats-paid.json"]);
  });

  test("waiting hands the round over, then brings the notes that ask for something, each with its conversation", async () => {
    const waiting = run(["wait", "overdue"]);
    const finished = await reviews.wait("overdue", (review) => !!review.rounds[0]?.finished);
    assert.ok(finished.rounds[0]?.finished);
    const note = { id: newId(), on: { flow: "See what's overdue", at: 2, point: { x: 0.7, y: 0.3 } }, words: "The badge is hard to read." };
    await reviews.send("overdue", { id: newId(), round: 1, by: "Ana", sent: new Date().toISOString(), notes: [note], verdicts: [], looksGood: ["See what's paid"] });

    const { said, code } = await waiting;
    assert.equal(code, 0);
    assert.match(said, /Ana says “See what's paid” looks good\./);
    assert.match(said, new RegExp(`${note.id}  on “See what's overdue” at 0:02, 70% across and 30% down the screen\\n    Ana: The badge is hard to read\\.`));
    assert.match(said, /record round 2: vantage record overdue/);
  });

  test("a round isn't handed over until every note has an answer, which recording again keeps", async () => {
    await run(["record", "overdue"]);
    const [reply] = (await round(2)).replies;
    assert.equal(reply?.words, "");

    let { said, code } = await run(["wait", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /Round 2 isn't ready to hand over yet:\n  Round 2 needs an answer to note \w+, “The badge is hard to read\.”/);

    const answered = { ...(await round(2)), replies: [{ note: reply!.note, words: "It's darker now." }] };
    await writeFile(join(repo, ".vantage/overdue/rounds/2/round.json"), JSON.stringify(answered));
    ({ said } = await run(["record", "overdue"]));
    assert.match(said, /Hand it over when it's ready/);
    assert.equal((await round(2)).replies[0]?.words, "It's darker now.");

    ({ said } = await run(["wait", "overdue"], 3000));
    assert.match(said, /Round 2 is ready for review\.\nWaiting for notes on overdue…/);
  });

  test("accepting the work ends the wait, and nothing more can be recorded", async () => {
    const waiting = run(["wait", "overdue"]);
    await reviews.accept("overdue", "Ana");
    assert.match((await waiting).said, /Ana accepted the work\. The review is done\./);

    const { said, code } = await run(["record", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /This review is accepted, so nothing more can be recorded\./);
  });
});
