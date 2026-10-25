// The same moment in another round's recording of a flow: what going back and forth between rounds keeps, and where a
// note's moment is on the next round.

import assert from "node:assert/strict";
import { test } from "node:test";
import { inStep, type Flow } from "../src/index.ts";

const flow = (length: number, steps: [string, number][]): Flow => ({ name: "Settle up", length, steps: steps.map(([title, at]) => ({ title, at })), recording: "settle-up.json" });

test("two recordings of a flow with the same steps keep in step at each step's start and its end", () => {
  const before = flow(8, [["Open the expenses", 0], ["Mark as paid", 1], ["Save", 3]]);
  const after = flow(10, [["Open the expenses", 0], ["Mark as paid", 2], ["Save", 4]]);
  assert.equal(inStep(1, before, after), 2);
  assert.equal(inStep(2, before, after), 3, "halfway through a step is halfway through it there");
  assert.equal(inStep(8, before, after), 10);
});

test("a step only one round has plays there while the other holds just before the step they share next", () => {
  const before = flow(4, [["Open the expenses", 0], ["Search", 1]]);
  const after = flow(6, [["Open the expenses", 0], ["Search", 1], ["Clear the search", 3]]);
  assert.equal(inStep(2, after, before), 2.5, "halfway through a step both have is halfway through it in the other");
  assert.equal(inStep(2.5, before, after), 2);
  assert.equal(inStep(5, after, before), 4, "in the step Before doesn't have, Before holds at its end");
});

test("the title card plays the same in every round, and a flow cut short holds at its end", () => {
  const short = flow(2, [["Open the expenses", 0]]);
  const whole = flow(6, [["Open the expenses", 0], ["Export", 2]]);
  assert.equal(inStep(-0.5, whole, short), -0.5);
  assert.equal(inStep(5, whole, short), 2);
});
