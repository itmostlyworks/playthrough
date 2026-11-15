// Stepping through a moment: each step is an instant its screen changed, or a frame of what's still moving after one;
// it never leaves what's shown of the moment.

import assert from "node:assert/strict";
import { test } from "node:test";
import { EventType, IncrementalSource, MouseInteractions, type eventWithTime } from "rrweb";
import { changesOf, isStep, stepFrom, FRAME } from "../src/stepping.ts";

const at = (ms: number, data: object, type = EventType.IncrementalSnapshot) => ({ type, data, timestamp: 1000 + ms }) as eventWithTime;
const mutation = (ms: number, attributes: { id: number; attributes: Record<string, string | null> }[] = [], adds = 0) =>
  at(ms, { source: IncrementalSource.Mutation, adds: Array(adds).fill({ parentId: 1, nextId: null, node: {} }), removes: [], texts: [], attributes });
const start = at(0, { href: "http://app/", width: 1280, height: 800 }, EventType.Meta);

test("the screen changes where the page changes, a click lands, words are typed or it scrolls, never where only the pointer moves", () => {
  const events = [
    start,
    at(300, { source: IncrementalSource.MouseMove, positions: [{ x: 1, y: 1, id: 1, timeOffset: 0 }] }),
    at(500, { source: IncrementalSource.MouseInteraction, type: MouseInteractions.Click, id: 4, x: 1, y: 1 }),
    mutation(900, [], 3),
    at(1500, { source: IncrementalSource.Input, id: 7, text: "a", isChecked: false }),
    at(2000, { source: IncrementalSource.Scroll, id: 1, x: 0, y: 40 }),
  ];
  assert.deepEqual(changesOf(events), [0.017, 0.517, 0.917, 1.517, 2.017]);
});

test("what changes within one frame is one step, shown whole on the frame after it", () => {
  const events = [start, mutation(1000, [], 1), mutation(1008, [], 1), mutation(1016, [], 1), mutation(1017, [], 1)];
  assert.deepEqual(changesOf(events), [0.017, 1.017, 1.034]);
});

test("a field's text cursor hidden for a picture and put back is no change", () => {
  const events = [
    start,
    mutation(400, [{ id: 9, attributes: { style: "caret-color: transparent !important;" } }]),
    mutation(420, [{ id: 9, attributes: { style: "" } }]),
    mutation(800, [{ id: 9, attributes: { style: "color: red" } }]),
  ];
  assert.deepEqual(changesOf(events), [0.017, 0.817]);
});

test("what changes in a dev server's badge, hidden in every recording, is no change", () => {
  const page = { id: 1, type: 0, childNodes: [{ id: 2, type: 2, tagName: "body", attributes: {}, childNodes: [] }] };
  const badge = { id: 5, type: 2, tagName: "nextjs-portal", attributes: {}, childNodes: [{ id: 6, type: 2, tagName: "svg", attributes: {}, childNodes: [] }] };
  const events = [
    start,
    at(10, { node: page, initialOffset: { top: 0, left: 0 } }, EventType.FullSnapshot),
    at(200, { source: IncrementalSource.Mutation, adds: [{ parentId: 2, nextId: null, node: badge }], removes: [], texts: [], attributes: [] }),
    mutation(600, [{ id: 6, attributes: { class: "paused" } }]),
    mutation(900, [{ id: 2, attributes: { class: "dark" } }]),
  ];
  assert.deepEqual(changesOf(events), [0.017, 0.917], "nor is the badge coming");
});

// A moment shown from 1s to 5s whose screen changed at 2s and at 3s, and whose page moved for 50ms after the change at
// 2s; nothing moved after the one at 3s.
const shown = { from: 1, end: 5, changes: [0.5, 2, 3, 6] };
const moving = (change: number) => (change === 2 ? 2.05 : change);
const walk = (from: number, by: 1 | -1) => {
  const steps: number[] = [];
  for (let now: number | undefined = from; (now = stepFrom(now, by, shown, moving)) !== undefined; ) steps.push(now);
  return steps;
};

test("on from the start, each step is the next change, or a frame of what's still moving after one, until the end", () => {
  assert.deepEqual(walk(1, 1), [2, 2.017, 2.033, 2.05, 3, 5]);
});

test("back from the end walks back through the same steps to the start, and no further", () => {
  assert.deepEqual(walk(5, -1), [3, 2.05, 2.033, 2.017, 2, 1]);
});

test("from anywhere between, a step goes to the step either side", () => {
  assert.equal(stepFrom(2.5, 1, shown, moving), 3);
  assert.equal(stepFrom(2.5, -1, shown, moving), 2.05);
  assert.equal(stepFrom(2.04, 1, shown, moving), 2.05);
  assert.equal(stepFrom(2.05, 1, shown, moving), 3, "once it has stopped, on to the next change");
  assert.equal(stepFrom(1.5, -1, shown, moving), 1);
});

test("a change that moves into the next is stepped through only up to it", () => {
  const close = { from: 0, end: 1, changes: [0.2, 0.25] };
  assert.deepEqual([stepFrom(0.2, 1, close, () => 0.6), stepFrom(0.217, 1, close, () => 0.6), stepFrom(0.233, 1, close, () => 0.6)], [0.217, 0.233, 0.25]);
});

test("each step is known as one, so resting there shows that very frame", () => {
  for (const step of walk(1, 1).slice(0, -1)) assert.ok(isStep(step, shown.changes), `${step}`);
  assert.equal(isStep(2.509, shown.changes), false);
  assert.equal(isStep(2 + FRAME / 2, shown.changes), false);
});
