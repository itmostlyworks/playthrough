// What changed at one moment of a flow between two rounds, as the changes a person would name. What only follows from
// another is told with it: what moved or grew with what holds it, and what was pushed along by something new, gone or
// resized above or beside it. Things that swapped places, rows in a new order, and alike things changed alike are one
// change each. A person reads a row, a list's item or a card as one thing: one new or gone is one change, and so are the
// words one says now; the same change in each of them is one change, in as many places. Each is said in Playthrough's
// fixed words, never the agent's, and its id is the thing and what happened to it, so the same change seen in another
// flow, at another moment or against another round is the same one.

import { createHash } from "node:crypto";
import { a, called, dataLeftOut, differences, HOLDS, holderOf, identity, lookWords, near, NEAR, parentOf, plural, rewordedPart, rewordedWords, sentence, symbolOnly, the, things, together, wayOf, word, WORD, type Difference, type Glimpse, type Item, type Reading, type Thing } from "@playthrough/page";
import type { Box, Element } from "@playthrough/review";

// A change at one moment: what it's on is an element of the newer round, or for something gone, where it was. And the
// ids of the changes it stands for, each by itself, so what changes by itself is left out as itself, never as all it's
// told with.
// Off the screen, it's what the page has but the recording doesn't show at this moment.
export type Found = { id: string; words: string; element?: Element; alike?: Element[]; box?: Box; pieces: string[]; reworded?: string; gone?: true; offScreen?: true; top?: number };

// What happened to a thing, before it's said in full: what it's on, in which of the two readings, and what came with it;
// what it's known by, where the thing alone doesn't say, and the changes it stands for, by their ids.
type Told = { what: string; thing: Thing; in: Reading; words: string; key?: string; pieces?: string[]; reworded?: string } & With;
// What came with a change: what it pushed along, what it made wider or narrower, and how many more changed alike with it.
type With = { pushed?: Along; sized?: Along; alike?: number };
type Along = { things: Thing[]; way: string };
// A thing in both readings that changed, and one that moved.
type Pair = Difference & { then: Thing; now: Thing };
type Move = Difference & { what: "moved" };

const TABLES = /^(table|grid|treegrid|listbox)$/;
const REFLOWS = /^(dialog|alertdialog|status|alert|menu|box)$/;
const MANY = 3; // things moved by the same amount that make a layout shift
const MOST_INSIDE = 5; // changes inside one table or list told one by one; past this, they're counted

// Each rule in turn. What only follows from another comes out first; then each change left is told, with what came with it,
// but for what changes by itself, which isn't a change at all, nor counted in one.
export function changesAt(then: Reading, now: Reading, unsteady = new Set<string>(), shown: Shown = { then: [], now: [] }): Found[] {
  const moment = new Moment(then, now, shown);
  const { follows, carried } = followingHolders(moment);
  const own = moment.differences.filter((difference) => !follows.has(difference));
  const others = own.filter((difference) => !isMove(difference));
  const caused = grownByWhatsInside(moment, own);
  const along = new Map<Difference, With>();

  const items = itemsReordered(moment, own.filter(isMove));
  const { reordered, left } = rowsReordered(moment, items.left);
  const { shifts, loose } = layoutShifts(left, carried);
  moment.shifts = shifts.map((shift) => shift.by);
  const widened = widenedTogether(others, caused, along);
  const told = [
    ...items.reordered,
    ...reordered,
    ...swappedOrMoved(moment, madeRoom(loose, others, caused, along)),
    ...causesOfShifts(moment, shifts, widened, others, caused, along),
  ];
  for (const difference of others) if (!caused.has(difference)) told.push(tell(moment, difference, along.get(difference)));
  return said(told, moment, unsteady);
}

// What each round glimpsed in the step and just after it.
type Shown = { then: Glimpse[]; now: Glimpse[] };

// The two readings of a moment: which thing now is which thing then, and what happened to each one that changed.
class Moment {
  readonly then: Reading;
  readonly now: Reading;
  readonly differences: Difference[];
  readonly was: Map<Thing, Thing>; // each thing now, as it was then
  readonly isNow: Map<Thing, Thing>; // each thing then, as it is now
  shifts: { x: number; y: number }[] = []; // how far each layout shift moved what's in it, once they're found

  constructor(then: Reading, now: Reading, shown: Shown) {
    const { differences: found, was } = differences(then, now);
    this.then = then;
    this.now = now;
    // A message the page announces and takes away by itself, a toast, is judged by whether the step showed it, not by
    // whether it's still up when the step is read: gone then, or new now, when that round glimpsed it in the step or just
    // after, it was only read at another moment of its life. Kan's “Added to favorites” stays as long as the page keeps
    // redrawing, so a slower run reads the step once it's faded. A dialog isn't a message: one that now closes is gone.
    const ids = (things: { reading: Pick<Reading, "things">; thing: Thing }[]) => new Set(things.map(({ reading, thing }) => identity(reading, thing)));
    const all = (readings: Pick<Reading, "things">[]) => readings.flatMap((reading) => reading.things.map((thing) => ({ reading, thing })));
    const glimpsed = { then: ids(all(shown.then)), now: ids(all(shown.now)) };
    const messages = ids(all([then, now, ...shown.then, ...shown.now]).filter(({ thing }) => thing.live));
    const passing = (reading: Reading, thing: Thing, other: Set<string>) => messages.has(identity(reading, thing)) && other.has(identity(reading, thing));
    this.differences = found.filter((difference) =>
      difference.what === "gone" ? !passing(then, difference.then, glimpsed.now) : difference.what === "new" ? !passing(now, difference.now, glimpsed.then) : true,
    );
    this.was = was;
    this.isNow = new Map([...was].map(([b, a]) => [a, b]));
  }

  // What holds it, or what it's in, when that moved by as much: its move is theirs.
  movedWith(a: Thing, b: Thing): Thing | undefined {
    return [holderOf(this.now, b), parentOf(this.now, b)].find((around) => {
      const before = around && this.was.get(around);
      const went = before && moveOf(before, around!);
      return went && (went.x || went.y) && near(moveOf(a, b).x, went.x) && near(moveOf(a, b).y, went.y);
    });
  }

