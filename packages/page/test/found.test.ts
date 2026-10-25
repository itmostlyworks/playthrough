// Something pointed at on one round, found on another: what a note sits on in every round, and where the next try shows.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Flow } from "@vantage/review";
import { placeIn, type Reading, type Recorded, type Thing } from "../src/index.ts";

const look = { color: "rgb(9, 9, 11)", background: "rgba(0, 0, 0, 0)", size: "16px", weight: "400", border: "none" };
const thing = (role: string, name: string, node: number, x: number, y: number, more: Partial<Thing> = {}): Thing => ({
  role,
  name,
  words: role === "text" ? name : "",
  box: { x, y, width: 120, height: 20 },
  page: { x, y },
  look,
  node,
  ...more,
});
const reading = (step: string, at: number, things: Thing[]): Reading => ({ step, at, screen: { width: 1280, height: 800 }, picture: "", things });
const flow = (length: number, steps: [string, number][]): Flow => ({ name: "Settle up", length, steps: steps.map(([title, at]) => ({ title, at })), recording: "settle-up.json" });
const round = (flowIs: Flow, ...readings: Reading[]): Recorded => ({ flow: flowIs, readings });

test("a thing is found on the next round at the same step, where the agent moved it, at its moment there", () => {
  const then = round(flow(4, [["Open the expenses", 0], ["Settle up", 2]]), reading("Open the expenses", 1.9, [thing("button", "Settle up", 12, 40, 100)]));
  const now = round(flow(6, [["Open the expenses", 0], ["Settle up", 3]]), reading("Open the expenses", 2.9, [thing("button", "Settle up", 31, 600, 100)]));
  const place = placeIn({ flow: "Settle up", at: 1, element: { role: "button", name: "Settle up", node: 12 } }, then, now);
  assert.deepEqual(place, { flow: "Settle up", at: 1.5, element: { role: "button", name: "Settle up", node: 31 } });
});

test("of things alike, it's the one in the same place among them, and words that changed are called as they read there", () => {
  const box = (name: string, node: number, y: number) => thing("box", name, node, 0, y, { box: { x: 0, y, width: 600, height: 200 } });
  const then = round(
    flow(2, [["Open the balances", 0]]),
    reading("Open the balances", 1, [box("Expenses", 1, 0), thing("text", "Dev", 2, 10, 10, { holder: 0 }), box("Who owes whom", 3, 300), thing("text", "Dev $40.00", 4, 10, 310, { holder: 2 })]),
  );
  const now = round(
    flow(2, [["Open the balances", 0]]),
    reading("Open the balances", 1, [box("Expenses", 7, 0), thing("text", "Dev", 8, 10, 10, { holder: 0 }), box("Who owes whom", 9, 300), thing("text", "Dev owes $40.00", 10, 10, 310, { holder: 2 })]),
  );
  const place = placeIn({ flow: "Settle up", at: 1, element: { role: "text", name: "Dev $40.00", node: 4 } }, then, now);
  assert.deepEqual(place.element, { role: "text", name: "Dev owes $40.00", node: 10 });
});

test("a thing that's gone, or a step the round doesn't take, leaves only the moment", () => {
  const then = round(flow(4, [["Open the expenses", 0], ["Export", 2]]), reading("Open the expenses", 1, [thing("button", "Export", 5, 40, 100)]), reading("Export", 3, [thing("dialog", "Export", 6, 300, 200)]));
  const now = round(flow(2, [["Open the expenses", 0]]), reading("Open the expenses", 1, [thing("button", "Download", 9, 900, 700)]));
  assert.deepEqual(placeIn({ flow: "Settle up", at: 1, element: { role: "button", name: "Export", node: 5 } }, then, now), { flow: "Settle up", at: 1 });
  assert.deepEqual(placeIn({ flow: "Settle up", at: 3, element: { role: "dialog", name: "Export", node: 6 } }, then, now), { flow: "Settle up", at: 2 });
});

test("a note noted by role and name alone is found by them, and a spot or a stretch keeps its place on the screen", () => {
  const steps: [string, number][] = [["Open the expenses", 0]];
  const then = round(flow(2, steps), reading("Open the expenses", 1, [thing("link", "Groups", 3, 0, 0)]));
  const now = round(flow(4, steps), reading("Open the expenses", 1, [thing("link", "Groups", 8, 0, 0)]));
  assert.deepEqual(placeIn({ flow: "Settle up", at: 1, element: { role: "link", name: "Groups" } }, then, now).element, { role: "link", name: "Groups", node: 8 });
  assert.deepEqual(placeIn({ flow: "Settle up", at: 0.5, until: 1, point: { x: 0.2, y: 0.4 } }, then, now), { flow: "Settle up", at: 1, until: 2, point: { x: 0.2, y: 0.4 } });
  assert.deepEqual(placeIn({ flow: "Settle up" }, then, now), { flow: "Settle up" });
});
