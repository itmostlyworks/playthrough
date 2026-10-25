// What changed at one moment of a flow between two rounds, as the changes a person would name. What only follows from
// another is told with it: what moved or grew with what holds it, and what was pushed along by something new, gone or
// resized above or beside it. Things that swapped places, rows in a new order, and alike things changed alike are one
// change each. Each is said in Vantage's fixed words, never the agent's, and its id is the thing and what happened to it,
// so the same change seen in another flow, at another moment or against another round is the same one.

import { createHash } from "node:crypto";
import type { Box, Element } from "@vantage/review";
import { differences, HOLDS, holderOf, identity, near, NEAR, parentOf, type Difference } from "./differences.ts";
import type { Reading, Thing } from "./read.ts";

// A change at one moment: what it's on is an element of the newer round, or for something gone, where it was.
export type Found = { id: string; words: string; element?: Element; box?: Box };

// What happened to a thing, before it's said in full: what it's on, in which of the two readings, and what came with it.
type Told = { what: string; thing: Thing; in: Reading; words: string; pushed?: Along; sized?: Along; alike?: number };
type Along = { things: Thing[]; way: string };

const TABLES = /^(table|grid|treegrid|listbox)$/;
const REFLOWS = /^(dialog|alertdialog|status|alert|menu|box)$/;
const MANY = 3; // things moved by the same amount that make a layout shift
const MOST_INSIDE = 5; // changes inside one thing told one by one; past this, they're counted