  // Its move is another's: what holds it or what it's in moved as far, or a layout shift it's part of did.
  movedAlong(a: Thing, b: Thing): boolean {
    const by = moveOf(a, b);
    return !!this.movedWith(a, b) || this.shifts.some((shift) => near(shift.x, by.x) && near(shift.y, by.y));
  }

  // A dialog, message or panel it's in now and wasn't in before: it moved into it.
  into({ then: a, now: b }: Pair): Thing | undefined {
    const holder = holderOf(this.now, b);
    return holder && HOLDS.test(holder.role) && !TABLES.test(holder.role) && this.was.get(holder) !== holderOf(this.then, a) ? holder : undefined;
  }
}

// What moved or changed size with what holds it isn't a change of its own: everything in a panel that moved, the words in
// a heading that got wider, what reflowed in a dialog that got shorter. What moved with a holder still counts as moved
// with it, in a layout shift.
function followingHolders(moment: Moment): { follows: Map<Difference, Thing>; carried: Map<Difference, number> } {
  const follows = new Map<Difference, Thing>();
  for (const difference of moment.differences) {
    const holder = holderItFollows(moment, difference);
    if (holder) follows.set(difference, holder);
  }
  const ofThing = new Map(moment.differences.flatMap((difference) => ("now" in difference ? [[difference.now, difference] as const] : [])));
  const carried = new Map<Difference, number>();
  for (const [difference, holder] of follows) {
    if (!isMove(difference)) continue;
    let carrier = ofThing.get(holder);
    while (carrier && follows.has(carrier)) carrier = ofThing.get(follows.get(carrier)!);
    if (carrier) carried.set(carrier, (carried.get(carrier) ?? 0) + 1);
  }
  return { follows, carried };
}

// A holder makes what's in it wider or narrower, never taller: something taller makes what holds it taller.
function holderItFollows(moment: Moment, difference: Difference): Thing | undefined {
  if (difference.what !== "moved" && difference.what !== "resized") return undefined;
  const { then: a, now: b } = difference;
  for (const around of [holderOf(moment.now, b), parentOf(moment.now, b)]) {
    const before = around && moment.was.get(around);
    if (!around || !before) continue;
    if (difference.what === "resized") {
      const widerWithIt = !near(before.box.width, around.box.width) && near(growthOf(a, b).x, growthOf(before, around).x) && near(a.box.height, b.box.height);
      if (widerWithIt) return around;
      continue;
    }
    if (around === moment.movedWith(a, b)) return around;
    const holds = around === holderOf(moment.now, b);
    const reflowed = holds && REFLOWS.test(around.role) && !sameSize(before, around);
    // In a table or list that got taller or shorter, what moved up or down by no more than that reflowed with it.
    const taller = around.box.height - before.box.height;
    const pushedDownInIt = holds && TABLES.test(around.role) && !near(taller, 0) && near(a.page.x, b.page.x) && Math.abs(moveOf(a, b).y) <= Math.abs(taller) + NEAR;
    if (reflowed || pushedDownInIt) return around;
  }
}

// Something bigger or smaller only by what changed inside it follows from that: the Expenses card that grew by the “Who
// owes whom” panel put in it, a table wider by a column of new buttons or by longer words, a panel taller by what moved
// into it. Each way it changed size is explained by something inside that changed as much, or at least half as much,
// and not because it did: what's narrower only because its holder is can't explain it.
function grownByWhatsInside(moment: Moment, own: Difference[]): Set<Difference> {
  const { then, now } = moment;
  const sizeOf = (thing: Thing, axis: "x" | "y") => (axis === "x" ? thing.box.width : thing.box.height);
  const explains = (d: Difference, holder: Pair, axis: "x" | "y", by: number) => {
    if (d === holder) return false;
    if (d.what === "new") return by > 0 && isIn(now, d.now, holder.now) && sizeOf(d.now, axis) >= by / 2;
    if (d.what === "gone") return by < 0 && isIn(then, d.then, holder.then) && sizeOf(d.then, axis) >= -by / 2;
    if (!isIn(now, d.now, holder.now)) return false;
    if (!isIn(then, d.then, holder.then)) return by > 0 && sizeOf(d.now, axis) >= by / 2; // moved into it
    const grew = growthOf(d.then, d.now)[axis];
    return Math.sign(grew) === Math.sign(by) && Math.abs(grew) >= Math.abs(by) / 2;
  };
  const caused = new Set<Difference>();
  for (const difference of own) {
    if (difference.what !== "resized") continue;
    const growth = growthOf(difference.then, difference.now);
    const ways = (["x", "y"] as const).filter((axis) => !near(growth[axis], 0));
    if (ways.every((axis) => own.some((d) => explains(d, difference, axis, growth[axis])))) caused.add(difference);
  }
  return caused;
}

