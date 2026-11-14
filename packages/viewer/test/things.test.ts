// What a click on the recording notes.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reading, Thing } from "@playthrough/page";
import { pickAt } from "../src/things.ts";

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
