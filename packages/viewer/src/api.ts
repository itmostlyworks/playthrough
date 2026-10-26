// The viewer's side of `vantage open`: the review as it's kept, arriving again whenever it changes, its recordings,
// and what a person sends.

import { useEffect, useState } from "react";
import type { Reading } from "@vantage/page";
import type { Review, Send } from "@vantage/review";
import type { Events } from "./replay.ts";

export type Listed = { id: string; title: string; rounds: number; accepted: boolean };

// undefined while it's on its way; a refusal's words when there's no such review.
export function useReview(id: string): Review | string[] | undefined {
  const [review, setReview] = useState<Review | string[]>();
  useEffect(() => {
    const live = new EventSource(`/api/reviews/${id}/live`);
    live.onmessage = (message) => setReview(JSON.parse(message.data));
    // A stream that can't be reached is tried again by itself; one that was refused is closed, and says why here.
    live.onerror = async () => {
      if (live.readyState !== EventSource.CLOSED) return;
      const listed = await get<Listed[]>("/api/reviews").catch(() => undefined);
      if (listed && !listed.some((review) => review.id === id)) setReview([`There's no review called “${id}” here.`]);
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

// A round's files never change once it's finished, so each is fetched once.
const files = new Map<string, Promise<unknown>>();
function file<T>(review: string, round: number, name: string): Promise<T> {
  const path = `/api/reviews/${review}/rounds/${round}/files/${name}`;
  if (!files.has(path)) files.set(path, get<T>(path));
  return files.get(path) as Promise<T>;
}

// A recording plays with the fonts, images and stylesheets kept with it, never the app's own, which may be gone or
// somewhere else. Of the sizes an image offered, the one it was recorded at is the one it shows.
export function recording(review: string, round: number, name: string): Promise<Events> {
  const path = `/api/reviews/${review}/rounds/${round}/files/${name}`;
  if (!files.has(path)) {
    const kept = file<Record<string, string>>(review, round, `assets/${name}`).catch(() => ({}));
    const events = fetch(path).then((answer) => (answer.ok ? answer.text() : Promise.reject(new Error(`${path}: ${answer.status}`))));
    files.set(path, Promise.all([events, kept]).then(([events, kept]) => JSON.parse(fromKept(events, kept, `/api/reviews/${review}/rounds/${round}/files/`))));
  }
  return files.get(path) as Promise<Events>;
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
export const picture = (review: string, round: number, recording: string, reading: number) => `/api/reviews/${review}/rounds/${round}/files/${readingsName(recording)}/${reading + 1}.png`;

// What's wrong in plain words, or nothing once it's kept.
export async function send(review: string, send: Send): Promise<string[]> {
  return post(`/api/reviews/${review}/sends`, send);
}

export async function accept(review: string, by: string): Promise<string[]> {
  return post(`/api/reviews/${review}/accept`, { by });
}

async function get<T>(path: string): Promise<T> {
  const answer = await fetch(path);
  if (!answer.ok) throw new Error(`${path}: ${answer.status}`);
  return answer.json();
}

async function post(path: string, body: unknown): Promise<string[]> {
  try {
    const answer = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return answer.ok ? [] : ((await answer.json()).problems ?? [`It wasn't kept (${answer.status}).`]);
  } catch {
    return ["Vantage isn't running here any more. Start it again with vantage open, then try again."];
  }
}
