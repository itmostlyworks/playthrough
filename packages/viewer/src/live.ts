// Taking a scene over, in place: Take over (T) makes the moment the playhead rests on ready, on the latest round, and
// turns the frame into the app there, and Escape lays the recording back over it. Nothing runs before you ask: watching
// does nothing to the app. Each is a fresh copy of that moment, made the way every scene starts (`playthrough take-over`).

import { pausedAt, type Did, type Paused } from "@playthrough/review";

export { pausedAt, type Paused };

// Shown, the app covers the recording; hidden, it waits under it, so taking the same moment over again carries on.
// It shows only once it has settled, so the frame turns into it with nothing on screen changing. Left from inside the
// app, `at` is where the pointer was there, on its page, for the way out to close on. Asked for before it's ready, `due`
// is when it should be, by this page's clock, if that can be known.
export type Live = { scene: string; paused: Paused; address?: string; problems?: string[]; shown: boolean; settled?: boolean; at?: { x: number; y: number }; due?: number };

export const samePaused = (one: Paused | undefined, other: Paused | undefined) => one?.step === other?.step && one?.actions === other?.actions;

// Each moment is made ready once, and asked for again if it couldn't be, or once it's been taken over: what was done in
// it stays in the app, so the next time starts from a fresh copy. Only the last one asked for is kept: Playthrough gives back
// the one before as it makes the next one ready.
const ready = new Map<string, Promise<string | string[]>>();
const momentOf = (review: string, scene: string, paused: Paused) => JSON.stringify([review, scene, paused.step, paused.actions]);

export const takenOver = (review: string, scene: string, paused: Paused) => void ready.delete(momentOf(review, scene, paused));

// Gone back to from a note in the app, with what was done there, and on a fork written for its notes, by them: always a
// fresh copy.
export function readyAt(review: string, scene: string, paused: Paused, { did, notes }: { did?: Did[]; notes?: string[] } = {}): Promise<string | string[]> {
  if (did) return ready.clear(), getReady(review, scene, paused, { did, notes });
  const moment = momentOf(review, scene, paused);
  const asked = ready.get(moment);
  if (asked) return asked;
  const made = getReady(review, scene, paused, {});
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
async function getReady(review: string, scene: string, paused: Paused, { did, notes }: { did?: Did[]; notes?: string[] }): Promise<string | string[]> {
  try {
    const answer = await fetch(`/api/reviews/${encodeURIComponent(review)}/take-over`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scene, ...paused, did, notes }) });
    const said = await answer.json();
    return answer.ok ? `${location.protocol}//${location.hostname}:${said.port}/take-over/${said.moment}` : (said.problems ?? [`It couldn't be made ready (${answer.status}).`]);
  } catch {
    return ["Playthrough isn't running here any more. Start it again with playthrough open, then try again."];
  }
}
