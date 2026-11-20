// Whose hands the pointer is is said on it and nowhere else: a small tag on the recording's pointer, at rest and for the
// first second of playing, standing where the picture's edges never cut it off.

import assert from "node:assert/strict";
import { test } from "node:test";
import { agentTo, besideTip, tagged } from "../src/tag.ts";

const atRest = { still: false, playing: false, playedASecond: false, comparing: false, noting: false, atLastStop: false };

test("the agent is yours to the person, and the agent to a guest on a change shared with them", () => {
  assert.equal(agentTo(false), "Your agent");
  assert.equal(agentTo(true), "The agent");
});

test("the recording's pointer wears it at rest and for the first second of playing, and not once it's played longer", () => {
  assert.equal(tagged(atRest), true);
  assert.equal(tagged({ ...atRest, playing: true }), true);
  assert.equal(tagged({ ...atRest, playing: true, playedASecond: true }), false);
  assert.equal(tagged({ ...atRest, playedASecond: true }), true, "stopped, it's back");
});

test("not on a still, in Compare, while noting, or at the last stop", () => {
  for (const one of ["still", "comparing", "noting", "atLastStop"] as const) assert.equal(tagged({ ...atRest, [one]: true }), false, one);
});

test("it stands below and right of the tip, and turns left or above where the picture's right or bottom edge would cut it off", () => {
  const room = { width: 800, height: 500 };
  const tag = { width: 62, height: 17 };
  assert.deepEqual(besideTip({ x: 400, y: 250 }, tag, room, 1), { left: false, above: false });
  assert.deepEqual(besideTip({ x: 760, y: 250 }, tag, room, 1), { left: true, above: false });
  assert.deepEqual(besideTip({ x: 400, y: 490 }, tag, room, 1), { left: false, above: true });
  assert.deepEqual(besideTip({ x: 790, y: 495 }, tag, room, 1), { left: true, above: true });
});

test("with the pointer grown on a picture brought closer, it stands as far from the tip as the pointer has grown", () => {
  const room = { width: 800, height: 500 };
  const tag = { width: 62, height: 17 };
  assert.deepEqual(besideTip({ x: 700, y: 250 }, tag, room, 1), { left: false, above: false });
  assert.deepEqual(besideTip({ x: 700, y: 250 }, tag, room, 3), { left: true, above: false });
});
