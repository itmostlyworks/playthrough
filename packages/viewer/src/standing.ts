// Where a change stands for you, read from it as it's kept: its latest moments, what you've sent on them and seen of
// them, what's different since, and what each note says now, in the page's words.

import { conversation, notesToAnswer, type Note, type Change, type HandBack, type Moment } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { stored, seenKey, type YourReply } from "./kept.ts";

// What Send says it sends: notes and replies, by their count.
export const toSend = (notes: number, replies: number) =>
  [notes && `${notes} ${notes === 1 ? "note" : "notes"}`, replies && `${replies} ${replies === 1 ? "reply" : "replies"}`].filter(Boolean).join(" and ");

// What a note says wherever it's shown, its picture's words or its pin pointed at: your latest
// words, and where it stands. An answer is new if it came back after you last opened the moment it's on, as what you've
// opened is kept with the change (`seen`), so it's the same on every device you look from.
export function noteSays(change: Change, you: string, note: Note, sent: boolean, replies: YourReply[]) {
  if (!sent) return { words: note.words, stands: "not sent yet", fresh: false };
  const turns = conversation(change, note.id);
  const replied = replies.find((one) => one.note === note.id)?.words;
  const words = replied ?? turns.findLast((turn) => !turn.agent)?.words ?? note.words;
  if (replied) return { words, stands: "reply not sent yet", fresh: false };
  if (!turns.at(-1)?.agent) return { words, stands: "sent", fresh: false };
  const [handBack, on] = [turns.at(-1)!.handBack, note.on?.moment];
  const fresh = !seenOf(change, you).some((taking) => Number(taking.slice(0, taking.indexOf(":"))) >= handBack && taking.slice(taking.indexOf(":") + 1) === on);
  return { words, stands: fresh ? "new answer" : "answered", fresh };
}

// Each moment's taking: seen per taking, so one that's different since asks for you again, once.
export const takingOf = (handBack: number, moment: string) => `${handBack}:${moment}`;

// The moments that look different since the taking before, by Playthrough's own comparison, with its words.
export function differentSince(change: Change, handBack: HandBack): Map<string, string[]> {
  const before = change.handBacks.findLast((one) => one.number < handBack.number && one.finished);
  const compared = before && change.comparisons.find((one) => one.handBack === handBack.number && one.since === before.number);
  const different = new Map<string, string[]>();
  for (const finding of compared?.findings ?? []) for (const seen of finding.seen) different.set(seen.moment, [...(different.get(seen.moment) ?? []), finding.words]);
  return different;
}

// The moments you've opened, kept with the change for you, so they're seen from every browser, each as it was handed
// back: one handed back again, different, asks for you again.
export const seenOf = (change: Change, you: string): string[] => (change.seen?.[you] ?? []).map((one) => takingOf(one.handBack, one.moment));

// Once each: the page asks again as it draws until the change comes back with it.
const telling = new Set<string>();

// Those this browser kept before they were kept with the change go to it with the first moments told, and are then
// forgotten here.
export function markSeen(change: Change, you: string, takings: string[]) {
  let here: string[] = [];
  try {
    here = JSON.parse(stored((id) => seenKey(id, you), change.id) ?? "[]");
  } catch {}
  const kept = new Set(seenOf(change, you));
  const opened = [...new Set([...here, ...takings])]
    .filter((taking) => !kept.has(taking) && !telling.has(`${change.id}:${taking}`))
    .map((taking) => ({ handBack: Number(taking.slice(0, taking.indexOf(":"))), moment: taking.slice(taking.indexOf(":") + 1) }))
    .filter(({ handBack, moment }) => change.handBacks.some((one) => one.number === handBack && one.finished && one.moments.some((kept) => kept.name === moment)));
  if (!opened.length) return;
  for (const one of opened) telling.add(`${change.id}:${takingOf(one.handBack, one.moment)}`);
  void fetch(`/api/changes/${encodeURIComponent(change.id)}/seen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ by: you, moments: opened }) }).then((answer) => {
    if (!answer.ok) return;
    try {
      localStorage.removeItem(seenKey(change.id, you));
    } catch {}
  });
}

// Since when the agent has been working on what was sent, for the hand-back after the latest: only on what asks it
// something, as a send that only says things look good asks for no next hand-back.
export const workingSince = (change: Change, latest: HandBack) =>
  change.taken.find((taken) => taken.handBack > latest.number && notesToAnswer(change, taken.handBack).length > 0)?.at;

// Who a moment is done as, as the page says them ("Sam, a member").
export const whoIn = (listed: Listed, moment: Moment) => (moment.person ? (listed.people[moment.person] ?? moment.person) : "");

// How long ago, as a person says it.
export function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
