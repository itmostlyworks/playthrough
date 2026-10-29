// What a click on the recording notes, what it's called, and where a note is on every round.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reading, Thing } from "@mostlyworks/vantage-page";
import type { Flow, Review, Round } from "@mostlyworks/vantage-review";
import { holdersOf, nearTo, pickAt, placeName, placeOn, watchedIn } from "../src/things.ts";

const look = { color: "rgb(9, 9, 11)", background: "rgba(0, 0, 0, 0)", size: "16px", weight: "400", border: "none" };
const box = (x: number, y: number, width: number, height: number) => ({ box: { x, y, width, height }, page: { x, y } });
const thing = (role: string, name: string, node: number, at: ReturnType<typeof box>, more: Partial<Thing> = {}): Thing => ({ role, name, words: role === "text" ? name : "", look, node, ...at, ...more });
const reading = (at: number, things: Thing[], step = "Open the expenses"): Reading => ({ step, at, screen: { width: 1280, height: 800 }, picture: "", things });

// Spliit's expenses: a panel with its heading, a dialog with words and a button in it, an expense with its amount.
const page = reading(1, [
  thing("box", "Expenses", 10, box(270, 200, 740, 480)),
  thing("heading", "Expenses", 11, box(290, 220, 200, 30), { holder: 0, parent: 0 }),
  thing("link", "Cabin $600.00", 12, box(290, 560, 700, 70), { words: "Cabin $600.00", holder: 0, parent: 0 }),
  thing("text", "$600.00", 13, box(880, 580, 55, 20), { holder: 0, parent: 2 }),
  thing("dialog", "Delete it?", 20, box(400, 300, 400, 200)),
  thing("text", "This can't be undone.", 21, box(420, 340, 300, 20), { holder: 4, parent: 4 }),
  thing("button", "Delete", 22, box(700, 440, 80, 32), { holder: 4, parent: 4 }),
]);

test("a click notes the nearest thing a person would name: a button for its words, words in a dialog, the panel for its space", () => {
  // Outwards from what's under the pointer: a span inside the button, the button, the dialog, a wrapper nothing reads.
  assert.equal(pickAt([99, 22, 20, 98], [page], 1)?.name, "Delete");
  assert.equal(pickAt([21, 20, 98], [page], 1)?.name, "This can't be undone.");
  assert.equal(pickAt([97, 10, 98], [page], 1)?.name, "Expenses");
  assert.equal(pickAt([13, 12, 10], [page], 1)?.role, "link", "an amount in an expense notes the expense");
  assert.equal(pickAt([96, 98], [page], 1), undefined, "nothing to name: a note on the spot");
});

test("widened, a pick steps out to what holds it, each bigger than the one before, short of the whole page", () => {
  const boxes: Record<number, { left: number; top: number; width: number; height: number }> = {
    13: { left: 880, top: 580, width: 55, height: 20 },
    12: { left: 290, top: 560, width: 700, height: 70 },
    14: { left: 290, top: 560, width: 700, height: 70 },
    10: { left: 270, top: 200, width: 740, height: 480 },
    15: { left: 0, top: 0, width: 1280, height: 800 },
  };
  const read = [reading(1, [...page.things, thing("box", "The same size", 14, box(290, 560, 700, 70)), thing("box", "Everything", 15, box(0, 0, 1280, 800))])];
  const holders = holdersOf([13, 14, 12, 10, 15], read, 1, read[0]!.things[3]!, (node) => boxes[node], { width: 1280, height: 800 });
  assert.deepEqual(holders.map((thing) => thing.name), ["The same size", "Expenses"]);
});

