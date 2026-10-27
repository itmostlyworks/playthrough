// Taking a flow over, in place: the moment the playhead rests on, on the latest round, is made ready while you look,
// so Take over (T) turns the frame into the app there at once, and Escape lays the recording back over it. A moment is
// the end of the step the playhead is in, a fresh copy of it made the way every flow starts (`vantage take-over`).

import type { Flow } from "@mostlyworks/vantage-review";

// Shown, the app covers the recording; hidden, it waits under it, so taking the same moment over again carries on.
export type Live = { flow: string; step?: string; address?: string; problems?: string[]; shown: boolean };

export const stepAt = (flow: Flow, at: number) => flow.steps.findLast((step) => step.at <= at + 0.05) ?? flow.steps[0];

// Each moment is made ready once, and asked for again only if it couldn't be.
const ready = new Map<string, Promise<string | string[]>>();

export function readyAt(review: string, flow: string, step?: string): Promise<string | string[]> {
  const moment = `${review}\n${flow}\n${step ?? ""}`;
  if (!ready.has(moment)) {
    const made = getReady(review, flow, step);
    ready.set(moment, made);
    made.then((answer) => typeof answer === "string" || ready.delete(moment));
  }
  return ready.get(moment)!;
}

// Where the app is at that moment, through Vantage, on the same machine name the viewer was reached by; or what stops it.
async function getReady(review: string, flow: string, step?: string): Promise<string | string[]> {
  try {
    const answer = await fetch(`/api/reviews/${encodeURIComponent(review)}/take-over`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flow, step }) });
    const said = await answer.json();
    return answer.ok ? `${location.protocol}//${location.hostname}:${said.port}/take-over/${said.moment}` : (said.problems ?? [`It couldn't be made ready (${answer.status}).`]);
  } catch {
    return ["Vantage isn't running here any more. Start it again with vantage open, then try again."];
  }
}
