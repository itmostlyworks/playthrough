// What the viewer shows of a review on a round, for you: each note with its number, its conversation and who it waits
// for, and where each scene stands for you. What you haven't sent counts as if it were sent, so it shows at once.
// Numbers are the viewer's to give; a note's id is only for the agent.

import {
  accountOf,
  allNotes,
  conversation,
  goodForYou,
  notesToAnswer,
  toJudge,
  waitingForTheAgent,
  waitingForYou,
  yourNotes,
  type Note,
  type Place,
  type Review,
  type Round,
  type Send,
  type Turn,
  type Verdict,
} from "@playthrough/review";

// What you've written on a round and not sent yet: what a send will carry, with the Looks goods you've sent and taken
// back since, the answers that came with their scene's Looks good, and the notes you started and haven't saved, which
// never go.
export type Draft = { notes: Note[]; verdicts: Verdict[]; replies: Replied[]; looksGood: string[]; takenBack: string[]; withTheScene: string[]; unsaved: Note[] };
export const nothing: Draft = { notes: [], verdicts: [], replies: [], looksGood: [], takenBack: [], withTheScene: [], unsaved: [] };
// A reply of yours on a note: words to what the agent said, judging nothing.
export type Replied = NonNullable<Send["replies"]>[number];

// What you haven't sent is the review's, each draft under the round it's about, as a send is: a newer round arriving
// leaves it where it is, and shows it as it shows what you sent.
export type Unsent = Record<number, Draft>;

// What you haven't sent about a round and the ones before it, as one.
export function upTo(unsent: Unsent, round: number): Draft {
  const drafts = Object.entries(unsent).filter(([about]) => Number(about) <= round).map(([, draft]) => draft);
  return {
    notes: drafts.flatMap((draft) => draft.notes),
    verdicts: drafts.flatMap((draft) => draft.verdicts),
    replies: drafts.flatMap((draft) => draft.replies),
    looksGood: drafts.flatMap((draft) => draft.looksGood),
    takenBack: drafts.flatMap((draft) => draft.takenBack),
    withTheScene: drafts.flatMap((draft) => draft.withTheScene),
    unsaved: drafts.flatMap((draft) => draft.unsaved),
  };
}

// Each draft changed alike, or only the one about a round.
export const everyDraft = (unsent: Unsent, change: (draft: Draft) => Draft): Unsent =>
  Object.fromEntries(Object.entries(unsent).map(([about, draft]) => [about, change(draft)]));
export const draftOn = (unsent: Unsent, round: number, change: (draft: Draft) => Draft): Unsent => ({ ...unsent, [round]: change(unsent[round] ?? nothing) });

// What a send carries of the draft.
export const sendOf = ({ notes, verdicts, replies, looksGood, takenBack }: Draft) => ({ notes, verdicts, ...(replies.length && { replies }), looksGood, ...(takenBack.length && { takenBack }) });
// What a send holds, in a few words: the notes, the answers judged and replied to, the scenes that look good.
export function toSend(draft: Draft): string {
  const count = (n: number, one: string, many: string) => (n ? [`${n} ${n === 1 ? one : many}`] : []);
  const judged = draft.verdicts.filter((verdict) => !draft.withTheScene.includes(verdict.note)).length;
  return [
    ...count(draft.notes.length, "note", "notes"),
    ...count(judged, "answer judged", "answers judged"),
    ...count(draft.replies.length, "reply", "replies"),
    ...count(draft.looksGood.length, "looks good", "look good"),
  ].join(", ");
}

export const said = (draft: Draft) => draft.notes.length + draft.verdicts.length + draft.replies.length + draft.looksGood.length + draft.takenBack.length;