export function changesAt(then: Reading, now: Reading): Found[] {
  const { differences: found, was } = differences(then, now);
  const isNow = new Map([...was].map(([b, a]) => [a, b]));
  const ofThing = new Map(found.flatMap((difference) => ("now" in difference ? [[difference.now, difference] as const] : [])));
  const move = (a: Thing, b: Thing) => ({ x: b.page.x - a.page.x, y: b.page.y - a.page.y });
  const grow = (a: Thing, b: Thing) => ({ x: b.box.width - a.box.width, y: b.box.height - a.box.height });
  const moved = (difference: Difference) => ("then" in difference && "now" in difference ? move(difference.then, difference.now) : { x: 0, y: 0 });
  const at = (difference: Difference) => (difference.what === "gone" ? difference.then : difference.now);
  // Something now inside a dialog, message or panel it wasn't in before has moved into it.
  const into = (difference: Difference & { then: Thing; now: Thing }) => {
    const holder = holderOf(now, difference.now);
    return holder && HOLDS.test(holder.role) && !TABLES.test(holder.role) && was.get(holder) !== holderOf(then, difference.then) ? holder : undefined;
  };

  // What holds it, or what it's in, when it moved by as much: its move is theirs.
  function movedWith(a: Thing, b: Thing): Thing | undefined {
    return [holderOf(now, b), parentOf(now, b)].find((around) => {
      const before = around && was.get(around);
      const went = before && move(before, around!);
      return went && (went.x || went.y) && near(move(a, b).x, went.x) && near(move(a, b).y, went.y);
    });
  }

  // What moved or changed size with what holds it isn't a change of its own: everything in a panel that moved, the words
  // in a heading that got wider, what reflowed in a dialog that got shorter. A holder makes what's in it wider or
  // narrower, never taller: something taller makes what holds it taller.
  function withHolder(difference: Difference): Thing | undefined {
    if (difference.what !== "moved" && difference.what !== "resized") return undefined;
    const { then: a, now: b } = difference;
    for (const around of [holderOf(now, b), parentOf(now, b)]) {
      const before = around && was.get(around);
      if (!around || !before) continue;
      const holds = around === holderOf(now, b);
      if (difference.what === "resized") {
        if (!near(before.box.width, around.box.width) && near(grow(a, b).x, grow(before, around).x) && near(a.box.height, b.box.height)) return around;
        continue;
      }
      if (around === movedWith(a, b)) return around;
      if (holds && REFLOWS.test(around.role) && (!near(before.box.width, around.box.width) || !near(before.box.height, around.box.height))) return around;
      // In a table or list that got taller or shorter, what moved up or down by no more than that reflowed with it.
      const taller = around.box.height - before.box.height;
      if (holds && TABLES.test(around.role) && !near(taller, 0) && near(a.page.x, b.page.x) && Math.abs(move(a, b).y) <= Math.abs(taller) + NEAR) return around;
    }
  }
  const follows = new Map(found.flatMap((difference) => (withHolder(difference) ? [[difference, withHolder(difference)!] as const] : [])));
  // What moved with its holder counts as moved with it, in a layout shift.
  const carried = new Map<Difference, number>();
  for (const [difference, around] of follows) {
    if (difference.what !== "moved") continue;
    let carrier = ofThing.get(around);
    while (carrier && follows.has(carrier)) carrier = ofThing.get(follows.get(carrier)!);
    if (carrier) carried.set(carrier, (carried.get(carrier) ?? 0) + 1);
  }
  // Enough moved to be a layout shift counts what moved with them; what moved is told by the things that moved themselves.
  const counted = (differences: Difference[]) => differences.reduce((count, difference) => count + 1 + (carried.get(difference) ?? 0), 0);

  const rest = found.filter((difference) => !follows.has(difference));
  const others = rest.filter((difference) => difference.what !== "moved");
  let moves = rest.filter((difference): difference is Difference & { what: "moved" } => difference.what === "moved");
  const told: Told[] = [];
  const caused = new Set<Difference>();
  const pushed = new Map<Difference, Along>();
  const sized = new Map<Difference, Along>();
  const alike = new Map<Difference, number>();
  const add = (along: Map<Difference, Along>, difference: Difference, things: Thing[], way: string) => along.set(difference, { things: [...(along.get(difference)?.things ?? []), ...things], way });

  // Something bigger or smaller only by what changed inside it follows from that: the Expenses card that grew by the “Who
  // owes whom” panel put in it, a table wider by a column of new buttons or by longer words, a panel taller by what moved
  // into it. Each way it changed size is explained by something inside that changed as much, or at least half as much,
  // and not because it did: what's narrower only because its holder is can't explain it.
  const isIn = (reading: Reading, thing: Thing, holder: Thing) => {
    for (let around = parentOf(reading, thing); around; around = parentOf(reading, around)) if (around === holder) return true;
    return false;
  };
  const sizeOf = (thing: Thing, axis: "x" | "y") => (axis === "x" ? thing.box.width : thing.box.height);
  const explains = (d: Difference, holder: Difference & { then: Thing; now: Thing }, axis: "x" | "y", by: number) => {
    if (d === holder) return false;
    if (d.what === "new") return by > 0 && isIn(now, d.now, holder.now) && sizeOf(d.now, axis) >= by / 2;
    if (d.what === "gone") return by < 0 && isIn(then, d.then, holder.then) && sizeOf(d.then, axis) >= -by / 2;
    if (!isIn(now, d.now, holder.now)) return false;
    if (!isIn(then, d.then, holder.then)) return by > 0 && sizeOf(d.now, axis) >= by / 2; // moved into it
    return Math.sign(grow(d.then, d.now)[axis]) === Math.sign(by) && Math.abs(grow(d.then, d.now)[axis]) >= Math.abs(by) / 2;
  };
  for (const difference of others) {
    if (difference.what !== "resized" || caused.has(difference)) continue;
    const growth = grow(difference.then, difference.now);
    const ways = (["x", "y"] as const).filter((axis) => !near(growth[axis], 0));
    if (ways.every((axis) => rest.some((d) => explains(d, difference, axis, growth[axis])))) caused.add(difference);
  }

  // A table or list whose rows moved by many amounts, up and down, has its rows in a new order.
  for (const [holder, ds] of groupBy(moves, (difference) => holderOf(now, difference.now))) {
    if (!holder || !TABLES.test(holder.role) || !was.has(holder)) continue;
    const amounts = new Set(ds.map((difference) => Math.round(moved(difference).y / 3)));
    if (amounts.size < 3 || !ds.some((difference) => moved(difference).y < 0) || !ds.some((difference) => moved(difference).y > 0)) continue;
    told.push({ what: "reordered", thing: holder, in: now, words: `Rows in ${the(holder)} are in a new order` });
    moves = moves.filter((difference) => !ds.includes(difference));
  }

  // Things moved by the same amount are a layout shift, which belongs to what caused it; a few moved alone may have
  // swapped places.
  const shifts: { by: { x: number; y: number }; ds: typeof moves }[] = [];
  for (const difference of moves) {
    const by = moved(difference);
    const shift = shifts.find((shift) => near(shift.by.x, by.x) && near(shift.by.y, by.y));
    if (shift) shift.ds.push(difference);
    else shifts.push({ by, ds: [difference] });
  }
  const loose = shifts.filter((shift) => counted(shift.ds) < MANY).flatMap((shift) => shift.ds);

  // Two things that crossed each other in what holds them, moving opposite ways, have swapped places; each move is taken
  // against what holds them, when that moved too (a menu that opens higher, its items swapped). Things that all went the
  // same way only moved.
  for (const [holder, ds] of groupBy(loose, (difference) => holderOf(now, difference.now))) {
    const before = holder && was.get(holder);
    const went = before ? move(before, holder!) : { x: 0, y: 0 };
    const opposite = (["x", "y"] as const).some((axis) => ds.some((d) => moved(d)[axis] - went[axis] > NEAR) && ds.some((d) => moved(d)[axis] - went[axis] < -NEAR));
    const crossed = ds.some((p) => ds.some((q) => (["x", "y"] as const).some((axis) => Math.sign(p.then.page[axis] - q.then.page[axis]) * Math.sign(p.now.page[axis] - q.now.page[axis]) < 0)));
    if (holder && before && ds.length >= 2 && opposite && crossed) {
      const order = [...ds].sort((p, q) => p.now.page.x - q.now.page.x || p.now.page.y - q.now.page.y);
      const words = ds.length === 2 ? `${together(order.map((d) => d.now))} have swapped places` : `What's in ${the(holder)} is in a new order: ${order.slice(0, 3).map((d) => called(d.now)).join(", ")}${ds.length > 3 ? "…" : ""}`;
      told.push({ what: "swapped", thing: holder, in: now, words });
    } else for (const difference of ds) told.push({ what: "moved", thing: difference.now, in: now, words: `${called(difference.now)} ${movedWords(difference)}` });
  }

  // What made things move or change size: something new, gone or resized above them (for a move up or down), or beside
  // them on the same rows (for left or right), the nearest; big enough to explain it, as wide as the move, or grown or
  // shrunk by that much. Never something that holds them all.
  type Span = { x: number; y: number; right: number; bottom: number };
  const spanOf = (things: Thing[]): Span => ({
    x: Math.min(...things.map((thing) => thing.page.x)),
    y: Math.min(...things.map((thing) => thing.page.y)),
    right: Math.max(...things.map((thing) => thing.page.x + thing.box.width)),
    bottom: Math.max(...things.map((thing) => thing.page.y + thing.box.height)),
  });
  type Looking = { vertical: boolean; by: number; not?: Difference[]; kinds?: RegExp; share?: number; moving?: boolean };
  function causeOf(span: Span, { vertical, by, not = [], kinds = /^(new|gone|resized|reworded)$/, share = 0.5, moving = false }: Looking): Difference | undefined {
    const wide = (difference: Difference) => (difference.what === "new" || difference.what === "gone" ? at(difference).box.width : "then" in difference ? Math.abs(grow(difference.then, difference.now).x) : 0);
    const above = (thing: Thing, gone: boolean) => (gone ? thing.page.y : thing.page.y + thing.box.height) <= span.y + NEAR && thing.page.x < span.right && thing.page.x + thing.box.width > span.x;
    const beside = (d: Difference) => {
      const thing = at(d);
      const left = thing.page.x + thing.box.width <= span.x + NEAR;
      const right = thing.page.x >= span.right - NEAR;
      const pushes = d.what === "new" || ("then" in d && "now" in d && grow(d.then, d.now).x > 0);
      // What's new or grew pushes what moved away from it; what's gone or shrank lets it move towards it.
      const side = moving ? ((by > 0) === pushes ? left : right) : left || right;
      return thing.page.y < span.bottom && thing.page.y + thing.box.height > span.y && side;
    };
    const middle = (thing: Thing) => Math.abs(thing.page.x + thing.box.width / 2 - (span.x + span.right) / 2);
    return others
      .filter((d) => !not.includes(d) && !caused.has(d) && kinds.test(d.what) && (vertical || wide(d) >= Math.abs(by) * share))
      .filter((d) => (vertical ? above(at(d), d.what === "gone") : beside(d)))
      .sort((p, q) => (vertical ? at(q).page.y - at(p).page.y : middle(at(p)) - middle(at(q))))[0];
  }

  // Things made wider or narrower by the same amount, sharing an edge (a heading and a table beside a new panel), are one
  // change: the biggest stands for them, and it belongs to what made them so, beside them.
  const widened: { by: number; ds: (Difference & { then: Thing; now: Thing })[]; top?: Difference & { then: Thing; now: Thing }; cause?: Difference }[] = [];
  for (const difference of others) {
    if (difference.what !== "resized" || caused.has(difference) || near(grow(difference.then, difference.now).x, 0)) continue;
    const by = grow(difference.then, difference.now).x;
    const edge = (d: { now: Thing }) => [d.now.page.x, d.now.page.x + d.now.box.width];
    const group = widened.find((group) => near(group.by, by) && group.ds.some((d) => edge(d).some((side, i) => near(side, edge(difference)[i]!))));
    if (group) group.ds.push(difference);
    else widened.push({ by, ds: [difference] });
  }
  for (const group of widened) {
    const [top, ...more] = [...group.ds].sort((p, q) => Number(HOLDS.test(q.now.role)) - Number(HOLDS.test(p.now.role)) || q.now.box.width * q.now.box.height - p.now.box.width * p.now.box.height);
    group.top = top!;
    for (const difference of more) caused.add(difference);
    const cause = causeOf(spanOf(group.ds.map((d) => d.now)), { vertical: false, by: group.by, not: group.ds, kinds: /^(new|gone)$/, share: 0.8 });
    if (cause) {
      add(sized, cause, group.ds.map((d) => d.now), group.by > 0 ? "wider" : "narrower");
      caused.add(top!);
      group.cause = cause;
    } else if (more.length) alike.set(top!, more.length);
  }

  for (const shift of shifts.filter((shift) => counted(shift.ds) >= MANY)) {
    const { by, ds } = shift;
    const first = [...ds].sort((p, q) => p.now.page.y - q.now.page.y || p.now.page.x - q.now.page.x)[0]!;
    const way = wayOf(by.x, by.y);
    // Things moved left or right as far as an edge of something that got wider or narrower, and in its column: it moved them.
    const before = spanOf(ds.map((d) => d.then));
    const column = near(by.y, 0)
      ? widened.find(({ top }) => top && before.x >= top.then.page.x - 8 && before.right <= top.then.page.x + top.then.box.width + 8 && (near(by.x, top.now.page.x - top.then.page.x) || near(by.x, top.now.page.x + top.now.box.width - top.then.page.x - top.then.box.width)))
      : undefined;
    if (column) {
      add(pushed, column.cause ?? column.top!, ds.map((d) => d.now), way);
      continue;
    }
    const vertical = Math.abs(by.y) >= Math.abs(by.x);
    const span = spanOf(ds.map((d) => d.now));
    // Across, in a row laid out with space between, a small new thing can move its neighbour a long way: the nearest change on
    // the side it moved away from, when nothing beside it is big enough.
    const looking = { vertical, by: vertical ? by.y : by.x, moving: true };
    const cause = into(first) ? undefined : (causeOf(span, looking) ?? (vertical ? undefined : causeOf(span, { ...looking, share: 0 })));
    if (cause) add(pushed, cause, ds.map((d) => d.now), way);
    else told.push({ what: "moved", thing: first.now, in: now, words: `${called(first.now)} ${movedWords(first)}${ds.length > 1 ? `, with ${ds.length - 1} more ${things(ds.length - 1)} around it` : ""}` });
  }

  for (const difference of others) {
    if (caused.has(difference)) continue;
    const along = { pushed: pushed.get(difference), sized: sized.get(difference), alike: alike.get(difference) };
    if (difference.what === "new") told.push({ what: "new", thing: difference.now, in: now, words: `${called(difference.now)} is new`, ...along });
    else if (difference.what === "gone") told.push({ what: "gone", thing: difference.then, in: then, words: `${called(difference.then)} is gone`, ...along });
    else if (difference.what === "became") told.push({ what: "became", thing: difference.now, in: now, words: `${called(difference.then)} is ${a(word(difference.now))} now`, ...along });
    else if (difference.what === "reworded") told.push({ what: "reworded", thing: difference.now, in: now, words: rewordedWords(difference.then, difference.now), ...along });
    else if (difference.what === "looks different") {
      const size = sizeWords(difference);
      told.push({ what: "looks different", thing: difference.now, in: now, words: `${called(difference.now)} looks different: ${lookWords(difference.then, difference.now)}${size ? `, and ${size}` : ""}`, ...along });
    } else if (difference.what === "resized") told.push({ what: "resized", thing: difference.now, in: now, words: `${called(difference.now)} ${sizeWords(difference)}`, ...along });
  }

  function movedWords(difference: Difference & { then: Thing; now: Thing }): string {
    const holder = into(difference);
    return holder ? `moved into ${the(holder)}` : `moved ${wayOf(moved(difference).x, moved(difference).y)}`;
  }
  // “Is wider and taller”, then where it went when both its edges went the same way; by under 10px, “a little”. Moved
  // into something, its size is what it takes there.
  function sizeWords(difference: Difference & { then: Thing; now: Thing }): string {
    const { then: a, now: b } = difference;
    const holder = into(difference);
    if (holder) return `moved into ${the(holder)}`;
    const little = (from: number, to: number) => (Math.abs(to - from) < 10 ? "a little " : "");
    const sizes = [
      b.box.width > a.box.width + NEAR ? `${little(a.box.width, b.box.width)}wider` : b.box.width < a.box.width - NEAR ? `${little(a.box.width, b.box.width)}narrower` : "",
      b.box.height > a.box.height + NEAR ? `${little(a.box.height, b.box.height)}taller` : b.box.height < a.box.height - NEAR ? `${little(a.box.height, b.box.height)}shorter` : "",
    ].filter(Boolean);
    const edges = (start: number, size: number, from: number, was: number) => {
      const [first, last] = [start - from, start + size - from - was];
      return first > NEAR && last > NEAR ? 1 : first < -NEAR && last < -NEAR ? -1 : 0;
    };
    const across = edges(b.page.x, b.box.width, a.page.x, a.box.width);
    const down = edges(b.page.y, b.box.height, a.page.y, a.box.height);
    const went = (across || down) && !movedWith(a, b) ? `moved ${wayOf(across, down)}` : "";
    return [sizes.length ? `is ${sizes.join(" and ")}` : "", went].filter(Boolean).join(", and ");
  }

  return said(told, now, was, isNow);
}

