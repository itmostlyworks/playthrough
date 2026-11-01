// What someone pointed at on one round, found on another. Each round is its own recording, so an element's node means
// nothing in another; what links them is the page each step left, read on both rounds and paired as the comparison pairs
// it: the same step, by its title, and on it the thing that's the same thing.

import { inStep, type Element, type Flow, type Place, type Point } from "@playthrough/review";
import { differences } from "./differences.ts";
import type { Glimpse, Reading, Thing } from "./reading.ts";

// A round's recording of a flow, with what was read at the end of each of its steps.
export type Recorded = { flow: Flow; readings: Reading[] };
export type Shown = { reading: Reading; thing: Thing };

// A place on another round: its moment there, kept in step through the steps both take, on its thing as it's found
// there and called as it's called there. A spot keeps beside the thing it's named by, wherever that thing is there; a
// part of the screen, or a spot with nothing named near it, stays where it was on the screen; a thing that isn't there
// leaves only the moment.
export function placeIn(place: Place, from: Recorded, to: Recorded): Place {
  if (place.at === undefined) return { flow: place.flow };
  // To the hundredth, but never past the flow's end, which isn't rounded: 5.689s long, an answer at its end was at 5.69s.
  const at = (moment: number) => Math.min(to.flow.length, Math.round(inStep(moment, from.flow, to.flow) * 100) / 100);
  const until = place.until === undefined ? undefined : at(place.until);
  const moment = { flow: place.flow, at: at(place.at), ...(until !== undefined && until > at(place.at) && { until }) };
  if (place.box) return { ...moment, box: place.box };
  if (place.point) return { ...moment, point: besideOn(place.point, place.at, from, to) ?? place.point };
  const there = (element: Element) => {
    const found = foundIn(from.readings, element, place.at!, to.readings);
    return found && elementOf(found.thing, element.name);
  };
  const element = place.element && there(place.element);
  const alike = element && place.alike?.map(there).filter((found) => found !== undefined);
  return element ? { ...moment, element, ...(alike?.length && { alike }) } : moment;
}

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

// A spot on another round, as far from the thing it's named by as it was: a note beside a card that moved down the list
// moves down with it. Nothing where that thing isn't there.
function besideOn(point: Point, at: number, from: Recorded, to: Recorded): Point | undefined {
  const beside = besideIn(from.readings, at, point);
  const found = beside && sameIn(beside, from.readings, to.readings);
  if (!beside || !found) return undefined;
  const share = (pixels: number, of: number) => Math.min(1, Math.max(0, pixels / of));
  return {
    x: share(point.x * beside.reading.screen.width + found.thing.box.x - beside.thing.box.x, found.reading.screen.width),
    y: share(point.y * beside.reading.screen.height + found.thing.box.y - beside.thing.box.y, found.reading.screen.height),
  };
}

// The same thing on another round: where it shows nearest its moment, then the same step there.
function foundIn(from: Reading[], element: Element, at: number, to: Reading[]): Shown | undefined {
  const shown = shownAt(from, element, at);
  return shown && sameIn(shown, from, to);
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

// Its step on the other round is the step of the same title, the same one of them where a title comes again; on it, the
// thing paired with it as the comparison pairs them. Nothing where that round didn't take the step, or the thing is gone.
function sameIn({ reading, thing }: Shown, from: Reading[], to: Reading[]): Shown | undefined {
  const nth = from.filter((kept) => kept.step === reading.step).indexOf(reading);
  const there = to.filter((kept) => kept.step === reading.step)[nth];
  if (!there) return undefined;
  for (const [now, then] of differences(reading, there).was) if (then === thing) return { reading: there, thing: now };
  return undefined;
}

// As an element of the round it's on. Something with no name of its own there keeps the one it was noted by.
export const elementOf = (thing: Thing, name: string): Element => ({ role: thing.role, name: thing.name || name, ...(thing.node !== undefined && { node: thing.node }) });