// A list whose items are in a new order is the fewest of them that moved, of those in it both times: the rest only made
// room. Two that traded places have swapped; one or two that went past others moved that many places (Kan's card,
// sorted below two, didn't swap with either); more are a new order. Each moved item is called by its words, as one new or
// gone is; a new order isn't, so one that comes every run is learned as changing by itself. What moved inside the list's
// items, with them, is theirs.
function itemsReordered(moment: Moment, moves: Move[]): { reordered: Told[]; left: Move[] } {
  const { then, now } = moment;
  const pairs = pairItems(moment);
  const reordered: Told[] = [];
  let left = moves;
  for (const [, paired] of groupBy([...pairs], ([, b]) => now.items![b]!.list)) {
    const byThen = [...paired].sort((p, q) => p[0] - q[0]);
    const byNow = [...paired].sort((p, q) => p[1] - q[1]);
    const placeThen = new Map(byThen.map(([a], i) => [a, i]));
    const kept = longestRising(byNow.map(([a]) => placeThen.get(a)!));
    // Along the way the list goes: down a column, across a row.
    const way = (a: number, b: number) => {
      const went = moveOf(asThing(then.items![a]!, a), asThing(now.items![b]!, b));
      return Math.abs(went.y) >= Math.abs(went.x) ? (went.y > 0 ? "down" : "up") : went.x > 0 ? "right" : "left";
    };
    const moved = byNow.flatMap(([a, b], i) => (kept.has(i) ? [] : [{ thing: asThing(now.items![b]!, b), way: way(a, b), places: Math.abs(i - placeThen.get(a)!) }]));
    if (!moved.length) continue;
    const changed = byNow.filter(([a], i) => placeThen.get(a) !== i);
    const first = now.items![byNow[0]![1]]!;
    const of = `${first.role} of ${listOf(now, first)}`;
    const holder = first.holder === undefined ? undefined : now.things[first.holder];
    if (changed.length === 2) {
      const both = changed.map(([, b]) => asThing(now.items![b]!, b));
      reordered.push({ what: "swapped", thing: both[0]!, in: now, words: `${together(both)} have swapped places`, key: `${of}: ${both.map((thing) => thing.words).join(" / ")}` });
    } else if (moved.length <= 2) {
      for (const { thing, way, places } of moved)
        reordered.push({ what: "moved", thing, in: now, words: `${called(thing)} moved ${way} ${places} ${places > 1 ? "places" : "place"}`, key: `${of}: ${thing.words}` });
    } else {
      const order = byNow.slice(0, 3).map(([, b]) => called(asThing(now.items![b]!, b)));
      const words = first.role === "row" ? `Rows in ${holder ? the(holder) : "the table"} are in a new order` : `What's in ${holder ? the(holder) : "the list"} is in a new order: ${order.join(", ")}${byNow.length > 3 ? "…" : ""}`;
      reordered.push({ what: "reordered", thing: holder ?? moved[0]!.thing, in: now, words, key: of });
    }
    const inList = new Set(paired.map(([, b]) => b));
    left = left.filter((move) => !(move.now.item !== undefined && inList.has(move.now.item) && move.then.item !== undefined && pairs.get(move.then.item) === move.now.item));
  }
  return { reordered, left };
}

// The most of a sequence that's still in order, by where each is in it: what stayed where it was among the rest.
function longestRising(sequence: number[]): Set<number> {
  const best = sequence.map(() => 1);
  const before = sequence.map(() => -1);
  for (let i = 0; i < sequence.length; i++)
    for (let j = 0; j < i; j++)
      if (sequence[j]! < sequence[i]! && best[j]! + 1 > best[i]!) {
        best[i] = best[j]! + 1;
        before[i] = j;
      }
  const kept = new Set<number>();
  for (let i = best.indexOf(Math.max(...best)); i >= 0; i = before[i]!) kept.add(i);
  return kept;
}

// A table or list whose rows moved by many amounts, up and down, has its rows in a new order.
function rowsReordered(moment: Moment, moves: Move[]): { reordered: Told[]; left: Move[] } {
  const reordered: Told[] = [];
  let left = moves;
  for (const [holder, inIt] of groupBy(moves, (move) => holderOf(moment.now, move.now))) {
    if (!holder || !TABLES.test(holder.role) || !moment.was.has(holder)) continue;
    const amounts = new Set(inIt.map((move) => Math.round(movedBy(move).y / 3)));
    const upAndDown = inIt.some((move) => movedBy(move).y < 0) && inIt.some((move) => movedBy(move).y > 0);
    if (amounts.size < 3 || !upAndDown) continue;
    reordered.push({ what: "reordered", thing: holder, in: moment.now, words: `Rows in ${the(holder)} are in a new order` });
    left = left.filter((move) => !inIt.includes(move));
  }
  return { reordered, left };
}

// Many things moved by the same amount are a layout shift, which belongs to what caused it; a few moved alone may have
// swapped places. Enough to be a shift counts what moved with them.
type Shift = { by: { x: number; y: number }; moves: Move[] };
function layoutShifts(moves: Move[], carried: Map<Difference, number>): { shifts: Shift[]; loose: Move[] } {
  const all: Shift[] = [];
  for (const move of moves) {
    const by = movedBy(move);
    const shift = all.find((shift) => near(shift.by.x, by.x) && near(shift.by.y, by.y));
    if (shift) shift.moves.push(move);
    else all.push({ by, moves: [move] });
  }
  const counted = (moves: Move[]) => moves.reduce((count, move) => count + 1 + (carried.get(move) ?? 0), 0);
  return { shifts: all.filter((shift) => counted(shift.moves) >= MANY), loose: all.filter((shift) => counted(shift.moves) < MANY).flatMap((shift) => shift.moves) };
}

// One thing moved straight up or down on its own, by something above it that took room or gave it, is part of that
// change, as many moved alike are: the close's heading, pushed down by a new section, isn't a change of its own, and on
// the newer round its outline showed nothing. Two that went opposite ways may have swapped, and stay.
function madeRoom(loose: Move[], others: Difference[], caused: Set<Difference>, along: Map<Difference, With>): Move[] {
  const candidates = others.filter((difference) => !caused.has(difference));
  return loose.filter((move) => {
    const by = movedBy(move);
    if (!near(by.x, 0) || loose.some((other) => Math.sign(movedBy(other).y) === -Math.sign(by.y))) return true;
    const cause = causeOf(spanOf([move.now]), { vertical: true, by: by.y, moving: true }, candidates);
    if (cause) addAlong(along, cause, "pushed", [move.now], wayOf(0, by.y));
    return !cause;
  });
}