test("a note on empty space is named by the nearest thing within 80px of it, only from inside the panel it's in", () => {
  assert.equal(nearTo([page], 1, { x: 800 / 1280, y: 470 / 800 })?.name, "Delete", "in the dialog, its own button");
  assert.equal(nearTo([page], 1, { x: 1000 / 1280, y: 600 / 800 })?.name, "Cabin $600.00", "nearest by its edge: the expense, 10px off");
  assert.equal(nearTo([page], 1, { x: 100 / 1280, y: 100 / 800 }), undefined);
  const read = () => [page];
  assert.equal(placeName({ flow: "Search", at: 1, point: { x: 1000 / 1280, y: 600 / 800 } }, read, 2), "Near Cabin $600.00 link");
  assert.equal(placeName({ flow: "Search", at: 1, point: { x: 0.05, y: 0.05 } }, read, 2), "This moment");
  assert.equal(placeName({ flow: "Search", at: 1, element: { role: "dialog", name: "Delete it?", node: 20 } }, read, 2), "Delete it? dialog");
  assert.equal(placeName({ flow: "Search" }, read, 2), "The whole flow");
});

test("a thing Vantage has no word for, such as a list item or a column's heading noted in the app, is called by its words", () => {
  const read = () => [page];
  assert.equal(placeName({ flow: "Search", at: 1, element: { role: "listitem", name: "Plan the review stage" } }, read, 2), "“Plan the review stage”");
  assert.equal(placeName({ flow: "Search", at: 1, element: { role: "columnheader", name: "Due" } }, read, 2), "“Due”");
});

test("a note sits on its own thing where it was written, where Vantage placed the answer, and found on any other round", () => {
  const flow: Flow = { name: "Search", length: 4, steps: [{ title: "Open the expenses", at: 0 }], recording: "search.json" };
  const round = (number: number, replies: Round["replies"] = []): Round => ({ number, by: "Claude Code", flows: [flow], replies, accounts: {} });
  const on = { flow: "Search", at: 1, element: { role: "text", name: "$600.00", node: 13 } };
  const placed = { flow: "Search", at: 1.5, element: { role: "text", name: "$600.00", node: 40 } };
  const review: Review = { id: "tidy", title: "Tidy", started: "2026-10-25T16:00:00.000Z", rounds: [round(1), round(2, [{ note: "n1", words: "Darker now.", on: placed }]), round(3)], comparisons: [], sends: [], taken: [] };
  const moved = reading(1, page.things.map((kept) => (kept.node === 13 ? { ...kept, node: 77, ...box(880, 620, 55, 20) } : kept)));
  const read = (number: number) => (number === 3 ? [moved] : [page]);
  assert.equal(placeOn(review, "n1", on, 1, review.rounds[0]!, read), on);
  assert.equal(placeOn(review, "n1", on, 1, review.rounds[1]!, read), placed);
  assert.deepEqual(placeOn(review, "n1", on, 1, review.rounds[2]!, read)?.element, { role: "text", name: "$600.00", node: 77 });
});

test("an answer that moves is watched in the step its reply names, from a second before the action that set it moving to the next step", () => {
  const steps = [{ title: "Open the board", at: 0 }, { title: "Filter to Design", at: 2, actions: [2.2, 2.3, 2.6] }, { title: "Clear the filter", at: 3.5 }];
  const flow: Flow = { name: "Filter", length: 5, steps, recording: "filter.json" };
  const round = (number: number, replies: Round["replies"] = []): Round => ({ number, by: "Claude Code", flows: [flow], replies, accounts: {} });
  const on = { flow: "Filter", at: 2.4, element: { role: "button", name: "To do 0/2", node: 9 } };
  const review: Review = {
    id: "fold", title: "Fold", started: "2026-10-29T16:00:00.000Z", comparisons: [], sends: [], taken: [],
    rounds: [round(1), round(2, [{ note: "n1", words: "Cards fold away now.", on, watch: "Filter to Design" }])],
  };
  assert.deepEqual(watchedIn(review.rounds[1]!, "n1"), { flow: "Filter", at: 1.3, until: 3.5 });
  assert.equal(watchedIn(review.rounds[0]!, "n1"), undefined);
});
