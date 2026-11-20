// Two recordings of the same moment played together, as Compare plays them: lined up on what both did.

import assert from "node:assert/strict";
import { test } from "node:test";
import { doneAt, doneBefore, together, type Moment } from "../src/index.ts";

// A moment: each thing done with what it was and when it began, and when it was done.
const recorded = (length: number, actions: [string, number, number?][]): Moment => ({
  name: "Change the card prefix",
  length,
  actions: actions.map(([what, began, done]) => ({ at: done ?? began, what, began })),
  recording: "prefix.json",
  from: 0,
});

// Whether two recordings pass these two moments of theirs together.
const passTogether = (one: Moment, other: Moment, at: number, atOther: number) => {
  const [mine, theirs] = together(one, other);
  return mine.some((time, i) => time === at && theirs[i] === atOther);
};

test("two sides that click the same things arrive at each click together, at their own pace between", () => {
  const then = recorded(10, [["click link “Settings”", 2], ["click button “Update”", 6]]);
  const now = recorded(8, [["click link “Settings”", 3], ["click button “Update”", 4]]);
  assert.ok(passTogether(then, now, 2, 3) && passTogether(then, now, 6, 4), "each click at once");
  assert.ok(passTogether(then, now, 10, 8), "and the end");
});

test("typing different words in the same field starts and stops together", () => {
  const then = recorded(10, [["type textbox “Card prefix”", 2, 4]]);
  const now = recorded(10, [["type textbox “Card prefix”", 3, 3.5]]);
  assert.ok(passTogether(then, now, 2, 3), "both start typing at once");
  assert.ok(passTogether(then, now, 4, 3.5), "and are done at once");
});

test("played together, a side that takes an extra action plays it while the other holds, whichever side it is", () => {
  const then = recorded(10, [["click link “Settings”", 2], ["click button “Update”", 6]]);
  const now = recorded(10, [["click link “Settings”", 2], ["press Escape", 4], ["click button “Update”", 6]]);
  assert.ok(passTogether(then, now, 6, 4) && passTogether(then, now, 6, 6), "then holds at Update from when now presses Escape until both click it");
  assert.ok(passTogether(now, then, 4, 6) && passTogether(now, then, 6, 6));
});

test("a moment marked again a different way lines up on what both still do", () => {
  const then = recorded(12, [["click link “Settings”", 2], ["click link “Workspace”", 4], ["type textbox “Card prefix”", 6, 8], ["click button “Update”", 10]]);
  const now = recorded(12, [["click link “Workspace”", 3], ["click button “Save”", 5], ["type textbox “Card prefix”", 7, 8], ["click button “Update”", 11]]);
  assert.ok(passTogether(now, then, 3, 4), "both on Workspace");
  assert.ok(passTogether(now, then, 3, 2), "Settings, which now doesn't click, plays while now holds at Workspace");
  assert.ok(passTogether(now, then, 7, 6), "both start typing");
  assert.ok(passTogether(now, then, 8, 8), "and stop");
  assert.ok(passTogether(now, then, 11, 10), "both on Update");
});

test("recordings kept without what each action was line up action by action where both took as many", () => {
  const then: Moment = { name: "Pick Ana", length: 4, actions: [{ at: 1 }, { at: 3 }], recording: "a.json", from: 0 };
  const now: Moment = { name: "Pick Ana", length: 4, actions: [{ at: 1.5 }, { at: 3.2 }], recording: "b.json", from: 0 };
  const fewer: Moment = { name: "Pick Ana", length: 4, actions: [{ at: 1.5 }], recording: "c.json", from: 0 };
  assert.ok(passTogether(then, now, 1, 1.5) && passTogether(then, now, 3, 3.2));
  assert.ok(!passTogether(then, fewer, 3, 1.5), "with another number of them, none is taken for another by its place");
});

// Where a moment is taken over: after so many of the things it shows done, the way there done whole before them.
// A moment marked since moments had a start: its way before where it starts, at 4s; it shows a click at 5s and a
// fill at 7s, and ends at 10s.
const marked: Moment = { name: "Hides the card numbers", length: 10, from: 4, actions: [{ at: 5 }, { at: 7 }], recording: "hides.json" };

test("taken over at rest on a moment's end, everything it shows is done and checked", () => {
  assert.equal(doneAt(marked, 10), undefined);
});

test("taken over at a moment's start, nothing it shows is done yet: the app is where the way there left it", () => {
  assert.equal(doneAt(marked, 4), 0);
  assert.equal(doneBefore(marked), 0, "its way is before its step, done whole by the time it starts");
});

test("paused after a thing done, or pressed while playing past it, the app is after that thing and before the next", () => {
  assert.equal(doneAt(marked, 5), 1, "at the click itself");
  assert.equal(doneAt(marked, 6.3), 1);
  assert.equal(doneAt(marked, 7.5), undefined, "after the last, it's the end");
});

test("a still is taken over at its end, wherever it rests", () => {
  const still: Moment = { ...marked, actions: [] };
  assert.equal(doneAt(still, 4), undefined);
});

test("a moment kept with its way inside its step counts the way's things before what it shows", () => {
  // Signed in and went to the board at 1s and 2s, then what it shows: a click at 6s.
  const kept: Moment = { name: "Opens the card", length: 9, from: 5, actions: [{ at: 1 }, { at: 2 }, { at: 6 }], recording: "opens.json" };
  assert.deepEqual([doneAt(kept, 5), doneBefore(kept)], [0, 2], "at its start, after the way's two");
  assert.equal(doneAt(kept, 9), undefined);
});
