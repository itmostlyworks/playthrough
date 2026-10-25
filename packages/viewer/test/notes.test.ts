// What the viewer shows each person of the same review: whose call each note is, who each flow looks good to, and what
// you haven't sent yet, as if it were.

import assert from "node:assert/strict";
import { test } from "node:test";
import { memory, newId, Reviews, type Flow, type Review, type Round, type Send } from "@vantage/review";
import { fill, goodTo, notesOn } from "../src/notes.ts";

const flow = (name: string): Flow => ({ name, length: 6, steps: [{ title: "Open the invoices", at: 0 }], recording: `${name.toLowerCase().replace(/\W+/g, "-")}.json` });
const round = (number: number, parts: Partial<Round> = {}): Round => ({
  number,
  by: "Claude Code",
  flows: [flow("See what's overdue"), flow("Export them")],
  replies: [],
  accounts: {},
  ...parts,
});
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

// Ana and Ben both look at round 1. Ana leaves a note on the export; round 2 answers it.
const note = { id: newId(), on: { flow: "Export them", at: 2 }, words: "Export should only take the overdue ones." };
async function twoPeople(): Promise<Review> {
  const reviews = new Reviews(memory());
  await reviews.start("export", "Export the overdue invoices");
  for (const number of [0, 1]) {
    await reviews.saveRound("export", round(number));
    await reviews.finish("export", number);
  }
  await reviews.send("export", send("Ana", 1, { looksGood: ["See what's overdue"], notes: [note] }));
  await reviews.send("export", send("Ben", 1, { looksGood: ["See what's overdue", "Export them"] }));
  await reviews.take("export");
  await reviews.saveRound("export", round(2, { replies: [{ note: note.id, words: "It exports the rows you're looking at." }] }));
  await reviews.finish("export", 2);
  return reviews.get("export");
}

test("an answer waits for whoever wrote the note, and everyone else sees who it waits for", async () => {
  const review = await twoPeople();
  const [ana] = notesOn(review, 2, "Ana");
  const [ben] = notesOn(review, 2, "Ben");
  assert.deepEqual([ana?.state, ana?.yours, fill(ana!)], ["needs you", true, "bg-amber"]);
  assert.deepEqual([ben?.state, ben?.waitingFor, ben?.yours, fill(ben!)], ["with someone else", ["Ana"], false, "bg-slate"]);
  // Ben can still judge the answer, as anyone can.
  assert.equal(ben?.toJudge, true);
});

test("each person's Looks good is their own, and a note of theirs in the flow takes it back", async () => {
  const review = await twoPeople();
  assert.deepEqual(goodTo(review, 1, "See what's overdue"), ["Ana", "Ben"]);
  assert.deepEqual(goodTo(review, 1, "Export them"), ["Ben"]);
  assert.deepEqual(goodTo(review, 2, "Export them"), ["Ben"]);
});

test("what you haven't sent shows as if it were sent", async () => {
  const review = await twoPeople();
  const general = { id: newId(), words: "The button could say how many it exports." };
  const [answered, written] = notesOn(review, 2, "Ana", { notes: [general], verdicts: [{ note: note.id, verdict: "looks good" }], looksGood: [] });
  assert.deepEqual([answered?.state, answered?.unsent, fill(answered!)], ["settled", true, "bg-green"]);
  assert.deepEqual([written?.number, written?.state, written?.unsent], [2, "with the agent", true]);
});

test("looking back shows what was said then, and nothing after", async () => {
  const review = await twoPeople();
  const [then] = notesOn(review, 1, "Ana");
  assert.deepEqual([then?.state, then?.turns.length], ["with the agent", 1]);
});
