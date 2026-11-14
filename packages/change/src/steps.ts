// Each hand-back is its own recording of a moment, so two are played together, and a moment stepped into, through what
// each did there.

import type { Moment } from "./model.ts";

// The times two recordings of a moment pass together, in order, each in its own recording's time. Each recording is
// what it did, in order: where it starts being shown, each thing done, and the end. The two are lined up on the longest
// run of these both did, in order: a thing done by what it was, so when one clicks Update the other does, and one typing
// in a field starts and stops as the other does, whatever words each types. Between two they share, each goes at its own
// pace, scaled to arrive together. What only one did plays there while the other holds just before what they share next,
// so one waits while the other opens a menu it didn't have, then both go on together.
export function together(one: Moment, other: Moment): [number[], number[]] {
  const mine = [0];
  const theirs = [0];
  const pair = (a: number, b: number) => {
    const [last, lastOther] = [mine.at(-1)!, theirs.at(-1)!];
    if (a >= last && b >= lastOther && (a > last || b > lastOther)) mine.push(a), theirs.push(b);
  };
  for (const [ours, others] of shared(doneIn(one), doneIn(other))) {
    pair(ours.from, others.from);
    pair(ours.to, others.to);
    pair(ours.next, others.next);
  }
  return [mine, theirs];
}

// Something a recording did: what it was, as the other recording knows it, from when it began until it was done, and
// when what it did next began.
type Done = { is: string; from: number; to: number; next: number };

// What a recording did, in order. A thing done kept without what it was, as recordings made before Playthrough kept that,
// is known only by its place among them: the second of four is the second of four on the other side, and nothing where
// the other side did another number of them.
function doneIn(moment: Moment): Done[] {
  const { actions } = moment;
  const done = [
    { is: "shown", from: moment.from, to: moment.from },
    ...actions.map((action, i) => ({ is: action.what ?? `action ${i + 1} of ${actions.length}`, from: Math.min(action.began ?? action.at, action.at), to: action.at })),
  ].sort((a, b) => a.from - b.from);
  done.push({ is: "end", from: moment.length, to: moment.length });
  return done.map((one, i) => ({ ...one, next: done[i + 1]?.from ?? moment.length }));
}

// The longest run of things both did, in the order both did them, as pairs.
function shared(ours: Done[], others: Done[]): [Done, Done][] {
  const longest = ours.map(() => others.map(() => 0));
  const after = (i: number, k: number) => longest[i]?.[k] ?? 0;
  for (let i = ours.length - 1; i >= 0; i--)
    for (let k = others.length - 1; k >= 0; k--) longest[i]![k] = ours[i]!.is === others[k]!.is ? 1 + after(i + 1, k + 1) : Math.max(after(i + 1, k), after(i, k + 1));
  const pairs: [Done, Done][] = [];
  for (let i = 0, k = 0; i < ours.length && k < others.length; )
    if (ours[i]!.is === others[k]!.is) pairs.push([ours[i++]!, others[k++]!]);
    else if (after(i + 1, k) >= after(i, k + 1)) i++;
    else k++;
  return pairs;
}

// Where a moment is stepped into, as its recording is at a moment: after so many of the things it shows done, as the
// page rests after each; at its end, everything done and checked, nothing. The way there comes before them, done
// whole, and the run never stops on a page with nothing loaded yet: it goes on to the first thing that loads one
// (test.ts).
export function doneAt(moment: Moment, at: number): number | undefined {
  const shown = actionsOf(moment).filter((action) => action >= moment.from);
  const done = shown.filter((action) => action <= at).length;
  return done === shown.length ? undefined : done;
}

// The things done on the way there that the run counts with what's shown, as a file kept before moments had a start does
// its way inside the moment's step.
export const doneBefore = (moment: Moment) => actionsOf(moment).filter((action) => action < moment.from).length;

const actionsOf = (moment: Moment) => moment.actions.map((action) => action.at);
