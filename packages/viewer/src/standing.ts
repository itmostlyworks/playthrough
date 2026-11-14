// Where a change stands for you, read from it as it's kept: its latest moments, what you've sent on them and seen of
// them, what's different since, and what each note says now, in the page's words.

import { conversation, notesToAnswer, type Note, type Review, type Round, type Scene } from "@playthrough/review";
import type { Listed } from "./api.ts";
import { stored, seenKey, type YourReply } from "./kept.ts";

// What Send says it sends: notes and replies, by their count.
export const toSend = (notes: number, replies: number) =>
  [notes && `${notes} ${notes === 1 ? "note" : "notes"}`, replies && `${replies} ${replies === 1 ? "reply" : "replies"}`].filter(Boolean).join(" and ");

// What a note says wherever it's shown, a line on the list, its picture's words or its pin pointed at: your latest
// words, and where it stands. An answer is new if it came back after you last opened the moment it's on, as what you've
// opened is kept with the change (`seen`), so it's the same on every device you look from.
export function noteSays(review: Review, you: string, note: Note, sent: boolean, replies: YourReply[]) {
  if (!sent) return { words: note.words, stands: "not sent yet", fresh: false };
  const turns = conversation(review, note.id);
  const replied = replies.find((one) => one.note === note.id)?.words;
  const words = replied ?? turns.findLast((turn) => !turn.agent)?.words ?? note.words;
  if (replied) return { words, stands: "reply not sent yet", fresh: false };
  if (!turns.at(-1)?.agent) return { words, stands: "sent", fresh: false };
  const [round, on] = [turns.at(-1)!.round, note.on?.app?.from.scene ?? note.on?.scene];
  const fresh = !seenOf(review, you).some((taking) => Number(taking.slice(0, taking.indexOf(":"))) >= round && taking.slice(taking.indexOf(":") + 1) === on);
  return { words, stands: fresh ? "new answer" : "answered", fresh };
}

// Each moment's taking: seen per taking, so one that's different since asks for you again, once.
export const takingOf = (round: number, scene: string) => `${round}:${scene}`;

// The moments that look different since the taking before, by Playthrough's own comparison, with its words.
export function differentSince(review: Review, round: Round): Map<string, string[]> {
  const before = review.rounds.findLast((one) => one.number < round.number && one.finished);
  const compared = before && review.comparisons.find((one) => one.round === round.number && one.since === before.number);
  const different = new Map<string, string[]>();
  for (const change of compared?.changes ?? []) for (const seen of change.seen) different.set(seen.scene, [...(different.get(seen.scene) ?? []), change.words]);
  return different;
}

// The moments you've opened, kept with the change for you, so they're seen from every browser, each as it was handed
// back: one handed back again, different, asks for you again.
export const seenOf = (review: Review, you: string): string[] => (review.seen?.[you] ?? []).map((one) => takingOf(one.round, one.scene));

// Once each: the page asks again as it draws until the change comes back with it.
const telling = new Set<string>();

// Those this browser kept before they were kept with the change go to it with the first moments told, and are then
// forgotten here.
export function markSeen(review: Review, you: string, takings: string[]) {
  let here: string[] = [];
  try {
    here = JSON.parse(stored((id) => seenKey(id, you), review.id) ?? "[]");
  } catch {}
  const kept = new Set(seenOf(review, you));
  const moments = [...new Set([...here, ...takings])]
    .filter((taking) => !kept.has(taking) && !telling.has(`${review.id}:${taking}`))
    .map((taking) => ({ round: Number(taking.slice(0, taking.indexOf(":"))), scene: taking.slice(taking.indexOf(":") + 1) }))
    .filter(({ round, scene }) => review.rounds.some((one) => one.number === round && one.finished && one.scenes.some((kept) => kept.name === scene)));
  if (!moments.length) return;
  for (const one of moments) telling.add(`${review.id}:${takingOf(one.round, one.scene)}`);
  void fetch(`/api/reviews/${encodeURIComponent(review.id)}/seen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ by: you, moments }) }).then((answer) => {
    if (!answer.ok) return;
    try {
      localStorage.removeItem(seenKey(review.id, you));
    } catch {}
  });
}

// Since when the agent has been working on what was sent, for the round after the latest: only on what asks it
// something, as a send that only says things look good asks for no next round.
export const workingSince = (review: Review, latest: Round) =>
  review.taken.find((taken) => taken.round > latest.number && notesToAnswer(review, taken.round).length > 0)?.at;

// Who a moment is done as, as the list says them ("Sam, a member").
export const whoIn = (listed: Listed, scene: Scene) => (scene.person ? (listed.people[scene.person] ?? scene.person) : "");

// How long ago, as a person says it.
export function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
