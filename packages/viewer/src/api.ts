// What the viewer knows and says, from the one source it's handed: every change as it's kept, arriving again whenever
// one changes, their recordings, what a person sends, and the app stepped into. `playthrough open` is the source
// (server.ts) unless another page hands the viewer its own (show.tsx).

import { useEffect, useState } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { SHARED, type Change, type Send } from "@playthrough/change";
import type { Events } from "./replay.ts";
import type { Box, Point } from "./view.ts";
import { server } from "./server.ts";

// A change as `playthrough open` lists it: the change, at its address on this machine, the app's name and its people as the person
// sees them ("Sam, a member"), whether an agent is waiting for what's sent, and whether the one it was last said to is
// known to have ended.
export type Listed = { change: Change; app: string; people: Record<string, string>; agentWaiting: boolean; agentGone: boolean };

// Each answer is what was asked for, or what's wrong in plain words; nothing at all where it can't be known or drawn.
export type Source = {
  // Who you are, as what you say and see is kept by: nobody yet (“”) for a guest on a shared change, until they say
  // who, the first time they keep a note (`name`).
  you(): Promise<string>;
  // A guest's name, said once: what's wrong with it, or nothing once it's kept with what they keep between visits, and
  // who they are from then on.
  name?(name: string): Promise<string[]>;
  // Sharing a change, the person's alone (share.ts): where it stands, started, and stopped.
  share?: { of(change: string): Promise<Shared>; start(change: string): Promise<Shared>; stop(change: string): Promise<Shared> };
  // Every change, told now and again whenever any of them changes, until stopped.
  changes(told: (changes: Listed[]) => void): () => void;
  // Where a hand-back's file is, for the browser to ask for: its recordings, what was read and glimpsed of each, their
  // pictures, the fonts and images kept with them, and what you did in the app.
  file(change: string, handBack: number, name: string): string;
  send(change: string, send: Send): Promise<string[]>;
  // The moments opened by you, the last stop as a hand-back alone.
  seen(change: string, by: string, moments: { handBack: number; moment?: string }[]): Promise<string[]>;
  // Stepping in at a moment, after its step's action `after` (none: before them all): how long until it's ready, as long
  // as the last took, whether the app starts first, and what your browser can't be of the one the moment ran in, in a
  // sentence; kept ready there, for a step in to come; and the app's address
  // there, what setup made for it, and what its check at the end says where it doesn't hold now; or why it can't be, in a
  // line for the person (`plainly`) and whole for the agent (`why`). Called off by `asked`.
  readyIn(change: string, moment: string, after: number | undefined, asked: AbortSignal): Promise<{ in?: number; starting: boolean; unlike?: string } | undefined>;
  keepReady(change: string, moment: string, after: number | undefined): void;
  stepIn(change: string, moment: string, after: number | undefined, asked: AbortSignal): Promise<{ address: string; setup: Record<string, unknown>; checked?: string } | CantStepIn>;
  // What you did in the app, kept as your branch off the moment you stepped in at, as the file `recording` of the
  // hand-back: its length in seconds.
  keepBranch(change: string, branch: { handBack: number; moment: string; at: number; events: unknown[]; recording: string }): Promise<number | string[]>;
  // A note's frame drawn as a picture, a file of its hand-back, with the screen it was on and where its thing is there,
  // as shares of it; and a moment's still drawn twice as fine.
  frame(change: string, note: string, framed: Framed): Promise<{ picture: string; screen: NoteFrame["screen"]; box?: NoteFrame["box"] } | undefined>;
  still(change: string, still: { handBack: number; recording: string; at: number }): Promise<string | undefined>;
  // What you're watching made into an MP4, telling the seconds it has left as it's made (Video.tsx); none where a
  // source can't make one.
  video?(change: string, asked: AskedVideo, onLeft: (seconds: number) => void): Promise<Blob | string[]>;
  // Where the viewer keeps what it holds between visits, your notes and replies not yet sent among it, and what it holds
  // for this tab alone (kept.ts). With none, it's kept in memory for as long as the page is open: a page showing a
  // change doesn't write to its own storage unasked.
  kept?: Keeping;
  keptForTheTab?: Keeping;
};
export type Keeping = Pick<Storage, "getItem" | "setItem" | "removeItem">;
// Where a shared change stands: the link while it's on, or why it couldn't be, with what to do.
export type Shared = { is: "off" } | { is: "starting" } | { is: "on"; link: string } | { is: "failed"; why: string };
export type CantStepIn = { plainly: string; why: string };
// Which moments of a hand-back, by their place from 1; and beside one, how it was when you last saw it, as Compare opens
// framed on it. Where you've taken the window and light or dark go unused: the video is always the whole app, as it was
// recorded (video.ts). They go once Download video stops sending them.
export type AskedVideo = {
  handBack: number;
  moments: number[];
  beside?: { handBack: number; framedOn: { changed: Box[]; done: Box[] } };
  window?: { centre: Point; k: number };
  dark: boolean;
};
type Framed = { handBack: number; recording: string; at: number; node?: number; point?: { x: number; y: number } };

