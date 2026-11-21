// A kept change as a state starts it: as it was when one of its versions was handed back, with what the person had done
// by then, and its times moved so that moment is now. Also what the pretend agent answers with, when it hands back the
// next kept version to notes the person has just written.

import { allNotes, latestOf, notesToAnswer, type Change, type HandBack, type Moment, type Note, type Reply, type Seen, type Send } from "@playthrough/change";
import type { State } from "./list.ts";

// A moment made from another for a longer change: its recording's files are the other's, under a name of its own.
export type MadeFrom = { handBack: number; recording: string; from: string };

export type AsItWas = {
  change?: Change;
  // The person's notes, written in the page and not yet sent.
  unsent: Note[];
  madeFrom: MadeFrom[];
};

// Done, as the person says it in a state: one send, the same every time.
const DONE_ID = "saiddone";

export function asItWas(kept: Change, state: State, you: string, now: Date): AsItWas {
  if (state.empty) return { unsent: [], madeFrom: [] };
  const latest = latestOf(kept)?.number ?? 1;
  const version = state.version === "latest" ? latest : (kept.sends.find((send) => send.notes.length && send.handBack <= latest)?.handBack ?? 1);
  const yours = (send: Send): Send => (send.guest ? send : { ...send, by: you });

  // Everything up to that version handing back: what the person said before it, which it answered.
  let handBacks = kept.handBacks.filter((handBack) => handBack.number <= version);
  const sends = kept.sends.filter((send) => send.handBack < version).map(yours);
  const taken = kept.taken.filter((one) => one.handBack <= version);
  const comparisons = kept.comparisons.filter((comparison) => comparison.handBack <= version);
  const madeFrom: MadeFrom[] = [];
  if (state.moments) {
    const longer = longerOf(handBacks.at(-1)!, state.moments);
    handBacks = [...handBacks.slice(0, -1), longer.handBack];
    madeFrom.push(...longer.madeFrom);
  }

  // Moved so that version was handed back a moment ago.
  const by = now.getTime() - Math.max(...[...handBacks.map((one) => one.finished), ...sends.map((one) => one.sent), ...taken.map((one) => one.at)].map(timeOf));
  const moved = (iso: string) => new Date(timeOf(iso) + by).toISOString();
  const change: Change = {
    ...kept,
    started: moved(kept.started),
    handBacks: handBacks.map((one) => ({ ...one, ...(one.finished && { finished: moved(one.finished) }) })),
    comparisons,
    sends: sends.map((one) => ({ ...one, sent: moved(one.sent) })),
    taken: taken.map((one) => ({ ...one, at: moved(one.at) })),
    seen: {},
  };

  // What the person said on it, as far as the state says.
  const said = kept.sends.filter((send) => send.handBack === version && send.notes.length).map(yours);
  const at = now.toISOString();
  if (state.notes === "sent" || state.notes === "taken") change.sends.push(...said.map((one) => ({ ...one, sent: at })));
  if (state.notes === "taken") change.taken.push(...said.map((one) => ({ send: one.id, handBack: version + 1, at })));
  if (state.notes === "done") change.sends.push({ id: DONE_ID, handBack: version, by: you, sent: at, notes: [], done: true });
  const unsent = state.notes === "written" ? said.flatMap((one) => one.notes) : [];

  const seen = watched(change.handBacks, version, state.watched);
  if (seen.length) change.seen = { [you]: seen };
  return { change, unsent, madeFrom };
}

// What the person has opened: every moment, those of the versions before, all but the last, or the first few.
function watched(handBacks: HandBack[], version: number, watched: State["watched"]): Seen[] {
  if (watched === "nothing") return [];
  const all = handBacks.flatMap((handBack) => handBack.moments.map((moment) => ({ handBack: handBack.number, moment: moment.name })));
  const earlier = all.filter((one) => one.handBack < version);
  const now = all.filter((one) => one.handBack === version);
  if (watched === "earlier") return earlier;
  if (watched === "all but the last") return [...earlier, ...now.slice(0, -1)];
  if (watched === "some") return [...earlier, ...now.slice(0, Math.ceil(now.length / 3))];
  return all;
}

// A version made `length` moments long from its own: each made again under a name of its own, “(2)”, “(3)”, in turn.
export function longerOf(handBack: HandBack, length: number): { handBack: HandBack; madeFrom: MadeFrom[] } {
  const own = handBack.moments;
  const moments: Moment[] = [...own];
  const madeFrom: MadeFrom[] = [];
  for (let i = own.length; i < length && own.length; i++) {
    const from = own[i % own.length]!;
    const again = Math.floor(i / own.length) + 1;
    const recording = from.recording.replace(/(\.json)?$/, `-${again}$1`);
    moments.push({ ...from, name: `${from.name} (${again})`, recording });
    madeFrom.push({ handBack: handBack.number, recording, from: from.recording });
  }
  return { handBack: { ...handBack, moments }, madeFrom };
}

// The next kept version's answers, to the notes the person has just sent: each kept reply to the note it answered, to
// one on the same moment, or else to any; a note more than the kept ones answered is answered plainly. A reply goes on
// showing where its thing is only on the moment it was kept for.
export function answersFor(kept: Change, next: HandBack, change: Change): Reply[] {
  const keptNotes = allNotes(kept);
  const notes = allNotes(change);
  const left = next.replies.filter((reply) => notesToAnswer(kept, next.number).includes(reply.note));
  const momentOf = (note?: Note) => note?.on?.moment;
  const take = (found: (reply: Reply) => boolean) => {
    const at = left.findIndex(found);
    return at < 0 ? undefined : left.splice(at, 1)[0];
  };
  return notesToAnswer(change, next.number).map((id) => {
    const moment = momentOf(notes.get(id)?.note);
    const same = take((reply) => reply.note === id) ?? take((reply) => momentOf(keptNotes.get(reply.note)?.note) === moment);
    if (same) return { ...same, note: id };
    const any = take(() => true);
    return any ? { note: id, words: any.words } : { note: id, words: "Done." };
  });
}

const timeOf = (iso?: string) => (iso ? Date.parse(iso) : -Infinity);