// Two things that crossed each other in what holds them, moving opposite ways, have swapped places; each move is taken
// against what holds them, when that moved too (a menu that opens higher, its items swapped). Things that all went the
// same way only moved.
function swappedOrMoved(moment: Moment, loose: Move[]): Told[] {
  const told: Told[] = [];
  for (const [holder, moves] of groupBy(loose, (move) => holderOf(moment.now, move.now))) {
    const before = holder && moment.was.get(holder);
    const went = before ? moveOf(before, holder!) : { x: 0, y: 0 };
    const axes = ["x", "y"] as const;
    const opposite = axes.some((axis) => moves.some((move) => movedBy(move)[axis] - went[axis] > NEAR) && moves.some((move) => movedBy(move)[axis] - went[axis] < -NEAR));
    // Two crossed when which came first, along or across, turned round.
    const turned = (p: Move, q: Move) => axes.some((axis) => Math.sign(p.then.page[axis] - q.then.page[axis]) * Math.sign(p.now.page[axis] - q.now.page[axis]) < 0);
    const crossed = moves.some((p) => moves.some((q) => turned(p, q)));
    if (!holder || !before || moves.length < 2 || !opposite || !crossed) {
      for (const move of moves) told.push({ what: "moved", thing: move.now, in: moment.now, words: `${called(move.now)} ${movedWords(moment, move)}` });
      continue;
    }
    const order = [...moves].sort((p, q) => p.now.page.x - q.now.page.x || p.now.page.y - q.now.page.y);
    const words =
      moves.length === 2
        ? `${together(order.map((move) => move.now))} have swapped places`
        : `What's in ${the(holder)} is in a new order: ${order.slice(0, 3).map((move) => called(move.now)).join(", ")}${moves.length > 3 ? "…" : ""}`;
    told.push({ what: "swapped", thing: holder, in: moment.now, words });
  }
  return told;
}

// Things made wider or narrower by the same amount, sharing an edge (a heading and a table beside a new panel), are one
// change: the biggest stands for them, and it belongs to what made them so, beside them.
type Widened = { by: number; top: Pair; cause?: Difference };
function widenedTogether(others: Difference[], caused: Set<Difference>, along: Map<Difference, With>): Widened[] {
  const groups: { by: number; pairs: Pair[] }[] = [];
  for (const difference of others) {
    if (difference.what !== "resized" || caused.has(difference)) continue;
    const by = growthOf(difference.then, difference.now).x;
    if (near(by, 0)) continue;
    const sharesAnEdge = (pair: Pair) => near(pair.now.page.x, difference.now.page.x) || near(right(pair.now), right(difference.now));
    const group = groups.find((group) => near(group.by, by) && group.pairs.some(sharesAnEdge));
    if (group) group.pairs.push(difference);
    else groups.push({ by, pairs: [difference] });
  }
  return groups.map(({ by, pairs }) => {
    const holdersFirst = (p: Pair, q: Pair) => Number(HOLDS.test(q.now.role)) - Number(HOLDS.test(p.now.role)) || area(q.now) - area(p.now);
    const [top, ...more] = [...pairs].sort(holdersFirst) as [Pair, ...Pair[]];
    for (const pair of more) caused.add(pair);
    const candidates = others.filter((d) => !caused.has(d) && !pairs.includes(d as Pair));
    const cause = causeOf(spanOf(pairs.map((pair) => pair.now)), { vertical: false, by, kinds: /^(new|gone)$/, share: 0.8 }, candidates);
    if (cause) {
      addAlong(along, cause, "sized", pairs.map((pair) => pair.now), by > 0 ? "wider" : "narrower");
      caused.add(top);
    } else if (more.length) along.set(top, { ...along.get(top), alike: more.length });
    return { by, top, cause };
  });
}

// What made a layout shift: something that got wider or narrower, moving what's in its column to its edge; else something
// new, gone or resized above it, or beside it on the side it moved away from; else something that moved past it, from
// one side to the other, taking its room along (Spliit's who owes whom, moved below the expenses). With no cause, the
// shift is told by the first thing in it.
function causesOfShifts(moment: Moment, shifts: Shift[], widened: Widened[], others: Difference[], caused: Set<Difference>, along: Map<Difference, With>): Told[] {
  const unexplained: Shift[] = [];
  for (const shift of shifts) {
    const { by, moves } = shift;
    const way = wayOf(by.x, by.y);
    const pushed = moves.map((move) => move.now);
    const column = near(by.y, 0) ? widened.find((group) => movedToItsEdge(group.top, moves, by.x)) : undefined;
    if (column) {
      addAlong(along, column.cause ?? column.top, "pushed", pushed, way);
      continue;
    }
    const vertical = Math.abs(by.y) >= Math.abs(by.x);
    const looking = { vertical, by: vertical ? by.y : by.x, moving: true };
    const candidates = others.filter((d) => !caused.has(d));
    const span = spanOf(pushed);
    // Across, in a row laid out with space between, a small new thing can move its neighbour a long way: the nearest change
    // on the side it moved away from, when nothing beside it is big enough.
    const cause = moment.into(firstOf(moves)) ? undefined : (causeOf(span, looking, candidates) ?? (vertical ? undefined : causeOf(span, { ...looking, share: 0 }, candidates)));
    if (cause) addAlong(along, cause, "pushed", pushed, way);
    else unexplained.push(shift);
  }

  // Of two that went past each other, it's the one with fewer things in it that moved the other: one panel past a list.
  const movedPast = new Map<Shift, Along>();
  const passed = new Set<Shift>();
  for (const shift of [...unexplained].sort((p, q) => q.moves.length - p.moves.length)) {
    const past = unexplained.find((other) => other !== shift && !passed.has(other) && other.moves.length <= shift.moves.length && wentPast(other, shift));
    if (!past) continue;
    const had = movedPast.get(past)?.things ?? [];
    movedPast.set(past, { things: [...had, ...shift.moves.map((move) => move.now)], way: wayOf(shift.by.x, shift.by.y) });
    passed.add(shift);
  }
  return unexplained
    .filter((shift) => !passed.has(shift))
    .map((shift) => {
      const first = firstOf(shift.moves);
      const pushed = movedPast.get(shift);
      // Two alike, each moved where the other was, have swapped places: two rows, called by their words, or else by what
      // each starts with.
      const other = pushed && unexplained.find((one) => passed.has(one) && one.moves.some((move) => pushed.things.includes(move.now)));
      if (other && alikeInSize(shift, other)) {
        const calledBy = (shift: Shift) => shift.moves.find((move) => move.now.role === "text")?.now ?? firstOf(shift.moves).now;
        const both = [calledBy(shift), calledBy(other)].sort((p, q) => p.page.y - q.page.y || p.page.x - q.page.x);
        return { what: "swapped", thing: both[0]!, in: moment.now, words: `${together(both)} have swapped places` };
      }
      // Alike things, each in an item of its own, moved as one: “57%”, “29%” and “14%” moved left.
      const alike = shift.moves.every((move) => move.now.item !== undefined && move.now.role === first.now.role) && new Set(shift.moves.map((move) => move.now.item)).size === shift.moves.length;
      const them = alike ? together([...shift.moves].sort((p, q) => p.now.page.y - q.now.page.y || p.now.page.x - q.now.page.x).map((move) => move.now)) : called(first.now);
      const more = shift.moves.length > 1 && !alike ? `, with ${shift.moves.length - 1} more ${things(shift.moves.length - 1)} around it` : "";
      return { what: "moved", thing: first.now, in: moment.now, words: `${them} ${movedWords(moment, first)}${more}`, ...(pushed && { pushed }) };
    });
}

