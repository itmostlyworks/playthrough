// What the command line promises an agent about Before, run for real: what it's recorded from kept as a commit, and a flow
// added later recorded on it, in the agent's own working copy, with the agent's work put back. In a copy of the example
// app of its own, recording in Chromium beside the other story.

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { addExport, example, exportPaid, lookThrough, openExport, seeOverdue, type Example } from "./example.ts";

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
  test("Before keeps what it was recorded from as a commit, with what wasn't committed yet, and the reviews stay out of git", async () => {
    await app.run(["start", "overdue", "Show only overdue invoices", "Can the invoices list show just the overdue ones?"]);
    await writeFile(join(app.flows, "overdue.ts"), seeOverdue);
    await mkdir(join(app.repo, "playthrough"));
    await writeFile(join(app.repo, "playthrough/app.json"), JSON.stringify(app.app));
    const { said, code } = await app.run(["start", "overdue"]);
    assert.equal(code, 0, said);

    const { commit } = await app.round(0);
    assert.equal(app.git("rev-parse", "refs/playthrough/overdue/before"), commit);
    assert.match(app.git("show", `${commit}:playthrough/app.json`), /node serve\.ts/, "playthrough/app.json isn't committed yet, and it's in it");
    assert.equal(app.git("status", "--porcelain"), "?? playthrough/");
  });

  test("a flow added later is recorded on Before too, as far as the app as it was can take it, and the agent's work is put back", async () => {
    await addExport(app);
    app.git("add", "app/index.html");
    await writeFile(join(app.repo, "notes.txt"), "What's left to do");
    const was = await work();
    await writeFile(join(app.flows, "export-paid.ts"), exportPaid);
    await writeFile(join(app.flows, "open-export.ts"), openExport);

    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(
      said,
      /“Export the paid ones” and “Open the export” are new, so they're recorded on Before too\. Your work is set aside with git stash meanwhile\.\nRecording “Export the paid ones” and “Open the export” on Before, the app as it was…/,
    );
    assert.match(
      said,
      /Your work is back\.\n“Export the paid ones” stops at “Export them”, where Playwright says “[^”\n]+”, so its Before goes as far as that\.\n“Open the export” can't start on the app as it was, where Playwright says “[^”\n]+”, so it has no Before\.\nIf that's the app as it was, that's Before\. If it's the flow's own mistake, fix the flow and run playthrough start \S+ again/,
    );
    assert.deepEqual(await work(), was);
    assert.equal(await readFile(join(app.repo, "notes.txt"), "utf8"), "What's left to do");

    const before = await app.round(0);
    assert.ok(before.finished);
    assert.deepEqual(before.flows.at(-1)?.steps.map((step) => step.title), ["Open the invoices", "Show only the paid ones"]);
    assert.deepEqual(before.cantStart, ["Open the export"]);
    // Compared with Before, it takes a step the app as it was couldn't, and shows what's new since it.
    const { changes } = await app.compared(1, 0);
    const seenIn = (words: RegExp) => changes.find((change) => words.test(change.words))?.seen.map((seen) => seen.flow);
    assert.deepEqual(seenIn(/^New steps: “Export them”$/), ["Export the paid ones"]);
    assert.ok(seenIn(/^Export button is new/)?.includes("Export the paid ones"));
  });

  test("stopped while a flow records on Before, Playthrough puts the agent's work back before it ends", async () => {
    const was = await work();
    await writeFile(join(app.flows, "look.ts"), lookThrough);
    const { said } = await app.run(["record", "overdue"], { says: /on Before, the app as it was…/, signal: "SIGTERM" });
    assert.match(said, /“Look through the invoices” is new, so it's recorded on Before too\./, "Before was tried on the others already, so only this one");
    assert.match(said, /Stopped, with your work back\./);
    assert.deepEqual(await work(), was);
    assert.ok(!(await app.round(0)).flows.some((flow) => flow.name === "Look through the invoices"));
  });
});
