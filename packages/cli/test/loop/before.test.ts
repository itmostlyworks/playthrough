// What the command line promises an agent about Before, run for real: the app as it was kept as a commit when the review
// starts, and each flow recorded on it with its round, doing what the round does, in the agent's own working copy, with
// the agent's work put back. In a copy of the example app of its own, recording in Chromium beside the other story.

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { addExport, example, exportFromHeader, exportPaid, lookThrough, openExport, seeOverdue, type Example } from "./example.ts";

let app: Example;
before(async () => void (app = await example(4472)));
after(() => app.remove());

// The agent's work as git sees it: its branch, what it changed and staged, and the page it changed.
const work = async () => ({
  branch: app.git("symbolic-ref", "--short", "HEAD"),
  status: app.git("status", "--porcelain"),
  staged: app.git("diff", "--cached", "--name-only"),
  page: await readFile(join(app.repo, "app/index.html"), "utf8"),
  stashes: app.git("stash", "list"),
});

describe("The command line, as an agent uses it, on Before", { timeout: 300_000 }, () => {
  test("Before is kept as a commit when the review starts, with what wasn't committed yet, and the reviews stay out of git", async () => {
    await app.run(["start", "overdue", "Show only overdue invoices", "Can the invoices list show just the overdue ones?"]);
    await writeFile(join(app.flows, "overdue.ts"), seeOverdue);
    await mkdir(join(app.repo, "playthrough"));
    await writeFile(join(app.repo, "playthrough/app.json"), JSON.stringify(app.app));
    // The first time flows run in the app, its setup is tried by itself, and nothing's recorded yet.
    assert.match((await app.run(["start", "overdue"])).said, /Nothing's recorded yet\./);
    const { said, code } = await app.run(["start", "overdue"]);
    assert.equal(code, 0, said);

    const { commit } = await app.round(0);
    assert.equal(app.git("rev-parse", "refs/playthrough/overdue/before"), commit);
    assert.match(app.git("show", `${commit}:playthrough/app.json`), /node serve\.ts/, "playthrough/app.json isn't committed yet, and it's in it");
    assert.equal(app.git("status", "--porcelain"), "?? playthrough/");
  });

  test("record keeps each flow on Before too, doing what the round does, as far as the app as it was takes it, and the agent's work is put back", async () => {
    await addExport(app);
    app.git("add", "app/index.html");
    await writeFile(join(app.repo, "notes.txt"), "What's left to do");
    const was = await work();
    await writeFile(join(app.flows, "export-paid.ts"), exportPaid);
    await writeFile(join(app.flows, "open-export.ts"), openExport);
    await writeFile(join(app.flows, "header.ts"), exportFromHeader);

    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Your work is set aside with git stash while they record on Before\.\nRecording 4 flows on Before, the app as it was…/);
    assert.match(said, /“Export the paid ones”: stops at “Export them”/);
    assert.match(said, /“Open the export”: can't start/);
    assert.match(said, /Your work is back\./);
    assert.deepEqual(await work(), was);
    assert.equal(await readFile(join(app.repo, "notes.txt"), "utf8"), "What's left to do");

    const before = await app.round(0);
    assert.ok(before.finished);
    const stopped = (name: string) => before.flows.find((flow) => flow.name === name);
    assert.deepEqual(stopped("Export the paid ones")?.steps.map((step) => step.title), ["Open the invoices", "Show only the paid ones"]);
    assert.deepEqual(before.cantStart, ["Open the export"]);
    // The header's last button was Paid then: the flow stops there, rather than showing a click the round never made.
    assert.equal(stopped("Export from the header")?.stopped, "Export them");
    assert.deepEqual(stopped("Export from the header")?.steps.map((step) => step.title), ["Open the invoices"]);
    assert.equal(stopped("See what's overdue")?.stopped, undefined, "what the round does on the same things, Before does too");
    // Compared with Before, it takes a step the app as it was couldn't, and shows what's new since it.
    const { changes } = await app.compared(1, 0);
    const seenIn = (words: RegExp) => changes.find((change) => words.test(change.words))?.seen.map((seen) => seen.flow);
    assert.ok(seenIn(/^New steps: “Export them”$/)?.includes("Export the paid ones"));
    assert.ok(seenIn(/^Export button is new/)?.includes("Export the paid ones"));
  });

  test("until its round is handed over, a flow's Before follows it: a flow fixed since is recorded on Before again, and only that one", async () => {
    await writeFile(join(app.flows, "export-paid.ts"), `// Fixed.\n${exportPaid}`);
    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Recording “Export the paid ones” on Before, the app as it was…/);
    assert.equal((await app.round(0)).flows.filter((flow) => flow.name === "Export the paid ones").length, 1, "in place of what it had");
  });

  test("stopped while a flow records on Before, Playthrough puts the agent's work back before it ends", async () => {
    const was = await work();
    await writeFile(join(app.flows, "look.ts"), lookThrough);
    const { said } = await app.run(["record", "overdue"], { says: /on Before, the app as it was…/, signal: "SIGTERM" });
    assert.match(said, /Recording “Look through the invoices” on Before, the app as it was…/, "the others follow what they did already, so only this one");
    assert.match(said, /Stopped, with your work back\./);
    assert.deepEqual(await work(), was);
    assert.ok(!(await app.round(0)).flows.some((flow) => flow.name === "Look through the invoices"));
  });
});