export let source: Source = server;
// Handed before the viewer is drawn, and kept for as long as it's open.
export const from = (given: Source) => void (source = given);
// Handed a source of its own, the viewer is shown by another page: one change on its own, nothing of the list of them,
// and where you are after the page's #.
export const shownByAnotherPage = () => source !== server;
// A guest on a shared change, whose source asks who they are: they send notes and replies, never Done, which is the
// person's alone, and what's said to them is what they can use, not what the person at this computer can.
export const isGuest = () => source.name !== undefined;

// Every change, undefined until they've first come.
export function useChanges(): Listed[] | undefined {
  const [changes, setChanges] = useState<Listed[]>();
  useEffect(() => source.changes(setChanges), []);
  return changes;
}

export function useYou(): string | undefined {
  const [you, setYou] = useState<string>();
  useEffect(() => {
    void source.you().then(setYou);
    naming.add(setYou);
    return () => void naming.delete(setYou);
  }, []);
  return you;
}

// A guest saying who they are, told to every part of the page that knows who you are.
const naming = new Set<(name: string) => void>();
export async function nameYou(name: string): Promise<string[]> {
  const problems = (await source.name?.(name)) ?? [];
  if (!problems.length) for (const tell of naming) tell(name);
  return problems;
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
const text = (path: string) => fetch(path).then((answer) => (answer.ok ? answer.text() : Promise.reject(new Error(`${path}: ${answer.status}`))));
function file<T>(change: string, handBack: number, name: string): Promise<T> {
  const path = source.file(change, handBack, name);
  return once(path, () => text(path).then((read) => JSON.parse(read) as T));
}

// What a guest did in the app through a shared link, kept where only a guest's is: the server keeps them there and
// nowhere else (`branch`, open.ts), and the viewer plays them with nothing but their own files (`Replay`).
export const byAGuest = (recording: string) => recording.startsWith(`branches/${SHARED}`);
// Where a hand-back's files are, all of them, as an address a page's policy can name.
export const keptFor = (change: string, handBack: number) => new URL(source.file(change, handBack, ""), location.href).href;

// A recording plays with the fonts, images and stylesheets kept with it, never the app's own, which may be gone or
// somewhere else. Of the sizes an image offered, the one it was recorded at is the one it shows.
export function recording(change: string, handBack: number, name: string): Promise<Events> {
  const path = source.file(change, handBack, name);
  return once(path, () => {
    const kept = file<Record<string, string>>(change, handBack, `assets/${name}`).catch(() => ({}));
    return Promise.all([text(path), kept]).then(([events, kept]) => JSON.parse(fromKept(events, kept, (asset) => source.file(change, handBack, asset))));
  });
}

// An SVG drawn as an image asks the viewer's browser for light or dark, whatever the page around it is answered: it's
// asked for as the recording's browser was, as the page is (scheme.ts).
export function fromKept(events: string, kept: Record<string, string>, fileOf: (name: string) => string): string {
  if (!Object.keys(kept).length) return events;
  const said = events.match(/"tag":"browser","payload":\{"dark":(true|false),"still":(true|false)\}/);
  const as = [said?.[1] === "true" ? "dark" : "light", said?.[2] === "true" ? "still" : "moving"].join(",");
  const recorded = (address: string) => address.trim().split(/\s+/)[0]!;
  return events
    .replace(/"srcset":"([^"]*)"/g, (whole, offered: string) => {
      const shown = offered.split(/,\s+/).map(recorded).find((address) => address in kept);
      return shown ? `"srcset":"${shown}"` : whole;
    })
    .replace(/https?:\/\/[^\s"'()\\]+/g, (address) => (address in kept ? fileOf(kept[address]!) + (/\.svg$/.test(kept[address]!) ? `?as=${as}` : "") : address));
}

// What was on the page where a moment's file read it, as it was recorded, and its picture then.
const readingsName = (recording: string) => `readings/${recording.replace(/\.json$/, "")}`;
export const readings = (change: string, handBack: number, recording: string) => file<Reading[]>(change, handBack, `${readingsName(recording)}.json`).catch((): Reading[] => []);
// None for a hand-back recorded before Playthrough glimpsed the page after each action.
export const glimpses = (change: string, handBack: number, recording: string) => file<Glimpse[]>(change, handBack, `${readingsName(recording)}.glimpses.json`).catch((): Glimpse[] => []);
export const picture = (change: string, handBack: number, recording: string, reading: number) => source.file(change, handBack, `${readingsName(recording)}/${reading + 1}.png`);
// One of a moment's frames as it was pictured on the way through it (“first”, “after-1”…).
export const framePicture = (change: string, handBack: number, recording: string, frame: string) => source.file(change, handBack, `${readingsName(recording)}/${frame}.png`);

// What's wrong in plain words, or nothing once it's kept.
export const send = (change: string, send: Send): Promise<string[]> => source.send(change, send);

// A note's frame as a picture, drawn once and kept: its address, and where the note's thing is on it, as shares of the
// screen. Asked for once a page.
// Where its thing is on it, and where a line of words' words are, which is narrower than the line.
export type NoteFrame = { src: string; screen: { width: number; height: number }; box?: { x: number; y: number; width: number; height: number }; words?: { x: number; y: number; width: number; height: number } };
const framing = new Map<string, Promise<NoteFrame | undefined>>();
export function noteFrame(change: string, note: string, framed: Framed): Promise<NoteFrame | undefined> {
  const asked = framing.get(note);
  if (asked) return asked;
  const made = source.frame(change, note, framed).then((drawn) => {
    // Not drawn, it's asked for again next time.
    if (!drawn) return void framing.delete(note);
    return { src: source.file(change, framed.handBack, drawn.picture), screen: drawn.screen, ...(drawn.box && { box: drawn.box }) };
  });
  framing.set(note, made);
  return made;
}

// A moment's still drawn twice as fine, for screens with twice the dots: its address once it's drawn. Asked for once a
// page.
const fine = new Map<string, Promise<string | undefined>>();
export function fineStill(change: string, handBack: number, recording: string, at: number): Promise<string | undefined> {
  const key = `${change} ${handBack} ${recording}`;
  const asked = fine.get(key);
  if (asked) return asked;
  const made = source.still(change, { handBack, recording, at }).then((picture) => picture && source.file(change, handBack, picture));
  fine.set(key, made);
  return made;
}

// What you did in the app, kept as your branch off the moment you took over: its length, in seconds, once it's kept, or
// what's wrong in plain words.
export const keepBranch = (change: string, handBack: number, from: { moment: string; at: number }, events: unknown[], recording: string): Promise<number | string[]> =>
  source.keepBranch(change, { handBack, ...from, events, recording });
