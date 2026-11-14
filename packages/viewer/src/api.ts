// The viewer's side of `playthrough open`: the review as it's kept, arriving again whenever it changes, its recordings,
// and what a person sends.

import { useEffect, useState } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import type { Review, Send } from "@playthrough/review";
import type { Events } from "./replay.ts";

// The review, undefined while it's on its way, a refusal's words when there's no such review; and whether an agent is
// waiting for what's sent, undefined until it's known. Both on one stream, and only while the page is in sight: a browser
// lets six requests at a time go to one address, from all its tabs together, and a stream holds one for as long as it's
// open. Three tabs of a review held two each, and Take over waited for one, forever. Out of sight, a tab lets its
// stream go; back in sight, it opens it again, and everything arrives as it is now: what hasn't changed changes nothing.
export function useReview(id: string): { review?: Review | string[]; agentWaiting?: boolean } {
  const [review, setReview] = useState<Review | string[]>();
  const [agentWaiting, setAgentWaiting] = useState<boolean>();
  useEffect(() => {
    let live: EventSource | undefined;
    let last = "";
    const listen = () => {
      if (document.hidden) return void (live?.close(), (live = undefined));
      if (live && live.readyState !== EventSource.CLOSED) return;
      const stream = (live = new EventSource(`/api/reviews/${id}/live`));
      stream.onmessage = ({ data }) => data !== last && setReview(JSON.parse((last = data)));
      stream.addEventListener("waiting", ({ data }) => setAgentWaiting(JSON.parse(data)));
      // A stream that can't be reached is tried again by itself; one that was refused is closed, and asked again, says
      // why here: no such review, or a file of it that can't be read.
      stream.onerror = async () => {
        if (stream.readyState !== EventSource.CLOSED) return;
        const answer = await fetch(`/api/reviews/${id}/live`).catch(() => undefined);
        if (answer?.ok) return void answer.body?.cancel();
        const problems = await answer?.json().then((said: { problems?: string[] }) => said.problems, () => undefined);
        if (problems) setReview(problems);
      };
    };
    listen();
    document.addEventListener("visibilitychange", listen);
    return () => (document.removeEventListener("visibilitychange", listen), live?.close());
  }, [id]);
  return { review, agentWaiting };
}

// A change as the list has it: the review, at its address on this machine, the app's name and its people as the person
// sees them ("Sam, a member"), and whether an agent is waiting for what's sent.
export type Listed = { review: Review; app: string; people: Record<string, string>; agentWaiting: boolean };

