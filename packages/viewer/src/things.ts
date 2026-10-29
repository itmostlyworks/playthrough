// What a click on the recording notes, and where a note is on every round. The page each step left was read as the
// comparison reads it, so a click notes what a person would call the thing under it, named as Vantage names every
// change, and a note sits on its thing in every round, found the way the agent's answer to it was placed.

import { useEffect, useState } from "react";
import { called, holdsControls, placeIn, type Reading, type Thing } from "@mostlyworks/vantage-page";
import type { Element, Place, Point, Review, Round } from "@mostlyworks/vantage-review";
import { readings } from "./api.ts";
import type { Rect } from "./replay.ts";

// What was read on a round's flow, once it's here.
export type Read = (round: number, flow: string) => Reading[] | undefined;

// Every flow's readings on these rounds, as they arrive, your forks' with them.
export function useReadings(review: Review, rounds: Round[]): Read {
  const [kept, setKept] = useState(() => new Map<string, Reading[]>());
  const wanted = rounds.flatMap((round) => round.flows.map((flow) => ({ round: round.number, flow })));
  const key = wanted.map(({ round, flow }) => `${round}/${flow.name}/${flow.recording}`).join("\n");
  useEffect(() => {
    let current = true;
    for (const { round, flow } of wanted)
      readings(review.id, round, flow.recording).then((read) => current && setKept((kept) => (kept.has(`${round}/${flow.recording}`) ? kept : new Map(kept).set(`${round}/${flow.recording}`, read))));
    return () => void (current = false);
  }, [review.id, key]);
  // A fork is kept again, longer, under a new recording, and read again with it.
  return (round, name) => {
    const flow = wanted.find((wanted) => wanted.round === round && wanted.flow.name === name)?.flow;
    return flow && kept.get(`${round}/${flow.recording}`);
  };
}

// A node is one element for as long as it's on the page, so it's read as it was at the step nearest the moment.
const byNode = new WeakMap<Reading[], Map<number, { at: number; thing: Thing }[]>>();
export function thingAt(read: Reading[], node: number, at: number): Thing | undefined {
  let index = byNode.get(read);
  if (!index) {
    index = new Map();
    for (const reading of read) for (const thing of reading.things) if (thing.node !== undefined) (index.get(thing.node) ?? index.set(thing.node, []).get(thing.node)!).push({ at: reading.at, thing });
    byNode.set(read, index);
  }
  return index.get(node)?.reduce((best, next) => (Math.abs(next.at - at) < Math.abs(best.at - at) ? next : best)).thing;
}

// What holds other things you could name on their own: words of their own in it are noted for themselves.
const HOLDING = /^(dialog|alertdialog|group|radiogroup|table|grid|treegrid|listbox|menu)$/;
const loose = (thing: Thing) => thing.role === "text" || thing.role === "box";

// What a click there would note, from the element under the pointer outwards: the nearest thing with a role a person
// would name, unless words or a panel of their own come first inside something that holds things. A click on a
// button's words notes the button; on words in a dialog, the words; on the space in a panel, the panel. Only what has a
// name can be noted by it. A "button" holding other controls holds things too: Kan's whole list is one you drag, and
// the count by its name is noted for itself.
export function pickAt(outwards: number[], read: Reading[], at: number): Thing | undefined {
  let near: Thing | undefined;
  const holds = (thing: Thing) => HOLDING.test(thing.role) || read.some((reading) => reading.things.includes(thing) && holdsControls(reading, thing));
  for (const node of outwards) {
    const thing = thingAt(read, node, at);
    if (!thing?.name) continue;
    if (!loose(thing)) return near && holds(thing) ? near : thing;
    near ??= thing;
  }
  return near;
}

// What holds a pick, nearest first, as far as most of the page: each bigger than the one before, since a holder the
// size of what it holds is the same thing to the eye. Alt and the wheel widen a pick to these, a notch a step.
export function holdersOf(outwards: number[], read: Reading[], at: number, pick: Thing, boxOf: (node: number) => Rect | undefined, page: { width: number; height: number }): Thing[] {
  const same = (a: Rect, b: Rect) => Math.abs(a.left - b.left) <= 2 && Math.abs(a.top - b.top) <= 2 && Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2;
  const holders: Thing[] = [];
  let last = boxOf(pick.node!);
  for (const node of outwards.slice(outwards.indexOf(pick.node!) + 1)) {
    const thing = thingAt(read, node, at);
    const box = thing?.name ? boxOf(node) : undefined;
    if (!thing || !box || (last && same(box, last))) continue;
    if (box.width * box.height > 0.9 * page.width * page.height) break;
    holders.push(thing);
    last = box;
  }
  return holders;
}

// A note on empty space is named by the nearest thing you could name within 80px of it, never by what holds it: inside
// a panel, a dialog or a menu, only what's in it. With nothing close, it's about the moment.
export function nearTo(read: Reading[], at: number, point: Point): Thing | undefined {
  const reading = read.reduce<Reading | undefined>((best, next) => (!best || Math.abs(next.at - at) < Math.abs(best.at - at) ? next : best), undefined);
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
  return reading.things
    .filter((thing) => thing.name && thing.role !== "box" && !HOLDING.test(thing.role) && (!room || within(thing)) && gap(thing) <= 80)
    .sort((a, b) => gap(a) - gap(b) || area(a) - area(b))[0];
}

// What a note says it's on, as Vantage calls things: “Settle up button”, “$600.00”, the “Who owes whom” area; a spot,
// by what's near it.
export function placeName(on: Place | undefined, read: Read, round: number): string {
  if (!on) return "New note";
  if (on.at === undefined) return "The whole flow";
  const seen = read(round, on.flow);
  if (on.element) return calledBy(on.element, seen, on.at);
  const near = on.point && seen && nearTo(seen, on.at, on.point);
  return near ? `Near ${called(near)}` : "This moment";
}

export const calledBy = (element: Element, seen: Reading[] | undefined, at: number) =>
  called((element.node !== undefined && seen && thingAt(seen, element.node, at)) || { ...element, words: element.name });

// Where a note is on a round: where it was written, on its own thing; where the agent answered it, where Vantage placed
// the answer; on any other round, found from the readings, once they're here. Nothing where that round has no flow of
// its name.
export function placeOn(review: Review, id: string, on: Place, written: number, round: Round, read: Read): Place | undefined {
  if (round.number === written) return on;
  const answered = round.replies.find((reply) => reply.note === id)?.on;
  return answered ?? placeFrom(review, on, written, round, read);
}

// A place on one round, found on another.
const found = new Map<string, Place | undefined>();
export function placeFrom(review: Review, on: Place, from: number, round: Round, read: Read): Place | undefined {
  const then = review.rounds.find((kept) => kept.number === from)?.flows.find((flow) => flow.name === on.flow);
  const now = round.flows.find((flow) => flow.name === on.flow);
  const was = read(from, on.flow);
  const is = read(round.number, on.flow);
  if (!then || !now || !was || !is) return undefined;
  const key = JSON.stringify([review.id, from, round.number, on]);
  if (!found.has(key)) found.set(key, placeIn(on, { flow: then, readings: was }, { flow: now, readings: is }));
  return found.get(key);
}