// Each change in full: alike things changed alike told once, what changed inside one thing counted when there's a lot,
// and each with its id and where it is.
function said(told: Told[], now: Reading, was: Map<Thing, Thing>, isNow: Map<Thing, Thing>): Found[] {
  const id = (told: Told) => idOf(identity(told.in, told.thing), told.what);
  // Top to bottom, as the page reads.
  const byId = groupBy(
    [...told].sort((p, q) => p.thing.page.y - q.thing.page.y || p.thing.page.x - q.thing.page.x),
    id,
  );

  // What changed inside one table, list, dialog or panel is told change by change, up to five; past that it's one change to
  // it, counted: a table that now shows other invoices.
  const inside = groupBy([...byId.values()], ([told]) => {
    const holder = holderOf(told!.in, told!.thing);
    const holderNow = holder && (told!.in === now ? holder : isNow.get(holder));
    return holderNow && was.has(holderNow) ? holderNow : undefined;
  });
  const found: Found[] = [];
  for (const [holder, all] of inside) {
    if (!holder || all.length <= MOST_INSIDE) {
      for (const alike of all) found.push({ id: id(alike[0]!), words: alikeWords(alike), ...placeOf(alike[0]!, now) });
      continue;
    }
    const COUNTED: Record<string, string> = { new: "new", gone: "gone", "looks different": "look different", resized: "changed size", reworded: "reworded", moved: "moved", became: "changed", swapped: "in a new order", reordered: "in a new order" };
    const kinds = groupBy(
      all.flatMap((alike) => alike),
      (told) => COUNTED[told.what] ?? "changed",
    );
    const words =
      TABLES.test(holder.role) && all.flat().every((told) => told.what === "resized" || told.what === "moved")
        ? `Columns in ${the(holder)} changed width`
        : `${called(holder)} changed inside: ${[...kinds]
            .sort((p, q) => q[1].length - p[1].length)
            .map(([kind, its], i) => {
              const names = [...new Set(its.map((told) => called(told.thing)))];
              return i ? `${its.length} ${kind}` : `${its.length} ${its.length > 1 ? "things" : "thing"} ${kind} (${names.slice(0, 2).join(", ")}${names.length > 2 ? ", …" : ""})`;
            })
            .join(", ")}`;
    const changed: Told = { what: "changed inside", thing: holder, in: now, words };
    found.push({ id: id(changed), words: sentence(words), ...placeOf(changed, now) });
  }
  return found;
}

