// A moment's page does one thing at a time, and whatever stops it playing stops it where the recording has got to.
// What may be pressed is one rule, which the keys and the buttons alike ask.

import assert from "node:assert/strict";
import { test } from "node:test";
import { arrived, can, reduce, type Action, type Facts, type Page } from "../src/mode.ts";

// A moment whose shown part starts at 2s and ends at 10s, at rest on its end.
const moment = () => arrived("Hides the card numbers", 2, 10);
const facts: Facts = { still: false, ready: true, compares: true, elsewhere: false };
// Pressed with the recording where it has got to.
const press = (page: Page, action: Action, now = page.at, along = page.along ?? 0) => reduce(page, { ...action, now, along });
const writing = { note: { id: "n1", words: "" }, spot: { x: 10, y: 10 } };

test("Play from the end plays from where what's shown starts, and Pause rests where the recording has got to", () => {
  const playing = press(moment(), { type: "play" });
  assert.deepEqual([playing.mode, playing.at], [{ is: "playing", until: 10 }, 2]);
  const paused = press(playing, { type: "play" }, 5.5);
  assert.deepEqual([paused.mode, paused.at], [{ is: "resting" }, 5.5]);
  assert.equal(press(paused, { type: "play" }).at, 5.5, "played again, it carries on from there");
});

test("played to its end, it rests there", () => {
  const ended = press(press(moment(), { type: "play" }), { type: "played" }, 9.97);
  assert.deepEqual([ended.mode, ended.at], [{ is: "resting" }, 10]);
});

test("Step in pressed while it plays steps in where the recording has got to", () => {
  const stepping = press(press(moment(), { type: "play" }), { type: "step in", since: 1 }, 4.2);
  assert.deepEqual([stepping.mode, stepping.at], [{ is: "getting there", since: 1 }, 4.2]);
});

test("Note pressed while it plays points where the recording has got to", () => {
  const pointing = press(press(moment(), { type: "play" }), { type: "note" }, 6.1);
  assert.deepEqual([pointing.mode, pointing.at], [{ is: "pointing" }, 6.1]);
});

test("a note opened while it plays opens where the recording has got to", () => {
  const open = press(press(moment(), { type: "play" }), { type: "open", note: "n1" }, 3.3);
  assert.deepEqual([open.mode, open.at], [{ is: "a note open", note: "n1" }, 3.3]);
  assert.deepEqual(press(open, { type: "open", note: "n1" }).mode, { is: "resting" }, "pressed again, it closes");
});

test("Compare, played and paused, rests both sides where they've got to, and so does Compare let go while it plays", () => {
  const playing = press(press(moment(), { type: "compare" }), { type: "play" });
  assert.deepEqual(playing.mode, { is: "comparing", playing: { until: 10 } });
  const paused = press(playing, { type: "play" }, 4, 3.5);
  assert.deepEqual([paused.mode, paused.at, paused.along], [{ is: "comparing" }, 4, 3.5]);
  const off = press(press(paused, { type: "play" }), { type: "compare" }, 7, 6.2);
  assert.deepEqual([off.mode, off.at, off.along], [{ is: "resting" }, 7, 6.2]);
});

test("while a note is open on a frame of its own, Step in and Note rest", () => {
  const open = press(moment(), { type: "open", note: "n1" });
  const may = can(open, { ...facts, elsewhere: true });
  assert.deepEqual([may.stepIn, may.note], [false, false]);
  assert.equal(can(open, facts).stepIn, true, "on the moment as it is now, Step in closes it and steps in");
});

test("while writing a note, nothing but the note answers: not Play, Step in, Note, Compare or another moment", () => {
  const page = press(press(moment(), { type: "note" }), { type: "pointed", writing });
  const may = can(page, facts);
  assert.deepEqual([may.play, may.stepIn, may.back, may.note, may.compare, may.move], [false, false, false, false, false, false]);
});

test("while comparing, Note rests", () => {
  assert.equal(can(press(moment(), { type: "compare" }), facts).note, false);
});

test("Step in pressed again while it's getting there does nothing; Back and Escape still stop it", () => {
  const stepping = press(moment(), { type: "step in", since: 1 });
  const may = can(stepping, facts);
  assert.deepEqual([may.stepIn, may.back], [false, true]);
  assert.deepEqual(press(stepping, { type: "back" }).mode, { is: "resting" });
});

test("stepped in, what drives the recording rests: only Note and Back answer", () => {
  const yours = press(press(moment(), { type: "step in", since: 1 }), { type: "yours" });
  const may = can(yours, facts);
  assert.deepEqual([may.play, may.stepIn, may.compare, may.move, may.note, may.back], [false, false, false, false, true, true]);
});

test("the app not made ready, it rests where it was stepped into; an answer for an earlier step in changes nothing", () => {
  const again = press(press(press(moment(), { type: "step in", since: 1 }), { type: "back" }), { type: "step in", since: 2 });
  assert.deepEqual(press(again, { type: "back", since: 1 }).mode, { is: "getting there", since: 2 });
  assert.deepEqual(press(again, { type: "back", since: 2 }).mode, { is: "resting" });
});

test("a note being written in the app is still being written once you're back", () => {
  const yours = press(press(moment(), { type: "step in", since: 1 }), { type: "yours" });
  const there = press(press(yours, { type: "note" }), { type: "pointed", writing });
  assert.deepEqual(there.mode, { is: "the app yours", since: 1, writing });
  assert.deepEqual(press(there, { type: "back" }).mode, { is: "writing", writing });
});

test("going to another moment, nothing of this one goes with it: it rests on its own end", () => {
  const busy = press(press(moment(), { type: "compare" }), { type: "play" });
  const next = press(busy, { type: "moment", scene: "Shows them again", starts: 1, end: 6 });
  assert.deepEqual(next, { scene: "Shows them again", starts: 1, end: 6, at: 6, mode: { is: "resting" } });
});

test("a still has no Play", () => {
  assert.equal(can(moment(), { ...facts, still: true }).play, false);
});
