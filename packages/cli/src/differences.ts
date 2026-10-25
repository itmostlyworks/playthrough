// Two readings of the same moment in two rounds, thing by thing: which thing now is which thing then, and what happened to
// each one that changed. A thing is the same one when it's what it was, called what it was, saying what it said; one that's
// gone where something like it is new may be the same one, reworded or renamed.

import type { Reading, Thing } from "./read.ts";

export type Difference =
  | { what: "new"; now: Thing }
  | { what: "gone"; then: Thing }
  | { what: "reworded" | "looks different" | "resized" | "moved" | "became"; then: Thing; now: Thing };

// Within this many pixels, two places or sizes are the same: a column 37px narrower moves some things 37px and others 38px.
export const NEAR = 4;
export const near = (a: number, b: number, by = NEAR) => Math.abs(a - b) <= by;

// What holds what changes inside it: a dialog, a message, a choice, a table, a list, a menu, or a panel.
export const HOLDS = /^(dialog|alertdialog|status|alert|group|radiogroup|table|grid|treegrid|listbox|menu|box)$/;

export const holderOf = (reading: Reading, thing: Thing) => (thing.holder === undefined ? undefined : reading.things[thing.holder]);
export const parentOf = (reading: Reading, thing: Thing) => (thing.parent === undefined ? undefined : reading.things[thing.parent]);