// Alike things changed alike, said once: “Delete button looks different: border, in 30 places”, or by their names when
// they differ, “Actions for INV-1043, INV-1050 and INV-1057 are new”.
function alikeWords(alike: Told[]): string {
  const [first] = alike as [Told];
  // One thing pushed along is named, “and moved the table down”; more are counted.
  const them = (along: Along) => (along.things.length === 1 ? the(along.things[0]!) : `${along.things.length} things`);
  const along = `${first.pushed ? `, and moved ${them(first.pushed)} ${first.pushed.way}` : ""}${first.sized ? `, and made ${them(first.sized)} ${first.sized.way}` : ""}${first.alike ? `, and so ${first.alike > 1 ? `are ${first.alike} more things` : "is 1 more thing"}` : ""}`;
  const names = [...new Set(alike.map((told) => told.thing.name))];
  if (alike.length === 1) return sentence(first.words + along);
  if (names.length > 1 && /^(new|gone|looks different)$/.test(first.what) && WORD[first.thing.role]) {
    const verb = first.what === "new" ? "are new" : first.what === "gone" ? "are gone" : `look different${first.words.slice(first.words.indexOf(":"))}`;
    const them = symbolOnly(first.thing) ? together(alike.map((told) => told.thing)) : `${together(alike.map((told) => told.thing), (thing) => thing.name)} ${plural(WORD[first.thing.role]!)}`;
    return sentence(`${them} ${verb}${along}`);
  }
  return sentence(`${first.words}${along}, in ${alike.length} places`);
}

