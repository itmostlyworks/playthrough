// The picture's window: the wheel brings it closer about the pointer, from the whole screen to three times closer, and a
// notch feels the same however the browser counts it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { around, wheeled, zoomedAt, type View } from "../src/view.ts";

const room = { width: 1152, height: 720 };
const page = { width: 1280, height: 800 };
const whole = around(room, page, [0, 0], 0);
const underPointer = (view: View, at: [number, number]): [number, number] => [view.x + at[0] / view.k, view.y + at[1] / view.k];

test("the wheel brings the picture closer about the point under the pointer, which stays under it", () => {
  let view = whole;
  const at: [number, number] = [700, 260];
  const point = underPointer(view, at);
  for (let notch = 0; notch < 8; notch++) {
    view = zoomedAt(view, room, page, at, 1.18, 3 * whole.fit);
    const [x, y] = underPointer(view, at);
    assert.ok(Math.abs(x - point[0]) < 1e-6 && Math.abs(y - point[1]) < 1e-6, `notch ${notch + 1} moved the point`);
  }
});

test("it goes no closer than three times the whole screen, and no further out than the whole screen, where it's as it starts", () => {
  let view = whole;
  for (let notch = 0; notch < 20; notch++) view = zoomedAt(view, room, page, [100, 600], 1.18, 3 * whole.fit);
  assert.equal(view.k, 3 * whole.fit);
  for (let notch = 0; notch < 20; notch++) view = zoomedAt(view, room, page, [900, 100], 1 / 1.18, 3 * whole.fit);
  assert.deepEqual(view, whole);
});

test("brought further out near an edge, it never shows past the screen's edges", () => {
  let view = zoomedAt(whole, room, page, [1100, 700], 2.5, 3 * whole.fit);
  view = zoomedAt(view, room, page, [10, 10], 1 / 1.5, 3 * whole.fit);
  assert.ok(view.x >= 0 && view.y >= 0);
  assert.ok(view.x + room.width / view.k <= page.width + 1e-9 && view.y + room.height / view.k <= page.height + 1e-9);
});

test("already closer than the closest, as a phone's picture starts, the wheel in leaves it as close as it is", () => {
  const close = around(room, page, [640, 400], 4);
  assert.equal(zoomedAt(close, room, page, [500, 300], 1.18, 3 * whole.fit).k, 4);
});

test("a mouse's notch is the same, about a sixth closer, whether it comes in lines or in pixels", () => {
  const lines = wheeled(true, false, -3, false);
  const pixels = wheeled(false, false, -100, false);
  assert.ok(Math.abs(lines - pixels) < 1e-9);
  assert.ok(lines > 1.15 && lines < 1.19);
  assert.ok(Math.abs(wheeled(false, false, 100, false) * pixels - 1) < 1e-9, "a notch back undoes a notch in");
});

test("a trackpad's small turns and pinches go in proportion, and nothing leaps further than a notch", () => {
  assert.ok(wheeled(false, false, -4, false) < 1.01);
  assert.ok(wheeled(false, false, -5, true) > 1.04 && wheeled(false, false, -5, true) < 1.06);
  assert.ok(wheeled(false, false, -100, true) <= 1.18 + 1e-9);
  assert.ok(wheeled(true, false, -30, false) <= 1.18 + 1e-9);
});
