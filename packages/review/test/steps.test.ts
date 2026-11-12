// The same moment in another round's recording of a scene: what going back and forth between rounds keeps, and where a
// note's moment is on the next round.

import assert from "node:assert/strict";
import { test } from "node:test";
import { inStep, together, type Scene } from "../src/index.ts";

const scene = (length: number, steps: [string, number][]): Scene => ({ name: "Settle up", length, steps: steps.map(([title, at]) => ({ title, at })), recording: "settle-up.json" });

test("two recordings of a scene with the same steps keep in step at each step's start and its end", () => {
  const before = scene(8, [["Open the expenses", 0], ["Mark as paid", 1], ["Save", 3]]);
  const after = scene(10, [["Open the expenses", 0], ["Mark as paid", 2], ["Save", 4]]);
  assert.equal(inStep(1, before, after), 2);
  assert.equal(inStep(2, before, after), 3, "halfway through a step is halfway through it there");
  assert.equal(inStep(8, before, after), 10);
});

test("a step only one round has plays there while the other holds just before the step they share next", () => {
  const before = scene(4, [["Open the expenses", 0], ["Search", 1]]);
  const after = scene(6, [["Open the expenses", 0], ["Search", 1], ["Clear the search", 3]]);
  assert.equal(inStep(2, after, before), 2.5, "halfway through a step both have is halfway through it in the other");
  assert.equal(inStep(2.5, before, after), 2);
  assert.equal(inStep(5, after, before), 4, "in the step Before doesn't have, Before holds at its end");
});

test("the title card plays the same in every round, and a scene cut short holds at its end", () => {
  const short = scene(2, [["Open the expenses", 0]]);
  const whole = scene(6, [["Open the expenses", 0], ["Export", 2]]);
  assert.equal(inStep(-0.5, whole, short), -0.5);
  assert.equal(inStep(5, whole, short), 2);
});

// A moment: one step, its actions each with what it was and when it began, and when each was done.
const moment = (length: number, actions: [string, number, number?][]): Scene => ({
  name: "Change the card prefix",
  length,
  steps: [{ title: "Change the card prefix", at: 0, actions: actions.map(([, began, done]) => done ?? began), began: actions.map(([action, at]) => ({ action, at })) }],
  recording: "prefix.json",
});

test("two sides that click the same things arrive at each click together, at their own pace between", () => {
  const then = moment(10, [["click link “Settings”", 2], ["click button “Update”", 6]]);
  const now = moment(8, [["click link “Settings”", 3], ["click button “Update”", 4]]);
  assert.equal(inStep(2, then, now), 3);
  assert.equal(inStep(6, then, now), 4);
  assert.equal(inStep(4, then, now), 3.5, "halfway between two clicks is halfway between them there");
  assert.equal(inStep(10, then, now), 8);
});

test("typing different words in the same field starts and stops together", () => {
  const then = moment(10, [["type textbox “Card prefix”", 2, 4]]);
  const now = moment(10, [["type textbox “Card prefix”", 3, 3.5]]);
  assert.equal(inStep(2, then, now), 3, "both start typing at once");
  assert.equal(inStep(4, then, now), 3.5, "and are done at once");
});

// Whether two recordings pass these two moments of theirs together.
const passTogether = (one: Scene, other: Scene, at: number, atOther: number) => {
  const [mine, theirs] = together(one, other);
  return mine.some((moment, i) => moment === at && theirs[i] === atOther);
};

test("played together, a side that takes an extra action plays it while the other holds, whichever side it is", () => {
  const then = moment(10, [["click link “Settings”", 2], ["click button “Update”", 6]]);
  const now = moment(10, [["click link “Settings”", 2], ["press Escape", 4], ["click button “Update”", 6]]);
  assert.ok(passTogether(then, now, 6, 4) && passTogether(then, now, 6, 6), "then holds at Update from when now presses Escape until both click it");
  assert.ok(passTogether(now, then, 4, 6) && passTogether(now, then, 6, 6));
  assert.equal(inStep(5, now, then), 6, "midway through Escape, then is at Update, waiting");
  assert.equal(inStep(3, now, then), 4, "on the way, then is already going to Update");
});

test("a moment marked again a different way lines up on what both still do", () => {
  const then = moment(12, [["click link “Settings”", 2], ["click link “Workspace”", 4], ["type textbox “Card prefix”", 6, 8], ["click button “Update”", 10]]);
  const now = moment(12, [["click link “Workspace”", 3], ["click button “Save”", 5], ["type textbox “Card prefix”", 7, 8], ["click button “Update”", 11]]);
  assert.ok(passTogether(now, then, 3, 4), "both on Workspace");
  assert.ok(passTogether(now, then, 3, 2), "Settings, which now doesn't click, plays while now holds at Workspace");
  assert.ok(passTogether(now, then, 7, 6), "both start typing");
  assert.ok(passTogether(now, then, 8, 8), "and stop");
  assert.ok(passTogether(now, then, 11, 10), "both on Update");
  assert.equal(inStep(4, now, then), 5, "while now clicks Save, then goes on towards the field");
});

test("recordings kept without what each action was line up action by action where both took as many", () => {
  const then: Scene = { name: "Pick Ana", length: 4, steps: [{ title: "Pick Ana", at: 0, actions: [1, 3] }], recording: "a.json" };
  const now: Scene = { name: "Pick Ana", length: 4, steps: [{ title: "Pick Ana", at: 0, actions: [1.5, 3.2] }], recording: "b.json" };
  const fewer: Scene = { name: "Pick Ana", length: 4, steps: [{ title: "Pick Ana", at: 0, actions: [1.5] }], recording: "c.json" };
  assert.equal(inStep(1, then, now), 1.5);
  assert.equal(inStep(3, then, now), 3.2);
  assert.notEqual(inStep(3, then, fewer), 1.5, "with another number of them, none is taken for another by its place");
});
