// A review told from start to finish, with two people reviewing it: what each of them is shown, what asks them again,
// and what goes back to the agent. The changes are written by hand, as Playthrough's comparison would find them.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  goodForYou,
  memory,
  newId,
  newToYou,
  notesToAnswer,
  readyToAccept,
  Refused,
  Reviews,
  waitingForYou,
  type Change,
  type Flow,
  type Round,
  type Send,
} from "../src/index.ts";

const flow = (name: string): Flow => ({
  name,
  length: 6,
  steps: [
    { title: "Open the invoices", at: 0 },
    { title: "Open the export dialog", at: 2 },
  ],
  recording: `${name.toLowerCase().replaceAll(" ", "-")}.json`,
});
const flows = [flow("Export a quarter"), flow("Cancel halfway")];
const round = (number: number, parts: Partial<Round> = {}): Round => ({ number, by: "Claude Code", flows, replies: [], accounts: {}, ...parts });

// Both flows open the same Export dialog; each has a part of its own.
const seenIn = (...places: [string, number][]) => places.map(([flow, at]) => ({ flow, at }));
const dialog: Change = { id: "dialog", words: "Export dialog is new", seen: seenIn(["Export a quarter", 2], ["Cancel halfway", 2]) };
const format: Change = { id: "format", words: "“Format” choice is new in the Export dialog", seen: seenIn(["Export a quarter", 3]) };
const keep: Change = { id: "keep", words: "“Keep editing” button is new in the Export dialog", seen: seenIn(["Cancel halfway", 3]) };
const buttons: Change = { id: "buttons", words: "Buttons in the Export dialog changed size", seen: seenIn(["Export a quarter", 2], ["Cancel halfway", 2]) };
const swap: Change = { id: "swap", words: "Download CSV and Cancel have swapped places", seen: seenIn(["Export a quarter", 2], ["Cancel halfway", 2]) };

let clock = Date.parse("2026-10-25T09:00:00Z");
const send = (by: string, round: number, parts: Partial<Send>): Send => ({
  id: newId(),
  round,
  by,
  sent: new Date((clock += 1000)).toISOString(),
  notes: [],
  verdicts: [],
  looksGood: [],
  ...parts,
});

const told = (review: Awaited<ReturnType<Reviews["get"]>>, number: number, you: string) =>
  newToYou(review, number, you).map(({ change, on }) => `${change.id} in ${on.flow}`);

