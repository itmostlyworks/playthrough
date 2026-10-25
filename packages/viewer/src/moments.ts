// Where you are in a round: a flow, and a moment in its recording, in seconds from its start. Each flow opens with its
// title card, part of its time like everything else: for the CARD seconds before its recording starts, its name is up
// over its first frame. The times people see are within a flow, from its recording's start.

import type { Flow } from "@vantage/review";

export type Moment = { flow: string; at: number };

export const CARD = 1.2;
// A flow recorded in another shape (a phone after a laptop) takes its own shape in the first part of its card.
export const MORPH = 0.3;
// Going to a flow lands where its name is up and the frame has its own shape.
export const FLOW_IN = -CARD + MORPH;
// A review opens as a video does before you press play: the first flow's name over its softened first frame.
export const POSTER = -CARD + 0.5;

export const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// How soft the first frame is and how clearly the name shows, from 0 to 1, while the title card is up: the frame goes
// soft as the name comes up, holds long enough to read, then sharpens as the recording starts.
export function titleCard(at: number): { soft: number; name: number } | undefined {
  if (at >= 0) return undefined;
  const u = at + CARD;
  return {
    soft: ease(clamp(u / 0.22)) * (1 - ease(clamp((u - (CARD - 0.3)) / 0.3))),
    name: clamp((u - 0.04) / 0.2) * (1 - clamp((u - (CARD - 0.34)) / 0.22)),
  };
}

// The same moment in another round's recording of the flow. The two keep in step through the steps both have, by title,
// at each one's start and end: a step only one side has plays there while the other holds just before the step they
// share next, so Before waits while round 1 opens a menu it didn't have, then both go on together.
export function inStep(at: number, from: Flow, to: Flow): number {
  if (at <= 0) return at;
  const [mine, theirs] = pairs(from, to);
  for (let i = 0; i < mine.length - 1; i++)
    if (at <= mine[i + 1]!) return theirs[i]! + (theirs[i + 1]! - theirs[i]!) * clamp((at - mine[i]!) / (mine[i + 1]! - mine[i]!));
  return to.length;
}

// Where each step starts, and where the last one ends, paired between two recordings of a flow.
function pairs(from: Flow, to: Flow): [number[], number[]] {
  const marks = (flow: Flow) => [...flow.steps.map((step) => step.at), flow.length];
  const ours = marks(from);
  const others = marks(to);
  if (ours.length === others.length) return [ours, others];
  const mine = [0];
  const theirs = [0];
  const pair = (a?: number, b?: number) => {
    if (a === undefined || b === undefined || b < theirs.at(-1)!) return;
    if (a > mine.at(-1)!) mine.push(a), theirs.push(b);
    else if (a === mine.at(-1) && b > theirs.at(-1)!) mine.push(a + 0.001), theirs.push(b);
  };
  let after = 0;
  from.steps.forEach((step, i) => {
    const k = to.steps.findIndex((other, k) => k >= after && other.title === step.title);
    if (k < 0) return;
    pair(ours[i], others[k]);
    pair(ours[i + 1], others[k + 1]);
    after = k + 1;
  });
  pair(ours.at(-1), others.at(-1));
  return [mine, theirs];
}

// A round's flows end to end, each with its card, so a step back or forward can cross from one flow into the next.
export function along(flows: Flow[], moment: Moment): number {
  let start = 0;
  for (const flow of flows) {
    if (flow.name === moment.flow) return start + CARD + moment.at;
    start += CARD + flow.length;
  }
  return 0;
}

export function momentAt(flows: Flow[], seconds: number): Moment {
  let start = 0;
  for (const flow of flows) {
    if (seconds < start + CARD + flow.length || flow === flows.at(-1)) return { flow: flow.name, at: clamp(seconds - start - CARD, -CARD, flow.length) };
    start += CARD + flow.length;
  }
  return { flow: "", at: 0 };
}
