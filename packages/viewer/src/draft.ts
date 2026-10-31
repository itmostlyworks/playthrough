// What's yours on a review, kept in this browser so a reload loses nothing, and nobody else sees it: what you've written
// and not sent yet, which sending empties, and the flows you've watched, each under the round it's about.

import { useState } from "react";
import { nothing, said, type Unsent, type Watched } from "./notes.ts";

export function useUnsent(review: string) {
  return useKept<Unsent>(
    `playthrough:${review}:unsent`,
    (kept) => Object.fromEntries(Object.entries(kept ?? {}).map(([round, draft]) => [round, { ...nothing, ...(draft as object) }])),
    (unsent) => Object.values(unsent).every((draft) => !said(draft) && !draft.unsaved.length),
    () => Object.fromEntries(movedFrom(review, "").map(({ round, kept }) => [round, kept])) as Unsent,
  );
}

export function useWatched(review: string) {
  return useKept<Watched[]>(
    `playthrough:${review}:watched`,
    (kept) => (Array.isArray(kept) ? kept : []),
    (watched) => !watched.length,
    () => movedFrom(review, ":watched").flatMap(({ round, kept }) => (Array.isArray(kept) ? kept.map((flow: string) => ({ flow, round })) : [])),
  );
}

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

function useKept<T>(key: string, shape: (kept: unknown) => T, empty: (value: T) => boolean, moved: () => T): [T, (change: (value: T) => T) => void] {
  const read = (key: string) => {
    if (stored(key) === null) keep(key, moved(), empty);
    return shape(stored(key));
  };
  const [kept, setKept] = useState(() => ({ key, value: read(key) }));
  if (kept.key !== key) setKept({ key, value: read(key) });

  const change = (change: (value: T) => T) =>
    setKept((kept) => {
      const value = change(kept.value);
      keep(kept.key, value, empty);
      return { key: kept.key, value };
    });
  return [kept.key === key ? kept.value : read(key), change];
}

function keep<T>(key: string, value: T, empty: (value: T) => boolean) {
  try {
    if (empty(value)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // the browser keeps nothing here: it lives until the page closes
  }
}