// The scenes a newer round shows as they were: nothing found changed in them since, or only what the agent says isn't
// real.
export function unchangedSince(review: Review, since: number, round: number): string[] {
  const scenes = review.rounds.find((kept) => kept.number === round)?.scenes ?? [];
  const comparison = review.comparisons.find((kept) => kept.round === round && kept.since === since);
  if (!comparison) return [];
  const real = comparison.changes.filter((change) => !("notReal" in (accountOf(review, round, change.id) ?? {})));
  return scenes.filter((scene) => !real.some((change) => change.seen.some((seen) => seen.scene === scene.name))).map((scene) => scene.name);
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

// Each round's scenes with those it changed first, since the round before, or since Before on the first, then those it
// left as they were: the page opens on what's new, and the scenes play, and are gone through, in the same order. It's
// the round's own order, so nothing moves when you send.
export function changedFirst(review: Review): Review {
  const rounds = review.rounds.map((round) => {
    const same = unchangedSince(review, Math.max(0, round.number - 1), round.number);
    return same.length ? { ...round, scenes: [...round.scenes.filter((scene) => !same.includes(scene.name)), ...round.scenes.filter((scene) => same.includes(scene.name))] } : round;
  });
  return { ...review, rounds };
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

// Every note on a round, each one thread as it stands: one settled rounds ago is still there, as a resolved comment is
// still on its line. Before, a note settled on an earlier round left the page, found only by looking back at that
// round, where it was as it stood then, its answer not yet in.
export function notesOn(review: Review, round: number, you: string, unsent: Unsent = {}): Shown[] {
  const then = asOf(asIfSent(review, you, unsent), round);
  const draft = upTo(unsent, round);
  const numbered = numbers(then);
  const people = new Set([you, ...then.sends.map((send) => send.by)]);
  const waiting = new Map([...people].map((person) => [person, waitingForYou(then, round, person)]));
  const withTheAgent = waitingForTheAgent(then);
  const yours = yourNotes(then, round, you);

  const every: Shown[] = [];
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
    const unsent = [...draft.notes.map((kept) => kept.id), ...draft.verdicts.map((verdict) => verdict.note), ...draft.replies.map((reply) => reply.note)].includes(id);
    every.push({ id, number: numbered.get(id) ?? 0, on: note.on, written: started, turns, state, waitingFor, yours: yours.has(id), toJudge: toJudge(turns), unsent });
  }
  return every.sort((a, b) => a.number - b.number);
}

// Where a scene stands for you, what you haven't sent counting as sent. It's good, as every scene is once the work is
// accepted, when nothing more is asked; or a note you started in it isn't
// saved; or what you said in it is yours to send, or with the agent, so it asks nothing more this round; or it asks
// whether it's good: once you've watched it, settling the answers in it you haven't judged, and before that it waits for
// your answers, or looked good earlier and changed since, or is still to watch. `count` is how many it's about.
export type Standing = {
  is: "good" | "not saved" | "needs you" | "to send" | "with the agent" | "is it good" | "looked good" | "to watch";
  count: number;
  asks: boolean;
};

export function standings(review: Review, round: number, you: string, unsent: Unsent): Map<string, Standing> {
  const then = asOf(asIfSent(review, you, unsent), round);
  const notes = notesOn(review, round, you, unsent);
  const draft = upTo(unsent, round);
  const scenes = review.rounds.find((kept) => kept.number === round)?.scenes ?? [];
  return new Map(
    scenes.map(({ name }): [string, Standing] => {
      const on = notes.filter((note) => note.on?.scene === name);
      const waiting = on.filter((note) => note.state === "needs you").length;
      const toSend = on.filter((note) => note.unsent && note.state === "with the agent").length;
      const sent = on.some((note) => note.yours && !note.unsent && note.state === "with the agent");
      const stands = (is: Standing["is"], count = 0, asks = true) => [name, { is, count, asks }] as [string, Standing];
      if (review.accepted) return stands("good", 0, false);
      if (goodForYou(then, round, you, name)) return stands("good");
      if (draft.unsaved.some((note) => note.on?.scene === name)) return stands("not saved", 1, false);
      if (toSend || sent) return waiting ? stands("needs you", waiting, false) : toSend ? stands("to send", toSend, false) : stands("with the agent", 0, false);
      if (waiting) return stands("needs you", waiting);
      const lastWord = then.sends.findLast((send) => send.by === you && (send.looksGood.includes(name) || send.takenBack?.includes(name)));
      if (lastWord?.looksGood.includes(name)) return stands("looked good");
      return stands("is it good");
    }),
  );
}

// A scene that still needs you: not good, and not only waiting on what you've said for the agent.
export const needsYou = (standing: Standing | undefined) => !!standing && standing.is !== "good" && standing.is !== "with the agent";

// Since when the agent has been working on what was sent, for the round after the latest: only on what asks it
// something, as a send that only says things look good asks for no next round.
export const workingSince = (review: Review, latest: Round) =>
  review.accepted ? undefined : review.taken.find((taken) => taken.round > latest.number && notesToAnswer(review, taken.round).length > 0)?.at;

// Your Looks good on a scene settles the answers in it you haven't judged, as a Looks good to each. Taking it back takes
// those back with it, and nothing you said yourself. One you've sent is taken back by saying so, in the next send.
export function lookGood(draft: Draft, scene: string, notes: Shown[]): Draft {
  const riding = notes.filter((note) => note.on?.scene === scene && note.state === "needs you").map((note) => note.id);
  return {
    ...draft,
    looksGood: [...draft.looksGood.filter((kept) => kept !== scene), scene],
    verdicts: [...draft.verdicts, ...riding.map((note) => ({ note, verdict: "looks good" as const }))],
    withTheScene: [...draft.withTheScene, ...riding],
  };
}

export function takeBack(draft: Draft, scene: string, notes: Shown[]): Draft {
  const riding = draft.withTheScene.filter((id) => notes.find((note) => note.id === id)?.on?.scene === scene);
  return {
    ...draft,
    looksGood: draft.looksGood.filter((kept) => kept !== scene),
    verdicts: draft.verdicts.filter((verdict) => !riding.includes(verdict.note)),
    withTheScene: draft.withTheScene.filter((id) => !riding.includes(id)),
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
