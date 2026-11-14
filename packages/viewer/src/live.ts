// Stepping in: the moment the recording rests on made ready, on the latest round, and the frame turned into the app
// there. Nothing runs before you ask: watching does nothing to the app. Each is a fresh copy of that moment, made the
// way every scene starts (`playthrough take-over`).

import type { Paused } from "@playthrough/review";

// Each moment is made ready once, and asked for again if it couldn't be: only the last one asked for is kept, as
// Playthrough gives back the one before as it makes the next one ready.
const ready = new Map<string, Promise<string | string[]>>();
const momentOf = (review: string, scene: string, paused: Paused) => JSON.stringify([review, scene, paused.step, paused.actions]);

export function readyAt(review: string, scene: string, paused: Paused): Promise<string | string[]> {
  const moment = momentOf(review, scene, paused);
  const asked = ready.get(moment);
  if (asked) return asked;
  const made = getReady(review, scene, paused);
  ready.clear();
  ready.set(moment, made);
  made.then((answer) => typeof answer === "string" || (ready.get(moment) === made && ready.delete(moment)));
  return made;
}

// How long until a moment asked for is ready, in milliseconds, as long as the last run took to get there; nothing when
// that can't be known yet.
export const readyIn = (review: string, scene: string, paused: Paused): Promise<number | undefined> =>
  fetch(`/api/reviews/${encodeURIComponent(review)}/ready-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scene, ...paused }) })
    .then((answer) => answer.json())
    .then((said) => said.in ?? undefined, () => undefined);

// Where the app is at that moment, through Playthrough, on the same machine name the viewer was reached by; or what stops it.
async function getReady(review: string, scene: string, paused: Paused): Promise<string | string[]> {
  try {
    const answer = await fetch(`/api/reviews/${encodeURIComponent(review)}/take-over`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scene, ...paused }) });
    const said = await answer.json();
    return answer.ok ? `${location.protocol}//${location.hostname}:${said.port}/take-over/${said.moment}` : (said.problems ?? [`It couldn't be made ready (${answer.status}).`]);
  } catch {
    return ["Playthrough isn't running here any more. Start it again with playthrough open, then try again."];
  }
}
