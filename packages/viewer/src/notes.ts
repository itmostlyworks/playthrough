// What the viewer shows of a review on a round, for you: each note with its number, its conversation and who it waits
// for, and who says each flow looks good. What you haven't sent counts as if it were sent, so it shows at once.
// Numbers are the viewer's to give; a note's id is only for the agent.

import {
  allNotes,
  conversation,
  goodForYou,
  toJudge,
  waitingForTheAgent,
  waitingForYou,
  yourNotes,
  type Note,
  type Place,
  type Review,
  type Turn,
  type Verdict,
} from "@vantage/review";

// What you've written on a round and not sent yet.
export type Draft = { notes: Note[]; verdicts: Verdict[]; looksGood: string[] };
export const nothing: Draft = { notes: [], verdicts: [], looksGood: [] };

// Amber waits for you, slate for the agent or for someone else, green is settled.
export type State = "needs you" | "with the agent" | "with someone else" | "settled";

// `waitingFor` names the others it waits for; `toJudge` says it has an answer you haven't judged, on your note or not.
export type Shown = { id: string; number: number; on?: Place; turns: Turn[]; state: State; waitingFor: string[]; yours: boolean; toJudge: boolean; unsent: boolean };

// The rounds anyone can see: the one being worked on is the agent's until it's finished.
export function seen(review: Review): Review {
  return { ...review, rounds: review.rounds.filter((round) => round.finished) };
}

// The review as it was on a round, so looking back shows what was said then and nothing after.
function asOf(review: Review, round: number): Review {
  return { ...review, rounds: review.rounds.filter((kept) => kept.number <= round), sends: review.sends.filter((send) => send.round <= round) };
}

// What you haven't sent, as the last send on its round.
function sending(review: Review, round: number, you: string, draft: Draft): Review {
  if (!draft.notes.length && !draft.verdicts.length && !draft.looksGood.length) return review;
  return { ...review, sends: [...review.sends, { id: "unsent", round, by: you, sent: new Date().toISOString(), ...draft }] };
}

// Numbered in the order they were started, across the whole review.
function numbers(review: Review): Map<string, number> {
  const order = review.rounds.flatMap((round) => review.sends.filter((send) => send.round === round.number).flatMap((send) => send.notes.map((note) => note.id)));
  return new Map(order.map((id, i) => [id, i + 1]));
}

// The notes on a round: those started on it, those with something said on it, and any not settled yet.
// The draft counts only on the round it was written on.
export function notesOn(review: Review, round: number, you: string, draft: Draft = nothing): Shown[] {
  const then = sending(asOf(review, round), round, you, draft);
  const numbered = numbers(then);
  const people = new Set([you, ...then.sends.map((send) => send.by)]);
  const waiting = new Map([...people].map((person) => [person, waitingForYou(then, round, person)]));
  const withTheAgent = waitingForTheAgent(then);
  const yours = yourNotes(then, round, you);

  const shown: Shown[] = [];
  for (const [id, { note, round: started }] of allNotes(then)) {
    const turns = conversation(then, id);
    const waitingFor = [...people].filter((person) => person !== you && waiting.get(person)?.includes(id));
    const state: State = waiting.get(you)?.includes(id)
      ? "needs you"
      : withTheAgent.includes(id)
        ? "with the agent"
        : waitingFor.length
          ? "with someone else"
          : "settled";
    const unsent = draft.notes.some((kept) => kept.id === id) || draft.verdicts.some((verdict) => verdict.note === id);
    if (started === round || turns.some((turn) => turn.round === round) || state !== "settled")
      shown.push({ id, number: numbered.get(id) ?? 0, on: note.on, turns, state, waitingFor, yours: yours.has(id), toJudge: toJudge(turns, you), unsent });
  }
  return shown.sort((a, b) => a.number - b.number);
}

// Everyone a flow is good for on a round, as they've sent it.
export function goodTo(review: Review, round: number, flow: string): string[] {
  const then = asOf(review, round);
  return [...new Set(then.sends.map((send) => send.by))].filter((person) => goodForYou(then, round, person, flow));
}

// What colour a note's marks are: amber while it needs you, which includes what you haven't sent. The pin, its dot on
// the timeline and its number in the column are always the same colour.
function tone(note: Shown): "amber" | "slate" | "green" {
  if (note.state === "settled") return "green";
  return note.unsent || note.state === "needs you" ? "amber" : "slate";
}

export const fill = (note: Shown) => ({ amber: "bg-amber", slate: "bg-slate", green: "bg-green" })[tone(note)];
export const ink = (note: Shown) => `var(--${tone(note)})`;
