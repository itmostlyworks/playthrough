// What's new to you on a round, as the timeline and a change's card show it: a diamond at each moment something
// changed in a scene, several changes at one moment being one diamond, and steps a scene takes that it couldn't before as
// one, over the stretch they take. A change the agent made for a note on a moment in the same scene is that note's answer,
// told with the note rather than on its own; made for a note on the whole scene, which is answered at its end, or in
// another scene, it's a change like any other, met where it happened, which says so.

import { allNotes, newToYou, time, type Change, type Place, type Review } from "@playthrough/review";
import type { Moment } from "./moments.ts";

// A change as it's told: where, the round it's new since, the agent's line on why and which agent said it, or the note
// it was made for.
export type Changed = { change: Change; on: Place; since: number; line?: string; by?: string; note?: string; answers: boolean };
// `row` says it has something to tell of its own, beside the notes' answers it holds.
export type Diamond = { id: string; scene: string; at: number; until?: number; changes: Changed[]; name: string; row: boolean };

// Changes this close together are at one moment, drawn as one diamond.
const TOGETHER = 0.05;
// Past its moment, a change is still the one you're on until the next click, and for this long at most.
const STAYS = 1.5;

export function diamondsOn(review: Review, round: number, you: string): Diamond[] {
  const scenes = review.rounds.find((kept) => kept.number === round)?.scenes.map((scene) => scene.name) ?? [];
  const notes = allNotes(review);
  // What the agent last said about a change, on this round or before.
  const saidOn = (id: string) => review.rounds.findLast((kept) => kept.number <= round && kept.accounts[id]);
  // A change made for a note is met in each scene it's seen in: in the note's, with it, and in any other, saying whose it
  // is. Any other change is met once.
  const met = newToYou(review, round, you).flatMap((shown) => {
    const account = saidOn(shown.change.id)?.accounts[shown.change.id];
    if (!account || !("note" in account)) return [shown];
    const first = (scene: string) => shown.change.seen.filter((seen) => seen.scene === scene).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0];
    const elsewhere = scenes.filter((scene) => scene !== shown.on.scene).flatMap((scene) => first(scene) ?? []);
    return [shown, ...elsewhere.map((on) => ({ ...shown, on }))];
  });
  // Several at one moment, in the order their comparison found them, down the page: the first is where its pin goes.
  const found = ({ change, since }: (typeof met)[number]) => review.comparisons.find((kept) => kept.round === round && kept.since === since)?.changes.findIndex((one) => one.id === change.id) ?? 0;
  met.sort((a, b) => scenes.indexOf(a.on.scene) - scenes.indexOf(b.on.scene) || (a.on.at ?? 0) - (b.on.at ?? 0) || found(a) - found(b));
  const diamonds: Omit<Diamond, "name" | "row">[] = [];
  for (const { change, on, since } of met) {
    if (on.at === undefined || !scenes.includes(on.scene)) continue;
    const said = saidOn(change.id);
    const account = said?.accounts[change.id];
    const note = account && "note" in account ? account.note : undefined;
    const line = account && "line" in account ? account.line : undefined;
    const asked = note === undefined ? undefined : notes.get(note)?.note.on;
    const told: Changed = { change, on, since, line, by: said?.by, note, answers: asked?.scene === on.scene && asked.at !== undefined };
    const together = on.until === undefined && diamonds.find((diamond) => diamond.scene === on.scene && diamond.until === undefined && Math.abs(diamond.at - on.at!) < TOGETHER);
    if (together) together.changes.push(told);
    else diamonds.push({ id: diamonds.some((diamond) => diamond.id === change.id) ? `${change.id} ${on.scene}` : change.id, scene: on.scene, at: on.at, until: on.until, changes: [told] });
  }
  return diamonds.map((diamond) => {
    const own = diamond.changes.filter((changed) => !changed.answers);
    return { ...diamond, name: nameOf(own.length ? own : diamond.changes), row: own.length > 0 };
  });
}

// A diamond is named as its card says it: by the agent's line, or with several, how many changed. What changed isn't put
// in words: the recording marks it.
function nameOf(changes: Changed[]): string {
  const lines = new Set(changes.map((changed) => changed.line ?? changed.change.id));
  return lines.size > 1 ? `${changes.length} changes` : (changes[0]!.line ?? "Changed here");
}

// What the agent changed for a note, in the note's own scene.
export const answersTo = (diamonds: Diamond[], note: string): Changed[] => diamonds.flatMap((diamond) => diamond.changes.filter((changed) => changed.answers && changed.note === note));
// The moments the agent changed something for a note.
export const madeFor = (diamonds: Diamond[], note: string): Diamond[] => diamonds.filter((diamond) => diamond.changes.some((changed) => changed.note === note));

// Your note on what changed, at its moment, on what it's on, or on the first of new steps, on nothing in particular: it
// grows out of the change's row, so the change and what you said about it are one row, one card and one mark.
export function grownFrom(diamonds: Diamond[], on: Place | undefined): Diamond | undefined {
  if (on?.at === undefined) return undefined;
  const near = (a: number, b?: number) => b !== undefined && Math.abs(a - b) < TOGETHER;
  return diamonds.find(
    (diamond) =>
      diamond.row &&
      diamond.scene === on.scene &&
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
  const here = diamonds.filter((diamond) => diamond.scene === moment.scene);
  const reached = (diamond: Diamond) => moment.at >= diamond.at - 0.001;
  const on = here.filter((diamond) => diamond.until === undefined && reached(diamond) && moment.at < Math.min(diamond.at + STAYS, clicks.find((click) => click > diamond.at + 0.001) ?? Infinity));
  return on.at(-1) ?? here.find((diamond) => diamond.until !== undefined && reached(diamond) && moment.at <= diamond.until);
}
