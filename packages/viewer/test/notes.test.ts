// What the viewer shows each person of the same review: whose call each note is, whether each scene looks good to them,
// and what you haven't sent yet, as if it were.

import assert from "node:assert/strict";
import { test } from "node:test";
import { memory, newId, Reviews, type Scene, type Review, type Round, type Send } from "@playthrough/review";
import { fill, lookGood, nothing, notesOn, settledBefore, standings, takeBack } from "../src/notes.ts";

const scene = (name: string): Scene => ({ name, length: 6, steps: [{ title: "Open the invoices", at: 0 }], recording: `${name.toLowerCase().replace(/\W+/g, "-")}.json` });
const round = (number: number, parts: Partial<Round> = {}): Round => ({
  number,
  by: "Claude Code",
  scenes: [scene("See what's overdue"), scene("Export them")],
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
const note = { id: newId(), on: { scene: "Export them", at: 2 }, words: "Export should only take the overdue ones." };
async function twoPeople(reviews = new Reviews(memory())): Promise<Review> {
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

test("whoever says an answer looks good settles the note for everyone, under their name, and it doesn't become theirs", async () => {
  const reviews = new Reviews(memory());
  await twoPeople(reviews);
  await reviews.send("export", send("Ben", 2, { verdicts: [{ note: note.id, verdict: "looks good" }] }));
  const review = await reviews.get("export");
  const [ana] = notesOn(review, 2, "Ana");
  const [ben] = notesOn(review, 2, "Ben");
  assert.deepEqual([ana?.state, ana?.toJudge, ana?.turns.at(-1)?.by, fill(ana!)], ["settled", false, "Ben", "bg-green"]);
  assert.deepEqual([ben?.state, ben?.yours], ["settled", false]);
});

test("a reply after someone's Looks good sends the note back for everyone", async () => {
  const reviews = new Reviews(memory());
  await twoPeople(reviews);
  await reviews.send("export", send("Ben", 2, { verdicts: [{ note: note.id, verdict: "looks good" }] }));
  await reviews.send("export", send("Ana", 2, { replies: [{ note: note.id, words: "It should still be only the overdue ones." }] }));
  const review = await reviews.get("export");
  assert.deepEqual(notesOn(review, 2, "Ben").map((note) => note.state), ["with the agent"]);
  assert.deepEqual(notesOn(review, 2, "Ana").map((note) => note.state), ["with the agent"]);
});

test("each person's Looks good is their own, and a note of theirs in the scene takes it back", async () => {
  const review = await twoPeople();
  const goodTo = (round: number, scene: string) => ["Ana", "Ben"].filter((person) => standings(review, round, person, {}).get(scene)?.is === "good");
  assert.deepEqual(goodTo(1, "See what's overdue"), ["Ana", "Ben"]);
  assert.deepEqual(goodTo(1, "Export them"), ["Ben"]);
  assert.deepEqual(goodTo(2, "Export them"), ["Ben"]);
});

test("what you haven't sent shows as if it were sent", async () => {
  const review = await twoPeople();
  const general = { id: newId(), words: "The button could say how many it exports." };
  const [answered, written] = notesOn(review, 2, "Ana", { 2: { ...nothing, notes: [general], verdicts: [{ note: note.id, verdict: "looks good" }] } });
  assert.deepEqual([answered?.state, answered?.unsent, fill(answered!)], ["settled", true, "bg-green"]);
  assert.deepEqual([written?.number, written?.state, written?.unsent], [2, "with the agent", true]);
});

test("looking back shows what was said then, and nothing after", async () => {
  const review = await twoPeople();
  const [then] = notesOn(review, 1, "Ana");
  assert.deepEqual([then?.state, then?.turns.length], ["with the agent", 1]);
});

test("a note settled on an earlier round is counted apart, and no longer a row on the rounds after", async () => {
  const reviews = new Reviews(memory());
  await twoPeople(reviews);
  const another = { id: newId(), on: { scene: "Export them", at: 4 }, words: "The file could be named for the month." };
  await reviews.send("export", send("Ana", 2, { verdicts: [{ note: note.id, verdict: "looks good" }], notes: [another] }));
  await reviews.take("export");
  await reviews.saveRound("export", round(3, { replies: [{ note: another.id, words: "It's named for the month now." }] }));
  await reviews.finish("export", 3);
  const later = await reviews.get("export");
  assert.deepEqual(notesOn(later, 2, "Ben").map((shown) => shown.number), [1, 2], "settled on round 2, it's still a row there");
  assert.deepEqual(settledBefore(later, 3, "Ben").map((shown) => shown.number), [1]);
  assert.deepEqual(notesOn(later, 3, "Ben").map((shown) => shown.number), [2]);
});

test("a scene with an answer waiting asks for it, and its Looks good settles the answers in it you haven't judged", async () => {
  const review = await twoPeople();
  const export_ = (draft = nothing) => standings(review, 2, "Ana", { 2: draft }).get("Export them");
  assert.deepEqual(export_(), { is: "needs you", count: 1, asks: true });
  const good = lookGood(nothing, "Export them", notesOn(review, 2, "Ana"));
  assert.deepEqual(good.verdicts, [{ note: note.id, verdict: "looks good" }]);
  assert.equal(export_(good)?.is, "good");
  const back = takeBack(good, "Export them", notesOn(review, 2, "Ana", { 2: good }));
  assert.deepEqual([back.looksGood, back.verdicts], [[], []], "taken back, the answer it settled waits again");
});

test("a scene with something of yours for the agent asks nothing more this round", async () => {
  const review = await twoPeople();
  assert.deepEqual(standings(review, 1, "Ana", {}).get("Export them"), { is: "with the agent", count: 0, asks: false });
  const draft = { ...nothing, notes: [{ id: newId(), on: { scene: "See what's overdue", at: 1 }, words: "Sort by how late they are?" }] };
  assert.deepEqual(standings(review, 2, "Ben", { 2: draft }).get("See what's overdue"), { is: "to send", count: 1, asks: false });
  const unsaved = { ...nothing, unsaved: [{ id: newId(), on: { scene: "Export them" }, words: "The file" }] };
  assert.equal(standings(review, 2, "Ana", { 2: unsaved }).get("Export them")?.is, "not saved");
});

test("a Looks good you've sent can be taken back, and the scene asks again; taken back, it's yours to say again", async () => {
  const review = await twoPeople();
  assert.equal(standings(review, 2, "Ben", {}).get("Export them")?.is, "good");
  const back = { 2: { ...nothing, takenBack: ["Export them"] } };
  assert.equal(standings(review, 2, "Ben", back).get("Export them")?.is, "is it good");
  const reviews = new Reviews(memory());
  await twoPeople(reviews);
  await reviews.send("export", send("Ben", 2, { takenBack: ["Export them"] }));
  const sent = await reviews.get("export");
  assert.equal(standings(sent, 2, "Ben", {}).get("Export them")?.is, "is it good");
  assert.equal(standings(sent, 2, "Ben", { 2: lookGood(nothing, "Export them", []) }).get("Export them")?.is, "good");
});

test("a scene that looked good to you and changed since asks again", async () => {
  const review = await twoPeople();
  assert.equal(standings(review, 2, "Ben", {}).get("Export them")?.is, "good");
  const changed: Review = { ...review, comparisons: [{ round: 2, since: 1, changes: [{ id: newId(), words: "Export is new", seen: [{ scene: "Export them", at: 1 }] }] }] };
  assert.equal(standings(changed, 2, "Ben", {}).get("Export them")?.is, "looked good");
  assert.equal(standings({ ...changed, accepted: { by: "Ana", at: "2026-10-25T12:00:00Z" } }, 2, "Ben", {}).get("Export them")?.is, "good", "accepted, every scene is");
});

test("what you haven't sent stays on the round it's about, and shows on the rounds after it as what you sent does", async () => {
  const review = await twoPeople();
  const earlier = { id: newId(), on: { scene: "See what's overdue", at: 1 }, words: "Sort by how late they are?" };
  const unsent = { 1: { ...nothing, notes: [earlier] } };
  const shown = notesOn(review, 2, "Ben", unsent).find((shown) => shown.id === earlier.id);
  assert.deepEqual([shown?.written, shown?.state, shown?.unsent], [1, "with the agent", true]);
  assert.equal(standings(review, 2, "Ben", unsent).get("See what's overdue")?.is, "to send");
  assert.deepEqual(notesOn(review, 1, "Ben", { 2: { ...nothing, notes: [earlier] } }).map((note) => note.id), [note.id], "looking back, what's about a later round isn't there");
});