// What a person would call it: “Export button”, “Total for Q3 $27,785.00”, the “Who owes whom” area, a button that shows
// only a symbol by its label (“Actions for INV-1065”), “Mark as paid” in the menu.
const WORD: Record<string, string> = {
  button: "button", link: "link", dialog: "dialog", alertdialog: "dialog", table: "table", grid: "table", treegrid: "table", heading: "heading", textbox: "field",
  searchbox: "search field", combobox: "menu", checkbox: "checkbox", radio: "option", switch: "switch", slider: "slider", listbox: "list", option: "option",
  tab: "tab", menu: "menu", menuitem: "menu item", img: "image", group: "choice", radiogroup: "choice",
};
const word = (thing: Thing) => WORD[thing.role] ?? thing.role;
const symbolOnly = (thing: Thing) => thing.role === "button" && !!thing.name && thing.words.replace(/\s/g, "").length <= 2 && !/[\p{L}\p{N}]/u.test(thing.words);
const cut = (words: string, most = 60) => (words.length > most ? words.slice(0, most - 1).trimEnd() + "…" : words);
export function called(thing: Thing): string {
  if (thing.role === "status" || thing.role === "alert") return "Message";
  if (thing.role === "box") return `“${cut(thing.name)}” area`;
  if (thing.role === "text") return `“${cut(thing.words)}”`;
  if (thing.role === "menuitem" && thing.name) return `“${cut(thing.name)}” in the menu`;
  if (symbolOnly(thing)) return thing.name;
  return `${cut(thing.name)} ${word(thing)}`.trim();
}
export const the = (thing: Thing) => {
  const name = called(thing);
  return name === "Message" ? "the message" : name.startsWith("“") && thing.role === "text" ? name : `the ${name}`;
};
const a = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);
const plural = (word: string) => (/(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`);
const things = (count: number) => (count > 1 ? "things" : "thing");
export const sentence = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

// Two or more of one kind, called together: “Mark as paid” and “Send reminder” in the menu; “Actions for INV-1043,
// INV-1050 and INV-1057”, the words they all start with said once.
function together(all: Thing[], name: (thing: Thing) => string = called): string {
  if (all.every((thing) => thing.role === "menuitem" && thing.name)) return `${together(all, (thing) => `“${thing.name}”`)} in the menu`;
  const names = all.map(name);
  let shared = names.reduce((common, next) => {
    let i = 0;
    while (i < common.length && common[i] === next[i]) i++;
    return common.slice(0, i);
  });
  shared = shared.slice(0, shared.lastIndexOf(" ") + 1);
  if (shared.trim().split(" ").length < 2) shared = "";
  const short = names.map((name, i) => (i ? name.slice(shared.length) : name));
  const shown = short.length > 4 ? [...short.slice(0, 3), `${short.length - 3} more`] : short;
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

// The part of two long texts that differs, with a few words either side: “…Hello Marcus, This is…”.
function rewordedWords(a: Thing, b: Thing): string {
  if (a.role !== "text") return `${called(a)} now says “${cut(b.name)}”`;
  let start = 0;
  while (start < a.words.length && start < b.words.length && a.words[start] === b.words[start]) start++;
  let end = 0;
  while (end < a.words.length - start && end < b.words.length - start && a.words.at(-1 - end) === b.words.at(-1 - end)) end++;
  const part = (words: string) => {
    if (words.length <= 60) return words;
    const from = start <= 15 ? 0 : words.lastIndexOf(" ", start - 15) + 1;
    const after = words.indexOf(" ", words.length - end + 15);
    const to = end <= 15 || after < 0 ? words.length : after;
    return `${from > 0 ? "…" : ""}${cut(words.slice(from, to), 80)}${to < words.length ? "…" : ""}`;
  };
  return `“${part(a.words)}” now says “${part(b.words)}”`;
}

// The look of something, in words: what about it changed.
function lookWords(a: Thing, b: Thing): string {
  const parts: string[] = [];
  if (a.look.background !== b.look.background) parts.push("background");
  if (a.look.color !== b.look.color) parts.push("text colour");
  if (a.look.size !== b.look.size) parts.push(parseFloat(b.look.size) > parseFloat(a.look.size) ? "bigger text" : "smaller text");
  if (a.look.weight !== b.look.weight) parts.push(Number(b.look.weight) > Number(a.look.weight) ? "bolder text" : "lighter text");
  if (a.look.border !== b.look.border) parts.push("border");
  return parts.join(", ");
}

export const wayOf = (across: number, down: number) => [down > 0 ? "down" : down < 0 ? "up" : "", across > 0 ? "right" : across < 0 ? "left" : ""].filter(Boolean).join(" and ");

// Its id: the thing and what happened to it, as letters that don't read alike, like every id in a review.
export function idOf(thing: string, what: string): string {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(createHash("sha256").update(`${thing}|${what}`).digest().subarray(0, 8), (byte) => letters[byte % 32]).join("");
}

// Where it is: an element of the newer round, by its role and name, or where something gone was, as shares of the screen.
function placeOf(told: Told, now: Reading): { element: Element } | { box: Box } | {} {
  const { thing } = told;
  if (told.in === now && thing.name) return { element: { role: thing.role, name: thing.name, ...(thing.node !== undefined && { node: thing.node }) } };
  const box = onScreen(thing.box, told.in.screen);
  return box ? { box } : {};
}

// The part of a box in pixels that's on the screen, as shares of it.
export function onScreen(box: Thing["box"], screen: Reading["screen"]): Box | undefined {
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  const right = Math.min(screen.width, box.x + box.width), bottom = Math.min(screen.height, box.y + box.height);
  if (right <= x || bottom <= y) return undefined;
  return { x: x / screen.width, y: y / screen.height, width: (right - x) / screen.width, height: (bottom - y) / screen.height };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}
