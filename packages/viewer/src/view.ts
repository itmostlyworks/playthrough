// What part of a recorded page its room shows, and how close: a point on the page at (px, py) is drawn in the room at
// ((px - x) * k, (py - y) * k). A window onto the page at 100% around where the recorded pointer is going, or around
// what's held, as Compare's two sides are; or wherever the person has taken it.

import { clamp } from "./clamp.ts";
import type { Replay } from "./replay.ts";

export type View = { k: number; x: number; y: number; fit: number };
export type Size = { width: number; height: number };
export type Point = [number, number];

export function around(room: Size, page: Size, centre: Point, k = 1): View {
  const fit = Math.min(room.width / page.width, room.height / page.height);
  k = Math.max(fit, k);
  // A page narrower than the room sits in the middle of it, one shorter than it at the top, as it does fitted.
  const along = (at: number, room: number, length: number, middle: boolean) =>
    room >= length ? (middle ? -(room - length) / 2 : 0) : clamp(at - room / 2, 0, length - room);
  return { k, x: along(centre[0], room.width / k, page.width, true), y: along(centre[1], room.height / k, page.height, false), fit };
}

export const centreOf = (view: View, room: Size): Point => [view.x + room.width / 2 / view.k, view.y + room.height / 2 / view.k];

// Following the pointer, the view leads it a little, averaged mostly over the second to come, so what it's about to
// click is in view before the click.
function ahead(replay: Replay, at: number, length: number): Point {
  let sum: Point = [0, 0];
  let count = 0;
  for (let u = -0.3; u <= 0.9; u += 0.1) {
    const point = replay.pointerAt(clamp(at + u, 0, length));
    if (!point) continue;
    sum = [sum[0] + point[0], sum[1] + point[1]];
    count++;
  }
  return count ? [sum[0] / count, sum[1] / count] : [replay.shapeAt(at).width / 2, 0];
}

// At actual size, a window onto the page around where the recorded pointer is going.
export function following(replay: Replay | undefined, at: number, length: number, room: Size, page: Size): View {
  return around(room, page, replay ? ahead(replay, at, length) : [page.width / 2, 0], 1);
}

// How large something shows whole: at 100% where it fits, else zoomed out just enough, with room around it.
const wholeAt = (room: Size, thing: Size) => Math.min(1, room.width / (thing.width + 48), room.height / (thing.height + 48));

// A view moved the least it needs for something to show whole in it, with room around it, so what was in view stays
// where both fit; where it doesn't fit as large, zoomed out around it.
export function holding(view: View, room: Size, page: Size, thing: { left: number; top: number; width: number; height: number }): View {
  const k = Math.min(view.k, wholeAt(room, thing));
  if (k < view.k) return around(room, page, [thing.left + thing.width / 2, thing.top + thing.height / 2], k);
  const [width, height] = [room.width / k, room.height / k];
  const x = clamp(view.x, thing.left + thing.width + 24 - width, thing.left - 24);
  const y = clamp(view.y, thing.top + thing.height + 24 - height, thing.top - 24);
  return around(room, page, [x + width / 2, y + height / 2], k);
}

// Closeness `k` brought `by` times closer: never further out than the whole screen fitted, nor closer than `closest`,
// unless it already was.
export const nearer = (k: number, by: number, fit: number, closest: number) => clamp(k * by, fit, Math.max(fit, closest, k));

// Where the view's middle is, at closeness `k`, for the page's point `at` to be `off` from the room's middle: as it's
// brought closer or further, that point stays where it is in the room, so under the pointer.
export const centreFor = (at: Point, off: Point, k: number): Point => [at[0] - off[0] / k, at[1] - off[1] / k];

// How much closer a turn of the wheel brings the picture: a mouse's notch about a sixth, whether it's counted in lines,
// as Firefox does, or in pixels; a trackpad's small turns, and its pinch, which comes as the wheel with Ctrl, in
// proportion, so they glide.
export function wheeled(lines: boolean, pages: boolean, delta: number, pinch: boolean): number {
  const pixels = delta * (lines ? LINE : pages ? 800 : 1);
  return Math.exp(clamp(-pixels * (pinch ? 0.01 : 0.0016), -NOTCH, NOTCH));
}
// A line of a wheel, in pixels: a notch is three.
const LINE = 100 / 3;
// The most one turn does, a notch's worth, so a fast spin or a Ctrl with a mouse never leaps.
const NOTCH = Math.log(1.18);
// How much closer than the whole screen the picture goes.
export const CLOSEST = 3;

// How large the recorded pointer is drawn over a picture of the page drawn k times its size: its true size against the
// app, so it grows with the picture brought closer than actual size, and never smaller than a pointer on a screen.
export const pointerScale = (k: number) => Math.max(1, k);

// How long the wheel's zoom takes to come to rest, in milliseconds. A notch says where it's heading and the picture gets
// there fast, then gently, never past it; notches in quick succession add up to one place it carries on toward, and a
// trackpad's small turns are behind it by a fraction of this, too little to feel.
export const SETTLES = 110;
// How long stepping in takes to bring the picture out to the whole screen, in milliseconds, while the app's on its way.
export const STEPS_OUT = 280;
// Close enough to where it's heading that the rest is less than half a pixel, it's there.
const THERE = 0.0004;
// The ease's pace: a notch comes within THERE of where it's heading in SETTLES.
const PACE = SETTLES / Math.log(NOTCH / THERE);

