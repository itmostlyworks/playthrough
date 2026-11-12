// What part of a recorded page a frame shows, and how large: a point on the page at (px, py) is drawn in the frame at
// ((px - x) * k, (py - y) * k). Fitted, the whole page shows, as large as fits and centred. At actual size the frame is a
// window onto the page at 100%, around a centre: where you moved it, else where the recorded pointer is going.

import { clamp, ease } from "./moments.ts";
import type { Replay } from "./replay.ts";

export type View = { k: number; x: number; y: number; fit: number };
export type Size = { width: number; height: number };
export type Point = [number, number];

// Where you've moved the view to stays, at its size, playing too, until you choose another size or go to another scene.
export type Held = { centre: Point; k: number; scene: string };

export function fitted(frame: Size, page: Size): View {
  const fit = Math.min(frame.width / page.width, frame.height / page.height);
  return { k: fit, x: -(frame.width - page.width * fit) / 2 / fit, y: 0, fit };
}

export function around(frame: Size, page: Size, centre: Point, k = 1): View {
  const fit = Math.min(frame.width / page.width, frame.height / page.height);
  k = Math.max(fit, k);
  // A page narrower than the frame sits in the middle of it, one shorter than it at the top, as it does fitted.
  const along = (at: number, room: number, length: number, middle: boolean) =>
    room >= length ? (middle ? -(room - length) / 2 : 0) : clamp(at - room / 2, 0, length - room);
  return { k, x: along(centre[0], frame.width / k, page.width, true), y: along(centre[1], frame.height / k, page.height, false), fit };
}

export const centreOf = (view: View, frame: Size): Point => [view.x + frame.width / 2 / view.k, view.y + frame.height / 2 / view.k];

// Following the pointer, the view leads it a little, averaged mostly over the second to come, so what it's about to
// click is in view before the click.
export function ahead(replay: Replay, at: number, length: number): Point {
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

// At actual size, a window onto the page around where it's held, else where the recorded pointer is going.
export function following(replay: Replay | undefined, at: number, length: number, frame: Size, page: Size, held?: { centre: Point; k: number }): View {
  return around(frame, page, held?.centre ?? (replay ? ahead(replay, at, length) : [page.width / 2, 0]), held?.k ?? 1);
}

// How large something shows whole: at 100% where it fits, else zoomed out just enough, with room around it.
export const wholeAt = (frame: Size, thing: Size) => Math.min(1, frame.width / (thing.width + 48), frame.height / (thing.height + 48));

// A view moved the least it needs for something to show whole in it, with room around it, so what was in view stays
// where both fit; where it doesn't fit as large, zoomed out around it.
export function holding(view: View, frame: Size, page: Size, thing: { left: number; top: number; width: number; height: number }): View {
  const k = Math.min(view.k, wholeAt(frame, thing));
  if (k < view.k) return around(frame, page, [thing.left + thing.width / 2, thing.top + thing.height / 2], k);
  const [width, height] = [frame.width / k, frame.height / k];
  const x = clamp(view.x, thing.left + thing.width + 24 - width, thing.left - 24);
  const y = clamp(view.y, thing.top + thing.height + 24 - height, thing.top - 24);
  return around(frame, page, [x + width / 2, y + height / 2], k);
}

// Two windows at actual size onto the same part of the page, side by side: the one that leads says where, the other
// shows the same, so nothing shifts between them that didn't move.
export type Together = { centre?: Point; k?: number };

// A held view moved by the pointer or the wheel, kept so the page never leaves the frame.
export function moved(centre: Point, frame: Size, page: Size, k: number): Point {
  const width = frame.width / k;
  const height = frame.height / k;
  return [clamp(centre[0], width / 2, Math.max(width / 2, page.width - width / 2)), clamp(centre[1], height / 2, Math.max(height / 2, page.height - height / 2))];
}

// Changing the size glides there rather than cutting: the centre moves and the scale changes by ratio, so zooming in
// and out feel alike, together.
export const GLIDE = 320;

export function between(from: View, to: View, u: number, frame: Size): View {
  const e = ease(clamp(u));
  const k = from.k * Math.pow(to.k / from.k, e);
  const [ax, ay] = centreOf(from, frame);
  const [bx, by] = centreOf(to, frame);
  const centre = [ax + (bx - ax) * e, ay + (by - ay) * e];
  return { k, x: centre[0]! - frame.width / 2 / k, y: centre[1]! - frame.height / 2 / k, fit: to.fit };
}
