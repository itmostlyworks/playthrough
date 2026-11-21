// The one step you can take on a change now, in as few words as say it, and where pressing the change takes you: the
// first thing on it you haven't seen. Read from where it stands (standing.ts) and what this browser keeps unsent.

import { allNotes, latestOf, standingOf, waitingForTheAgent, type Change, type HandBack } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { unsentOf } from "./kept.ts";
import { differentSince, noteSays, seenOf, shownOn, takingOf, workingSince } from "./standing.ts";

export type Step =
  // Waiting on you, with something you haven't seen: pressing the change goes to it.
  | { is: "look"; words: string }
  // Waiting on you, all seen and nothing said: Done, and the words say it's all seen.
  | { is: "done"; words: string }
  // Something said and not sent, wherever the change stands: Send, and while it waits on you, what's left to see.
  | { is: "send"; notes: number; replies: number; words?: string }
  // With your agents: what they're doing with it, or, with `tell`, what you can do about it.
  | { is: "with"; words: string; tell?: string }
  // Done, or nothing handed back yet: nothing to do, only when.
  | { is: "quiet"; words: string };

// Which part of every change it's in: waiting on you, with your agents, or done.
export type Section = "waiting" | "agents" | "done";

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The moments of its latest hand-back you haven't seen: one seen in this hand-back, or the same as one seen before, is
// seen; one different since asks again.
export function unseenOf(listed: Listed, you: string): number[] {
  const { change } = listed;
  const handBack = latestOf(change);
  if (!handBack) return [];
  const seen = seenOf(change, you);
  const different = differentSince(change, handBack);
  return handBack.moments.flatMap((moment, i) => {
    const before = seen.some((one) => one === moment.name || one.endsWith(`:${moment.name}`));
    return seen.includes(takingOf(handBack.number, moment.name)) || (before && !different.has(moment.name)) ? [] : [i + 1];
  });
}

// The answers you haven't opened, each with the moment it's on, in the order the moments come.
export function unreadOf(listed: Listed, you: string): { note: string; moment: number }[] {
  const { change } = listed;
  const handBack = latestOf(change);
  if (!handBack) return [];
  const { replies } = unsentOf(change.id, handBack.number);
  return [...allNotes(change)]
    .flatMap(([id, kept]) => {
      const on = shownOn(change, handBack, kept.note);
      const moment = handBack.moments.findIndex((one) => one.name === on) + 1;
      return moment && noteSays(change, you, kept.note, true, replies).fresh ? [{ note: id, moment }] : [];
    })
    .sort((a, b) => a.moment - b.moment);
}

// Every moment seen and every answer read: all that's left on it is Send or Done.
export const seenThrough = (listed: Listed, you: string) => !unseenOf(listed, you).length && !unreadOf(listed, you).length;

// Where pressing a change takes you: the first of its moments with something on it you haven't seen, a moment or an
// answer, so Next goes on through the rest in order and none is left behind; else its first. Going in lands on the
// moment itself, so an answer's card isn't over what it's about: its note says it's new, and → opens it.
export function firstUnseen(listed: Listed, you: string): { moment: number } {
  const answer = unreadOf(listed, you)[0];
  const moment = unseenOf(listed, you)[0];
  if (answer && (!moment || answer.moment <= moment)) return { moment: answer.moment };
  return { moment: moment ?? 1 };
}

// What's left to look at on a change, in the words its step says: the moments you haven't seen, as so many more when
// you've seen some, so landing on the second of two is what was said; the answers you haven't read; or that it's all seen.
export function lookOf(listed: Listed, you: string): string {
  const handBack = latestOf(listed.change);
  if (!handBack) return "";
  const [unseen, unread, count] = [unseenOf(listed, you).length, unreadOf(listed, you).length, handBack.moments.length];
  const moments = !unseen ? "" : unseen === count ? counted(count, "moment", "moments") : `${unseen} more ${unseen === 1 ? "moment" : "moments"}`;
  const answers = unread ? counted(unread, "answer", "answers") : "";
  if (moments) return `See ${moments}${answers && `, ${answers}`}`;
  if (answers) return `Read ${answers}`;
  return count === 1 ? "Seen" : `All ${count} seen`;
}

