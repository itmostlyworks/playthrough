// Stepping in: the moment where its recording rests made ready, as the latest hand-back has it, and the picture turned
// into the app there; given back, the recording again. Nothing runs before the first step in on a change: watching does
// nothing to the app. After it, the app is kept ready where the recording rests, so the next is quick. Each is the app
// made afresh for that step in, from the same start as every moment. Everything the page does to get the app and give it
// back is here: asking for it, calling it off, keeping it ready, how long it should take, what the app says, a note made
// there.

import { useEffect, useRef, useState } from "react";
import { doneAt, madeBySetup, madeInApp, newId, type Did, type InApp, type Note, type Moment } from "@playthrough/change";
import { keepBranch } from "./api.ts";
import { keepSteppedIn, steppedInHere } from "./kept.ts";
import { isPlaying, keptReadyAt, type Action, type Facts, type Page } from "./mode.ts";
import type { Clock } from "./Player.tsx";
import type { App, Heard } from "./Portal.tsx";

// One step in: on which moment, from where, since when, and as it goes, when it should be there, if that can be known;
// the app's address once it's ready, what setup made for it, and what its check at the end says where it doesn't hold
// now, or what stopped it; and where your pointer was in the app as you left it. Whether the app wasn't running, so it
// starts first.
type Run = { moment: string; from: number; since: number; due?: number; starting?: boolean; address?: string; setup?: Record<string, unknown>; checked?: string; problems?: string[]; at?: { x: number; y: number } };

export function useStepIn({ change, handBack, moment, page, clock, act, pointing }: { change: string; handBack: number; moment: Moment; page: Page; clock: Clock; act: (action: Action) => void; pointing: () => void }) {
  const [run, setRun] = useState<Run>();
  // A step in is its moment's: going to another lets it go, and nothing of it is drawn there meanwhile.
  const here = run?.moment === moment.name ? run : undefined;
  useEffect(() => setRun((now) => (now?.moment === moment.name ? now : undefined)), [moment.name]);
  const { mode } = page;
  const shown = mode.is === "getting there" || mode.is === "the app yours";
  const yours = mode.is === "the app yours";
  const app = useRef<App>(null);
  // What you did in the app, recorded from when it was handed to you, for a note made there to be on.
  const session = useRef<{ id: string; events: { timestamp: number }[]; did: Did[]; kept: number }>({ id: newId(), events: [], did: [], kept: 0 });
  // Made in the app while you're there, a note joins the edge once you're back.
  const madeThere = useRef(new Set<string>());

  // What's asking for the app now, to be called off.
  const asking = useRef<AbortController>(undefined);
  // Pressed while it plays, it's where the recording has got to that's stepped into, and it stops there. Every press
  // asks afresh: the app is made for this step in, whatever was made for one before.
  const stepIn = () => {
    const where = isPlaying(mode) ? clock.at : page.at;
    const after = doneAt(moment, where);
    session.current = { id: newId(), events: [], did: [], kept: 0 };
    keepSteppedIn(change);
    const since = Date.now();
    act({ type: "step in", since });
    setRun({ moment: moment.name, from: where, since });
    asking.current?.abort();
    const asked = (asking.current = new AbortController());
    const ours = (update: (run: Run) => Run) => setRun((now) => (now?.since === since ? update(now) : now));
    readyIn(change, moment.name, after, asked.signal).then(({ in: left, starting }) => (starting ? ours((now) => ({ ...now, starting })) : left && ours((now) => ({ ...now, due: since + left }))));
    readyAt(change, moment.name, after, asked.signal).then((answer) => {
      if (asked.signal.aborted) return;
      if ("address" in answer) return ours((now) => ({ ...now, address: answer.address, setup: answer.setup, checked: answer.checked }));
      ours((now) => ({ ...now, problems: answer.problems }));
      act({ type: "back", since });
    });
  };
  // Called off while it's getting there, by Back, Escape or going to another moment, nothing goes on making it: the
  // request ends, which stops the run, and a page of the app already opening unseen goes, so nothing holds what was made.
  const getting = mode.is === "getting there";
  useEffect(() => {
    if (getting) return;
    asking.current?.abort();
    asking.current = undefined;
    if (mode.is !== "the app yours") setRun((now) => (now?.address ? { ...now, address: undefined } : now));
  }, [getting]);
  useEffect(() => () => asking.current?.abort(), []);
  // Its page asked for, it has as long as the app gives a page to load to settle; past that, it says so.
  const opening = getting && here?.address ? here.since : undefined;
  useEffect(() => {
    if (opening === undefined) return;
    const late = setTimeout(() => {
      setRun((now) => (now?.since === opening ? { ...now, address: undefined, problems: [`The app's page didn't settle within ${SETTLING / 1000} seconds of being opened. Step in again; if it's as slow again, look at what the app says where it runs.`] } : now));
      act({ type: "back", since: opening });
    }, SETTLING);
    return () => clearTimeout(late);
  }, [opening]);
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
      const from = { moment: moment.name, at: Math.round((here?.from ?? page.end) * 100) / 100 };
      const file = `${kept.id}-${++kept.kept}.json`;
      const now = { type: 5, data: { tag: "now", payload: {} }, timestamp: kept.events.at(-1)!.timestamp };
      const length = await keepBranch(change, handBack, from, [...kept.events, now], file);
      if (typeof length !== "number") return setRun((run) => run && { ...run, problems: length });
      // Where the app was, with the ids this step in's setup made said as setup's, for the agent to go there in its own run.
      const on: InApp = { handBack, moment: moment.name, steppedIn: from.at, did: said.did, ...(said.address && { address: madeBySetup(said.address, here?.setup ?? {}) }), recording: `branches/${file}`, length, at: Math.floor(length * 100) / 100, ...(said.element ? { element: said.element } : said.point && { point: said.point }) };
      const [corner, far] = said.box ? [at(said.box.x, said.box.y), at(said.box.x + said.box.width, said.box.y + said.box.height)] : [];
      act({ type: "pointed", writing: { note: { id: newId(), on, words: "" }, spot: at(said.x, said.y), ...(corner && far && { box: { left: corner.x, top: corner.y, width: far.x - corner.x, height: far.y - corner.y } }) } });
    }
  };

  // Saved there, a note made in the app shows in it as a pin on what it's on.
  const saved = (note: Note, number: number) => {
    if (shown) madeThere.current.add(note.id);
    if (note.on && madeInApp(note.on) && yours) app.current?.post({ playthrough: "pin", id: note.id, number, thing: note.on.element && { role: note.on.element.role, name: note.on.element.name }, point: note.on.point });
  };

  return {
    stepIn,
    back,
    saved,
    // Kept off the edge until you're back.
    madeThere: (note: Note) => shown && madeThere.current.has(note.id),
    // What it says under the bar: why it couldn't open, back on the recording; in the app, that its check at the end
    // doesn't hold now.
    said: yours ? here?.checked : here?.problems?.join(" "),
    // Getting there with the app not running, that it's starting first, as the wait is longer for it.
    starting: mode.is === "getting there" && !!here?.starting,
    // How far it is on its way, for Step in's line.
    getting: mode.is === "getting there" && here ? { since: here.since, due: here.due } : undefined,
    // The app, for the portal that holds it.
    portal: { live: here && { address: here.address, shown, inApp: yours, at: here.at }, app, onHeard: heard },
  };
}

