// The picture's window: the wheel brings it closer about the pointer, from the whole screen to three times closer, and a
// notch feels the same however the browser counts it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { approach, around, centreFor, FARTHEST, framed, nearer, seenThrough, SETTLES, Together, wheeled, type Box, type View } from "../src/view.ts";

const room = { width: 1152, height: 720 };
const page = { width: 1280, height: 800 };
const whole = around(room, page, [0, 0], 0);
const underPointer = (view: View, at: [number, number]): [number, number] => [view.x + at[0] / view.k, view.y + at[1] / view.k];
// The view at closeness k about the page's point under `at` in `view`, as the wheel takes it there.
const zoomedTo = (view: View, at: [number, number], k: number) => around(room, page, centreFor(underPointer(view, at), [at[0] - room.width / 2, at[1] - room.height / 2], k), k);
const zoomedAt = (view: View, at: [number, number], by: number) => zoomedTo(view, at, nearer(view.k, by, view.fit, 3 * whole.fit));

test("the wheel brings the picture closer about the point under the pointer, which stays under it", () => {
  let view = whole;
  const at: [number, number] = [700, 260];
  const point = underPointer(view, at);
  for (let notch = 0; notch < 8; notch++) {
    view = zoomedAt(view, at, 1.18);
    const [x, y] = underPointer(view, at);
    assert.ok(Math.abs(x - point[0]) < 1e-6 && Math.abs(y - point[1]) < 1e-6, `notch ${notch + 1} moved the point`);
  }
});

test("it goes no closer than three times the whole screen, and no further out than the whole screen, where it's as it starts", () => {
  let view = whole;
  for (let notch = 0; notch < 20; notch++) view = zoomedAt(view, [100, 600], 1.18);
  assert.equal(view.k, 3 * whole.fit);
  for (let notch = 0; notch < 20; notch++) view = zoomedAt(view, [900, 100], 1 / 1.18);
  assert.deepEqual(view, whole);
});

test("brought further out near an edge, it never shows past the screen's edges", () => {
  let view = zoomedAt(whole, [1100, 700], 2.5);
  view = zoomedAt(view, [10, 10], 1 / 1.5);
  assert.ok(view.x >= 0 && view.y >= 0);
  assert.ok(view.x + room.width / view.k <= page.width + 1e-9 && view.y + room.height / view.k <= page.height + 1e-9);
});

test("already closer than the closest, as a phone's picture starts, the wheel in leaves it as close as it is", () => {
  const close = around(room, page, [640, 400], 4);
  assert.equal(zoomedAt(close, [500, 300], 1.18).k, 4);
});

// Frames of the wheel's ease toward `to` from `k`, 16 ms apart, until it's there.
const frames = (k: number, to: number) => {
  const all = [k];
  while (all.at(-1) !== to && all.length < 100) all.push(approach(all.at(-1)!, to, 16));
  return all;
};

test("a notch eases there, fast at first, never past it, and is at rest within its time", () => {
  const all = frames(1, 1.18);
  assert.ok(all.every((k, i) => i === 0 || (k > all[i - 1]! && k <= 1.18)), "every frame closer, none past it");
  assert.ok(all[1]! - all[0]! > all[2]! - all[1]!, "fastest at once");
  assert.ok((all.length - 1) * 16 <= SETTLES + 16, `at rest in ${(all.length - 1) * 16} ms`);
  assert.equal(all.at(-1), 1.18);
});

test("notches in quick succession end where they would one at a time, and the point under the pointer stays under it in every frame", () => {
  const at: [number, number] = [700, 260];
  const point = underPointer(whole, at);
  let [k, to] = [whole.k, whole.k];
  for (let notch = 0; notch < 5; notch++) {
    to = nearer(to, 1.18, whole.fit, 3 * whole.fit);
    for (let frame = 0; frame < 2; frame++) {
      k = approach(k, to, 16);
      const [x, y] = underPointer(zoomedTo(whole, at, k), at);
      assert.ok(Math.abs(x - point[0]) < 1e-6 && Math.abs(y - point[1]) < 1e-6, `notch ${notch + 1}, frame ${frame + 1} moved the point`);
    }
  }
  let one = whole;
  for (let notch = 0; notch < 5; notch++) one = zoomedAt(one, at, 1.18);
  const eased = zoomedTo(whole, at, frames(k, to).at(-1)!);
  assert.equal(eased.k, one.k);
  assert.ok(Math.abs(eased.x - one.x) < 1e-9 && Math.abs(eased.y - one.y) < 1e-9);
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

test("the wheel turned during a drag zooms about what's held, and the drag goes on from there: what's under the pointer stays under it through both", () => {
  // The browser's frames, run by hand.
  let frame: ((now: number) => void) | undefined;
  Object.assign(globalThis, { requestAnimationFrame: (on: (now: number) => void) => ((frame = on), 1), cancelAnimationFrame: () => void (frame = undefined) });
  const together = new Together();
  const shown = () => around(room, page, together.centre!, together.k);
  const off = (at: [number, number]): [number, number] => [at[0] - room.width / 2, at[1] - room.height / 2];
  together.hold([640, 400], [0, 0], 1.5);
  let pointer: [number, number] = [500, 300];
  const held = underPointer(shown(), pointer);
  const kept = () => {
    const [x, y] = underPointer(shown(), pointer);
    assert.ok(Math.abs(x - held[0]) < 1e-6 && Math.abs(y - held[1]) < 1e-6, `the held point is ${x - held[0]}, ${y - held[1]} off the pointer`);
  };
  const drag = (by: [number, number]) => {
    const from = underPointer(shown(), pointer);
    pointer = [pointer[0] + by[0], pointer[1] + by[1]];
    together.hold(from, off(pointer), shown().k);
    kept();
  };
  drag([6, 4]);
  // Two notches in, as the drag goes on.
  const to = 1.5 * 1.18 * 1.18;
  together.zoom(together.k!, to, underPointer(shown(), pointer), off(pointer), false);
  let [now, k] = [performance.now(), together.k!];
  for (let i = 0; i < 12; i++) {
    drag([-5, 3]);
    now += 16;
    const on = frame;
    frame = undefined;
    on?.(now);
    kept();
    assert.ok(together.k! >= k, `frame ${i + 1} went back from ${k} to ${together.k}`);
    k = together.k!;
  }
  assert.equal(together.k, to, "the zoom got where it was heading, the drag meanwhile");
  drag([20, -10]);
});

// Compare's side: about half the picture.
const side = { width: 560, height: 700 };
const topLeft = around(side, page, [0, 0], 1);
const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, width, height });
const shows = (view: View, thing: Box, air = 0) =>
  thing.left - air / view.k >= view.x - 1e-9 && thing.top - air / view.k >= view.y - 1e-9 && thing.left + thing.width + air / view.k <= view.x + side.width / view.k + 1e-9 && thing.top + thing.height + air / view.k <= view.y + side.height / view.k + 1e-9;

