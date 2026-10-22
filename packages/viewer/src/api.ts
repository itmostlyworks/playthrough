// The viewer's side of `vantage open`: the review as it's kept, arriving again whenever it changes, its recordings,
// and what a person sends.

import { useEffect, useState } from "react";
import type { Review, Send } from "@vantage/review";
import type { Events } from "./player.ts";

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

// A recording never changes once its round is finished, so each is fetched once.
const recordings = new Map<string, Promise<Events>>();
export function recording(review: string, round: number, file: string): Promise<Events> {
  const path = `/api/reviews/${review}/rounds/${round}/files/${file}`;
  if (!recordings.has(path)) recordings.set(path, get<Events>(path));
  return recordings.get(path)!;
}

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
