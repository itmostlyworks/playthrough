// The viewer's side of `playthrough open`: the review as it's kept, arriving again whenever it changes, its recordings,
// and what a person sends.

import { useEffect, useState } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import type { Review, Send } from "@playthrough/review";
import type { Events } from "./replay.ts";

export type Listed = { id: string; title: string; rounds: number; accepted: boolean };

// undefined while it's on its way; a refusal's words when there's no such review.
export function useReview(id: string): Review | string[] | undefined {
  const [review, setReview] = useState<Review | string[]>();
  useEffect(() => {
    const live = new EventSource(`/api/reviews/${id}/live`);
    live.onmessage = (message) => setReview(JSON.parse(message.data));
    // A stream that can't be reached is tried again by itself; one that was refused is closed, and asked again, says why
    // here: no such review, or a file of it that can't be read.
    live.onerror = async () => {
      if (live.readyState !== EventSource.CLOSED) return;
      const answer = await fetch(`/api/reviews/${id}/live`).catch(() => undefined);
      if (answer?.ok) return void answer.body?.cancel();
      const problems = await answer?.json().then((said: { problems?: string[] }) => said.problems, () => undefined);
      if (problems) setReview(problems);
    };
    return () => live.close();
  }, [id]);
  return review;
}

export function useReviews(): Listed[] | undefined {
  const [reviews, setReviews] = useState<Listed[]>();
  useEffect(() => void get<Listed[]>("/api/reviews").then(setReviews), []);
  return reviews;
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

export function fromKept(events: string, kept: Record<string, string>, files: string): string {
  if (!Object.keys(kept).length) return events;
  const recorded = (address: string) => address.trim().split(/\s+/)[0]!;
  return events
    .replace(/"srcset":"([^"]*)"/g, (whole, offered: string) => {
      const shown = offered.split(/,\s+/).map(recorded).find((address) => address in kept);
      return shown ? `"srcset":"${shown}"` : whole;
    })
    .replace(/https?:\/\/[^\s"'()\\]+/g, (address) => (address in kept ? files + kept[address] : address));
}

// What was on the page at each step of a flow, read as it was recorded, and its picture then.
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

// A flow as a video, alone or beside the round Compare shows, saved where your browser saves files; what's wrong in
// plain words, or nothing once it's saved.
export async function saveVideo(review: string, filmed: { round: number; flow: string; beside?: number; dark: boolean }, name: string): Promise<string[]> {
  try {
    const answer = await fetch(`/api/reviews/${review}/video`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(filmed) });
    if (!answer.ok) return (await answer.json()).problems ?? [`It wasn't made (${answer.status}).`];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await answer.blob());
    link.download = `${name}.mp4`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    return [];
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

// What you did in the app, kept as your branch off the flow you took over: its length, in seconds, once it's kept, or
// what's wrong in plain words.
export async function keepBranch(review: string, round: number, from: { flow: string; at: number }, events: unknown[], recording: string): Promise<number | string[]> {
  const done = await posted<{ length: number }>(`/api/reviews/${review}/branches`, { round, ...from, events, recording });
  return "problems" in done ? done.problems : done.answer.length;
}
