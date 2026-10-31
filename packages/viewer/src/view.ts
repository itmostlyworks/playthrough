// What part of a recorded page a frame shows, and how large: a point on the page at (px, py) is drawn in the frame at
// ((px - x) * k, (py - y) * k). Fitted, the whole page shows, as large as fits and centred. At actual size the frame is a
// window onto the page at 100%, around a centre: where you moved it, else where the recorded pointer is going.

import { clamp, ease } from "./moments.ts";
import type { Replay } from "./replay.ts";

export type View = { k: number; x: number; y: number; fit: number };
export type Size = { width: number; height: number };
export type Point = [number, number];

// Where you've moved the view to stays, at its size, playing too, until you choose another size or go to another flow.
export type Held = { centre: Point; k: number; flow: string };

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
