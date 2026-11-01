// What's worked out for each person, never kept: where you last looked at each flow, what's new to you, which notes wait
// for you, whether a flow is good for you, and whether you can accept. A note has one state for everyone, the last word on
// it; Looks good on a flow, and accepting, are each person's own.

import type { Change, Place, Review } from "./model.ts";
import { accountOf, allNotes, conversation, problemsAccepting, waitingForTheAgent, type Turn } from "./rules.ts";

// The last round before `before` you said something about a flow on: a note in it, a verdict on an answer in it, or
// Looks good on it, or taking that back. Once you have, you've seen what's in it. Nothing for a flow you haven't.
export function lastLooked(review: Review, you: string, flow: string, before = Infinity): number | undefined {
  const notes = allNotes(review);
  const rounds = review.sends
    .filter((send) => send.by === you && send.round < before)
    .filter(
      (send) =>
        send.looksGood.includes(flow) ||
        !!send.takenBack?.includes(flow) ||
        send.notes.some((note) => note.on?.flow === flow) ||
        send.verdicts.some((verdict) => notes.get(verdict.note)?.note.on?.flow === flow),
    )
    .map((send) => send.round);
  return rounds.length ? Math.max(...rounds) : undefined;
}

// A change new to you, told once, where you'll meet it, and the round it's new since.
export type Shown = { change: Change; on: Place; since: number };

// What's new to you on a round: each change that's different from the last round you looked at any flow it's in, or
// from Before when you've looked at none of them. It's told in the flow of the note it was made for, or else the first
// flow that shows it, in the order the flows joined the review, so the task's flows come before those the agent added
// for its own choices, whatever their files are called. What the agent says isn't real is never told.
export function newToYou(review: Review, round: number, you: string): Shown[] {
  const recorded = review.rounds.find((kept) => kept.number === round);
  const first = review.rounds[0]?.number;
  if (!recorded || first === undefined) return [];
  const comparisons = review.comparisons.filter((comparison) => comparison.round === round);
  const notes = allNotes(review);
  const order = recorded.flows.map((flow) => flow.name);
  const joined = [...new Set(review.rounds.flatMap((kept) => [...kept.flows.map((flow) => flow.name), ...(kept.cantStart ?? [])]))];

  const found = comparisons.flatMap((comparison) => comparison.changes);
  const shown: Shown[] = [];
  for (const id of new Set(found.map((change) => change.id))) {
    const account = accountOf(review, round, id);
    if (account && "notReal" in account) continue;
    const flows = new Set(found.filter((change) => change.id === id).flatMap((change) => change.seen.map((seen) => seen.flow)));
    const looked = [...flows].map((flow) => lastLooked(review, you, flow, round)).filter((looked) => looked !== undefined);
    const since = looked.length ? Math.max(...looked) : first;
    const change = comparisons.find((comparison) => comparison.since === since)?.changes.find((change) => change.id === id);
    if (!change) continue; // the same as when you last looked

    const noted = account && "note" in account ? notes.get(account.note)?.note.on?.flow : undefined;
    const flow = [noted, ...joined].find((name) => change.seen.some((seen) => seen.flow === name)) ?? change.seen[0]!.flow;
    const on = change.seen.filter((seen) => seen.flow === flow).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0]!;
    shown.push({ change, on, since });
  }
  return shown.sort((a, b) => order.indexOf(a.on.flow) - order.indexOf(b.on.flow) || (a.on.at ?? 0) - (b.on.at ?? 0));
}

// Your notes are the ones you asked the agent about, up to this round: you wrote them, or sent an answer on them back.
export function yourNotes(review: Review, round: number, you: string): Map<string, Turn[]> {
  const yours = new Map<string, Turn[]>();
  for (const id of allNotes(review).keys()) {
    const turns = conversation(review, id).filter((turn) => turn.round <= round);
    if (turns.some((turn) => !turn.agent && turn.by === you && turn.verdict !== "looks good")) yours.set(id, turns);
  }
  return yours;
}

// A note's latest answer is to judge until someone says whether it fixes it. Anyone can, on anyone's note.
export function toJudge(turns: Turn[]): boolean {
  const answered = turns.findLast((turn) => turn.agent)?.round;
  return answered !== undefined && !turns.some((turn) => !turn.agent && turn.verdict && turn.round >= answered);
}

// One of your notes waits for you once it has an answer nobody has judged yet.
export function waitingForYou(review: Review, round: number, you: string): string[] {
  return [...yourNotes(review, round, you)].filter(([, turns]) => toJudge(turns)).map(([id]) => id);
}

// A flow is good for you once you've said it looks good, while nothing new to you is told in it on the rounds since and
// none of your notes in it waits, for you or for the agent.
export function goodForYou(review: Review, round: number, you: string, flow: string): boolean {
  // Your last word on it holds: Looks good, or taking that back.
  const last = review.sends.findLast((send) => send.by === you && send.round <= round && (send.looksGood.includes(flow) || send.takenBack?.includes(flow)));
  if (!last?.looksGood.includes(flow)) return false;
  for (let later = last.round + 1; later <= round; later++)
    if (newToYou(review, later, you).some((shown) => shown.on.flow === flow)) return false;

  const notes = allNotes(review);
  const yours = yourNotes(review, round, you);
  const waiting = [...waitingForYou(review, round, you), ...waitingForTheAgent(review).filter((id) => yours.has(id))];
  return !waiting.some((id) => notes.get(id)?.note.on?.flow === flow);
}

// You can accept once every flow of the latest round is good for you, nothing waits for you, and nothing waits for the
// agent. Anyone can: everyone else's judgement shows with their name, and people can be trusted to read it.
export function readyToAccept(review: Review, you: string): boolean {
  const latest = review.rounds.findLast((round) => round.finished && round.number > 0);
  if (!latest || problemsAccepting(review, you).length || waitingForYou(review, latest.number, you).length) return false;
  return latest.flows.every((flow) => goodForYou(review, latest.number, you, flow.name));
}
