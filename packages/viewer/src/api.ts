// The viewer's side of `playthrough open`: every change as it's kept, arriving again whenever one changes, their
// recordings, and what a person sends.

import { useEffect, useState } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import type { Change, Send } from "@playthrough/change";
import type { Events } from "./replay.ts";

// A change as `playthrough open` lists it: the change, at its address on this machine, the app's name and its people as the person
// sees them ("Sam, a member"), and whether an agent is waiting for what's sent.
export type Listed = { change: Change; app: string; people: Record<string, string>; agentWaiting: boolean };

// Every change on this machine, from every app and every copy of each, arriving again whenever any of them changes,
// undefined until it's first come. One stream, while the page is in sight: a browser lets six requests at a time go to
// one address, from all its tabs together. Out of sight, they are asked for now and then instead, so the tab's
// title still says what's waiting.
export function useChanges(): Listed[] | undefined {
  const [changes, setChanges] = useState<Listed[]>();
  useEffect(() => {
    let live: EventSource | undefined;
    let every = 0;
    let last = "";
    const take = (data: string) => data !== last && setChanges(JSON.parse((last = data)));
    const ask = () => fetch("/api/changes").then((answer) => (answer.ok ? answer.text() : undefined), () => undefined).then((data) => data && take(data));
    const listen = () => {
      clearInterval(every);
      if (document.hidden) return void (live?.close(), (live = undefined), (every = window.setInterval(ask, 5000)));
      if (live && live.readyState !== EventSource.CLOSED) return;
      live = new EventSource("/api/changes?live");
      live.onmessage = ({ data }) => take(data);
    };
    listen();
    document.addEventListener("visibilitychange", listen);
    return () => (document.removeEventListener("visibilitychange", listen), clearInterval(every), live?.close());
  }, []);
  return changes;
}

export function useYou(): string | undefined {
  const [you, setYou] = useState<string>();
  useEffect(() => void get<{ name: string }>("/api/you").then(({ name }) => setYou(name)), []);
  return you;
}

// A hand-back's files never change once it's finished, so each is fetched once, once it's come: one that didn't is asked
// for again the next time.
const files = new Map<string, Promise<unknown>>();
function once<T>(path: string, fetching: () => Promise<T>): Promise<T> {
  if (!files.has(path))
    files.set(
      path,
      fetching().catch((error) => {
        files.delete(path);
        throw error;
      }),
    );
  return files.get(path) as Promise<T>;
}
function file<T>(change: string, handBack: number, name: string): Promise<T> {
  const path = `/api/changes/${change}/hand-backs/${handBack}/files/${name}`;
  return once(path, () => get<T>(path));
}

// A recording plays with the fonts, images and stylesheets kept with it, never the app's own, which may be gone or
// somewhere else. Of the sizes an image offered, the one it was recorded at is the one it shows.
export function recording(change: string, handBack: number, name: string): Promise<Events> {
  const path = `/api/changes/${change}/hand-backs/${handBack}/files/${name}`;
  return once(path, () => {
    const kept = file<Record<string, string>>(change, handBack, `assets/${name}`).catch(() => ({}));
    const events = fetch(path).then((answer) => (answer.ok ? answer.text() : Promise.reject(new Error(`${path}: ${answer.status}`))));
    return Promise.all([events, kept]).then(([events, kept]) => JSON.parse(fromKept(events, kept, `/api/changes/${change}/hand-backs/${handBack}/files/`)));
  });
}

