// What the viewer shows of a review on a round, for you: each note with its number, its conversation and who it waits
// for, and where each flow stands for you. What you haven't sent counts as if it were sent, so it shows at once.
// Numbers are the viewer's to give; a note's id is only for the agent.

import {
  accountOf,
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
} from "@mostlyworks/vantage-review";

// What you've written on a round and not sent yet: what a send will carry, the answers that came with their flow's Looks
// good, and the notes you started and haven't saved, which never go.
export type Draft = { notes: Note[]; verdicts: Verdict[]; looksGood: string[]; withTheFlow: string[]; unsaved: Note[] };
export const nothing: Draft = { notes: [], verdicts: [], looksGood: [], withTheFlow: [], unsaved: [] };

// What you haven't sent is the review's, each draft under the round it's about, as a send is: a newer round arriving
// leaves it where it is, and shows it as it shows what you sent.
export type Unsent = Record<number, Draft>;

// What you haven't sent about a round and the ones before it, as one.
export function upTo(unsent: Unsent, round: number): Draft {
  const drafts = Object.entries(unsent).filter(([about]) => Number(about) <= round).map(([, draft]) => draft);
  return {
    notes: drafts.flatMap((draft) => draft.notes),
    verdicts: drafts.flatMap((draft) => draft.verdicts),
    looksGood: drafts.flatMap((draft) => draft.looksGood),
    withTheFlow: drafts.flatMap((draft) => draft.withTheFlow),
    unsaved: drafts.flatMap((draft) => draft.unsaved),
  };
}

// Each draft changed alike, or only the one about a round.
export const everyDraft = (unsent: Unsent, change: (draft: Draft) => Draft): Unsent =>
  Object.fromEntries(Object.entries(unsent).map(([about, draft]) => [about, change(draft)]));
export const draftOn = (unsent: Unsent, round: number, change: (draft: Draft) => Draft): Unsent => ({ ...unsent, [round]: change(unsent[round] ?? nothing) });

// The flows you've watched, each on the round you watched it. One a newer round shows as it was, you've watched there too.
export type Watched = { flow: string; round: number };
export function watchedOn(review: Review, round: number, watched: Watched[]): string[] {
  const on = watched.filter((seen) => seen.round === round || (seen.round < round && unchangedSince(review, seen.round, round).includes(seen.flow)));
  return [...new Set(on.map((seen) => seen.flow))];
}

// What a send carries of the draft.
export const sendOf = ({ notes, verdicts, looksGood }: Draft) => ({ notes, verdicts, looksGood });
export const said = (draft: Draft) => draft.notes.length + draft.verdicts.length + draft.looksGood.length;

// A flow's notes are sent at its end, so the agent starts on them while you watch the rest: what you wrote in it and
// said of the answers in it, with every Looks good you haven't sent and the answers they settle riding along. The rest
// stays for the flows you haven't finished.
export function sendingFlow(draft: Draft, flow: string, notes: Shown[]): { sending: Draft; left: Draft } {
  const inIt = new Set([...notes.filter((note) => note.on?.flow === flow).map((note) => note.id), ...draft.withTheFlow]);
  const its = (note: Note) => note.on?.flow === flow;
  return {
    sending: { ...nothing, notes: draft.notes.filter(its), verdicts: draft.verdicts.filter((verdict) => inIt.has(verdict.note)), looksGood: draft.looksGood },
    left: { ...draft, notes: draft.notes.filter((note) => !its(note)), verdicts: draft.verdicts.filter((verdict) => !inIt.has(verdict.note)), looksGood: [], withTheFlow: [] },
  };
}

// The flows a newer round shows as they were: nothing found changed in them since, or only what the agent says isn't
// real.
function unchangedSince(review: Review, since: number, round: number): string[] {
  const flows = review.rounds.find((kept) => kept.number === round)?.flows ?? [];
  const comparison = review.comparisons.find((kept) => kept.round === round && kept.since === since);
  if (!comparison) return [];
  const real = comparison.changes.filter((change) => !("notReal" in (accountOf(review, round, change.id) ?? {})));
  return flows.filter((flow) => !real.some((change) => change.seen.some((seen) => seen.flow === flow.name))).map((flow) => flow.name);
}

// Amber waits for you, slate for the agent or for someone else, green is settled.
export type State = "needs you" | "with the agent" | "with someone else" | "settled";

// `written` is the round it was written on; `waitingFor` names the others it waits for; `toJudge` says it has an answer
// nobody has judged yet, which anyone can.
export type Shown = { id: string; number: number; on?: Place; written: number; turns: Turn[]; state: State; waitingFor: string[]; yours: boolean; toJudge: boolean; unsent: boolean };

// The rounds anyone can see: the one being worked on is the agent's until it's finished.
export function seen(review: Review): Review {
  return { ...review, rounds: review.rounds.filter((round) => round.finished) };
}

// The review as it was on a round, so looking back shows what was said then and nothing after.
function asOf(review: Review, round: number): Review {
  return { ...review, rounds: review.rounds.filter((kept) => kept.number <= round), sends: review.sends.filter((send) => send.round <= round) };
}

// What you haven't sent, each draft as the last send on its round.
export function asIfSent(review: Review, you: string, unsent: Unsent): Review {
  const drafts = Object.entries(unsent).filter(([, draft]) => said(draft));
  if (!drafts.length) return review;
  const sent = new Date().toISOString();
  return { ...review, sends: [...review.sends, ...drafts.map(([round, draft]) => ({ id: `unsent ${round}`, round: Number(round), by: you, sent, ...sendOf(draft) }))] };
}

// Numbered in the order they were started, across the whole review.
function numbers(review: Review): Map<string, number> {
  const order = review.rounds.flatMap((round) => review.sends.filter((send) => send.round === round.number).flatMap((send) => send.notes.map((note) => note.id)));
  return new Map(order.map((id, i) => [id, i + 1]));
}

// The notes on a round: those started on it, those with something said on it, and any not settled yet.
export function notesOn(review: Review, round: number, you: string, unsent: Unsent = {}): Shown[] {
  return everyNote(review, round, you, unsent).filter(([, on]) => on).map(([note]) => note);
}

// The notes settled on the rounds before it, nothing said about them since.
export function settledBefore(review: Review, round: number, you: string): Shown[] {
  return everyNote(review, round, you, {}).filter(([, on]) => !on).map(([note]) => note);
}

function everyNote(review: Review, round: number, you: string, unsent: Unsent): [Shown, boolean][] {
  const then = asOf(asIfSent(review, you, unsent), round);
  const draft = upTo(unsent, round);
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
    const shown = { id, number: numbered.get(id) ?? 0, on: note.on, written: started, turns, state, waitingFor, yours: yours.has(id), toJudge: toJudge(turns), unsent };
    every.push([shown, started === round || turns.some((turn) => turn.round === round) || state !== "settled"]);
  }
  return every.sort(([a], [b]) => a.number - b.number);
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

export function standings(review: Review, round: number, you: string, unsent: Unsent, watched: string[]): Map<string, Standing> {
  const then = asOf(asIfSent(review, you, unsent), round);
  const notes = notesOn(review, round, you, unsent);
  const draft = upTo(unsent, round);
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
// the timeline and its number in its card are always the same colour.
function tone(note: Shown): "amber" | "slate" | "green" {
  if (note.state === "settled") return "green";
  return note.unsent || note.state === "needs you" ? "amber" : "slate";
}

export const fill = (note: Shown) => ({ amber: "bg-amber", slate: "bg-slate", green: "bg-green" })[tone(note)];
export const ink = (note: Shown) => `var(--${tone(note)})`;
