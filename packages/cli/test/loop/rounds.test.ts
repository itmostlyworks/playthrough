// What the command line promises an agent, run for real, round after round: the commands as an agent types them, in a copy
// of the example app, recording in Chromium. The steps build on each other, like a review does.

import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { newId } from "@playthrough/review";
import { addExport, example, exportThem, seeOverdue, seePaid, type Example } from "./example.ts";

let app: Example;
before(async () => void (app = await example(4471)));
after(() => app.remove());

const waitingForNotes = { says: /Waiting for notes on overdue…/ };

describe("The command line, as an agent uses it, round after round", { timeout: 300_000 }, () => {
  test("start begins a review and asks for its flows from the task, before anything changes", async () => {
    const { said, code } = await app.run(["start", "overdue", "Show only overdue invoices", "Can the invoices list show just the overdue ones?"]);
    assert.equal(code, 0);
    assert.match(said, /Write its flows before you change anything\. They show what was asked, so write them from the task, not from the code/);
    assert.match(said, /Each flow is a Playwright test in a \.ts file in \.playthrough\/overdue\/flows/);
    assert.match(said, /Then run playthrough start overdue again\. It records Before/);
    const review = await app.reviews.get("overdue");
    assert.deepEqual([review.title, review.asked], ["Show only overdue invoices", "Can the invoices list show just the overdue ones?"]);
  });

  test("record says what it needs before recording anything: flows, then how to start the app", async () => {
    let { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /overdue has no flows yet/);

    await writeFile(join(app.flows, "overdue.ts"), seeOverdue);
    ({ said, code } = await app.run(["record", "overdue"]));
    assert.equal(code, 1);
    assert.match(said, /Say how to start the app in playthrough\/app\.json/);
  });

  test("run again, start tries the app's setup by itself first and records nothing; once more, it records Before: each flow on the app as it is, as far as the app can take it", async () => {
    await mkdir(join(app.repo, "playthrough"));
    await writeFile(join(app.repo, "playthrough/app.json"), JSON.stringify(app.app));
    await writeFile(join(app.flows, "paid.ts"), seePaid);
    await writeFile(join(app.flows, "export.ts"), exportThem);
    let { said, code } = await app.run(["start", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /Trying the app's setup by itself first, twice, as every flow will start…/);
    assert.match(said, /Nothing's recorded yet\. Once the picture shows where a flow should start, run playthrough start overdue again\./);
    assert.deepEqual((await app.reviews.get("overdue")).rounds, []);

    ({ said, code } = await app.run(["start", "overdue"]));
    assert.equal(code, 0, said);
    assert.match(said, /Recorded Before: “Export the overdue ones”, “See what's overdue” and “See what's paid”\.\n“Export the overdue ones” stops at “Export them”, where Playwright says “[^”\n]+”, so its Before goes as far as that\./);
    assert.match(said, /add a flow for each choice you made that the person can see and didn't ask for\. Then record round 1: playthrough record overdue/);

    const before = await app.round(0);
    assert.deepEqual(before.flows.map((flow) => flow.name), ["Export the overdue ones", "See what's overdue", "See what's paid"]);
    assert.ok(before.finished, "nothing is reviewed on it, so it's done once it's recorded");

    // What it expects of the finished work only waits on Before; where it can't act, it stops, and holds there.
    const [cut] = before.flows;
    assert.deepEqual(cut?.steps.map((step) => step.title), ["Open the invoices"]);
    const events: { type: number; data: { tag?: string } }[] = JSON.parse((await app.file(0, cut!.recording)).toString());
    assert.equal(events.at(-1)?.data.tag, "end");
    assert.ok(cut!.length > 1.5 && cut!.length < 6, `it ends where it stopped, not where it gave up: ${cut!.length}s`);
    // The step it stopped at left nothing to read.
    assert.deepEqual((await app.readings(0, cut!)).map((reading) => reading.step), ["Open the invoices"]);

    // Run again, it tries the flow Before cut short once more, in case that was the flow's own mistake: here it's the app.
    ({ said, code } = await app.run(["start", "overdue"]));
    assert.equal(code, 0, said);
    assert.match(said, /Before cut “Export the overdue ones” short, so it is tried on it again, in place of what it has of it, on the app as it is: nothing has changed since Before\./);
    assert.match(said, /“Export the overdue ones” stops at “Export them”, where Playwright says/);
    assert.deepEqual((await app.round(0)).flows.map((flow) => [flow.name, flow.stopped]), [["See what's overdue", undefined], ["See what's paid", undefined], ["Export the overdue ones", "Export them"]]);
  });

  test("a flow that fails records nothing, and names itself", async () => {
    await addExport(app);
    await writeFile(join(app.flows, "overdue.ts"), seeOverdue.replace("toHaveCount(3)", "toHaveCount(30, { timeout: 1000 })"));
    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /Round 1 wasn't recorded, because a flow failed:\n  “See what's overdue”, at the step “Show only the overdue ones”, where Playwright says “[^\n]+”\nFix it and record again, which runs it first\./);
    assert.deepEqual((await app.reviews.get("overdue")).rounds.map((round) => round.number), [0]);
  });

  test("record keeps every flow's recording, with where each of its steps starts, in the order the flows are written", async () => {
    await writeFile(join(app.flows, "overdue.ts"), seeOverdue);
    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 0, said);
    assert.match(said, /Recorded round 1: “Export the overdue ones” \(\d+s\), “See what's overdue” \(\d+s\) and “See what's paid” \(\d+s\)/);
    assert.match(said, /are new to the person\. In \.playthrough\/overdue\/rounds\/1\/round\.json, each can have a line at its start, as “line” in its flow under “flows”: what it starts from, or the choice it shows, in a sentence of up to 140 characters\./);

    const recorded = await app.round(1);
    const steps: Record<string, string> = { "Export the overdue ones": "Export them", "See what's overdue": "Show only the overdue ones", "See what's paid": "Show only the paid ones" };
    assert.deepEqual(recorded.flows.map((flow) => flow.name), Object.keys(steps));
    for (const flow of recorded.flows) {
      assert.deepEqual(flow.steps.map((step) => step.title), ["Open the invoices", steps[flow.name]]);
      assert.ok(flow.length > 1.5, "it holds its end long enough to be seen");
      assert.ok((flow.steps[1]?.at ?? 0) >= (flow.steps[0]?.at ?? 0));
      assert.ok((await stat(join(app.repo, `.playthrough/overdue/rounds/1/files/${flow.recording}`))).size > 1000);
    }
    assert.deepEqual(recorded.flows.map((flow) => flow.recording), ["export-the-overdue-ones.json", "see-whats-overdue.json", "see-whats-paid.json"]);
  });

  test("each step is read where it ended, once the page was at rest, with a picture of the page it left", async () => {
    const [, overdue] = (await app.round(1)).flows;
    const read = await app.readings(1, overdue!);
    assert.deepEqual(read.map((reading) => reading.step), ["Open the invoices", "Show only the overdue ones"]);
    assert.ok(read[0]!.at < overdue!.steps[1]!.at && read[1]!.at < overdue!.length, "each is read after its step starts, before the next one");
    assert.ok(read[1]!.things.some((thing) => thing.role === "button" && thing.name === "Overdue"));
    for (const reading of read) assert.equal((await app.file(1, reading.picture)).subarray(1, 4).toString(), "PNG");
  });

  test("record compares the round with Before, and it isn't handed over until the agent says why each change is there", async () => {
    // Since Before, the app has an Export button, and the flow that exports takes the step Before couldn't.
    const { changes } = await app.compared(1, 0);
    const button = changes.find((change) => change.words === "Export button is new, and moved the Show choice left");
    assert.deepEqual(
      changes.map((change) => change.words),
      ["Export button is new, and moved the Show choice left", "New steps: “Export them”"],
    );
    assert.deepEqual(button?.seen.map((seen) => seen.flow), ["Export the overdue ones", "See what's overdue", "See what's paid"], "one change, seen in each flow");

    const { said, code } = await app.run(["wait", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, new RegExp(`say why ${button!.id} is there \\(Export button is new, and moved the Show choice left, in “Export the overdue ones” at 0:00\\)`));
    const accounts = Object.fromEntries(changes.map((change) => [change.id, { line: "The export the task asked for." }]));
    await app.saveRound({ ...(await app.round(1)), accounts });
  });

  test("waiting hands the round over, then brings the notes that ask for something, each with its conversation and a picture of what it's on", async () => {
    const waiting = app.run(["wait", "overdue"]);
    await app.reviews.wait("overdue", (review) => !!review.rounds.find((round) => round.number === 1)?.finished);
    const [, overdue] = (await app.round(1)).flows;
    const shown = (await app.readings(1, overdue!))[1]!;
    const button = shown.things.find((thing) => thing.role === "button" && thing.name === "Overdue")!;
    const note = { id: newId(), on: { flow: "See what's overdue", at: shown.at, element: { role: "button", name: "Overdue", node: button.node } }, words: "The badge is hard to read." };
    await app.reviews.send("overdue", { id: newId(), round: 1, by: "Ana", sent: new Date().toISOString(), notes: [note], verdicts: [], looksGood: ["See what's paid"] });

    const { said, code } = await waiting;
    assert.equal(code, 0);
    assert.match(said, /Ana says “See what's paid” looks good\./);
    assert.match(said, new RegExp(`${note.id}  on “See what's overdue” at \\d:\\d\\d, the button “Overdue”\\n    As they saw it: \\.playthrough/overdue/rounds/2/files/notes/${note.id}\\.png\\n    Ana: The badge is hard to read\\.`));
    assert.match(said, /Look at what each note is on, change the app, then record round 2: playthrough record overdue/);
    assert.equal((await app.file(2, `notes/${note.id}.png`)).subarray(1, 4).toString(), "PNG", "the page as they saw it, what the note is on outlined");
  });

  test("a round isn't handed over until every note has an answer, which recording again keeps, placed where its note's thing is now", async () => {
    // Recorded again with nothing changed, nothing has changed since round 1.
    assert.match((await app.run(["record", "overdue"])).said, /Nothing changed since round 1\./);
    assert.deepEqual((await app.compared(2, 1)).changes, []);
    assert.equal((await app.compared(2, 0)).changes.length, 2);
    const [reply] = (await app.round(2)).replies;
    assert.equal(reply?.words, "");
    // Its answer shows where the note's thing is on the new recording, found by what was read at the same step.
    const [, overdue] = (await app.round(2)).flows;
    const there = (await app.readings(2, overdue!))[1]!.things.find((thing) => thing.role === "button" && thing.name === "Overdue");
    assert.deepEqual(reply?.on?.element, { role: "button", name: "Overdue", node: there!.node });

    let { said, code } = await app.run(["wait", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /Round 2 isn't ready to hand over yet:\n  Round 2 needs an answer to note \w+, “The badge is hard to read\.”/);

    await app.saveRound({ ...(await app.round(2)), replies: [{ note: reply!.note, words: "It's darker now." }] });
    ({ said } = await app.run(["record", "overdue"]));
    assert.match(said, /Hand it over when it's ready/);
    assert.equal((await app.round(2)).replies[0]?.words, "It's darker now.");
  });

  test("handed over, a round's answers wait for what's said of them, a Not quite from anyone sends one back, and wait says whose each verdict is", async () => {
    const waiting = app.run(["wait", "overdue"]);
    await app.reviews.wait("overdue", (review) => !!review.rounds.find((round) => round.number === 2)?.finished);
    const [note] = (await app.round(2)).replies.map((reply) => reply.note);
    const verdict = (by: string, verdict: "looks good" | "not quite", words?: string) =>
      app.reviews.send("overdue", { id: newId(), round: 2, by, sent: new Date().toISOString(), notes: [], verdicts: [{ note: note!, verdict, words }], looksGood: [] });
    await verdict("Ana", "looks good");
    await verdict("Ben", "not quite", "Still hard to read on a phone.");

    const { said, code } = await waiting;
    assert.equal(code, 0);
    assert.match(said, new RegExp(`Round 2 is ready for review\\.\\nWaiting for notes on overdue…\\n\\nAna says your answer to note ${note} looks good\\.`));
    assert.match(said, /Ana: The badge is hard to read\.\n    You, in round 2: It's darker now\.\n    Ana, looks good\n    Ben, not quite: Still hard to read on a phone\./);
    assert.match(said, /record round 3: playthrough record overdue/);

    await app.run(["record", "overdue"]);
    await app.saveRound({ ...(await app.round(3)), replies: [{ note: note!, words: "It's bolder on small screens." }] });
    assert.match((await app.run(["wait", "overdue"], waitingForNotes)).said, /Round 3 is ready for review\./);
  });

  test("accepting the work ends the wait, and nothing more can be recorded", async () => {
    const waiting = app.run(["wait", "overdue"]);
    await app.reviews.accept("overdue", "Ana");
    assert.match((await waiting).said, /Ana accepted the work\. The review is done\./);

    const { said, code } = await app.run(["record", "overdue"]);
    assert.equal(code, 1);
    assert.match(said, /This review is accepted, so nothing more can be recorded\./);
  });
});
