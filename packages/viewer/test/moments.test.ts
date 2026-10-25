// Where you are in a round, and the same place in another round: what going back and forth between rounds keeps.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Flow } from "@vantage/review";
import { along, CARD, inStep, momentAt, titleCard } from "../src/moments.ts";

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

test("a step forward from one flow's end goes on into the next, through its title card", () => {
  const flows = [{ ...flow(2, []), name: "See who owes whom" }, { ...flow(4, []), name: "Search" }];
  const end = along(flows, { flow: "See who owes whom", at: 2 });
  assert.deepEqual(momentAt(flows, end + 1), { flow: "Search", at: 1 - CARD });
  assert.deepEqual(momentAt(flows, end + 100), { flow: "Search", at: 4 });
  assert.deepEqual(momentAt(flows, -5), { flow: "See who owes whom", at: -CARD });
});

test("a flow's name comes up over its softened first frame, and is gone as its recording starts", () => {
  const middle = titleCard(-CARD / 2)!;
  assert.ok(middle.soft > 0.9 && middle.name === 1);
  assert.equal(titleCard(0), undefined);
  assert.ok(titleCard(-0.01)!.name < 0.1 && titleCard(-0.01)!.soft < 0.1);
});