test("Compare opens where it always did when what was done and what changed are in view there already", () => {
  assert.deepEqual(framed(side, page, [box(120, 260, 90, 30)], [box(40, 100, 24, 24)]), topLeft);
});

test("Compare opens at actual size, moved only as far as it takes for what was done and what changed to be in view, with room around", () => {
  const [changed, done] = [box(727, 275, 151, 34), box(500, 120, 24, 24)];
  const view = framed(side, page, [changed], [done]);
  assert.equal(view.k, 1);
  assert.equal(view.y, 0, "nothing needed it to move down");
  assert.equal(view.x, 727 + 151 + 24 - side.width, "moved only as far as the change's far edge and its room");
  assert.ok(shows(view, changed, 24) && shows(view, done, 24));
});

test("where they don't fit at actual size, it opens just far enough out that they do", () => {
  const [changed, done] = [box(727, 275, 151, 34), box(300, 120, 24, 24)];
  const view = framed(side, page, [changed], [done]);
  assert.ok(Math.abs(view.k - (side.width - 48) / (878 - 300)) < 1e-9, `at ${view.k}`);
  assert.ok(view.k >= FARTHEST && shows(view, changed, 23.9) && shows(view, done, 23.9));
});

test("never further out than it can be read: there, it opens on what changed, from its top left, and what was done is a drag away", () => {
  const [changed, done] = [box(41, 216, 1198, 227), box(1250, 700, 24, 24)];
  const view = framed(side, page, [changed], [done]);
  assert.equal(view.k, FARTHEST);
  assert.ok(Math.abs(view.x - (41 - 24 / FARTHEST)) < 1e-9, "its left edge, with room");
  assert.ok(shows(view, box(41, 216, 1, 1), 24), "its top left, with room");
  assert.ok(!shows(view, done));
});

// The moment's own picture's window, as it draws it: how close it is whole.
const pictureWindow = () => Object.assign(new Together(), { fit: whole.fit, closest: 3 * whole.fit });
const opensOn = { changed: [box(727, 275, 151, 34)], done: [box(500, 120, 24, 24)] };
const near = (view: View | undefined, to: View) => assert.ok(view && Math.abs(view.k - to.k) < 1e-9 && Math.abs(view.x - to.x) < 1e-6 && Math.abs(view.y - to.y) < 1e-6, `${JSON.stringify(view)} isn't ${JSON.stringify(to)}`);

test("not yet moved, Compare opens framed, both sides on the same part of the page, and off again the moment's own picture is whole", () => {
  const window = pictureWindow();
  assert.equal(seenThrough(window, room, page), undefined, "the whole screen");
  window.compareTurned();
  const framedView = framed(side, page, opensOn.changed, opensOn.done);
  near(seenThrough(window, side, page, opensOn), framedView);
  near(seenThrough(window, side, page, opensOn), framedView);
  window.compareTurned();
  assert.equal(seenThrough(window, room, page), undefined);
});

test("moved first, Compare keeps where the person had it and how close, and off again it's still there", () => {
  const window = pictureWindow();
  window.hold([300, 500], [0, 0], 2 * whole.fit);
  const had = seenThrough(window, room, page)!;
  window.compareTurned();
  near(seenThrough(window, side, page, opensOn), around(side, page, [300, 500], 2 * whole.fit));
  window.compareTurned();
  near(seenThrough(window, room, page), had);
});

test("moved in Compare, the moment's own picture is where the person left it once Compare's off", () => {
  const window = pictureWindow();
  window.compareTurned();
  seenThrough(window, side, page, opensOn);
  window.hold([900, 300], [0, 0], 1);
  window.compareTurned();
  near(seenThrough(window, room, page), around(room, page, [900, 300], 1));
});

test("brought all the way out, it's as if never moved: Compare opens framed again", () => {
  const window = pictureWindow();
  window.hold([300, 500], [0, 0], whole.fit);
  window.compareTurned();
  near(seenThrough(window, side, page, opensOn), framed(side, page, opensOn.changed, opensOn.done));
});

test("with nothing found changed, it opens on what was done", () => {
  const done = box(1000, 600, 24, 24);
  const view = framed(side, page, [], [done]);
  assert.equal(view.k, 1);
  assert.ok(shows(view, done, 24));
});