// Two shifts as many things strong, as far each way, moved past each other as two rows do: a panel moved past a whole
// list, many things against few, isn't a swap.
function alikeInSize(one: Shift, other: Shift): boolean {
  const [few, many] = [one.moves.length, other.moves.length].sort((p, q) => p - q) as [number, number];
  const [less, more] = [Math.hypot(one.by.x, one.by.y), Math.hypot(other.by.x, other.by.y)].sort((p, q) => p - q) as [number, number];
  return few * 2 >= many && less * 2 >= more;
}

const firstOf = (moves: Move[]) => [...moves].sort((p, q) => p.now.page.y - q.now.page.y || p.now.page.x - q.now.page.x)[0]!;

// One shift went past another, from one side of it to the other, along the way the other moved: before them, it's after
// them now, or after them, before.
function wentPast(mover: Shift, moved: Shift): boolean {
  const [was, is] = [spanOf(mover.moves.map((move) => move.then)), spanOf(mover.moves.map((move) => move.now))];
  const [wasThere, isThere] = [spanOf(moved.moves.map((move) => move.then)), spanOf(moved.moves.map((move) => move.now))];
  if (Math.abs(moved.by.y) >= Math.abs(moved.by.x))
    return moved.by.y < 0 ? was.bottom <= wasThere.y + NEAR && is.y >= isThere.bottom - NEAR : was.y >= wasThere.bottom - NEAR && is.bottom <= isThere.y + NEAR;
  return moved.by.x < 0 ? was.right <= wasThere.x + NEAR && is.x >= isThere.right - NEAR : was.x >= wasThere.right - NEAR && is.right <= isThere.x + NEAR;
}

// Things moved left or right as far as an edge of something that got wider or narrower, and in its column: it moved them.
function movedToItsEdge({ then: was, now: is }: Pair, moves: Move[], by: number): boolean {
  const span = spanOf(moves.map((move) => move.then));
  const inItsColumn = span.x >= was.page.x - 8 && span.right <= right(was) + 8;
  return inItsColumn && (near(by, is.page.x - was.page.x) || near(by, right(is) - right(was)));
}

// The nearest of the candidates that could have moved what's in the span: above it for a move up or down; beside it on
// the same rows for left or right, and big enough to explain it, as wide as a share of the move, or grown or shrunk by
// that much. When what's looked for moved, what's new or grew pushed it away, and what's gone or shrank let it come closer.
type Span = { x: number; y: number; right: number; bottom: number };
type Looking = { vertical: boolean; by: number; kinds?: RegExp; share?: number; moving?: boolean };
function causeOf(span: Span, { vertical, by, kinds = /^(new|gone|resized|reworded)$/, share = 0.5, moving = false }: Looking, candidates: Difference[]): Difference | undefined {
  const wide = (d: Difference) => (d.what === "new" || d.what === "gone" ? thingOf(d).box.width : isPair(d) ? Math.abs(growthOf(d.then, d.now).x) : 0);
  // Up or down, only what took room or gave it moves things: new or taller pushes them down, gone or shorter lets them up.
  const tall = (d: Difference) => (d.what === "new" || d.what === "gone" ? thingOf(d).box.height : isPair(d) ? Math.abs(growthOf(d.then, d.now).y) : 0);
  const down = (d: Difference) => d.what === "new" || (isPair(d) && growthOf(d.then, d.now).y > 0);
  const above = (d: Difference) => {
    const thing = thingOf(d);
    return (d.what === "gone" ? thing.page.y : bottom(thing)) <= span.y + NEAR && thing.page.x < span.right && right(thing) > span.x;
  };
  const beside = (d: Difference) => {
    const thing = thingOf(d);
    const left = right(thing) <= span.x + NEAR;
    const onTheRight = thing.page.x >= span.right - NEAR;
    const pushes = d.what === "new" || (isPair(d) && growthOf(d.then, d.now).x > 0);
    const side = moving ? ((by > 0) === pushes ? left : onTheRight) : left || onTheRight;
    return thing.page.y < span.bottom && bottom(thing) > span.y && side;
  };
  const offCentre = (thing: Thing) => Math.abs(thing.page.x + thing.box.width / 2 - (span.x + span.right) / 2);
  return candidates
    .filter((d) => kinds.test(d.what) && (vertical ? tall(d) > NEAR && (!moving || by > 0 === down(d)) : wide(d) >= Math.abs(by) * share))
    .filter((d) => (vertical ? above(d) : beside(d)))
    .sort((p, q) => (vertical ? thingOf(q).page.y - thingOf(p).page.y : offCentre(thingOf(p)) - offCentre(thingOf(q))))[0];
}

