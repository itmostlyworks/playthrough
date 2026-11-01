// What's yours on a review, kept in this browser so a reload loses nothing, and nobody else sees it: what you've written
// and not sent yet, which sending empties, and the flows you've watched, each under the round it's about.

import { useState } from "react";
import { nothing, said, type Unsent, type Watched } from "./notes.ts";

type Kept<T> = { key: string; shape: (kept: unknown) => T; empty: (value: T) => boolean; moved: () => T };

const unsent = (review: string): Kept<Unsent> => ({
  key: `playthrough:${review}:unsent`,
  shape: (kept) => Object.fromEntries(Object.entries(kept ?? {}).map(([round, draft]) => [round, { ...nothing, ...(draft as object) }])),
  empty: (unsent) => Object.values(unsent).every((draft) => !said(draft) && !draft.unsaved.length),
  moved: () => Object.fromEntries(movedFrom(review, "").map(({ round, kept }) => [round, kept])) as Unsent,
});

const watched = (review: string): Kept<Watched[]> => ({
  key: `playthrough:${review}:watched`,
  shape: (kept) => (Array.isArray(kept) ? kept : []),
  empty: (watched) => !watched.length,
  moved: () => movedFrom(review, ":watched").flatMap(({ round, kept }) => (Array.isArray(kept) ? kept.map((flow: string) => ({ flow, round })) : [])),
});

export const useUnsent = (review: string) => useKept(unsent(review));
export const useWatched = (review: string) => useKept(watched(review));
// As they are now, for every review at once.
export const unsentOn = (review: string) => read(unsent(review));
export const watchedOf = (review: string) => read(watched(review));

// Kept before what you haven't sent was the review's, under a key for each round: taken from there, once.
function movedFrom(review: string, end: string): { round: number; kept: unknown }[] {
  const pattern = new RegExp(`^playthrough:${review.replace(/[^\w-]/g, "\\$&")}:(\\d+)${end}$`);
  try {
    return Object.keys(localStorage).flatMap((key) => {
      const round = pattern.exec(key)?.[1];
      if (round === undefined) return [];
      const kept = stored(key);
      localStorage.removeItem(key);
      return kept ? [{ round: Number(round), kept }] : [];
    });
  } catch {
    return [];
  }
}

function stored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function read<T>({ key, shape, empty, moved }: Kept<T>): T {
  if (stored(key) === null) keep(key, moved(), empty);
  return shape(stored(key));
}

function useKept<T>(it: Kept<T>): [T, (change: (value: T) => T) => void] {
  const [kept, setKept] = useState(() => ({ key: it.key, value: read(it) }));
  if (kept.key !== it.key) setKept({ key: it.key, value: read(it) });

  const change = (change: (value: T) => T) =>
    setKept((kept) => {
      const value = change(kept.value);
      keep(kept.key, value, it.empty);
      return { key: kept.key, value };
    });
  return [kept.key === it.key ? kept.value : read(it), change];
}

function keep<T>(key: string, value: T, empty: (value: T) => boolean) {
  try {
    if (empty(value)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // the browser keeps nothing here: it lives until the page closes
  }
}
