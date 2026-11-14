// Stepping in: the moment the recording rests on made ready, on the latest round, and the picture turned into the app
// there; given back, the recording again. Nothing runs before you ask: watching does nothing to the app. Each is a
// fresh copy of that moment, made the way every scene starts (`playthrough take-over`). Everything the page does to get
// the app and give it back is here: asking for it, how long it should take, what the app says, a note made there.

import { useEffect, useRef, useState } from "react";
import { newId, pausedAt, type Did, type Note, type Paused, type Place, type Scene } from "@playthrough/review";
import { keepBranch } from "./api.ts";
import { isPlaying, type Action, type Page } from "./mode.ts";
import type { Clock } from "./Player.tsx";
import type { App, Heard } from "./Portal.tsx";

// One step in: on which moment, from where, since when, and as it goes, when it should be there, if that can be known;
// the app's address once it's ready, or what stopped it; and where your pointer was in the app as you left it.
type Run = { scene: string; from: number; since: number; due?: number; address?: string; problems?: string[]; at?: { x: number; y: number } };

export function useStepIn({ review, round, scene, page, clock, act, pointing }: { review: string; round: number; scene: Scene; page: Page; clock: Clock; act: (action: Action) => void; pointing: () => void }) {
  const [run, setRun] = useState<Run>();
  // A step in is its moment's: going to another lets it go, and nothing of it is drawn there meanwhile.
  const here = run?.scene === scene.name ? run : undefined;
  useEffect(() => setRun((now) => (now?.scene === scene.name ? now : undefined)), [scene.name]);
  const { mode } = page;
  const shown = mode.is === "getting there" || mode.is === "the app yours";
  const yours = mode.is === "the app yours";
  const app = useRef<App>(null);
  // What you did in the app, recorded from when it was handed to you, for a note made there to be on.
  const session = useRef<{ id: string; events: { timestamp: number }[]; did: Did[]; kept: number }>({ id: newId(), events: [], did: [], kept: 0 });
  // Made in the app while you're there, a note joins the edge once you're back.
  const madeThere = useRef(new Set<string>());

  // Pressed while it plays, it's where the recording has got to that's stepped into, and it stops there.
  const stepIn = () => {
    const where = isPlaying(mode) ? clock.at : page.at;
    const paused = pausedAt(scene, where);
    if (!paused) return;
    session.current = { id: newId(), events: [], did: [], kept: 0 };
    const since = Date.now();
    act({ type: "step in", since });
    setRun({ scene: scene.name, from: where, since });
    const ours = (change: (run: Run) => Run) => setRun((now) => (now?.since === since ? change(now) : now));
    readyIn(review, scene.name, paused).then((left) => left && ours((now) => ({ ...now, due: since + left })));
    readyAt(review, scene.name, paused).then((answer) => {
      if (typeof answer === "string") return ours((now) => ({ ...now, address: answer }));
      ours((now) => ({ ...now, problems: answer }));
      act({ type: "back", since });
    });
  };
  // Given back, the app closes on where your pointer was in it.
  const back = (at?: { x: number; y: number }) => {
    act({ type: "back" });
    setRun((now) => now && { ...now, at });
    window.focus();
  };

  // In the app, noting goes there: it rings what's under the pointer and tells what's clicked.
  const noting = yours && !!mode.pointing;
  useEffect(() => app.current?.post({ playthrough: "noting", on: noting }), [noting]);
  const heard: Heard = async (said, at) => {
    if (said.playthrough === "settled") act({ type: "yours" });
    if (said.playthrough === "escape") noting ? act({ type: "note" }) : back({ x: said.x, y: said.y });
    if (said.playthrough === "note") pointing();
    if (said.playthrough === "recorded") session.current.events.push(...said.events);
    if (said.playthrough === "did") session.current.did = said.did;
    if (said.playthrough === "noted") {
      if (noting) act({ type: "note" });
      const kept = session.current;
      if (!kept.events.length) return;
      kept.did = said.did;
      const from = { scene: scene.name, at: Math.round((here?.from ?? page.end) * 100) / 100 };
      const file = `${kept.id}-${++kept.kept}.json`;
      const now = { type: 5, data: { tag: "now", payload: {} }, timestamp: kept.events.at(-1)!.timestamp };
      const length = await keepBranch(review, round, from, [...kept.events, now], file);
      if (typeof length !== "number") return setRun((run) => run && { ...run, problems: length });
      const on: Place = { scene: scene.name, at: Math.floor(length * 100) / 100, ...(said.element ? { element: said.element } : said.point && { point: said.point }), app: { from, did: said.did, recording: `branches/${file}`, length } };
      const [corner, far] = said.box ? [at(said.box.x, said.box.y), at(said.box.x + said.box.width, said.box.y + said.box.height)] : [];
      act({ type: "pointed", writing: { note: { id: newId(), on, words: "" }, spot: at(said.x, said.y), ...(corner && far && { box: { left: corner.x, top: corner.y, width: far.x - corner.x, height: far.y - corner.y } }) } });
    }
  };

  // Saved there, a note made in the app shows in it as a pin on what it's on.
  const saved = (note: Note, number: number) => {
    if (shown) madeThere.current.add(note.id);
    if (note.on?.app && yours) app.current?.post({ playthrough: "pin", id: note.id, number, thing: note.on.element && { role: note.on.element.role, name: note.on.element.name }, point: note.on.point });
  };

  return {
    stepIn,
    back,
    saved,
    // Kept off the edge until you're back.
    madeThere: (note: Note) => shown && madeThere.current.has(note.id),
    problems: here?.problems,
    // How far it is on its way, for Step in's line.
    getting: mode.is === "getting there" && here ? { since: here.since, due: here.due } : undefined,
    // The app, for the portal that holds it.
    portal: { live: here && { address: here.address, shown, inApp: yours, due: here.due, at: here.at }, app, onHeard: heard },
  };
}

// Each moment is made ready once, and asked for again if it couldn't be: only the last one asked for is kept, as
// Playthrough gives back the one before as it makes the next one ready.
const ready = new Map<string, Promise<string | string[]>>();
const momentOf = (review: string, scene: string, paused: Paused) => JSON.stringify([review, scene, paused.step, paused.actions]);

function readyAt(review: string, scene: string, paused: Paused): Promise<string | string[]> {
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
const readyIn = (review: string, scene: string, paused: Paused): Promise<number | undefined> =>
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
