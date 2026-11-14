// Each round is its own recording of a scene, so a moment in one is found in another through what both did there.

import type { Scene } from "./model.ts";

// The same moment in another round's recording of the scene, as the two pass it together. Where only the other did
// something, it's passed in no time here, so the other leaps it: played together, both go by `together`.
export function inStep(at: number, from: Scene, to: Scene): number {
  if (at <= 0) return at;
  const [mine, theirs] = together(from, to);
  for (let i = 0; i < mine.length - 1; i++)
    if (at <= mine[i + 1]!) return theirs[i]! + (theirs[i + 1]! - theirs[i]!) * Math.min(1, Math.max(0, (at - mine[i]!) / (mine[i + 1]! - mine[i]!)));
  return to.length;
}

// The moments two recordings of a scene pass together, in order, each in its own recording's time. Each recording is
// what it did, in order: each step as it starts, each action in it, and the end. The two are lined up on the longest run
// of these both did, in order: a step by its title; an action by its step and what it was, so when one clicks Update the
// other does, and one typing in a field starts and stops as the other does, whatever words each types. Between two they
// share, each goes at its own pace, scaled to arrive together. What only one did plays there while the other holds just
// before what they share next, so Before waits while round 1 opens a menu it didn't have, then both go on together.
export function together(one: Scene, other: Scene): [number[], number[]] {
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

// What a recording did, in order. An action kept without what it was, as recordings made before Playthrough kept that,
// is known only by its place among its step's actions: the second of four is the second of four on the other side, and
// nothing where the other side did another number of them.
function doneIn(scene: Scene): Done[] {
  const done = scene.steps.flatMap((step) => {
    const actions = step.actions ?? [];
    return [
      { is: `step ${step.title}`, from: step.at, to: step.at },
      ...actions.map((at, i) => {
        const began = step.began?.[i];
        return { is: `${step.title}\n${began?.action ?? `action ${i + 1} of ${actions.length}`}`, from: Math.min(began?.at ?? at, at), to: at };
      }),
    ];
  });
  done.push({ is: "end", from: scene.length, to: scene.length });
  return done.map((one, i) => ({ ...one, next: done[i + 1]?.from ?? scene.length }));
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

// The step a moment is in: its result, where the page rests once it has played, is the step's, not the next one's.
export const stepAt = (scene: Scene, at: number) => scene.steps.find((_, i) => (scene.steps[i + 1]?.at ?? scene.length) >= at - 0.05) ?? scene.steps.at(-1);

// Where a scene is taken over, as the recording was at a moment: after as many of a step's actions as it had done, or at
// the step's end, as the page rests between them. The same place on every round that takes that step that far.
export type Paused = { step: string; actions?: number };

export function pausedAt(scene: Scene, at: number): Paused | undefined {
  const step = scene.steps.findLast((step) => step.at <= at + 0.05) ?? scene.steps[0];
  if (!step) return undefined;
  const actions = step.actions ?? [];
  const done = actions.filter((action) => action <= at).length;
  if (done === actions.length) return { step: step.title };
  if (done) return { step: step.title, actions: done };
  // Before its first action, the page is as the step before left it; a moment's, as its way there left it; any other
  // first step's, after it.
  const before = scene.steps[scene.steps.indexOf(step) - 1];
  return before ? { step: before.title } : scene.from !== undefined ? { step: step.title, actions: 0 } : { step: step.title, actions: 1 };
}