// Every change on this machine, from every app and every copy of each, arriving again whenever any of them changes,
// undefined until it's first come. One stream, while the page is in sight: a browser lets six requests at a time go to
// one address, from all its tabs together. Out of sight, the list is asked for now and then instead, so the tab's
// title still says what's waiting.
export function useChanges(): Listed[] | undefined {
  const [changes, setChanges] = useState<Listed[]>();
  useEffect(() => {
    let live: EventSource | undefined;
    let every = 0;
    let last = "";
    const take = (data: string) => data !== last && setChanges(JSON.parse((last = data)));
    const ask = () => fetch("/api/reviews").then((answer) => (answer.ok ? answer.text() : undefined), () => undefined).then((data) => data && take(data));
    const listen = () => {
      clearInterval(every);
      if (document.hidden) return void (live?.close(), (live = undefined), (every = window.setInterval(ask, 5000)));
      if (live && live.readyState !== EventSource.CLOSED) return;
      live = new EventSource("/api/reviews?live");
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

// A round's files never change once it's finished, so each is fetched once, once it's come: one that didn't is asked
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
function file<T>(review: string, round: number, name: string): Promise<T> {
  const path = `/api/reviews/${review}/rounds/${round}/files/${name}`;
  return once(path, () => get<T>(path));
}

// A recording plays with the fonts, images and stylesheets kept with it, never the app's own, which may be gone or
// somewhere else. Of the sizes an image offered, the one it was recorded at is the one it shows.
export function recording(review: string, round: number, name: string): Promise<Events> {
  const path = `/api/reviews/${review}/rounds/${round}/files/${name}`;
  return once(path, () => {
    const kept = file<Record<string, string>>(review, round, `assets/${name}`).catch(() => ({}));
    const events = fetch(path).then((answer) => (answer.ok ? answer.text() : Promise.reject(new Error(`${path}: ${answer.status}`))));
    return Promise.all([events, kept]).then(([events, kept]) => JSON.parse(fromKept(events, kept, `/api/reviews/${review}/rounds/${round}/files/`)));
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

// What was on the page at each step of a scene, read as it was recorded, and its picture then.
const readingsName = (recording: string) => `readings/${recording.replace(/\.json$/, "")}`;
export const readings = (review: string, round: number, recording: string) => file<Reading[]>(review, round, `${readingsName(recording)}.json`).catch((): Reading[] => []);
// None for a round recorded before Playthrough glimpsed the page after each action.
export const glimpses = (review: string, round: number, recording: string) => file<Glimpse[]>(review, round, `${readingsName(recording)}.glimpses.json`).catch((): Glimpse[] => []);
export const picture = (review: string, round: number, recording: string, reading: number) => `/api/reviews/${review}/rounds/${round}/files/${readingsName(recording)}/${reading + 1}.png`;

// What's wrong in plain words, or nothing once it's kept.
export async function send(review: string, send: Send): Promise<string[]> {
  return post(`/api/reviews/${review}/sends`, send);
}

export async function accept(review: string, by: string): Promise<string[]> {
  return post(`/api/reviews/${review}/accept`, { by });
}

// A scene as a video, alone or beside the round Compare shows, downloaded by your browser, telling the seconds it has
// left as it's made; what's wrong in plain words, or nothing once it's downloaded.
export async function downloadVideo(review: string, filmed: { round: number; scene: string; beside?: number; dark: boolean }, name: string, onLeft: (seconds: number) => void): Promise<string[]> {
  try {
    const answer = await fetch(`/api/reviews/${review}/video`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(filmed) });
    if (!answer.ok || !answer.body) return (await answer.json()).problems ?? [`It wasn't made (${answer.status}).`];
    let said = "";
    for await (const part of answer.body.pipeThrough(new TextDecoderStream())) {
      said += part;
      const lines = said.split("\n");
      said = lines.pop()!;
      for (const line of lines) {
        const told: { left?: number; video?: string; problems?: string[] } = JSON.parse(line);
        if (told.left !== undefined) onLeft(told.left);
        if (told.problems) return told.problems;
        if (told.video) {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(await (await fetch(`data:video/mp4;base64,${told.video}`)).blob());
          link.download = `${name}.mp4`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
          return [];
        }
      }
    }
    return ["The video stopped before it was made. Try again."];
  } catch {
    return ["Playthrough isn't running here any more. Start it again with playthrough open, then try again."];
  }
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
export type NoteFrame = { src: string; screen: { width: number; height: number }; box?: { x: number; y: number; width: number; height: number } };
const framing = new Map<string, Promise<NoteFrame | undefined>>();
export function noteFrame(review: string, note: string, framed: { round: number; recording: string; at: number; node?: number; point?: { x: number; y: number } }): Promise<NoteFrame | undefined> {
  const asked = framing.get(note);
  if (asked) return asked;
  const made = posted<{ picture: string; screen: NoteFrame["screen"]; box?: NoteFrame["box"] }>(`/api/reviews/${review}/frames`, { note, ...framed }).then((done) => {
    // Not drawn, it's asked for again next time.
    if ("problems" in done) return void framing.delete(note);
    return { src: `/api/reviews/${review}/rounds/${framed.round}/files/${done.answer.picture}`, screen: done.answer.screen, ...(done.answer.box && { box: done.answer.box }) };
  });
  framing.set(note, made);
  return made;
}

// What you did in the app, kept as your branch off the scene you took over: its length, in seconds, once it's kept, or
// what's wrong in plain words.
export async function keepBranch(review: string, round: number, from: { scene: string; at: number }, events: unknown[], recording: string): Promise<number | string[]> {
  const done = await posted<{ length: number }>(`/api/reviews/${review}/branches`, { round, ...from, events, recording });
  return "problems" in done ? done.problems : done.answer.length;
}