// An SVG drawn as an image asks the viewer's browser for light or dark, whatever the page around it is answered: it's
// asked for as the recording's browser was, as the page is (scheme.ts).
export function fromKept(events: string, kept: Record<string, string>, files: string): string {
  if (!Object.keys(kept).length) return events;
  const said = events.match(/"tag":"browser","payload":\{"dark":(true|false),"still":(true|false)\}/);
  const as = [said?.[1] === "true" ? "dark" : "light", said?.[2] === "true" ? "still" : "moving"].join(",");
  const recorded = (address: string) => address.trim().split(/\s+/)[0]!;
  return events
    .replace(/"srcset":"([^"]*)"/g, (whole, offered: string) => {
      const shown = offered.split(/,\s+/).map(recorded).find((address) => address in kept);
      return shown ? `"srcset":"${shown}"` : whole;
    })
    .replace(/https?:\/\/[^\s"'()\\]+/g, (address) => (address in kept ? files + kept[address] + (/\.svg$/.test(kept[address]!) ? `?as=${as}` : "") : address));
}

// What was on the page where a moment's file read it, as it was recorded, and its picture then.
const readingsName = (recording: string) => `readings/${recording.replace(/\.json$/, "")}`;
export const readings = (change: string, handBack: number, recording: string) => file<Reading[]>(change, handBack, `${readingsName(recording)}.json`).catch((): Reading[] => []);
// None for a hand-back recorded before Playthrough glimpsed the page after each action.
export const glimpses = (change: string, handBack: number, recording: string) => file<Glimpse[]>(change, handBack, `${readingsName(recording)}.glimpses.json`).catch((): Glimpse[] => []);
export const picture = (change: string, handBack: number, recording: string, reading: number) => `/api/changes/${change}/hand-backs/${handBack}/files/${readingsName(recording)}/${reading + 1}.png`;

// What's wrong in plain words, or nothing once it's kept.
export async function send(change: string, send: Send): Promise<string[]> {
  return post(`/api/changes/${change}/sends`, send);
}

async function get<T>(path: string): Promise<T> {
  const answer = await fetch(path);
  if (!answer.ok) throw new Error(`${path}: ${answer.status}`);
  return answer.json();
}

async function post(path: string, body: unknown): Promise<string[]> {
  const done = await posted(path, body);
  return "problems" in done ? done.problems : [];
}

// What it answered, or what's wrong in plain words.
async function posted<T>(path: string, body: unknown): Promise<{ answer: T } | { problems: string[] }> {
  try {
    const answer = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return answer.ok ? { answer: await answer.json() } : { problems: (await answer.json()).problems ?? [`It wasn't kept (${answer.status}).`] };
  } catch {
    return { problems: ["Playthrough isn't running here any more. Start it again with playthrough open, then try again."] };
  }
}

// A note's frame as a picture, drawn once by `playthrough open` and kept (frames.ts): its address, and where the note's
// thing is on it, as shares of the screen. Asked for once a page.
// Where its thing is on it, and where a line of words' words are, which is narrower than the line.
export type NoteFrame = { src: string; screen: { width: number; height: number }; box?: { x: number; y: number; width: number; height: number }; words?: { x: number; y: number; width: number; height: number } };
const framing = new Map<string, Promise<NoteFrame | undefined>>();
export function noteFrame(change: string, note: string, framed: { handBack: number; recording: string; at: number; node?: number; point?: { x: number; y: number } }): Promise<NoteFrame | undefined> {
  const asked = framing.get(note);
  if (asked) return asked;
  const made = posted<{ picture: string; screen: NoteFrame["screen"]; box?: NoteFrame["box"] }>(`/api/changes/${change}/frames`, { note, ...framed }).then((done) => {
    // Not drawn, it's asked for again next time.
    if ("problems" in done) return void framing.delete(note);
    return { src: `/api/changes/${change}/hand-backs/${framed.handBack}/files/${done.answer.picture}`, screen: done.answer.screen, ...(done.answer.box && { box: done.answer.box }) };
  });
  framing.set(note, made);
  return made;
}

// A moment's still drawn twice as fine, for screens with twice the dots, by `playthrough open` and kept (frames.ts): its
// address once it's drawn. Asked for once a page.
const fine = new Map<string, Promise<string | undefined>>();
export function fineStill(change: string, handBack: number, recording: string, at: number): Promise<string | undefined> {
  const key = `${change} ${handBack} ${recording}`;
  const asked = fine.get(key);
  if (asked) return asked;
  const made = posted<{ picture: string }>(`/api/changes/${change}/stills`, { handBack, recording, at }).then((done) =>
    "problems" in done ? undefined : `/api/changes/${change}/hand-backs/${handBack}/files/${done.answer.picture}`,
  );
  fine.set(key, made);
  return made;
}

// What you did in the app, kept as your branch off the moment you took over: its length, in seconds, once it's kept, or
// what's wrong in plain words.
export async function keepBranch(change: string, handBack: number, from: { moment: string; at: number }, events: unknown[], recording: string): Promise<number | string[]> {
  const done = await posted<{ length: number }>(`/api/changes/${change}/branches`, { handBack, ...from, events, recording });
  return "problems" in done ? done.problems : done.answer.length;
}
