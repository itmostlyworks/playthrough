// Stepping through a moment a frame at a time, as `,` and `.` do: on to the next instant its screen changed, or back to
// the one before, resting there; and where what changed is still moving with nothing else changing, as a fade, a frame of
// that motion at a time. Where the screen changed is read from the recording alone; how long the page goes on moving
// after, only the page can say, so it's asked.

import { EventType, IncrementalSource, MouseInteractions, type eventWithTime } from "rrweb";

// One frame, in seconds: the recording's browser drew sixty a second, so what changed within one is seen together.
export const FRAME = 1 / 60;

// What the page does that changes the screen: what it holds or says, a scroll, words typed, its styles, a canvas drawn.
const CHANGING = new Set<number>([
  IncrementalSource.Mutation,
  IncrementalSource.Scroll,
  IncrementalSource.Input,
  IncrementalSource.StyleSheetRule,
  IncrementalSource.CanvasMutation,
  IncrementalSource.StyleDeclaration,
  IncrementalSource.AdoptedStyleSheet,
]);
// What Playthrough draws over it as it was kept: the text cursor, a dropdown's list, a dialog.
const DRAWN = new Set(["caret", "choice", "chose", "dialog", "dialog answered"]);
// Taking a picture, the recording's browser hides each field's text cursor and puts it back, which shows nothing.
const HIDES_CARET = "caret-color: transparent !important;";

// The instants a recording's screen changed, in seconds from its start, each the first frame drawn after it: a page
// loaded, the page changing, a click (its ring is drawn), or what Playthrough draws for it. Changes within one frame of
// the first are one.
export function changesOf(events: eventWithTime[]): number[] {
  const start = events[0]?.timestamp ?? 0;
  const hidden = new Set<number>();
  const changes: number[] = [];
  for (const event of events) {
    if (!showsChange(event, hidden)) continue;
    const ms = event.timestamp - start;
    const last = changes.at(-1);
    // Played up to an instant, the recording shows what happened before it: the frame after the first change of one
    // shows all of it, and none of the next.
    if (last === undefined || ms >= last) changes.push(ms + Math.ceil(FRAME * 1000));
  }
  return changes.map((ms) => ms / 1000);
}

function showsChange(event: eventWithTime, hidden: Set<number>): boolean {
  if (event.type === EventType.Meta || event.type === EventType.FullSnapshot) return true;
  if (event.type === EventType.Custom) return DRAWN.has((event.data as { tag: string }).tag);
  if (event.type !== EventType.IncrementalSnapshot) return false;
  const data = event.data;
  if (data.source === IncrementalSource.MouseInteraction) return data.type === MouseInteractions.Click;
  if (!CHANGING.has(data.source)) return false;
  if (data.source !== IncrementalSource.Mutation || data.adds.length || data.removes.length || data.texts.length) return true;
  // Nothing but each field's text cursor hidden, or put back where it was hidden.
  let shows = false;
  for (const { id, attributes } of data.attributes) {
    const style = attributes.style;
    const only = Object.keys(attributes).length === 1 && typeof style === "string";
    if (only && style === HIDES_CARET) hidden.add(id);
    else if (only && hidden.has(id)) hidden.delete(id);
    else shows = true;
  }
  return shows;
}

// What's shown of a moment, from `from` to `end`, and the instants its screen changed.
export type Shown = { from: number; end: number; changes: number[] };

const EPSILON = 0.0005;
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

// The frames after a change, each one frame on, while the page is still moving from it: up to and with the first frame
// it has stopped, never into the next change.
function framesAfter(change: number, until: number, next: number): number[] {
  const frames: number[] = [];
  for (let k = 1; ; k++) {
    const frame = ms(change + k * FRAME);
    if (frame >= next - EPSILON || frame - FRAME >= until - EPSILON) return frames;
    frames.push(frame);
  }
}

// Where one step on (1) or back (-1) from `at` rests, within what's shown: the next instant the screen changed or the one
// before, or a frame of what's still moving between; back from the first change, the moment's start, and on from the
// last, its end. Nothing past either. `movingUntil` says until when the page moves after a change.
export function stepFrom(at: number, by: 1 | -1, shown: Shown, movingUntil: (change: number) => number): number | undefined {
  const { from, end } = shown;
  if (by > 0 ? at >= end - EPSILON : at <= from + EPSILON) return undefined;
  const changes = shown.changes.filter((change) => change > from + EPSILON && change < end - EPSILON);
  // The change whose frames hold the step: the last at or before where it rests, or, back, before it.
  const i = by > 0 ? changes.findLastIndex((change) => change <= at + EPSILON) : changes.findLastIndex((change) => change < at - EPSILON);
  const change = changes[i];
  const next = changes[i + 1] ?? end;
  const frames = change === undefined ? [] : framesAfter(change, movingUntil(change), next);
  if (by > 0) return frames.find((frame) => frame > at + EPSILON) ?? Math.max(from, next);
  return frames.findLast((frame) => frame < at - EPSILON) ?? change ?? from;
}

// Whether `at` is a step: an instant the screen changed, or a frame after one. Resting there, the page is shown as it
// was at that very frame, its motion where it had got to.
export function isStep(at: number, changes: number[]): boolean {
  const change = changes.findLast((one) => one <= at + EPSILON);
  if (change === undefined) return false;
  if (Math.abs(at - change) < EPSILON) return true;
  const k = Math.round((at - change) / FRAME);
  const next = changes[changes.indexOf(change) + 1] ?? Infinity;
  return k >= 1 && Math.abs(ms(change + k * FRAME) - at) < EPSILON && at < next - EPSILON;
}
