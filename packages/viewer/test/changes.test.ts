// What changed, as the timeline and a change's card draw it: a diamond for each moment, new steps one where they start,
// and the one you're on as the playhead passes.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Change, Flow, Review, Round } from "@mostlyworks/vantage-review";
import { answersTo, diamondAt, diamondsOn, grownFrom } from "../src/changes.ts";

const flow = (name: string): Flow => ({ name, length: 6, steps: [{ title: "Open the expenses", at: 0 }], recording: `${name.toLowerCase().replace(/\W+/g, "-")}.json` });
const round = (number: number): Round => ({ number, by: "Claude Code", flows: [flow("See who owes whom"), flow("Search the expenses")], replies: [], accounts: {}, finished: "2026-10-25T09:00:00Z" });
const change = (id: string, words: string, flow: string, at: number, until?: number): Change => ({ id, words, seen: [{ flow, at, ...(until !== undefined && { until }) }] });
const review = (changes: Change[]): Review => ({
  id: "tidy-expenses",
  title: "Make the expenses list easier to scan",
  started: "2026-10-25T08:00:00Z",
  rounds: [round(0), round(1)],
  comparisons: [{ round: 1, since: 0, changes }],
  sends: [],
  taken: [],
});

test("changes at one moment of a flow are one diamond, named by the first and how many more", () => {
  const diamonds = diamondsOn(
    review([change("swap", "Create expense and Export have swapped places", "See who owes whom", 0.9), change("words", "“Here are the expenses…” now says “Everything your group has spent”", "See who owes whom", 0.92)]),
    1,
    "Ana",
  );
  assert.equal(diamonds.length, 1);
  assert.equal(diamonds[0]!.name, "Create expense and Export have swapped places and 1 more");
  assert.deepEqual(diamonds[0]!.changes.map(({ change }) => change.id), ["swap", "words"]);
});

test("new steps are a diamond of their own where they start, never folded into another change there", () => {
  const diamonds = diamondsOn(review([change("steps", "New steps: “Clear the search”", "Search the expenses", 2, 4.6), change("green", "“$…” looks different", "Search the expenses", 2)]), 1, "Ana");
  assert.deepEqual(
    diamonds.map(({ id, at, until }) => ({ id, at, until })),
    [
      { id: "steps", at: 2, until: 4.6 },
      { id: "green", at: 2, until: undefined },
    ],
  );
});

test("a note on new steps sits on the first of them, on nothing in particular, and grows out of their diamond", () => {
  const diamonds = diamondsOn(review([change("steps", "New steps: “Clear the search”", "Search the expenses", 2, 4.6)]), 1, "Ana");
  assert.equal(grownFrom(diamonds, { flow: "Search the expenses", at: 2 })?.id, "steps");
  assert.equal(grownFrom(diamonds, { flow: "Search the expenses", at: 2, element: { role: "button", name: "Clear" } }), undefined, "one on a thing there is about that thing");
  assert.equal(grownFrom(diamonds, { flow: "Search the expenses", at: 3 }), undefined, "one later in them is a moment of its own");
});

test("the change you're on lasts from its moment until the next click, a moment and a half at most, and else it's the new steps you're in", () => {
  const diamonds = diamondsOn(review([change("swap", "Create expense and Export have swapped places", "Search the expenses", 1), change("steps", "New steps: “Clear the search”", "Search the expenses", 2, 4.6)]), 1, "Ana");
  const on = (at: number, clicks: number[] = []) => diamondAt(diamonds, { flow: "Search the expenses", at }, clicks)?.id;
  assert.equal(on(0.9), undefined);
  assert.equal(on(1), "swap");
  assert.equal(on(1.6, [1.5]), undefined, "the next click takes you past it");
  assert.equal(on(1.9), "swap");
  assert.equal(on(2.6), "steps", "a moment and a half after it, the new steps you're in");
  assert.equal(diamondAt(diamonds, { flow: "See who owes whom", at: 1 }, [])?.id, undefined, "only in the flow you're in");
});

test("a change made for a note in the note's flow is told with the note, and one made for a note elsewhere is a row that says so", () => {
  const asked = review([change("moved", "“Who owes whom” area moved down", "See who owes whom", 0.9), change("dark", "“$…” looks different", "Search the expenses", 1)]);
  asked.sends = [{ id: "sent", round: 0, by: "Ben", sent: "2026-10-25T08:30:00Z", notes: [{ id: "first", on: { flow: "See who owes whom", at: 1.5 }, words: "Could who owes whom come after the expenses?" }], verdicts: [], looksGood: [] }];
  asked.rounds[1]!.accounts = { moved: { note: "first" }, dark: { note: "first" } };
  const diamonds = diamondsOn(asked, 1, "Ana");
  assert.deepEqual(diamonds.map(({ id, row }) => ({ id, row })), [{ id: "moved", row: false }, { id: "dark", row: true }]);
  assert.deepEqual(answersTo(diamonds, "first").map(({ change }) => change.id), ["moved"]);
  assert.equal(diamonds[1]!.changes[0]!.note, "first", "the row says which note it was made for");
});