// What a newer hand-back holds against the one you're on, in a line: the moments that look different, are new or are
// gone, as Playthrough's own comparison of the two says, and the agent's answers in it; or that nothing changed.
export function newerSays(change: Change, on: HandBack, newer: HandBack): string {
  const compared = change.comparisons.find((one) => one.handBack === newer.number && one.since === on.number);
  const names = (handBack: HandBack) => handBack.moments.map((one) => one.name);
  const changed = new Set(compared?.findings.flatMap((finding) => finding.seen.map((seen) => seen.moment)).filter((name) => names(on).includes(name)));
  const added = names(newer).filter((name) => !names(on).includes(name)).length;
  const gone = names(on).filter((name) => !names(newer).includes(name)).length;
  const answers = newer.replies.length;
  const moments = [
    changed.size && `${counted(changed.size, "moment", "moments")} changed`,
    added && `${added} new ${added === 1 ? "moment" : "moments"}`,
    gone && `${counted(gone, "moment", "moments")} gone`,
  ].filter((one): one is string => !!one);
  const answered = answers ? counted(answers, "answer", "answers") : "";
  if (!moments.length) return answered ? `${answered}, no moment changed` : "Nothing changed";
  return [...moments, ...(answered ? [answered] : [])].join(", ");
}

// Handed back again since you last looked: an earlier hand-back of it was seen or sent on by you, so this one is the
// agent's answer, not its first word.
export function backAgain(change: Change, you: string): boolean {
  const handBack = latestOf(change);
  if (!handBack) return false;
  const earlier = (n: number) => n < handBack.number;
  return seenOf(change, you).some((taking) => earlier(Number(taking.slice(0, taking.indexOf(":"))))) || change.sends.some((one) => one.by === you && earlier(one.handBack));
}

// What to say to an agent so it picks up what you sent, when none is listening for it.
const TELL = "Pick up my notes in Playthrough.";
export const NO_AGENT = "No agent listening";

// An agent is on the change: one is listening for what's sent, or one took what was sent before and is on it, so
// what's sent now reaches it. Without one, what's sent is kept for the next.
export function agentOn(listed: Listed): boolean {
  const latest = latestOf(listed.change);
  return listed.agentWaiting || (!!latest && !!workingSince(listed.change, latest) && !listed.agentGone);
}

// What to tell a new agent: while what you sent waits for one, and none is on it. Just sent, "tell your agent" read as
// nonsense: you had. What's true is that nothing is listening for it.
export function tellOf(listed: Listed, you: string): string | undefined {
  const { change } = listed;
  return latestOf(change) && standingOf(change, you).is === "sent" && waitingForTheAgent(change).length && !agentOn(listed) ? TELL : undefined;
}

// Nothing handed back yet, it's with your agents; handed back, where it stands for you.
export function sectionOf(listed: Listed, you: string): Section {
  if (!latestOf(listed.change)) return "agents";
  const { is } = standingOf(listed.change, you);
  return is === "waiting" ? "waiting" : is === "sent" ? "agents" : "done";
}

export function stepOf(listed: Listed, you: string): Step {
  const { change } = listed;
  const latest = latestOf(change);
  if (!latest) return { is: "quiet", words: "Nothing back yet" };
  const unsent = unsentOf(change.id, latest.number);
  const [notes, replies] = [unsent.notes.length, unsent.replies.length];
  const standing = standingOf(change, you);
  if (notes + replies) return { is: "send", notes, replies, ...(standing.is === "waiting" && { words: lookOf(listed, you) }) };
  if (standing.is === "done") return { is: "quiet", words: "" };
  if (standing.is === "sent") {
    // Taken, it's being worked on until the agent that took it has ended (where that can be known), when it's the
    // next agent's, as if never taken.
    if (workingSince(change, latest) && agentOn(listed)) return { is: "with", words: "Agent working" };
    const tell = tellOf(listed, you);
    if (tell) return { is: "with", words: NO_AGENT, tell };
    return { is: "with", words: "Sent" };
  }
  const words = lookOf(listed, you);
  return seenThrough(listed, you) ? { is: "done", words } : { is: "look", words };
}

// What's waiting on you, in the order it comes: first what has something you haven't seen or read, then what's seen
// through with something unsent, and last what's seen through with nothing said, so the next is one you can judge; each
// part longest waiting first.
export function waitingInOrder(changes: Listed[], you: string): Listed[] {
  const rank = (one: Listed) => (!seenThrough(one, you) ? 0 : stepOf(one, you).is === "send" ? 1 : 2);
  return changes
    .filter((one) => sectionOf(one, you) === "waiting")
    .sort((a, b) => rank(a) - rank(b) || latestOf(a.change)!.finished!.localeCompare(latestOf(b.change)!.finished!));
}