// A change of its own, in words, with what came with it.
function tell(moment: Moment, difference: Difference, along: With = {}): Told {
  const { now } = moment;
  switch (difference.what) {
    case "new":
      return { what: "new", thing: difference.now, in: now, words: `${called(difference.now)} is new`, ...along };
    case "gone":
      return { what: "gone", thing: difference.then, in: moment.then, words: `${called(difference.then)} is gone`, ...along };
    case "became":
      return { what: "became", thing: difference.now, in: now, words: `${called(difference.then)} is ${a(word(difference.now))} now`, ...along };
    case "reworded":
      return { what: "reworded", thing: difference.now, in: now, words: rewordedWords(difference.then, difference.now), reworded: rewordedPart(difference.then.words, difference.now.words), ...along };
    case "looks different": {
      const size = sizeWords(moment, difference);
      const words = `${called(difference.now)} looks different: ${lookWords(difference.then, difference.now)}${size ? `, and ${size}` : ""}`;
      return { what: "looks different", thing: difference.now, in: now, words, ...along };
    }
    default:
      return { what: difference.what, thing: difference.now, in: now, words: `${called(difference.now)} ${sizeWords(moment, difference)}`, ...along };
  }
}

function movedWords(moment: Moment, move: Pair): string {
  const holder = moment.into(move);
  return holder ? `moved into ${the(holder)}` : `moved ${wayOf(movedBy(move).x, movedBy(move).y)}`;
}

// “Is wider and taller”, then where it went when both its edges went the same way; by under 10px, “a little”. Moved into
// something, its size is what it takes there, and where it went only follows what holds it.
function sizeWords(moment: Moment, pair: Pair): string {
  const { then: a, now: b } = pair;
  const holder = moment.into(pair);
  if (holder) return `moved into ${the(holder)}`;
  const little = (from: number, to: number) => (Math.abs(to - from) < 10 ? "a little " : "");
  const change = (from: number, to: number, more: string, less: string) => (near(from, to) ? "" : `${little(from, to)}${to > from ? more : less}`);
  const sizes = [change(a.box.width, b.box.width, "wider", "narrower"), change(a.box.height, b.box.height, "taller", "shorter")].filter(Boolean);
  const edges = (start: number, size: number, from: number, was: number) => {
    const [first, last] = [start - from, start + size - from - was];
    return first > NEAR && last > NEAR ? 1 : first < -NEAR && last < -NEAR ? -1 : 0;
  };
  const across = edges(b.page.x, b.box.width, a.page.x, a.box.width);
  const down = edges(b.page.y, b.box.height, a.page.y, a.box.height);
  const went = (across || down) && !moment.movedAlong(a, b) ? `moved ${wayOf(across, down)}` : "";
  return [sizes.length ? `is ${sizes.join(" and ")}` : "", went].filter(Boolean).join(", and ");
}

// Each change in full: what changes by itself left out, each item's told as one, alike things changed alike told once,
// what changed inside one table or list counted when there's a lot, and each with its id and where it is.
function said(told: Told[], moment: Moment, unsteady: Set<string>): Found[] {
  const { now, was, isNow } = moment;
  const id = (told: Told) => idOf(told.key ?? identityOf(told, moment), told.what);
  const piecesOf = (told: Told) => told.pieces ?? [id(told)];
  // Top to bottom, as the page reads.
  const steady = told.filter((one) => !unsteady.has(id(one)));
  const byId = groupBy(
    asItems(steady, moment, id).sort((p, q) => p.thing.page.y - q.thing.page.y || p.thing.page.x - q.thing.page.x),
    id,
  );

  // What changed inside one table or list is told change by change, up to five; past that it's one change to it, counted:
  // a table that now shows other invoices. A dialog or a panel holds things judged on their own, so each is told: Kan's
  // open card, its field shorter, its comment new and its error gone, isn't one change.
  const inside = groupBy([...byId.values()], ([told]) => {
    const holder = holderOf(told!.in, told!.thing);
    const holderNow = holder && (told!.in === now ? holder : isNow.get(holder));
    return holderNow && TABLES.test(holderNow.role) && was.has(holderNow) ? holderNow : undefined;
  });
  const found: Found[] = [];
  for (const [holder, all] of inside) {
    if (!holder || all.length <= MOST_INSIDE) {
      for (const alike of all) found.push({ id: id(alike[0]!), words: alikeWords(alike), ...placeOf(alike[0]!, now), ...alikeOf(alike, now), pieces: alike.flatMap(piecesOf), ...(alike[0]!.reworded && { reworded: alike[0]!.reworded }), ...(alike[0]!.in !== now && { gone: true as const }), ...offScreen(alike), top: topOf(alike[0]!, now) });
      continue;
    }
    // Counted, not listed: Compare shows what they are better than their names can.
    const count = all.flat().length;
    const words =
      all.flat().every((told) => told.what === "resized" || told.what === "moved")
        ? `Columns in ${the(holder)} changed width`
        : `${called(holder)}: ${count} ${things(count)} changed inside`;
    const changed: Told = { what: "changed inside", thing: holder, in: now, words };
    found.push({ id: id(changed), words: sentence(words), ...placeOf(changed, now), pieces: all.flat().flatMap(piecesOf), ...offScreen(all.flat()), top: topOf(changed, now) });
  }
  return found;
}

// How far down the screen it is, as a share of it, so a moment's changes are told as the screen reads, top to bottom.
// What's gone isn't on it, and comes after.
const topOf = (told: Told, now: Reading) => (told.in === now ? told.thing.box.y / now.screen.height : 2);

// Whether none of what it's on is on the screen at this moment: on a long page, the page has it before the recording
// shows it.
const offScreen = (told: Told[]): { offScreen?: true } => (told.some((one) => onScreen(one.thing.box, one.in.screen)) ? {} : { offScreen: true });

