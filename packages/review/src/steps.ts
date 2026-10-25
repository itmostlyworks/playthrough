// Each round is its own recording of a flow, so a moment in one is found in another through the steps both take.

import type { Flow } from "./model.ts";

// The same moment in another round's recording of the flow. The two keep in step through the steps both have, by title,
// at each one's start and end: a step only one side has plays there while the other holds just before the step they
// share next, so Before waits while round 1 opens a menu it didn't have, then both go on together.
export function inStep(at: number, from: Flow, to: Flow): number {
  if (at <= 0) return at;
  const [mine, theirs] = pairs(from, to);
  for (let i = 0; i < mine.length - 1; i++)
    if (at <= mine[i + 1]!) return theirs[i]! + (theirs[i + 1]! - theirs[i]!) * Math.min(1, Math.max(0, (at - mine[i]!) / (mine[i + 1]! - mine[i]!)));
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