// The words with the data in them left out, and the small words that only linked it: “Total for Q3 2026 $27,785.00” is
// “Total”, and “12 invoices from Q3 2026” is “invoices”.
const LINKING = /^(for|from|of|in|on|at|to|by|and|with|·|–|—|-|:|,)$/i;
export function bare(words: string): string {
  const kept = words
    .replace(/[“”"]/g, "")
    .split(/\s+/)
    .filter((word) => word && !/\d/.test(word) && !/^[$€£¥%#+−-]+$/.test(word));
  while (kept.length && LINKING.test(kept.at(-1)!)) kept.pop();
  while (kept.length && LINKING.test(kept[0]!)) kept.shift();
  return kept.join(" ");
}

// What a thing is, whatever it shows: what it is, its name with the data in it left out, and what holds it, said the same
// way. The Export dialog saying “12 invoices from Q3 2026” in one flow and “25 invoices from 2026” in another is one dialog.
export function identity(reading: Reading, thing: Thing, up = 1): string {
  const holder = up > 0 ? holderOf(reading, thing) : undefined;
  return `${thing.role}:${bare(thing.name)}${holder ? ` in ${identity(reading, holder, up - 1)}` : ""}`;
}

const exactly = (thing: Thing) => `${thing.role}:${thing.name}|${thing.words}`;
const sameLook = (a: Thing, b: Thing) => JSON.stringify(a.look) === JSON.stringify(b.look);
const distance = (a: Thing, b: Thing) => Math.hypot(a.page.x - b.page.x, a.page.y - b.page.y);
const samePlace = (a: Thing, b: Thing) => near(a.page.x, b.page.x, 8) && near(a.page.y, b.page.y, 8);
// How much of the smaller of two things the other covers, on the page.
export function overlap(a: Thing, b: Thing): number {
  const across = Math.min(a.page.x + a.box.width, b.page.x + b.box.width) - Math.max(a.page.x, b.page.x);
  const down = Math.min(a.page.y + a.box.height, b.page.y + b.box.height) - Math.max(a.page.y, b.page.y);
  return (Math.max(0, across) * Math.max(0, down)) / Math.max(1, Math.min(a.box.width * a.box.height, b.box.width * b.box.height));
}

export function differences(then: Reading, now: Reading): { differences: Difference[]; was: Map<Thing, Thing> } {
  const was = new Map<Thing, Thing>(); // each thing now, and the one it was
  const found: Difference[] = [];
  const holderKey = (reading: Reading, thing: Thing) => {
    const holder = holderOf(reading, thing);
    return holder ? exactly(holder) : "";
  };
  const pair = (a: Thing, b: Thing) => {
    was.set(b, a);
    const difference = compared(a, b);
    if (difference) found.push(difference);
  };

  // The same thing, called the same and saying the same. As many alike in both (every “Overdue” in a list) pair in order,
  // so rows pushed down further than a row's height still pair with themselves. Otherwise each pairs with the nearest
  // that looks the same in the same table or panel, so a new line repeating a table's amount doesn't take the table's own.
  const alike = new Map<string, { then: Thing[]; now: Thing[] }>();
  const alikeTo = (key: string) => alike.get(key) ?? alike.set(key, { then: [], now: [] }).get(key)!;
  for (const thing of then.things) alikeTo(exactly(thing)).then.push(thing);
  for (const thing of now.things) alikeTo(exactly(thing)).now.push(thing);
  const gone: Thing[] = [];
  const added: Thing[] = [];
  for (const { then: as, now: bs } of alike.values()) {
    if (as.length === bs.length) {
      as.forEach((a, i) => pair(a, bs[i]!));
      continue;
    }
    const costs = as.flatMap((a) => bs.map((b) => ({ a, b, cost: distance(a, b) + (sameLook(a, b) ? 0 : 200) + (holderKey(then, a) === holderKey(now, b) ? 0 : 400) })));
    const paired = new Set<Thing>();
    for (const { a, b } of costs.sort((x, y) => x.cost - y.cost)) {
      if (paired.has(a) || paired.has(b)) continue;
      paired.add(a).add(b);
      pair(a, b);
    }
    gone.push(...as.filter((a) => !paired.has(a)));
    added.push(...bs.filter((b) => !paired.has(b)));
  }
  gone.sort((a, b) => then.things.indexOf(a) - then.things.indexOf(b));
  added.sort((a, b) => now.things.indexOf(a) - now.things.indexOf(b));

  // As many words gone as new in the same table, dialog or panel are those words reworded, in order, wherever they went.
  const wordsIn = (reading: Reading, things: Thing[]) => {
    const count = new Map<string, number>();
    for (const thing of things) if (thing.role === "text" && holderOf(reading, thing)) count.set(holderKey(reading, thing), (count.get(holderKey(reading, thing)) ?? 0) + 1);
    return count;
  };
  const goneWords = wordsIn(then, gone);
  const newWords = wordsIn(now, added);

  // What's gone where something like it is new may be the same thing.
  const take = (test: (a: Thing) => boolean) => {
    const i = gone.findIndex(test);
    return i < 0 ? undefined : gone.splice(i, 1)[0];
  };
  for (const b of added) {
    // Words gone where a control is new, called by them, are that control now: “Status” is a button now, not a heading
    // gone and a button new.
    let a = /^(button|link|tab|checkbox|switch)$/.test(b.role) ? take((a) => a.role === "text" && a.words === b.name && overlap(a, b) > 0.5) : undefined;
    if (a) {
      was.set(b, a);
      found.push({ what: "became", then: a, now: b });
      continue;
    }
    // A control that only gained or lost words in something inside it is the same control: those words are what changed,
    // read on their own (Actual's account links took a line under their names).
    a = b.role !== "text" ? take((a) => a.role === b.role && (gained(now, b, a.name) || gained(then, a, b.name))) : undefined;
    if (a) {
      was.set(b, a);
      if (!sameLook(a, b)) found.push({ what: "looks different", then: a, now: b });
      continue;
    }
    a =
      b.role !== "text"
        ? // The same kind of thing with the same name, or in the same place; a table, dialog or panel mostly where the old
          // one was; or a panel or menu holding the same words, wherever it went (a menu that opens higher, its items in
          // another order).
          take((a) => a.role === b.role && (a.name === b.name || samePlace(a, b) || (HOLDS.test(b.role) && overlap(a, b) > 0.5) || (/^(box|menu)$/.test(b.role) && !!a.wordsInside && bag(a) === bag(b))))
        : // Words in the same place; or one of as many words gone as new in the same thing; or the same words with other
          // data in them, in the same thing (“Total $56,145.00” is now “Total for 2026 $56,145.00”).
          (take((a) => a.role === "text" && samePlace(a, b)) ??
          (holderOf(now, b) && goneWords.get(holderKey(now, b)) === newWords.get(holderKey(now, b))
            ? take((a) => a.role === "text" && holderKey(then, a) === holderKey(now, b))
            : undefined) ??
          take((a) => a.role === "text" && holderKey(then, a) === holderKey(now, b) && !!bare(b.words) && bare(a.words) === bare(b.words)));
    if (!a) {
      found.push({ what: "new", now: b });
      continue;
    }
    // A panel is the same panel whatever its first words say: what changed is what's inside it.
    if (b.role === "box") pair(a, b);
    else {
      was.set(b, a);
      found.push({ what: "reworded", then: a, now: b });
    }
  }
  for (const a of gone) found.push({ what: "gone", then: a });

  // What's inside something new is part of it, and what's inside something gone went with it. What's marked inside
  // reworded words, the amount in “Total for 2026 $56,145.00”, is part of their rewording.
  const fresh = new Set(found.flatMap((difference) => (difference.what === "new" ? [difference.now] : [])));
  const lost = new Set(found.flatMap((difference) => (difference.what === "gone" ? [difference.then] : [])));
  const rewordedNow = new Set(found.flatMap((difference) => (difference.what === "reworded" && difference.now.role === "text" ? [difference.now] : [])));
  const rewordedThen = new Set(found.flatMap((difference) => (difference.what === "reworded" && difference.then.role === "text" ? [difference.then] : [])));
  const within = (reading: Reading, thing: Thing, set: Set<Thing>) => [holderOf(reading, thing), parentOf(reading, thing)].some((around) => around && set.has(around));
  const told = found.filter((difference) => {
    if (difference.what === "new" && within(now, difference.now, fresh)) return false;
    if (difference.what === "gone" && within(then, difference.then, lost)) return false;
    if (difference.what === "looks different") return true;
    const [reading, thing, reworded] = difference.what === "gone" ? [then, difference.then, rewordedThen] : [now, difference.now, rewordedNow];
    const parent = parentOf(reading, thing);
    return !(thing.role === "text" && parent && reworded.has(parent));
  });
  return { differences: told, was };
}

// The same thing, kept: how it looks, how big it is, and where it is on the page, in that order of what a person notices.
function compared(a: Thing, b: Thing): Difference | undefined {
  if (!sameLook(a, b)) return { what: "looks different", then: a, now: b };
  if (!near(a.box.width, b.box.width) || !near(a.box.height, b.box.height)) return { what: "resized", then: a, now: b };
  if (!near(a.page.x, b.page.x) || !near(a.page.y, b.page.y)) return { what: "moved", then: a, now: b };
}

// Whether a control is called what another was, with more words after, all of them in something of its own inside it.
function gained(reading: Reading, control: Thing, was: string): boolean {
  if (!was || !control.name.startsWith(was + " ")) return false;
  const more = control.name.slice(was.length + 1);
  return reading.things.some((thing) => parentOf(reading, thing) === control && thing.words === more);
}
const bag = (thing: Thing) => (thing.wordsInside ?? "").split(" ").sort().join(" ");
