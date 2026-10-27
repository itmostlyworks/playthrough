// Taking a flow over, in place: the moment the playhead rests on, on the latest round, is made ready while you look,
// so Take over (T) turns the frame into the app there at once, and Escape lays the recording back over it. Each is a
// fresh copy of that moment, made the way every flow starts (`vantage take-over`).

import type { Flow } from "@mostlyworks/vantage-review";

// Where a flow is taken over, as the recording was where you paused: after as many of a step's actions as it had done,
// or at the step's end, as the page rests between them.
export type Paused = { step: string; actions?: number };

// Shown, the app covers the recording; hidden, it waits under it, so taking the same moment over again carries on.
// It shows only once it has settled, so the frame turns into it with nothing on screen changing. Left from inside the
// app, `at` is where the pointer was there, on its page, for the way out to close on.
export type Live = { flow: string; paused: Paused; address?: string; problems?: string[]; shown: boolean; settled?: boolean; at?: { x: number; y: number } };

export const stepAt = (flow: Flow, at: number) => flow.steps.findLast((step) => step.at <= at + 0.05) ?? flow.steps[0];

export function pausedAt(flow: Flow, at: number): Paused | undefined {
  const step = stepAt(flow, at);
  if (!step) return undefined;
  const actions = step.actions ?? [];
  const done = actions.filter((action) => action <= at).length;
  if (done === actions.length) return { step: step.title };
  if (done) return { step: step.title, actions: done };
  // Before its first action, the page is as the step before left it; the first step's, after it.
  const before = flow.steps[flow.steps.indexOf(step) - 1];
  return before ? { step: before.title } : { step: step.title, actions: 1 };
}

export const samePaused = (one: Paused | undefined, other: Paused | undefined) => one?.step === other?.step && one?.actions === other?.actions;

// Each moment is made ready once, and asked for again if it couldn't be, or once it's been taken over: what was done in
// it stays in the app, so the next time starts from a fresh copy.
const ready = new Map<string, Promise<string | string[]>>();
const momentOf = (review: string, flow: string, paused: Paused) => JSON.stringify([review, flow, paused.step, paused.actions]);

export const takenOver = (review: string, flow: string, paused: Paused) => void ready.delete(momentOf(review, flow, paused));

export function readyAt(review: string, flow: string, paused: Paused): Promise<string | string[]> {
  const moment = momentOf(review, flow, paused);
  if (!ready.has(moment)) {
    const made = getReady(review, flow, paused);
    ready.set(moment, made);
    made.then((answer) => typeof answer === "string" || ready.delete(moment));
  }
  return ready.get(moment)!;
}

// Where the app is at that moment, through Vantage, on the same machine name the viewer was reached by; or what stops it.
async function getReady(review: string, flow: string, paused: Paused): Promise<string | string[]> {
  try {
    const answer = await fetch(`/api/reviews/${encodeURIComponent(review)}/take-over`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flow, ...paused }) });
    const said = await answer.json();
    return answer.ok ? `${location.protocol}//${location.hostname}:${said.port}/take-over/${said.moment}` : (said.problems ?? [`It couldn't be made ready (${answer.status}).`]);
  } catch {
    return ["Vantage isn't running here any more. Start it again with vantage open, then try again."];
  }
}
