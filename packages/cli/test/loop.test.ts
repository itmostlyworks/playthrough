// What the command line promises an agent, run for real: the commands as an agent types them, in a copy of the example
// app, recording in Chromium. The steps build on each other, like a review does.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { newId, Reviews, type Flow, type Round } from "@vantage/review";
import { folder } from "@vantage/review/folder";
import type { Reading } from "../src/read.ts";

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
// The app as it is has no Export button: the agent adds it once Before is recorded.
const exportThem = flow(
  "Export the overdue ones",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  });
  await test.step("Export them", async () => {
    await page.getByRole("button", { name: "Overdue" }).click();
    await page.getByRole("button", { name: "Export" }).click();
  });`,
);
const flows = () => join(repo, ".vantage/overdue/flows");
const round = async (n: number): Promise<Round> => JSON.parse(await readFile(join(repo, `.vantage/overdue/rounds/${n}/round.json`), "utf8"));
const file = (n: number, name: string) => readFile(join(repo, `.vantage/overdue/rounds/${n}/files/${name}`));
const readings = async (n: number, flow: Flow): Promise<Reading[]> => JSON.parse((await file(n, `readings/${flow.recording}`)).toString());

describe("The command line, as an agent uses it", { timeout: 120_000 }, () => {
  test("start begins a review and asks for its flows from the task, before anything changes", async () => {
    const { said, code } = await run(["start", "overdue", "Show", "only", "the", "overdue", "invoices"]);
    assert.equal(code, 0);
    assert.match(said, /Write its flows before you change anything\. They show what was asked, so write them from the task, not from the code/);
    assert.match(said, /Each flow is a Playwright test in \.vantage\/overdue\/flows/);
    assert.match(said, /Then run vantage start overdue again\. It records Before/);
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

  test("run again, start records Before: each flow on the app as it is, as far as the app can take it", async () => {
    await mkdir(join(repo, "vantage"));
    await writeFile(join(repo, "vantage/app.json"), JSON.stringify({ start: "node serve.ts", url: `http://localhost:${PORT}` }));
    await writeFile(join(flows(), "paid.ts"), seePaid);
    await writeFile(join(flows(), "export.ts"), exportThem);
    let { said, code } = await run(["start", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Recorded Before: “Export the overdue ones”, “See what's overdue” and “See what's paid”\.\n“Export the overdue ones” stops at “Export them”, which the app as it is can't do, so its Before goes as far as that\./);
    assert.match(said, /add a flow for each choice you made that the reviewer can see and didn't ask for\. Then record round 1: vantage record overdue/);

    const before = await round(0);
    assert.deepEqual(before.flows.map((flow) => flow.name), ["Export the overdue ones", "See what's overdue", "See what's paid"]);
    assert.ok(before.finished, "nothing is reviewed on it, so it's done once it's recorded");

    // What it expects of the finished work only waits on Before; where it can't act, it stops, and holds there.
    const [cut] = before.flows;
    assert.deepEqual(cut?.steps.map((step) => step.title), ["Open the invoices"]);
    const events: { type: number; data: { tag?: string } }[] = JSON.parse(await readFile(join(repo, `.vantage/overdue/rounds/0/files/${cut!.recording}`), "utf8"));
    assert.equal(events.at(-1)?.data.tag, "end");
    assert.ok(cut!.length > 1.5 && cut!.length < 6, `it ends where it stopped, not where it gave up: ${cut!.length}s`);
    // The step it stopped at left nothing to read.
    assert.deepEqual((await readings(0, cut!)).map((reading) => reading.step), ["Open the invoices"]);

    ({ said, code } = await run(["start", "overdue"]));
    assert.equal(code, 1);
    assert.match(said, /Before is recorded already\. Change the app, then record round 1: vantage record overdue/);
  });

  test("a flow that fails records nothing, and names itself", async () => {
    const page = join(repo, "app/index.html");
    await writeFile(page, (await readFile(page, "utf8")).replace("</header>", "  <button>Export</button>\n      </header>"));
    await writeFile(join(flows(), "overdue.ts"), seeOverdue.replace("toHaveCount(3)", "toHaveCount(30)"));
    const { said, code } = await run(["record", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /Round 1 wasn't recorded, because a flow failed:\n  “See what's overdue”, at the step “Show only the overdue ones”\nFix it and record again\./);
    assert.deepEqual((await reviews.get("overdue")).rounds.map((round) => round.number), [0]);
  });

  test("record keeps every flow's recording, with where each of its steps starts, in the order the flows are written", async () => {
    await writeFile(join(flows(), "overdue.ts"), seeOverdue);
    const { said, code } = await run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Recorded round 1: “Export the overdue ones” \(\d+s\), “See what's overdue” \(\d+s\) and “See what's paid” \(\d+s\)/);
    assert.match(said, /are new to the reviewer\. In \.vantage\/overdue\/rounds\/1\/round\.json, each can have a line at its start: what it starts from, or the choice it shows\./);

    const recorded = await round(1);
    const steps: Record<string, string> = { "Export the overdue ones": "Export them", "See what's overdue": "Show only the overdue ones", "See what's paid": "Show only the paid ones" };
    assert.deepEqual(recorded.flows.map((flow) => flow.name), Object.keys(steps));
    for (const flow of recorded.flows) {
      assert.deepEqual(flow.steps.map((step) => step.title), ["Open the invoices", steps[flow.name]]);
      assert.ok(flow.length > 1.5, "it holds its end long enough to be seen");
      assert.ok((flow.steps[1]?.at ?? 0) >= (flow.steps[0]?.at ?? 0));
      assert.ok((await stat(join(repo, `.vantage/overdue/rounds/1/files/${flow.recording}`))).size > 1000);
    }
    assert.deepEqual(recorded.flows.map((flow) => flow.recording), ["export-the-overdue-ones.json", "see-whats-overdue.json", "see-whats-paid.json"]);
  });

  test("each step is read where it ended, once the page was at rest, with a picture of the page it left", async () => {
    const [, overdue] = (await round(1)).flows;
    const read = await readings(1, overdue!);
    assert.deepEqual(read.map((reading) => reading.step), ["Open the invoices", "Show only the overdue ones"]);
    assert.ok(read[0]!.at < overdue!.steps[1]!.at && read[1]!.at < overdue!.length, "each is read after its step starts, before the next one");
    assert.ok(read[1]!.things.some((thing) => thing.role === "button" && thing.name === "Overdue"));
    for (const reading of read) assert.equal((await file(1, reading.picture)).subarray(1, 4).toString(), "PNG");
  });

  test("waiting hands the round over, then brings the notes that ask for something, each with its conversation", async () => {
    const waiting = run(["wait", "overdue"]);
    await reviews.wait("overdue", (review) => !!review.rounds.find((round) => round.number === 1)?.finished);
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

  test("a Not quite from anyone sends the answer back, and wait says whose each verdict is", async () => {
    const waiting = run(["wait", "overdue"]);
    const [note] = (await round(2)).replies.map((reply) => reply.note);
    const verdict = (by: string, verdict: "looks good" | "not quite", words?: string) =>
      reviews.send("overdue", { id: newId(), round: 2, by, sent: new Date().toISOString(), notes: [], verdicts: [{ note: note!, verdict, words }], looksGood: [] });
    await verdict("Ana", "looks good");
    await verdict("Ben", "not quite", "Still hard to read on a phone.");

    const { said, code } = await waiting;
    assert.equal(code, 0);
    assert.match(said, new RegExp(`Ana says your answer to note ${note} looks good\\.`));
    assert.match(said, /Ana: The badge is hard to read\.\n    You, in round 2: It's darker now\.\n    Ana, looks good\n    Ben, not quite: Still hard to read on a phone\./);
    assert.match(said, /record round 3: vantage record overdue/);

    await run(["record", "overdue"]);
    await writeFile(join(repo, ".vantage/overdue/rounds/3/round.json"), JSON.stringify({ ...(await round(3)), replies: [{ note, words: "It's bolder on small screens." }] }));
    assert.match((await run(["wait", "overdue"], 3000)).said, /Round 3 is ready for review\./);
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
