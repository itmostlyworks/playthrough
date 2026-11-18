// The last stop lays your notes out from the frame's width alone: two across where two wide cards fit, else one.

import assert from "node:assert/strict";
import { test } from "node:test";
import { notesAcross } from "../src/sheet.ts";

test("two notes across once the frame holds two cards at least 420 wide", () => {
  assert.deepEqual(notesAcross(856), { across: 2, card: 420, measure: 856 });
  assert.equal(notesAcross(855).across, 1);
});

test("two across, the cards grow with the frame up to 480 each, and no further", () => {
  assert.equal(notesAcross(900).card, 442);
  assert.deepEqual(notesAcross(2400), { across: 2, card: 480, measure: 976 });
});

test("one across, the card is up to 560 wide, or as wide as the frame has room for", () => {
  assert.deepEqual(notesAcross(855), { across: 1, card: 560, measure: 560 });
  assert.deepEqual(notesAcross(358), { across: 1, card: 358, measure: 358 });
});

test("the measure, and with it the one left edge, never shrinks as the frame grows", () => {
  let was = 0;
  for (let room = 0; room <= 2000; room++) {
    const { measure } = notesAcross(room);
    assert.ok(measure >= was, `at ${room} the measure went from ${was} to ${measure}`);
    was = measure;
  }
});
