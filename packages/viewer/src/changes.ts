// What's new to you on a round, as the timeline and a change's card show it: a diamond at each moment something
// changed in a flow, several changes at one moment being one diamond, and steps a flow takes that it couldn't before as
// one, over the stretch they take. A change the agent made for a note in the same flow is that note's answer, told with
// the note rather than on its own; made for a note in another flow, it's a change like any other, which says so.

import { allNotes, newToYou, time, type Change, type Place, type Review } from "@mostlyworks/vantage-review";
import type { Moment } from "./moments.ts";

// A change as it's told: where, the round it's new since, the agent's line on why and which agent said it, or the note
// it was made for.
export type Changed = { change: Change; on: Place; since: number; line?: string; by?: string; note?: string; answers: boolean };
// `row` says it has something to tell of its own, beside the notes' answers it holds.
export type Diamond = { id: string; flow: string; at: number; until?: number; changes: Changed[]; name: string; row: boolean };

// Changes this close together are at one moment, drawn as one diamond.
const TOGETHER = 0.05;
// Past its moment, a change is still the one you're on until the next click, and for this long at most.
const STAYS = 1.5;

export function diamondsOn(review: Review, round: number, you: string): Diamond[] {
  const flows = review.rounds.find((kept) => kept.number === round)?.flows.map((flow) => flow.name) ?? [];
  const notes = allNotes(review);
  const diamonds: Omit<Diamond, "name" | "row">[] = [];
  for (const { change, on, since } of newToYou(review, round, you)) {
    if (on.at === undefined || !flows.includes(on.flow)) continue;
    // What the agent last said about it, on this round or before.
    const said = review.rounds.findLast((kept) => kept.number <= round && kept.accounts[change.id]);
    const account = said?.accounts[change.id];
    const note = account && "note" in account ? account.note : undefined;
    const line = account && "line" in account ? account.line : undefined;
    const told: Changed = { change, on, since, line, by: said?.by, note, answers: !!note && notes.get(note)?.note.on?.flow === on.flow };
    const together = on.until === undefined && diamonds.find((diamond) => diamond.flow === on.flow && diamond.until === undefined && Math.abs(diamond.at - on.at!) < TOGETHER);
    if (together) together.changes.push(told);
    else diamonds.push({ id: change.id, flow: on.flow, at: on.at, until: on.until, changes: [told] });
  }
  return diamonds.map((diamond) => {
    const own = diamond.changes.filter((changed) => !changed.answers);
    return { ...diamond, name: nameOf((own.length ? own : diamond.changes).map(({ change }) => change)), row: own.length > 0 };
  });
}

// A diamond with several changes is named by its first, and how many more.
function nameOf(changes: Change[]): string {
  return changes.length > 1 ? `${changes[0]!.words} and ${changes.length - 1} more` : changes[0]!.words;
}

// What the agent changed for a note, in the note's own flow.
export const answersTo = (diamonds: Diamond[], note: string): Changed[] => diamonds.flatMap((diamond) => diamond.changes.filter((changed) => changed.answers && changed.note === note));

// Your note on what changed, at its moment, on what it's on, or on the first of new steps, on nothing in particular: it
// grows out of the change's row, so the change and what you said about it are one row, one card and one mark.
export function grownFrom(diamonds: Diamond[], on: Place | undefined): Diamond | undefined {
  if (on?.at === undefined) return undefined;
  const near = (a: number, b?: number) => b !== undefined && Math.abs(a - b) < TOGETHER;
  return diamonds.find(
    (diamond) =>
      diamond.row &&
      diamond.flow === on.flow &&
      near(diamond.at, on.at) &&
      (diamond.until !== undefined
        ? !on.element && !on.box && !on.point
        : diamond.changes.some(({ on: there }) => (there.element?.node !== undefined && there.element.node === on.element?.node) || (!!there.box && JSON.stringify(there.box) === JSON.stringify(on.box)))),
  );
}

export const when = (diamond: { at: number; until?: number }) => (diamond.until === undefined ? time(diamond.at) : `${time(diamond.at)}–${time(diamond.until)}`);

// The change you're on: at its moment or just past it, while what it shows is still there, until the next click and
// for a moment and a half at most, the latest of them; else the new steps you're in.
export function diamondAt(diamonds: Diamond[], moment: Moment, clicks: number[]): Diamond | undefined {
  const here = diamonds.filter((diamond) => diamond.flow === moment.flow);
  const reached = (diamond: Diamond) => moment.at >= diamond.at - 0.001;
  const on = here.filter((diamond) => diamond.until === undefined && reached(diamond) && moment.at < Math.min(diamond.at + STAYS, clicks.find((click) => click > diamond.at + 0.001) ?? Infinity));
  return on.at(-1) ?? here.find((diamond) => diamond.until !== undefined && reached(diamond) && moment.at <= diamond.until);
}
