// The one step you can take on a change now, in as few words as say it, and where pressing the change takes you: the
// first thing on it you haven't seen. Read from where it stands (standing.ts) and what this browser keeps unsent.

import { allNotes, latestOf, standingOf, waitingForTheAgent, type Change } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { unsentOf } from "./kept.ts";
import { differentSince, noteSays, seenOf, takingOf, workingSince } from "./standing.ts";

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
      const on = kept.note.on?.moment;
      const moment = handBack.moments.findIndex((one) => one.name === on) + 1;
      return moment && noteSays(change, you, kept.note, true, replies).fresh ? [{ note: id, moment }] : [];
    })
    .sort((a, b) => a.moment - b.moment);
}

// Where pressing a change takes you: the first of its moments with something on it you haven't seen, a moment or an
// answer, so Next goes on through the rest in order and none is left behind; else its first. `note` is that moment's
// first unread answer, where there is one; going in lands on the moment itself, so the answer's card isn't over what
// it's about, and the moment's Next answer opens it.
export function firstUnseen(listed: Listed, you: string): { moment: number; note?: string } {
  const answer = unreadOf(listed, you)[0];
  const moment = unseenOf(listed, you)[0];
  if (answer && (!moment || answer.moment <= moment)) return answer;
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
    if (workingSince(change, latest)) return { is: "with", words: "Agent working" };
    // Just sent, "tell your agent" read as nonsense: you had. What's true is that nothing is listening for it.
    if (waitingForTheAgent(change).length && !listed.agentWaiting) return { is: "with", words: "No agent listening", tell: TELL };
    return { is: "with", words: "Sent" };
  }
  const words = lookOf(listed, you);
  return unseenOf(listed, you).length || unreadOf(listed, you).length ? { is: "look", words } : { is: "done", words };
}

// What's waiting on you, in the order it comes: first what has something you haven't seen or read, then what's seen
// through with something unsent, and last what's seen through with nothing said, so the next is one you can judge; each
// part longest waiting first.
export function waitingInOrder(changes: Listed[], you: string): Listed[] {
  const rank = (one: Listed) => (unseenOf(one, you).length || unreadOf(one, you).length ? 0 : stepOf(one, you).is === "send" ? 1 : 2);
  return changes
    .filter((one) => sectionOf(one, you) === "waiting")
    .sort((a, b) => rank(a) - rank(b) || latestOf(a.change)!.finished!.localeCompare(latestOf(b.change)!.finished!));
}