// What a thing in an item is, whichever item it's in: its place there, its column and which of the things of its kind in
// it, in which kind of item of which list, for words reworded, how they changed, and for a move, which way. Never its
// words, which in an item are its data, so the same change in every row is one change: “(paid)” after each customer's
// name; and never two moves the opposite way. Anything else is what it is (differences.ts).
function identityOf({ in: reading, thing, what }: Told, moment: Moment): string {
  const item = thing.item === undefined ? undefined : reading.items?.[thing.item];
  if (!item) return identity(reading, thing);
  const kind = reading.things.filter((other) => other.item === thing.item && other.role === thing.role && other.column === thing.column);
  const place = `${thing.role} ${kind.indexOf(thing) + 1}${thing.column ? ` under ${thing.column}` : ""}`;
  const was = /^(reworded|moved)$/.test(what) ? moment.was.get(thing) : undefined;
  const went = was && what === "moved" && moveOf(was, thing);
  const how = went ? `, ${wayOf(near(went.x, 0) ? 0 : went.x, near(went.y, 0) ? 0 : went.y)}` : was ? `: ${shapeOf(was.words, thing.words)}` : "";
  return `${place} in a ${item.role} of ${listOf(reading, item)}${how}`;
}
const listOf = (reading: Reading, item: Item) => (item.holder === undefined ? "the page" : identity(reading, reading.things[item.holder]!, 0));

// Items, rows or a list's items, paired across the two readings: by what's the same in both inside them, most first;
// then, in lists side by side, those left in order, when there are as many of each. Words only in the same place say
// nothing of which item is which.
function pairItems({ then, now, was }: Moment): Map<number, number> {
  const [before, after] = [then.items ?? [], now.items ?? []];
  const pairs = new Map<number, number>(); // each item then, and the one it is now
  const taken = new Set<number>();
  const votes = new Map<string, number>();
  for (const [b, a] of was) if (a.item !== undefined && b.item !== undefined && a.name === b.name && a.words === b.words) votes.set(`${a.item} ${b.item}`, (votes.get(`${a.item} ${b.item}`) ?? 0) + 1);
  for (const [pair] of [...votes].sort((p, q) => q[1] - p[1])) {
    const [a, b] = pair.split(" ").map(Number) as [number, number];
    if (pairs.has(a) || taken.has(b)) continue;
    pairs.set(a, b);
    taken.add(b);
  }
  const lists = new Map<number, number>();
  for (const [a, b] of pairs) if (!lists.has(before[a]!.list)) lists.set(before[a]!.list, after[b]!.list);
  const left = (items: Item[], used: Set<number>) => [...new Set(items.map((item) => item.list))].filter((list) => !used.has(list));
  const listsNow = left(after, new Set(lists.values()));
  left(before, new Set(lists.keys())).forEach((list, i) => listsNow[i] !== undefined && lists.set(list, listsNow[i]!));
  for (const [listThen, listNow] of lists) {
    const a = before.flatMap((item, i) => (item.list === listThen && !pairs.has(i) ? [i] : []));
    const b = after.flatMap((item, i) => (item.list === listNow && !taken.has(i) ? [i] : []));
    if (a.length === b.length) a.forEach((i, k) => (pairs.set(i, b[k]!), taken.add(b[k]!)));
  }
  return pairs;
}

// What came, went or was reworded in one item is one change to it: the item new or gone, or the words it says now, where
// more than one piece of them changed. How something in it looks, or where it is, is told on its own.
function asItems(told: Told[], moment: Moment, id: (told: Told) => string): Told[] {
  const { then, now } = moment;
  const items = pairItems(moment);
  const was = new Map([...items].map(([a, b]) => [b, a]));
  const itemOf = (one: Told) => {
    if (one.thing.item === undefined || !/^(new|gone|reworded|became)$/.test(one.what)) return undefined;
    if (one.in === now) return `now ${one.thing.item}`;
    const paired = items.get(one.thing.item);
    return paired === undefined ? `then ${one.thing.item}` : `now ${paired}`;
  };
  const out: Told[] = [];
  for (const [key, all] of groupBy(told, itemOf)) {
    if (!key || all.length < 2) {
      out.push(...all);
      continue;
    }
    const [side, at] = key.split(" ") as [string, string];
    const [reading, index] = [side === "then" ? then : now, Number(at)];
    const item = reading.items![index]!;
    const thing = asThing(item, index);
    const pieces = all.flatMap((one) => one.pieces ?? [id(one)]);
    const along = all.find((one) => one.pushed || one.sized);
    const whole = { thing, in: reading, pieces, ...(along?.pushed && { pushed: along.pushed }), ...(along?.sized && { sized: along.sized }) };
    // A whole item new or gone, alike with any other in its list.
    if (side === "then" || (!was.has(index) && all.every((one) => one.what === "new"))) {
      const what = side === "then" ? "gone" : "new";
      out.push({ ...whole, what, words: `${called(thing)} is ${what}`, key: `${item.role} of ${listOf(reading, item)}` });
      continue;
    }
    const before = was.has(index) ? then.items![was.get(index)!] : undefined;
    const words = all.filter((one) => one.thing.role === "text");
    if (!before || before.words === item.words || words.length < 2) {
      out.push(...all);
      continue;
    }
    const reworded = rewordedWords(asThing(before, was.get(index)!, "text"), asThing(item, index, "text"));
    out.push(
      { ...whole, what: "reworded", words: reworded, reworded: rewordedPart(before.words, item.words), pieces: words.flatMap((one) => one.pieces ?? [id(one)]), key: `${item.role} of ${listOf(now, item)}: ${shapeOf(before.words, item.words)}` },
      ...all.filter((one) => one.thing.role !== "text"),
    );
  }
  return out;
}

// An item as a thing, to be called and placed: by its words, past an avatar's initial (“M Maya” is “Maya”) and an icon's
// symbol (a ⋯ button).
function asThing(item: Item, index: number, role: string = item.role): Thing {
  const name = item.words.replace(/^(\p{Lu})\s+(?=\1)/u, "").split(" ").filter((word) => /[\p{L}\p{N}]/u.test(word)).join(" ");
  const look = { color: "", background: "", size: "", weight: "", border: "" };
  return { role, name: name.slice(0, 120), words: role === "text" ? item.words : name, box: item.box, page: item.page, look, item: index, ...(item.holder !== undefined && { holder: item.holder }), ...(item.node !== undefined && { node: item.node }) };
}

