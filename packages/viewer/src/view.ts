// What part of a recorded page its room shows, and how close: a point on the page at (px, py) is drawn in the room at
// ((px - x) * k, (py - y) * k). Wherever the person has taken it; else the whole screen, or, as Compare's two sides
// open, a window framed on what was done and what changed.

import { clamp } from "./clamp.ts";

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

// A part of the page, in its pixels.
export type Box = { left: number; top: number; width: number; height: number };

// What Compare's two sides open on: what was done in the moment and what changed, together, with room around them. At
// actual size, the page's top left moved only as far as that takes, so where they're in view already nothing moves; where
// they don't fit, brought further out just enough, never further than FARTHEST; and where even then they don't, what
// changed, from its top left, with what was done a drag away.
export function framed(room: Size, page: Size, changed: Box[], done: Box[]): View {
  const largest = (thing: Box) => Math.min(1, (room.width - 2 * AIR) / thing.width, (room.height - 2 * AIR) / thing.height);
  const all = spanOf([...changed, ...done]);
  if (!all) return around(room, page, [0, 0], 1);
  if (largest(all) >= FARTHEST) return into(room, page, all, largest(all));
  const first = spanOf(changed) ?? all;
  const k = Math.max(FARTHEST, largest(first));
  if (k > FARTHEST) return into(room, page, first, k);
  return around(room, page, [first.left - AIR / k + room.width / k / 2, first.top - AIR / k + room.height / k / 2], k);
}

// The view at closeness `k` from the page's top left, moved the least it takes for `thing` to be in it with room around.
function into(room: Size, page: Size, thing: Box, k: number): View {
  const start = around(room, page, [0, 0], k);
  const [width, height, air] = [room.width / start.k, room.height / start.k, AIR / start.k];
  const x = clamp(start.x, thing.left + thing.width + air - width, thing.left - air);
  const y = clamp(start.y, thing.top + thing.height + air - height, thing.top - air);
  return around(room, page, [x + width / 2, y + height / 2], start.k);
}

// The least box that holds them all.
function spanOf(boxes: Box[]): Box | undefined {
  if (!boxes.length) return undefined;
  const [left, top] = [Math.min(...boxes.map((box) => box.left)), Math.min(...boxes.map((box) => box.top))];
  const [right, bottom] = [Math.max(...boxes.map((box) => box.left + box.width)), Math.max(...boxes.map((box) => box.top + box.height))];
  return { left, top, width: right - left, height: bottom - top };
}

// The room kept around what a view is framed on, in the picture's pixels.
const AIR = 24;
// The furthest out Compare opens: further, an app's words are too small to read.
export const FARTHEST = 0.6;

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
// How long taking over takes to bring the picture out to the whole screen, in milliseconds, while the app's on its way,
// and the curve it moves on: setting off gently and landing softly, slow enough to follow the recording growing and the
// sides going. Back moves the same way.
export const STEPS_OUT = 600;
const STEPS_OUT_ON = [0.4, 0, 0.2, 1] as const;
// The move as CSS has it, for everything that goes or grows with it, so it's all one move.
export const STEPPING_OUT = { transitionDuration: `${STEPS_OUT}ms`, transitionTimingFunction: `cubic-bezier(${STEPS_OUT_ON.join(", ")})` };
// Coming back, what the recording grew over comes back in the move's last 40%, once the recording's edge has passed
// it, so it never shows across the recording.
export const STEPPING_BACK = { ...STEPPING_OUT, transitionDuration: `${STEPS_OUT * 0.4}ms`, transitionDelay: `${STEPS_OUT * 0.6}ms` };
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

// A curve as CSS's cubic-bezier draws it, how far along it is at `t` of the way through.
const curve =
  ([x1, y1, x2, y2]: readonly [number, number, number, number]) =>
  (t: number): number => {
    const along = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
    let [low, high] = [0, 1];
    for (let i = 0; i < 20; i++) {
      const s = (low + high) / 2;
      if (along(s, x1, x2) < t) low = s;
      else high = s;
    }
    return along((low + high) / 2, y1, y2);
  };