// Once this tab has stepped in on the change, the place the recording has rested at for a beat is kept ready, asked for
// as Step in there would ask, so moving through moments with the keys doesn't start a run for each. Asked once for each
// place it rests at, and again once back from the app, where what was made there was taken.
export function useKeptReady({ change, moment, page, facts }: { change: string; moment: Moment; page: Page; facts: Facts }) {
  const at = page.moment === moment.name ? keptReadyAt(page, facts, steppedInHere(change)) : undefined;
  const place = at === undefined ? undefined : JSON.stringify({ moment: moment.name, after: doneAt(moment, at) });
  const asked = useRef<string>(undefined);
  useEffect(() => {
    if (place === undefined) return void (asked.current = undefined);
    if (place === asked.current) return;
    const rested = setTimeout(() => {
      asked.current = place;
      fetch(`/api/changes/${encodeURIComponent(change)}/keep-ready`, { method: "POST", headers: { "content-type": "application/json" }, body: place }).catch(() => {});
    }, RESTED);
    return () => clearTimeout(rested);
  }, [change, place]);
}
const RESTED = 600;

// Playthrough answers a step in within a minute, made or with why not (following.ts); past this, it isn't going to.
const ANSWERED = 70_000;
// A page of the app is given half a minute to load on the way there, and its page here as long.
const SETTLING = 30_000;

// How long until a moment asked for is ready, in milliseconds, as long as the last run took to get there; nothing when
// that can't be known yet, as when the app isn't running and starts first.
const readyIn = (change: string, moment: string, after: number | undefined, asked: AbortSignal): Promise<{ in?: number; starting?: boolean }> =>
  fetch(`/api/changes/${encodeURIComponent(change)}/ready-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moment, after }), signal: asked })
    .then((answer) => answer.json())
    .then((said) => ({ in: said.in ?? undefined, starting: said.starting === true }), () => ({}));

// Where the app is at that moment, through Playthrough, on the same machine name the viewer was reached by, and what its
// check at the end says where it doesn't hold now; or what stops it.
async function readyAt(change: string, moment: string, after: number | undefined, asked: AbortSignal): Promise<{ address: string; setup: Record<string, unknown>; checked?: string } | { problems: string[] }> {
  try {
    const answer = await fetch(`/api/changes/${encodeURIComponent(change)}/step-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moment, after }),
      signal: AbortSignal.any([asked, AbortSignal.timeout(ANSWERED)]),
    });
    const said = await answer.json().catch(() => ({}));
    if (answer.ok) return { address: `${location.protocol}//${location.hostname}:${said.port}/step-in/${said.name}`, setup: said.setup ?? {}, checked: said.checked };
    return { problems: said.problems ?? [`Playthrough couldn't open the app here: it answered ${answer.status}. Step in again; if it says so again, start Playthrough again with playthrough open.`] };
  } catch (error) {
    if ((error as Error)?.name === "TimeoutError")
      return { problems: [`Playthrough hasn't answered in ${ANSWERED / 1000} seconds, when it always says within a minute. Look at where playthrough open runs: if it's stuck there, start it again, then step in again.`] };
    return { problems: ["Playthrough isn't running here any more. Start it again with playthrough open, then step in again."] };
  }
}
