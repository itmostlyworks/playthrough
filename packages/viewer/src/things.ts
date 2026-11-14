// What a click on the recording notes. The page each step left was read as the comparison reads it, so a click notes
// what a person would call the thing under it, named as Playthrough names every change.

import { HOLDING, holdsControls, type Glimpse, type Thing } from "@playthrough/page";

// A node is one element for as long as it's on the page, so it's read as it was at the step nearest the moment.
const byNode = new WeakMap<Glimpse[], Map<number, { at: number; thing: Thing }[]>>();
function thingAt(read: Glimpse[], node: number, at: number): Thing | undefined {
  let index = byNode.get(read);
  if (!index) {
    index = new Map();
    for (const reading of read) for (const thing of reading.things) if (thing.node !== undefined) (index.get(thing.node) ?? index.set(thing.node, []).get(thing.node)!).push({ at: reading.at, thing });
    byNode.set(read, index);
  }
  return index.get(node)?.reduce((best, next) => (Math.abs(next.at - at) < Math.abs(best.at - at) ? next : best)).thing;
}

const loose = (thing: Thing) => thing.role === "text" || thing.role === "box";

// What a click there would note, from the element under the pointer outwards: the nearest thing with a role a person
// would name, unless words or a panel of their own come first inside something that holds things. A click on a
// button's words notes the button; on words in a dialog, the words; on the space in a panel, the panel. Only what has a
// name can be noted by it. A "button" holding other controls holds things too: Kan's whole list is one you drag, and
// the count by its name is noted for itself.
export function pickAt(outwards: number[], read: Glimpse[], at: number): Thing | undefined {
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