// The page's own curve, --ease-calm: the view glides on it, as the picture narrows and widens around it for Compare, so
// the two move in step.
export const calm = curve([0.2, 0.8, 0.2, 1]);
// Taking over's, so the picture goes out to the whole screen in step with the recording growing.
const steppingOut = curve(STEPS_OUT_ON);

// Asked for reduced motion: nothing eases.
const unmoving = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Where a zoom is going: to closeness `to`, about the page's point `at`, which stays `off` from the room's middle, so under
// the pointer; the whole screen again once it's there, if `whole`. Over `length` milliseconds on taking over's curve from
// `from`, or else at the wheel's pace.
type Zoom = { to: number; at: Point; off: Point; whole: boolean; last: number; length?: number; from?: number; since?: number };

// One window onto a moment's page, where on it and how close, that every picture on it shows: the moment's own and
// Compare's two sides, so nothing shifts between them that didn't move. Once the person has moved it, by the wheel or a
// drag on any of them, it's theirs: it stays where they put it, following nothing, Compare on or off, and every picture
// on it is told. How close it may go is the moment's own picture's to say, so it's the same in Compare.
export class Together {
  centre?: Point;
  k?: number;
  closest?: number;
  // How close the moment's own picture is with the whole screen in it, which taking over goes back to.
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
  // The page's point `at` held `off` from the room's middle, at once, as a drag holds what it took under the pointer,
  // shown at closeness `k`. A zoom on its way carries on about that point instead, from where it's got to, so the wheel
  // during a drag, or a drag during the wheel's ease, keeps what's under the pointer under it through both.
  hold(at: Point, off: Point, k: number) {
    if (this.#zoom) Object.assign(this.#zoom, { at, off });
    else this.k = k;
    Object.assign(this, { centre: centreFor(at, off, this.k!), moved: true });
    this.#tell();
  }
  // How close a zoom is taking it, so the next notch goes on from there, not from where it's got to.
  get heading(): number | undefined {
    return this.#zoom?.to;
  }
  // Brought to closeness `to`, from `from` where it shows now, about the page's point `at` held `off` from the room's
  // middle: at the wheel's pace, or over `length` milliseconds on taking over's curve; at once with reduced motion.
  zoom(from: number, to: number, at: Point, off: Point, whole: boolean, length?: number) {
    const last = performance.now();
    const going = this.#zoom;
    this.#zoom = { to, at, off, whole, last: going?.last ?? last, ...(length && { length, from, since: last }) };
    if (!going) this.k = from;
    if (unmoving()) return void this.#step(Infinity, (draw) => draw());
    if (!this.#frame) this.#frame = requestAnimationFrame(this.#on);
  }
  // To the whole screen, on taking over's curve, from wherever it's been brought, as taking over starts: the app comes in whole.
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
    const k = zoom.length ? Math.exp(Math.log(zoom.from!) + Math.log(zoom.to / zoom.from!) * steppingOut(Math.min(1, (now - zoom.since!) / zoom.length))) : approach(this.k!, zoom.to, now - zoom.last);
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
  // Compare on or off: where the person has it stays; not moved, or brought all the way out, it starts again, so Compare
  // opens framed and the moment's own picture is the whole screen.
  compareTurned() {
    if (!this.moved || (this.fit !== undefined && this.k! <= this.fit * 1.001)) this.forget();
  }
  // Where the next picture on it starts again: where Compare's first side drawn says, or the whole screen.
  forget() {
    this.#still();
    Object.assign(this, { centre: undefined, k: undefined, moved: false });
  }
  follow(tell: () => void) {
    this.#told.add(tell);
    return () => void this.#told.delete(tell);
  }
}

// What a picture shows through its window: where the person has taken it; else, as one of Compare's sides, framed on what
// was done and what changed, the first side drawn saying where for both; else nothing of its own, the whole screen.
export function seenThrough(window: Together, room: Size, page: Size, framedOn?: { changed: Box[]; done: Box[] }): View | undefined {
  if (!window.moved && framedOn && !window.centre) {
    const view = framed(room, page, framedOn.changed, framedOn.done);
    Object.assign(window, { centre: centreOf(view, room), k: view.k });
  }
  return window.moved || framedOn ? around(room, page, window.centre!, window.k) : undefined;
}
