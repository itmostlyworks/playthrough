// What the viewer shows of a review on a round: each note with its number, its conversation and what it waits on, from
// what's kept and what you haven't sent yet. Numbers are the viewer's to give; a note's id is only for the agent.

import { allNotes, conversation, type Note, type Place, type Review, type Turn, type Verdict } from "@vantage/review";

// What you've written on a round and not sent yet.
export type Draft = { notes: Note[]; verdicts: Verdict[]; looksGood: string[] };
export const nothing: Draft = { notes: [], verdicts: [], looksGood: [] };

// Amber needs you, slate is with the agent, green is settled.
export type State = "needs you" | "with the agent" | "settled";

export type Shown = { id: string; number: number; on?: Place; turns: Turn[]; state: State; unsent: boolean };

// The rounds anyone can see: the one being worked on is the agent's until it's finished.
export function seen(review: Review): Review {
  return { ...review, rounds: review.rounds.filter((round) => round.finished) };
}

// The review as it was on a round, so looking back shows what was said then and nothing after.
function asOf(review: Review, round: number): Review {
  return { ...review, rounds: review.rounds.filter((kept) => kept.number <= round), sends: review.sends.filter((send) => send.round <= round) };
}

// Numbered in the order they were started, across the whole review: each round's sends in turn, then what you haven't
// sent.
function numbers(review: Review, draft: Draft): Map<string, number> {
  const order: string[] = [];
  for (const round of review.rounds)
    for (const send of review.sends.filter((send) => send.round === round.number)) order.push(...send.notes.map((note) => note.id));
  order.push(...draft.notes.map((note) => note.id));
  return new Map(order.map((id, i) => [id, i + 1]));
}

// The notes on a round: those started on it, those with something said on it, and any not settled yet.
// The draft counts only on the round it was written on.
export function notesOn(review: Review, round: number, you: string, draft: Draft = nothing): Shown[] {
  const then = asOf(review, round);
  const numbered = numbers(then, draft);
  const shown: Shown[] = [];
  for (const [id, { note, round: started }] of allNotes(then)) {
    const turns = conversation(then, id);
    const verdict = draft.verdicts.find((verdict) => verdict.note === id);
    if (verdict) turns.push({ by: you, round, words: verdict.words ?? "", verdict: verdict.verdict });
    const state = stateOf(turns);
    if (started === round || turns.some((turn) => turn.round === round) || state !== "settled")
      shown.push({ id, number: numbered.get(id) ?? 0, on: note.on, turns, state, unsent: !!verdict });
  }
  for (const note of draft.notes)
    shown.push({ id: note.id, number: numbered.get(note.id) ?? 0, on: note.on, turns: [{ by: you, round, words: note.words }], state: "with the agent", unsent: true });
  return shown.sort((a, b) => a.number - b.number);
}

function stateOf(turns: Turn[]): State {
  const last = turns.at(-1);
  if (last?.verdict === "looks good") return "settled";
  return last?.by === "agent" ? "needs you" : "with the agent";
}

// What colour a note's marks are: amber while it needs you, which includes what you haven't sent. The pin, its dot on
// the timeline and its number in the column are always the same colour.
export function fill(note: Shown): string {
  if (note.state === "settled") return "bg-green";
  return note.unsent || note.state === "needs you" ? "bg-amber" : "bg-slate";
}
