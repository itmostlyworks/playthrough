// A note made on an earlier taking of a moment, found in the taking now. The readings are cut from a real change: the
// person asked "How late is each one?" on Alder Dental's "Overdue" badge, and the agent made the badges say how late, while
// the overdue total's own "Overdue" label stayed as it was.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { foundNow } from "../src/found.ts";
import type { Reading } from "../src/reading.ts";

const { then, now } = JSON.parse(readFileSync(new URL("./overdue-invoices.json", import.meta.url), "utf8")) as { then: Reading; now: Reading };
const badge = { role: "text", name: "Overdue", node: 247 };
const label = { role: "text", name: "Overdue", node: 33 };

test("a note on words the agent then reworded is on them as they read now, not on the same words standing elsewhere", () => {
  const found = foundNow([then], [now], badge, 5.399);
  assert.equal(found?.name, "79 days late");
  assert.equal(found?.node, 1247);
});

test("a note on words still there is on them, wherever they moved", () => {
  const moved = { ...now, things: now.things.map((thing) => (thing.node === 1033 ? { ...thing, box: { ...thing.box, y: 400 }, page: { ...thing.page, y: 400 } } : thing)) };
  assert.equal(foundNow([then], [moved], label, 5.399)?.node, 1033);
});

test("a note whose thing is gone is on nothing now, never on what says the same words", () => {
  const gone = { ...now, things: now.things.filter((thing) => !/late/.test(thing.name)) };
  assert.equal(foundNow([then], [gone], badge, 5.399), undefined);
});