// Closeness `k` a frame on toward `to`, `since` milliseconds after the last: by a share of the way left, the same share
// each moment, so it's fastest at once and never overshoots; within THERE, there.
export function approach(k: number, to: number, since: number): number {
  const left = Math.log(to / k) * Math.exp(-Math.max(0, since) / PACE);
  return Math.abs(left) < THERE ? to : to * Math.exp(-left);
}

// The page's own curve, --ease-calm, cubic-bezier(0.2, 0.8, 0.2, 1), at `t` of the way through: the view glides on it,
// as the picture narrows and widens around it for Compare, so the two move in step.
export function calm(t: number): number {
  const along = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  let [low, high] = [0, 1];
  for (let i = 0; i < 20; i++) {
    const s = (low + high) / 2;
    if (along(s, 0.2, 0.2) < t) low = s;
    else high = s;
  }
  return along((low + high) / 2, 0.8, 1);
}

// Asked for reduced motion: nothing eases.
const unmoving = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Where a zoom is going: to closeness `to`, about the page's point `at`, which stays `off` from the room's middle, so under
// the pointer; the whole screen again once it's there, if `whole`. Over `length` milliseconds on the calm curve from
// `from`, or else at the wheel's pace.
type Zoom = { to: number; at: Point; off: Point; whole: boolean; last: number; length?: number; from?: number; since?: number };

// One window onto a moment's page, where on it and how close, that every picture of it shows: the moment's own and
// Compare's two sides, the one that leads saying where, so nothing shifts between them that didn't move. Once the
// person has moved it, by the wheel or a drag on the picture, it's theirs: it stays where they put it, following
// nothing, and every picture on it is told. How close it may go is the moment's own picture's to say, so it's the same
// in Compare.
export class Together {
  centre?: Point;
  k?: number;
  closest?: number;
  // How close the moment's own picture is with the whole screen in it, which stepping in goes back to.
  fit?: number;
  moved = false;
  #told = new Set<() => void>();
  #zoom?: Zoom;
  #frame = 0;
  // How a frame of a zoom is drawn by every picture before the browser shows it, so nothing's a frame behind.
  #now: (draw: () => void) => void;
  constructor(now = (draw: () => void) => draw()) {
    this.#now = now;
  }
  // Taken somewhere at once, as a drag takes it: wherever a zoom was going, it's here now.
  move(centre: Point, k: number) {
    this.#still();
    Object.assign(this, { centre, k, moved: true });
    this.#tell();
  }
  // How close a zoom is taking it, so the next notch goes on from there, not from where it's got to.
  get heading(): number | undefined {
    return this.#zoom?.to;
  }
  // Brought to closeness `to`, from `from` where it shows now, about the page's point `at` held `off` from the room's
  // middle: at the wheel's pace, or over `length` milliseconds on the calm curve; at once with reduced motion.
  zoom(from: number, to: number, at: Point, off: Point, whole: boolean, length?: number) {
    const last = performance.now();
    const going = this.#zoom;
    this.#zoom = { to, at, off, whole, last: going?.last ?? last, ...(length && { length, from, since: last }) };
    if (!going) this.k = from;
    if (unmoving()) return void this.#step(Infinity, (draw) => draw());
    if (!this.#frame) this.#frame = requestAnimationFrame(this.#on);
  }
  // To the whole screen, on the calm curve, from wherever it's been brought, as stepping in starts: the app comes in whole.
  wholeAgain(length: number) {
    if (!this.moved || this.k === undefined || this.fit === undefined || this.k <= this.fit * 1.001) return this.letGo();
    this.zoom(this.k, this.fit, this.centre!, [0, 0], true, length);
  }
  // A frame of the zoom, drawn by every picture on the window in this frame.
  #on = (now: number) => {
    this.#frame = 0;
    if (this.#step(now, this.#now)) this.#frame = requestAnimationFrame(this.#on);
  };
  // Where the zoom has got to by `now`, drawn as `draw` draws; whether it's still on its way.
  #step(now: number, draw: (draw: () => void) => void) {
    const zoom = this.#zoom!;
    const k = zoom.length ? Math.exp(Math.log(zoom.from!) + Math.log(zoom.to / zoom.from!) * calm(Math.min(1, (now - zoom.since!) / zoom.length))) : approach(this.k!, zoom.to, now - zoom.last);
    const there = zoom.length ? now - zoom.since! >= zoom.length : k === zoom.to;
    zoom.last = now;
    if (there) this.#zoom = undefined;
    if (there && zoom.whole) return void draw(() => this.letGo());
    Object.assign(this, { centre: centreFor(zoom.at, zoom.off, there ? zoom.to : k), k: there ? zoom.to : k, moved: true });
    draw(() => this.#tell());
    return !there;
  }
  #still() {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#zoom = undefined;
  }
  // What a picture of a page shows of it, as far as the person has said: where they've taken it, else the whole screen.
  shownIn(room: Size, page: Size): View {
    return this.moved ? around(room, page, this.centre!, this.k) : around(room, page, [0, 0], 0);
  }
  // Back to how it starts, the person's view let go of: the wheel all the way out, or Back from the app.
  letGo() {
    if (!this.moved) return;
    this.forget();
    this.#tell();
  }
  #tell() {
    for (const tell of this.#told) tell();
  }
  // Where the next picture on it starts again: where it leads, or where it was going to start.
  forget() {
    this.#still();
    Object.assign(this, { centre: undefined, k: undefined, moved: false });
  }
  follow(tell: () => void) {
    this.#told.add(tell);
    return () => void this.#told.delete(tell);
  }
}
