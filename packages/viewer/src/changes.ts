// What's new to you on a round, as the timeline and the column show it: a diamond at each moment something changed in
// a flow, several changes at one moment being one diamond, and steps a flow takes that it couldn't before as one band
// over the stretch they take. A change says nothing about where the work stands, so it's never amber, slate or green.

import { newToYou, time, type Change, type Place, type Review } from "@vantage/review";
import type { Moment } from "./moments.ts";

export type Diamond = { id: string; flow: string; at: number; until?: number; changes: { change: Change; on: Place }[]; name: string };

// Changes this close together are at one moment, drawn as one diamond.
const TOGETHER = 0.05;
// Past its moment, a change is still the one you're on until the next click, and for this long at most.
const STAYS = 1.5;

export function diamondsOn(review: Review, round: number, you: string): Diamond[] {
  const flows = review.rounds.find((kept) => kept.number === round)?.flows.map((flow) => flow.name) ?? [];
  const diamonds: Omit<Diamond, "name">[] = [];
  for (const { change, on } of newToYou(review, round, you)) {
    if (on.at === undefined || !flows.includes(on.flow)) continue;
    const together = on.until === undefined && diamonds.find((diamond) => diamond.flow === on.flow && diamond.until === undefined && Math.abs(diamond.at - on.at!) < TOGETHER);
    if (together) together.changes.push({ change, on });
    else diamonds.push({ id: change.id, flow: on.flow, at: on.at, until: on.until, changes: [{ change, on }] });
  }
  return diamonds.map((diamond) => ({ ...diamond, name: nameOf(diamond.changes.map(({ change }) => change)) }));
}

// A diamond with several changes is named by its first, and how many more.
function nameOf(changes: Change[]): string {
  return changes.length > 1 ? `${changes[0]!.words} and ${changes.length - 1} more` : changes[0]!.words;
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