// How words changed, whichever item they're in: the part that differs, each word with a number in it as “…”, as it's
// data. “Apples -- 12 votes” to “Apples 57% 12 votes” and “Red -- 5 votes” to “Red 50% 5 votes” are both “-- → …”, and
// an email made new each run is “… → …” every run.
function shapeOf(then: string, now: string): string {
  const [a, b] = [then.split(" "), now.split(" ")];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a.at(-1 - end) === b.at(-1 - end)) end++;
  const part = (words: string[]) => words.slice(start, words.length - end).map((word) => (/\d/.test(word) ? "…" : word)).join(" ");
  return `${part(a)} → ${part(b)}`;
}

// Alike things changed alike, said once: “Delete button looks different: border, in 30 places”, or by their names when
// they differ, “Actions for INV-1043, INV-1050 and INV-1057 are new”.
function alikeWords(alike: Told[]): string {
  const [first] = alike as [Told];
  // One thing pushed along is named, “and moved the table down”; more are counted.
  const them = (along: Along) => (along.things.length === 1 ? the(along.things[0]!) : `${along.things.length} things`);
  const along = [
    first.pushed ? `, and moved ${them(first.pushed)} ${first.pushed.way}` : "",
    first.sized ? `, and made ${them(first.sized)} ${first.sized.way}` : "",
    first.alike ? `, and so ${first.alike > 1 ? `are ${first.alike} more things` : "is 1 more thing"}` : "",
  ].join("");
  const names = [...new Set(alike.map((told) => told.thing.name))];
  if (alike.length === 1) return sentence(first.words + along);
  if (names.length > 1 && /^(new|gone|looks different)$/.test(first.what) && WORD[first.thing.role]) {
    const verb = first.what === "new" ? "are new" : first.what === "gone" ? "are gone" : `look different${first.words.slice(first.words.indexOf(":"))}`;
    const all = alike.map((told) => told.thing);
    const them = symbolOnly(first.thing) ? together(all) : `${together(all, (thing) => thing.name)} ${plural(WORD[first.thing.role]!)}`;
    return sentence(`${them} ${verb}${along}`);
  }
  // Things called by their words, new or gone: “96”, “2”, “2” and 18 more are new.
  if (names.length > 1 && /^(new|gone)$/.test(first.what) && !WORD[first.thing.role]) return sentence(`${together(alike.map((told) => told.thing))} are ${first.what}${along}`);
  // Called differently only by their data, they're called by what they share: “$…” looks different, in 5 places. Things
  // that are only their data, a count, share nothing to say, and are called by the first: “2” is new, in 3 places.
  const name = called(first.thing);
  const bare = dataLeftOut(name);
  const shared = new Set(alike.map((told) => called(told.thing))).size > 1 && first.words.startsWith(name) && /[^“”…\s]/.test(bare) ? bare + first.words.slice(name.length) : first.words;
  return sentence(`${shared}${along}, in ${alike.length} places`);
}

// Its id: the thing and what happened to it, as letters that don't read alike, like every id in a review.
export function idOf(thing: string, what: string): string {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(createHash("sha256").update(`${thing}|${what}`).digest().subarray(0, 8), (byte) => letters[byte % 32]).join("");
}

// Where it is: an element of the newer round, by its role and name, or where something gone was, as shares of the screen.
function placeOf(told: Told, now: Reading): { element: Element } | { box: Box } | {} {
  const { thing } = told;
  if (told.in === now && thing.name) return { element: elementOf(thing) };
  const box = onScreen(thing.box, told.in.screen);
  return box ? { box } : {};
}

// Where the others changed alike with the first are, those still on the newer round.
function alikeOf([first, ...others]: Told[], now: Reading): { alike?: Element[] } {
  const alike = others.filter((told) => told.in === now && told.thing.name).map((told) => elementOf(told.thing));
  return first!.in === now && first!.thing.name && alike.length ? { alike } : {};
}

const elementOf = (thing: Thing): Element => ({ role: thing.role, name: thing.name, ...(thing.node !== undefined && { node: thing.node }) });

// The part of a box in pixels that's on the screen, as shares of it.
export function onScreen(box: Thing["box"], screen: Reading["screen"]): Box | undefined {
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  const right = Math.min(screen.width, box.x + box.width), bottom = Math.min(screen.height, box.y + box.height);
  if (right <= x || bottom <= y) return undefined;
  return { x: x / screen.width, y: y / screen.height, width: (right - x) / screen.width, height: (bottom - y) / screen.height };
}

function addAlong(along: Map<Difference, With>, difference: Difference, how: "pushed" | "sized", moved: Thing[], way: string) {
  const had = along.get(difference) ?? {};
  along.set(difference, { ...had, [how]: { things: [...(had[how]?.things ?? []), ...moved], way } });
}

const isPair = (difference: Difference): difference is Pair => "then" in difference && "now" in difference;
const isMove = (difference: Difference): difference is Move => difference.what === "moved";
const thingOf = (difference: Difference) => (difference.what === "gone" ? difference.then : difference.now);
const moveOf = (a: Thing, b: Thing) => ({ x: b.page.x - a.page.x, y: b.page.y - a.page.y });
const growthOf = (a: Thing, b: Thing) => ({ x: b.box.width - a.box.width, y: b.box.height - a.box.height });
const movedBy = (difference: Difference) => (isPair(difference) ? moveOf(difference.then, difference.now) : { x: 0, y: 0 });
const sameSize = (a: Thing, b: Thing) => near(a.box.width, b.box.width) && near(a.box.height, b.box.height);
const right = (thing: Thing) => thing.page.x + thing.box.width;
const bottom = (thing: Thing) => thing.page.y + thing.box.height;
const area = (thing: Thing) => thing.box.width * thing.box.height;
const spanOf = (all: Thing[]): Span => ({
  x: Math.min(...all.map((thing) => thing.page.x)),
  y: Math.min(...all.map((thing) => thing.page.y)),
  right: Math.max(...all.map(right)),
  bottom: Math.max(...all.map(bottom)),
});
const isIn = (reading: Reading, thing: Thing, holder: Thing) => {
  for (let around = parentOf(reading, thing); around; around = parentOf(reading, around)) if (around === holder) return true;
  return false;
};

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}
