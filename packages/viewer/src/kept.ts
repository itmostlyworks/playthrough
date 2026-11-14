// What this browser keeps for you: your notes and replies not yet sent, by the change's address, until you send them;
// what it kept of what you'd seen before that was kept with the change; and, for this tab, where the list was
// scrolled and which of its quiet lines you'd opened.

import type { Note } from "@playthrough/review";

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

// Your notes on a change not yet sent, kept in this browser until you send them.
const unsentKey = (review: string) => `playthrough:moments:${review}`;

export function unsentOf(review: string): Note[] {
  try {
    return JSON.parse(stored(unsentKey, review) ?? "[]");
  } catch {
    return [];
  }
}

export function keepUnsent(review: string, notes: Note[]) {
  try {
    if (notes.length) localStorage.setItem(unsentKey(review), JSON.stringify(notes));
    else localStorage.removeItem(unsentKey(review));
  } catch {}
}

// Your replies on notes already sent, kept in this browser until you send them, by note.
export type Replied = { note: string; words: string };

const repliesKey = (review: string) => `playthrough:moments-replies:${review}`;

export function repliesOf(review: string): Replied[] {
  try {
    return JSON.parse(stored(repliesKey, review) ?? "[]");
  } catch {
    return [];
  }
}

export function keepReplies(review: string, replies: Replied[]) {
  try {
    if (replies.length) localStorage.setItem(repliesKey(review), JSON.stringify(replies));
    else localStorage.removeItem(repliesKey(review));
  } catch {}
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
