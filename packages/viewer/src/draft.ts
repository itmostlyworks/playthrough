// What's yours on a round, kept in this browser so a reload loses nothing, and nobody else sees it: what you've written
// and not sent yet, which sending empties, and the flows you've watched.

import { useState } from "react";
import { nothing, said, type Draft } from "./notes.ts";

export function useDraft(review: string, round: number) {
  return useKept<Draft>(`vantage:${review}:${round}`, (kept) => ({ ...nothing, ...(kept as object) }), (draft) => !said(draft) && !draft.unsaved.length);
}

export function useWatched(review: string, round: number) {
  return useKept<string[]>(`vantage:${review}:${round}:watched`, (kept) => (Array.isArray(kept) ? kept : []), (flows) => !flows.length);
}

function useKept<T>(key: string, shape: (kept: unknown) => T, empty: (value: T) => boolean): [T, (change: (value: T) => T) => void] {
  const read = (key: string) => {
    try {
      return shape(JSON.parse(localStorage.getItem(key) ?? "null"));
    } catch {
      return shape(null);
    }
  };
  const [kept, setKept] = useState(() => ({ key, value: read(key) }));
  if (kept.key !== key) setKept({ key, value: read(key) });

  const change = (change: (value: T) => T) =>
    setKept((kept) => {
      const value = change(kept.value);
      try {
        if (empty(value)) localStorage.removeItem(kept.key);
        else localStorage.setItem(kept.key, JSON.stringify(value));
      } catch {
        // the browser keeps nothing here: it lives until the page closes
      }
      return { key: kept.key, value };
    });
  return [kept.key === key ? kept.value : read(key), change];
}
