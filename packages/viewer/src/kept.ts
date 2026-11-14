// What this browser keeps for you: your notes and replies not yet sent, by the change's address, until you send them;
// what it kept of what you'd seen before that was kept with the change; and, for this tab, where the list was
// scrolled and which of its quiet lines you'd opened.

import { useEffect, useState } from "react";
import type { Note, Send } from "@playthrough/review";

// What this browser keeps for a change, by its address. What it kept by the change's own name alone, before every app's
// changes were listed, comes over to the address once.
export function stored(key: (review: string) => string, review: string): string | null {
  const now = localStorage.getItem(key(review));
  const own = review.slice(review.indexOf("/") + 1);
  if (now !== null || own === review) return now;
  const before = localStorage.getItem(key(own));
  if (before !== null) (localStorage.setItem(key(review), before), localStorage.removeItem(key(own)));
  return before;
}

// Your notes on a change not yet sent, and your replies on notes already sent, kept in this browser until you send
// them: each reply as Send takes it.
export type YourReply = NonNullable<Send["replies"]>[number];
export type Unsent = { notes: Note[]; replies: YourReply[] };

const unsentKey = (review: string) => `playthrough:moments:${review}`;
const repliesKey = (review: string) => `playthrough:moments-replies:${review}`;

function read<T>(key: (review: string) => string, review: string): T[] {
  try {
    return JSON.parse(stored(key, review) ?? "[]");
  } catch {
    return [];
  }
}

export const unsentOf = (review: string): Unsent => ({ notes: read(unsentKey, review), replies: read(repliesKey, review) });

// Changed as it is kept now, not as this tab last read it, so two tabs on one change each add to what the other kept
// rather than the last one's whole list winning; and every tab, this one too, hears of it.
export function keepUnsent(review: string, change: (now: Unsent) => Unsent) {
  const next = change(unsentOf(review));
  try {
    for (const [key, list] of [[unsentKey, next.notes], [repliesKey, next.replies]] as const)
      if (list.length) localStorage.setItem(key(review), JSON.stringify(list));
      else localStorage.removeItem(key(review));
  } catch {}
  dispatchEvent(new Event(CHANGED));
}

const CHANGED = "playthrough:unsent";

// What's unsent on a change, as kept now: again whenever this tab or another changes it.
export function useUnsent(review: string): Unsent {
  const [unsent, setUnsent] = useState(() => unsentOf(review));
  useEffect(() => {
    const again = () => setUnsent((was) => {
      const now = unsentOf(review);
      return JSON.stringify(now) === JSON.stringify(was) ? was : now;
    });
    again();
    addEventListener(CHANGED, again);
    addEventListener("storage", again);
    return () => (removeEventListener(CHANGED, again), removeEventListener("storage", again));
  }, [review]);
  return unsent;
}

// The moments you opened, as this browser kept them before they were kept with the change.
export const seenKey = (review: string, you: string) => `playthrough:moments-seen:${review}:${you}`;

// Where the list was scrolled as you went to a moment, for coming back to it there.
const scrollKey = "playthrough:moments-scroll";

export const keepScroll = () => {
  try {
    sessionStorage.setItem(scrollKey, String(scrollY));
  } catch {}
};

export function scrolledBack() {
  try {
    const kept = Number(sessionStorage.getItem(scrollKey) ?? 0);
    sessionStorage.removeItem(scrollKey);
    return kept;
  } catch {
    return 0;
  }
}

// The quiet lines you've opened, kept while you go to a moment and back.
const openKey = "playthrough:moments-open";

export function openedLines(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(openKey) ?? "[]");
  } catch {
    return [];
  }
}

export function keepOpened(ids: string[]) {
  try {
    sessionStorage.setItem(openKey, JSON.stringify(ids));
  } catch {}
}
