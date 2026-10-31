// What someone pointed at on one round, found on another. Each round is its own recording, so an element's node means
// nothing in another; what links them is the page each step left, read on both rounds and paired as the comparison pairs
// it: the same step, by its title, and on it the thing that's the same thing.

import { inStep, type Element, type Flow, type Place } from "@mostlyworks/vantage-review";
import { differences } from "./differences.ts";
import type { Reading, Thing } from "./reading.ts";

// A round's recording of a flow, with what was read at the end of each of its steps.
export type Recorded = { flow: Flow; readings: Reading[] };
export type Shown = { reading: Reading; thing: Thing };

// A place on another round: its moment there, kept in step through the steps both take, on its thing as it's found
// there and called as it's called there. A spot or a part of the screen stays where it was on the screen; a thing that
// isn't there leaves only the moment.
export function placeIn(place: Place, from: Recorded, to: Recorded): Place {
  if (place.at === undefined) return { flow: place.flow };
  // To the hundredth, but never past the flow's end, which isn't rounded: 5.689s long, an answer at its end was at 5.69s.
  const at = (moment: number) => Math.min(to.flow.length, Math.round(inStep(moment, from.flow, to.flow) * 100) / 100);
  const until = place.until === undefined ? undefined : at(place.until);
  const moment = { flow: place.flow, at: at(place.at), ...(until !== undefined && until > at(place.at) && { until }) };
  if (place.box) return { ...moment, box: place.box };
  if (place.point) return { ...moment, point: place.point };
  const there = (element: Element) => {
    const found = foundIn(from.readings, element, place.at!, to.readings);
    return found && elementOf(found.thing, element.name);
  };
  const element = place.element && there(place.element);
  const alike = element && place.alike?.map(there).filter((found) => found !== undefined);
  return element ? { ...moment, element, ...(alike?.length && { alike }) } : moment;
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
