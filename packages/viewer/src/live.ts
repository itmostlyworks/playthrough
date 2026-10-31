// Taking a flow over, in place: the moment the playhead rests on, on the latest round, is made ready while you look,
// so Take over (T) turns the frame into the app there at once, and Escape lays the recording back over it. Each is a
// fresh copy of that moment, made the way every flow starts (`playthrough take-over`).

import { pausedAt, type Did, type Paused } from "@playthrough/review";

export { pausedAt, type Paused };

// Shown, the app covers the recording; hidden, it waits under it, so taking the same moment over again carries on.
// It shows only once it has settled, so the frame turns into it with nothing on screen changing. Left from inside the
// app, `at` is where the pointer was there, on its page, for the way out to close on. Asked for before it's ready, `due`
// is when it should be, by this page's clock, if that can be known.
export type Live = { flow: string; paused: Paused; address?: string; problems?: string[]; shown: boolean; settled?: boolean; at?: { x: number; y: number }; due?: number };

export const samePaused = (one: Paused | undefined, other: Paused | undefined) => one?.step === other?.step && one?.actions === other?.actions;

// Each moment is made ready once, and asked for again if it couldn't be, or once it's been taken over: what was done in
// it stays in the app, so the next time starts from a fresh copy. Only the last one asked for is kept: Playthrough gives back
// the one before as it makes the next one ready.
const ready = new Map<string, Promise<string | string[]>>();
const momentOf = (review: string, flow: string, paused: Paused) => JSON.stringify([review, flow, paused.step, paused.actions]);

export const takenOver = (review: string, flow: string, paused: Paused) => void ready.delete(momentOf(review, flow, paused));

// Gone back to from a note in the app, with what was done there: always a fresh copy. Ahead, as the playhead rests, before
// Take over is asked for: not for a flow that reaches outside the app, which Playthrough then says it runs only when asked.
export function readyAt(review: string, flow: string, paused: Paused, { did, ahead }: { did?: Did[]; ahead?: boolean } = {}): Promise<string | string[]> {
  if (did) return ready.clear(), getReady(review, flow, paused, { did });
  const moment = momentOf(review, flow, paused);
  const asked = ready.get(moment);
  if (asked && (ahead || !aheadOnly.has(asked))) return asked;
  // Asked for now, one asked for only ahead goes on from there, or is asked for again if it was refused ahead.
  const made = asked ? asked.then((answer) => (typeof answer === "string" ? answer : getReady(review, flow, paused, {}))) : getReady(review, flow, paused, { ahead });
  if (!asked) ready.clear();
  if (ahead) aheadOnly.add(made);
  ready.set(moment, made);
  made.then((answer) => typeof answer === "string" || (ready.get(moment) === made && ready.delete(moment)));
  return made;
}
const aheadOnly = new WeakSet<Promise<string | string[]>>();

// Playing, the flow is run alongside the playhead, as far as it has gone, so the moment it comes to rest on is ready
// sooner. It's only a head start: what it can't do, taking over does again.
export const follow = (review: string, flow: string, paused: Paused) =>
  void fetch(`/api/reviews/${encodeURIComponent(review)}/follow`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flow, ...paused }) }).catch(() => {});

// How long until a moment asked for is ready, in milliseconds, as long as the last run took to get there; nothing when
// that can't be known yet.
export const readyIn = (review: string, flow: string, paused: Paused): Promise<number | undefined> =>
  fetch(`/api/reviews/${encodeURIComponent(review)}/ready-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flow, ...paused }) })
    .then((answer) => answer.json())
    .then((said) => said.in ?? undefined, () => undefined);

// Where the app is at that moment, through Playthrough, on the same machine name the viewer was reached by; or what stops it.
async function getReady(review: string, flow: string, paused: Paused, { did, ahead }: { did?: Did[]; ahead?: boolean }): Promise<string | string[]> {
  try {
    const answer = await fetch(`/api/reviews/${encodeURIComponent(review)}/take-over`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flow, ...paused, did, ahead }) });
    const said = await answer.json();
    return answer.ok ? `${location.protocol}//${location.hostname}:${said.port}/take-over/${said.moment}` : (said.problems ?? [`It couldn't be made ready (${answer.status}).`]);
  } catch {
    return ["Playthrough isn't running here any more. Start it again with playthrough open, then try again."];
  }
}
