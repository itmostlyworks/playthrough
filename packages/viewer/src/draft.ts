// What you've written on a round and not sent yet, kept in this browser so a reload loses nothing. Nobody else sees it,
// and sending empties it.

import { useState } from "react";
import { nothing, type Draft } from "./notes.ts";

export function useDraft(review: string, round: number): [Draft, (change: (draft: Draft) => Draft) => void] {
  const key = `vantage:${review}:${round}`;
  const [kept, setKept] = useState(() => ({ key, draft: read(key) }));
  if (kept.key !== key) setKept({ key, draft: read(key) });

  const change = (change: (draft: Draft) => Draft) =>
    setKept((kept) => {
      const draft = change(kept.draft);
      write(kept.key, draft);
      return { key: kept.key, draft };
    });
  return [kept.key === key ? kept.draft : read(key), change];
}

function read(key: string): Draft {
  try {
    return { ...nothing, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return nothing;
  }
}

function write(key: string, draft: Draft) {
  try {
    if (draft.notes.length || draft.verdicts.length || draft.looksGood.length) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // the browser keeps nothing here: the draft lives until the page closes
  }
}