test("two people review the same work, each from where they last looked", async () => {
  const reviews = new Reviews(memory());
  const id = "invoice-export";
  await reviews.start(id, "Export a quarter's invoices as a CSV");
  await reviews.saveRound(id, round(0));
  await reviews.finish(id, 0);

  // Round 1: the work, against Before. It's handed over once the agent has said why each change is there.
  await reviews.saveRound(id, round(1));
  await reviews.saveComparison(id, { round: 1, since: 0, changes: [dialog, format, keep] });
  await assert.rejects(reviews.finish(id, 1), (error: unknown) => error instanceof Refused && error.problems.length === 3);
  const lines = { line: "Exporting starts from the invoices you're looking at." };
  await reviews.saveRound(id, round(1, { accounts: { dialog: lines, format: { line: "CSV first: it's what accountants ask for." }, keep: { line: "A way back without losing your choices." } } }));
  await reviews.finish(id, 1);

  // Nobody has looked yet, so each sees every change once: the dialog in the first flow that shows it.
  let review = await reviews.get(id);
  assert.deepEqual(told(review, 1, "Ana"), ["dialog in Export a quarter", "format in Export a quarter", "keep in Cancel halfway"]);

  // Ana says the first flow is good and notes something in the second. Ben says the second is good.
  const small = { id: newId(), on: { flow: "Cancel halfway", at: 2 }, words: "The dialog's buttons are too small to hit." };
  await reviews.send(id, send("Ana", 1, { looksGood: ["Export a quarter"], notes: [small] }));
  await reviews.send(id, send("Ben", 1, { looksGood: ["Cancel halfway"] }));
  await reviews.take(id);

  // Round 2: the buttons are bigger for Ana's note, and the agent swapped two of them of its own accord.
  await reviews.saveRound(id, round(2, { replies: [{ note: small.id, words: "Every button in the dialog is the size of the main ones now." }] }));
  await reviews.saveComparison(id, { round: 2, since: 0, changes: [dialog, format, keep, buttons, swap] });
  await reviews.saveComparison(id, { round: 2, since: 1, changes: [buttons, swap] });
  await reviews.saveRound(
    id,
    round(2, {
      replies: [{ note: small.id, words: "Every button in the dialog is the size of the main ones now." }],
      accounts: { buttons: { note: small.id }, swap: { line: "Download sits on the right now, like every other dialog." } },
    }),
  );
  await reviews.finish(id, 2);
  review = await reviews.get(id);

  // Ana looked at both flows on round 1, so only this round's changes are new to her. The one made for her note is told
  // in her note's flow; the swap in the first flow, which she'd said was good, so that flow asks her again.
  assert.deepEqual(told(review, 2, "Ana"), ["swap in Export a quarter", "buttons in Cancel halfway"]);
  assert.equal(goodForYou(review, 2, "Ana", "Export a quarter"), false);
  assert.deepEqual(waitingForYou(review, 2, "Ana"), [small.id]);

  // Ben only looked at the second flow. The first flow's own change is new to him, from Before; the dialog isn't,
  // since he saw it in the second flow. His good flow asks again for what's new in it.
  assert.deepEqual(told(review, 2, "Ben"), ["swap in Export a quarter", "format in Export a quarter", "buttons in Cancel halfway"]);
  assert.equal(goodForYou(review, 2, "Ben", "Cancel halfway"), false);
  // Each change says which round it's new since, so how it was then can be shown beside it: for Ben, the swap since round
  // 1, when he looked at the second flow, which shows it too, and the first flow's own change since Before.
  assert.deepEqual(newToYou(review, 2, "Ana").map(({ since }) => since), [1, 1]);
  assert.deepEqual(newToYou(review, 2, "Ben").map(({ since }) => since), [1, 0, 1]);
  assert.deepEqual(waitingForYou(review, 2, "Ben"), []);

  // Ana is happy with the answer and the first flow. Ben isn't: a Not quite from anyone sends the answer back.
  await reviews.send(id, send("Ana", 2, { verdicts: [{ note: small.id, verdict: "looks good" }], looksGood: ["Export a quarter"] }));
  await reviews.send(id, send("Ben", 2, { verdicts: [{ note: small.id, verdict: "not quite", words: "Cancel is still tiny on a phone." }] }));
  review = await reviews.get(id);
  assert.equal(goodForYou(review, 2, "Ana", "Export a quarter"), true);
  assert.equal(readyToAccept(review, "Ana"), false);
  await reviews.take(id);
  assert.deepEqual(notesToAnswer(await reviews.get(id), 3), [small.id]);

  // Round 3 answers again. The note is Ana's, so its new answer waits for her as well as for Ben, who sent it back.
  await reviews.saveRound(id, round(3, { replies: [{ note: small.id, words: "Cancel is full width on a phone." }], accounts: { buttons: { note: small.id } } }));
  await reviews.saveComparison(id, { round: 3, since: 0, changes: [dialog, format, keep, buttons, swap] });
  await reviews.saveComparison(id, { round: 3, since: 1, changes: [buttons, swap] });
  await reviews.saveComparison(id, { round: 3, since: 2, changes: [buttons] });
  await reviews.finish(id, 3);
  review = await reviews.get(id);
  assert.deepEqual(waitingForYou(review, 3, "Ana"), [small.id]);
  assert.deepEqual(waitingForYou(review, 3, "Ben"), [small.id]);
  assert.deepEqual(told(review, 3, "Ana"), ["buttons in Cancel halfway"]);
  assert.equal(goodForYou(review, 3, "Ana", "Export a quarter"), true);

  // Ben says the answer looks good, which settles it for Ana too: a note has one state, the last word on it. Each says
  // their flows look good for themselves, and either of them can accept.
  await reviews.send(id, send("Ben", 3, { verdicts: [{ note: small.id, verdict: "looks good" }], looksGood: ["Export a quarter", "Cancel halfway"] }));
  review = await reviews.get(id);
  assert.deepEqual(waitingForYou(review, 3, "Ana"), []);
  assert.equal(readyToAccept(review, "Ana"), false);
  await reviews.send(id, send("Ana", 3, { looksGood: ["Cancel halfway"] }));
  review = await reviews.get(id);
  assert.equal(readyToAccept(review, "Ana"), true);
  assert.equal(readyToAccept(review, "Ben"), true);
  await reviews.accept(id, "Ben");
});

test("what the agent says isn't real is never shown to anyone", async () => {
  const reviews = new Reviews(memory());
  await reviews.start("invoice-export", "Export a quarter's invoices as a CSV");
  await reviews.saveRound("invoice-export", round(0));
  await reviews.finish("invoice-export", 0);
  await reviews.saveRound("invoice-export", round(1, { accounts: { dialog: { line: "Exporting starts here." }, keep: { notReal: "The page was still drawing." } } }));
  await reviews.saveComparison("invoice-export", { round: 1, since: 0, changes: [dialog, keep] });
  await reviews.finish("invoice-export", 1);
  assert.deepEqual(told(await reviews.get("invoice-export"), 1, "Ana"), ["dialog in Export a quarter"]);
});
