// What part of a recorded page its room shows at actual size: a point on the page at (px, py) is drawn in the room at
// ((px - x) * k, (py - y) * k), a window onto the page at 100% around where the recorded pointer is going, or around
// what's held, as Compare's two sides are.

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

// One window onto a moment's page, where on it and how close, that every picture of it shows: Compare's two sides, the
// one that leads saying where, so nothing shifts between them that didn't move. Once the person has moved it, by
// dragging the picture, it's theirs: it stays where they put it, following nothing, and every picture on it is told.
export class Together {
  centre?: Point;
  k?: number;
  moved = false;
  #told = new Set<() => void>();
  move(centre: Point, k: number) {
    Object.assign(this, { centre, k, moved: true });
    for (const tell of this.#told) tell();
  }
  // Where the next picture on it starts again: where it leads, or where it was going to start.
  forget() {
    Object.assign(this, { centre: undefined, k: undefined, moved: false });
  }
  follow(tell: () => void) {
    this.#told.add(tell);
    return () => void this.#told.delete(tell);
  }
}
