// What Compare opens framed on, of what changed: where the hand-back said it found each change, as each side's reading has it.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finding } from "@playthrough/change";
import type { Reading, Thing } from "@playthrough/page";
import { changedAt } from "../src/compare.ts";

const look = { color: "", background: "", size: "", weight: "", border: "" };
const text = (name: string, y: number): Thing => ({ role: "text", name, words: name, box: { x: 40, y, width: 120, height: 20 }, page: { x: 40, y }, look });
const reading = (...things: Thing[]): Reading => ({ step: "Open the invoices", at: 1, picture: "", screen: { width: 1000, height: 800 }, things }) as Reading;
const table = { x: 0.04, y: 0.25, width: 0.9, height: 0.5 };
const counted = (inside?: Finding["seen"][number]["inside"]): Finding[] => [
  { id: "c9ig4j2a", words: "Table: 3 things changed inside", seen: [{ moment: "Only overdue invoices show", at: 3, box: table, ...(inside && { inside }) }] },
];

test("a part counted as one change frames the things the hand-back counted inside it, each on whichever side has it", () => {
  const then = reading(text("Harbor & Finch", 240), text("Paid", 280));
  const now = reading(text("79 days late", 260), text("Status", 220));
  const changed = changedAt(counted([{ role: "text", name: "79 days late" }, { role: "text", name: "Harbor & Finch" }]), "Only overdue invoices show", then, now);
  assert.deepEqual(changed.map((box) => box.top), [260, 240]);
});

test("a part known by its name, counted as one change, frames what was counted inside it, not the whole part (the demo's Invoices table)", () => {
  const now = reading(text("79 days late", 260), { ...text("Invoices", 200), role: "table", box: { x: 40, y: 200, width: 900, height: 400 } });
  const named: Finding[] = [{ id: "c9ig4j2a", words: "Invoices table: 3 things changed inside", seen: [{ moment: "Only overdue invoices show", at: 3, element: { role: "table", name: "Invoices" }, inside: [{ role: "text", name: "79 days late" }] }] }];
  assert.deepEqual(changedAt(named, "Only overdue invoices show", reading(), now).map((box) => box.top), [260]);
});

test("kept before the hand-back counted what's inside a part, it frames the part itself", () => {
  const changed = changedAt(counted(), "Only overdue invoices show", reading(text("Paid", 280)), reading(text("Status", 220)));
  assert.deepEqual(changed, [{ left: 40, top: 200, width: 900, height: 400 }]);
});
