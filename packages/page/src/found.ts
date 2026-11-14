// What someone pointed at, found in what was read: the thing a note is on in the reading that shows it, and the thing a
// spot on empty space is named by.

import type { Element, Point } from "@playthrough/review";
import type { Glimpse, Reading, Thing } from "./reading.ts";

export type Shown = { reading: Reading; thing: Thing };

// What holds other things you could name on their own: words of their own in it are noted for themselves.
export const HOLDING = /^(dialog|alertdialog|group|radiogroup|table|grid|treegrid|listbox|menu)$/;

// A note on empty space is named by the nearest thing you could name within 80px of it, never by what holds it: inside
// a panel, a dialog or a menu, only what's in it. With nothing close, it's about the moment.
export const nearTo = (read: Glimpse[], at: number, point: Point): Thing | undefined => besideIn(read, at, point)?.thing;

function besideIn<Read extends Glimpse>(read: Read[], at: number, point: Point): { reading: Read; thing: Thing } | undefined {
  const reading = read.reduce<Read | undefined>((best, next) => (!best || Math.abs(next.at - at) < Math.abs(best.at - at) ? next : best), undefined);
  if (!reading) return undefined;
  const x = point.x * reading.screen.width;
  const y = point.y * reading.screen.height;
  const inside = (thing: Thing) => x >= thing.box.x && x <= thing.box.x + thing.box.width && y >= thing.box.y && y <= thing.box.y + thing.box.height;
  const area = (thing: Thing) => thing.box.width * thing.box.height;
  const room = reading.things.filter((thing) => (thing.role === "box" || (HOLDING.test(thing.role) && !/^(table|grid|treegrid)$/.test(thing.role))) && inside(thing)).sort((a, b) => area(a) - area(b))[0];
  const within = (thing: Thing) => {
    for (let holder = thing.holder; holder !== undefined; holder = reading.things[holder]?.holder) if (reading.things[holder] === room) return true;
    return false;
  };
  const gap = (thing: Thing) => Math.hypot(Math.max(thing.box.x - x, 0, x - thing.box.x - thing.box.width), Math.max(thing.box.y - y, 0, y - thing.box.y - thing.box.height));
  const thing = reading.things
    .filter((thing) => thing.name && thing.role !== "box" && !HOLDING.test(thing.role) && (!room || within(thing)) && gap(thing) <= 80)
    .sort((a, b) => gap(a) - gap(b) || area(a) - area(b))[0];
  return thing && { reading, thing };
}

// The reading nearest its moment with its element in it; for one whose element was never read there (noted by its role
// and name alone), the nearest with something of that role and name.
export function shownAt(readings: Reading[], element: Element, at: number): Shown | undefined {
  const nearest = (test: (thing: Thing) => boolean) => {
    let best: Shown | undefined;
    for (const reading of readings) {
      const thing = reading.things.find(test);
      if (thing && (!best || Math.abs(reading.at - at) < Math.abs(best.reading.at - at))) best = { reading, thing };
    }
    return best;
  };
  return (element.node === undefined ? undefined : nearest((thing) => thing.node === element.node)) ?? nearest((thing) => thing.role === element.role && thing.name === element.name);
}

// As an element of the round it's on. Something with no name of its own there keeps the one it was noted by.
export const elementOf = (thing: Thing, name: string): Element => ({ role: thing.role, name: thing.name || name, ...(thing.node !== undefined && { node: thing.node }) });

// Two names for the same thing, as a person would take them: most of the shorter one's words in the other's, so a card
// that gained a badge, or a message that gained a sign-off, is still that card or that message.
export function sameWords(one: string, other: string): boolean {
  const [few, many] = [wordsOf(one), wordsOf(other)].sort((a, b) => a.length - b.length);
  return !few!.length || few!.filter((word) => many!.includes(word)).length * 2 >= few!.length;
}
const wordsOf = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
