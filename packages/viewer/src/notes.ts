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

// What you've written on a round and not sent yet: what a send will carry, the answers that came with their flow's Looks
// good, and the notes you started and haven't saved, which never go.
export type Draft = { notes: Note[]; verdicts: Verdict[]; looksGood: string[]; withTheFlow: string[]; unsaved: Note[] };
export const nothing: Draft = { notes: [], verdicts: [], looksGood: [], withTheFlow: [], unsaved: [] };

// What a send carries of the draft.
export const sendOf = ({ notes, verdicts, looksGood }: Draft) => ({ notes, verdicts, looksGood });
export const said = (draft: Draft) => draft.notes.length + draft.verdicts.length + draft.looksGood.length;

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
export function asIfSent(review: Review, round: number, you: string, draft: Draft): Review {
  if (!said(draft)) return review;
  return { ...review, sends: [...review.sends, { id: "unsent", round, by: you, sent: new Date().toISOString(), ...sendOf(draft) }] };
}

// Numbered in the order they were started, across the whole review.
function numbers(review: Review): Map<string, number> {
  const order = review.rounds.flatMap((round) => review.sends.filter((send) => send.round === round.number).flatMap((send) => send.notes.map((note) => note.id)));
  return new Map(order.map((id, i) => [id, i + 1]));
}

// The notes on a round: those started on it, those with something said on it, and any not settled yet.
// The draft counts only on the round it was written on.
export function notesOn(review: Review, round: number, you: string, draft: Draft = nothing): Shown[] {
  return everyNote(review, round, you, draft).filter(([, on]) => on).map(([note]) => note);
}

// The notes settled on the rounds before it, nothing said about them since.
export function settledBefore(review: Review, round: number, you: string): Shown[] {
  return everyNote(review, round, you, nothing).filter(([, on]) => !on).map(([note]) => note);
}

function everyNote(review: Review, round: number, you: string, draft: Draft): [Shown, boolean][] {
  const then = asIfSent(asOf(review, round), round, you, draft);
  const numbered = numbers(then);
  const people = new Set([you, ...then.sends.map((send) => send.by)]);
  const waiting = new Map([...people].map((person) => [person, waitingForYou(then, round, person)]));
  const withTheAgent = waitingForTheAgent(then);
  const yours = yourNotes(then, round, you);

  const every: [Shown, boolean][] = [];
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
    const shown = { id, number: numbered.get(id) ?? 0, on: note.on, turns, state, waitingFor, yours: yours.has(id), toJudge: toJudge(turns, you), unsent };
    every.push([shown, started === round || turns.some((turn) => turn.round === round) || state !== "settled"]);
  }
  return every.sort(([a], [b]) => a.number - b.number);
}

// Everyone a flow is good for on a round, as they've sent it.
export function goodTo(review: Review, round: number, flow: string): string[] {
  const then = asOf(review, round);
  return [...new Set(then.sends.map((send) => send.by))].filter((person) => goodForYou(then, round, person, flow));
}

// Where a flow stands for you, what you haven't sent counting as sent. It's good, as every flow is once the work is
// accepted, when nothing more is asked; or a note you started in it isn't
// saved; or what you said in it is yours to send, or with the agent, so it asks nothing more this round; or it asks
// whether it's good: once you've watched it, settling the answers in it you haven't judged, and before that it waits for
// your answers, or looked good earlier and changed since, or is still to watch. `count` is how many it's about.
export type Standing = {
  is: "good" | "not saved" | "needs you" | "to send" | "with the agent" | "is it good" | "looked good" | "to watch";
  count: number;
  asks: boolean;
};

export function standings(review: Review, round: number, you: string, draft: Draft, watched: string[]): Map<string, Standing> {
  const then = asIfSent(asOf(review, round), round, you, draft);
  const notes = notesOn(review, round, you, draft);
  const flows = review.rounds.find((kept) => kept.number === round)?.flows ?? [];
  return new Map(
    flows.map(({ name }): [string, Standing] => {
      const on = notes.filter((note) => note.on?.flow === name);
      const waiting = on.filter((note) => note.state === "needs you").length;
      const toSend = on.filter((note) => note.unsent && note.state === "with the agent").length;
      const sent = on.some((note) => note.yours && !note.unsent && note.state === "with the agent");
      const stands = (is: Standing["is"], count = 0, asks = true) => [name, { is, count, asks }] as [string, Standing];
      if (review.accepted) return stands("good", 0, false);
      if (goodForYou(then, round, you, name)) return stands("good");
      if (draft.unsaved.some((note) => note.on?.flow === name)) return stands("not saved", 1, false);
      if (toSend || sent) return waiting ? stands("needs you", waiting, false) : toSend ? stands("to send", toSend, false) : stands("with the agent", 0, false);
      if (watched.includes(name)) return stands("is it good", waiting);
      if (waiting) return stands("needs you", waiting);
      if (then.sends.some((send) => send.by === you && send.looksGood.includes(name))) return stands("looked good");
      return stands("to watch");
    }),
  );
}

// Your Looks good on a flow settles the answers in it you haven't judged, as a Looks good to each. Taking it back takes
// those back with it, and nothing you said yourself.
export function lookGood(draft: Draft, flow: string, notes: Shown[]): Draft {
  const riding = notes.filter((note) => note.on?.flow === flow && note.state === "needs you").map((note) => note.id);
  return {
    ...draft,
    looksGood: [...draft.looksGood.filter((kept) => kept !== flow), flow],
    verdicts: [...draft.verdicts, ...riding.map((note) => ({ note, verdict: "looks good" as const }))],
    withTheFlow: [...draft.withTheFlow, ...riding],
  };
}

export function takeBack(draft: Draft, flow: string, notes: Shown[]): Draft {
  const riding = draft.withTheFlow.filter((id) => notes.find((note) => note.id === id)?.on?.flow === flow);
  return {
    ...draft,
    looksGood: draft.looksGood.filter((kept) => kept !== flow),
    verdicts: draft.verdicts.filter((verdict) => !riding.includes(verdict.note)),
    withTheFlow: draft.withTheFlow.filter((id) => !riding.includes(id)),
  };
}

// What colour a note's marks are: amber while it needs you, which includes what you haven't sent. The pin, its dot on
// the timeline and its number in the column are always the same colour.
function tone(note: Shown): "amber" | "slate" | "green" {
  if (note.state === "settled") return "green";
  return note.unsent || note.state === "needs you" ? "amber" : "slate";
}

export const fill = (note: Shown) => ({ amber: "bg-amber", slate: "bg-slate", green: "bg-green" })[tone(note)];
export const ink = (note: Shown) => `var(--${tone(note)})`;
