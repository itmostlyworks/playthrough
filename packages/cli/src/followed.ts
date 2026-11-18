// A note followed into what's about to be handed back: where its thing shows there, and how it looks against the frame
// the note was written on. A person notes on what happens along the way, and Playthrough knows a moment by where it
// ends, so its thing is looked for in every frame the hand-back already keeps, never by running anything again. It's
// told as a fact, in Playthrough's words; where the frames don't allow it, nothing is said.

import { differences, looksAsItWas, type Glimpse, type Reading, type Thing } from "@playthrough/page";
import { allNotes, madeInApp, quote, type Change, type Changes, type HandBack, type Moment, type Note, type Shown } from "@playthrough/change";
import { findingsAt } from "./findings.ts";
import { glimpsesOn, readingsOn } from "./reporter.ts";

// A frame of a moment as it was read: as its step began ("first"), after each thing done ("after-1"…), each pictured
// under that name, or its end, read and pictured once it rested. With how many things had been done by then.
export type MomentFrame = { name?: string; at: number; done: number; read: Reading };

// Where a note's thing is in a hand-back: the moment, the frame, and the thing there; and, where the note's own frame
// was read, whether it looks as it did then, and if not, what's different, as comparing hand-backs says it.
export type Followed = { moment: Moment; frame: MomentFrame; thing: Thing; looks?: "the same" | string[] };

// Each frame of a moment, in order. Its glimpses after its step began are its frames, as they were pictured: one
// that couldn't be read wasn't pictured either.
export function framesOf(moment: Moment, readings: Reading[], glimpses: Glimpse[]): MomentFrame[] {
  const end = readings.at(-1);
  if (!end) return [];
  const done = (at: number) => moment.actions.filter((action) => action.at >= moment.from && action.at <= at).length;
  const begun = glimpses.findIndex((glimpse) => glimpse.at >= moment.from);
  const inStep = begun < 0 ? [] : glimpses.slice(begun).filter((glimpse) => glimpse.at <= end.at);
  return [
    ...inStep.map((glimpse, i) => ({ name: i ? `after-${i}` : "first", at: glimpse.at, done: done(glimpse.at), read: { ...glimpse, picture: "" } })),
    { at: moment.length, done: moment.actions.filter((action) => action.at >= moment.from).length, read: end },
  ];
}

// The frame a note was written on, and its thing there: the frame nearest its time with its element, by the recording's
// own numbering, or else something of its role and name.
export function writtenOn(frames: MomentFrame[], on: Note["on"]): { frame: MomentFrame; thing: Thing } | undefined {
  const element = on?.element;
  if (!on || madeInApp(on) || !element || on.at === undefined) return undefined;
  const at = on.at;
  const nearest = (test: (thing: Thing) => boolean) => {
    let best: { frame: MomentFrame; thing: Thing } | undefined;
    for (const frame of frames) {
      const thing = frame.read.things.find(test);
      if (thing && (!best || Math.abs(frame.read.at - at) < Math.abs(best.frame.read.at - at))) best = { frame, thing };
    }
    return best;
  };
  return (element.node === undefined ? undefined : nearest((thing) => thing.node === element.node)) ?? nearest((thing) => thing.role === element.role && thing.name === element.name);
}

// Where it is now: on its own moment, at the frame lined up with the one it was written on by the things done, as it
// became there; else the first frame of its own moment with something of its role and name; else, the same way, the
// first moment marked since the note that has it. Then is what it was on, where that was read.
export function follow(note: Note, then: { frames: MomentFrame[]; moment?: Moment } | undefined, now: { moment: Moment; frames: MomentFrame[]; own: boolean; since: boolean }[]): Followed | undefined {
  const element = note.on?.element;
  if (!element) return undefined;
  const was = then && writtenOn(then.frames, note.on);
  const named = (thing: Thing) => thing.role === (was?.thing.role ?? element.role) && thing.name === (was?.thing.name ?? element.name);
  const looks = (frame: MomentFrame, thing: Thing): Followed["looks"] => {
    if (!was) return undefined;
    if (looksAsItWas(was.thing, thing)) return "the same";
    return findingsAt(was.frame.read, frame.read)
      .filter((found) => [found.element, ...(found.alike ?? [])].some((one) => one && one.node === thing.node && one.role === thing.role))
      .map((found) => found.words);
  };
  const own = now.find((one) => one.own);
  if (own && was && then?.moment) {
    const lined = linedUp(was.frame, then.frames, then.moment, own.frames, own.moment);
    const became = lined && [...differences(was.frame.read, lined.read).was].find(([, before]) => before === was.thing)?.[0];
    if (lined && became) return { moment: own.moment, frame: lined, thing: became, looks: looks(lined, became) };
  }
  for (const { moment, frames } of [...(own ? [own] : []), ...now.filter((one) => one.since)])
    for (const frame of frames) {
      const thing = frame.read.things.find(named);
      if (thing) return { moment, frame, thing, looks: looks(frame, thing) };
    }
}

// The frame of a moment now that's where the frame then was: after the same things done, where the things done that far
// are the same, and as many frames on after them.
function linedUp(frame: MomentFrame, thenMomentFrames: MomentFrame[], then: Moment, nowMomentFrames: MomentFrame[], now: Moment): MomentFrame | undefined {
  const whats = (moment: Moment) => moment.actions.filter((action) => action.at >= moment.from).map((action) => action.what);
  const [before, after] = [whats(then).slice(0, frame.done), whats(now).slice(0, frame.done)];
  if (after.length < before.length || before.some((what, i) => what !== after[i])) return undefined;
  const alike = (frames: MomentFrame[]) => frames.filter((one) => one.done === frame.done);
  const at = alike(thenMomentFrames).indexOf(frame);
  const there = alike(nowMomentFrames);
  return frame.name === undefined ? nowMomentFrames.at(-1) : there[Math.min(at, there.length - 1)];
}

// Each note waiting on this hand-back that's on a thing, followed into it from the hand-back it was written on.
export async function followEach(changes: Changes, change: Change, handBack: HandBack, notes: string[]): Promise<Map<string, Followed | undefined>> {
  const all = allNotes(change);
  const framesIn = async (number: number, moment: Moment) => framesOf(moment, await readingsOn(changes, change.id, number, moment), await glimpsesOn(changes, change.id, number, moment));
  const followed = new Map<string, Followed | undefined>();
  for (const id of notes) {
    const note = all.get(id)?.note;
    const on = note?.on;
    if (!note || !on?.element) continue;
    const earlier = change.handBacks.find((one) => one.number === on.handBack);
    const thenMoment = earlier?.moments.find((one) => one.name === on.moment);
    const then = thenMoment && !madeInApp(on) ? { moment: thenMoment, frames: await framesIn(on.handBack, thenMoment) } : undefined;
    const now = [];
    for (const moment of handBack.moments) {
      const own = moment.name === on.moment;
      const since = !earlier?.moments.some((one) => one.name === moment.name);
      if (own || since) now.push({ moment, own, since, frames: await framesIn(handBack.number, moment) });
    }
    followed.set(id, follow(note, then, now));
  }
  return followed;
}

// Where a note's thing is, as it's kept with the answer, for the person's page to open the note there.
export const shownOf = ({ moment, frame, thing }: Followed): Shown => ({
  moment: moment.name,
  at: frame.at,
  element: { role: thing.role, name: thing.name, ...(thing.node !== undefined && { node: thing.node }) },
  ...(frame.name && { frame: frame.name }),
});

// The fact, in a line: where the thing shows in what's about to be handed back and how it looks there, or that it
// doesn't. A note that isn't on a thing gets none.
export function followedSaid(change: Change, id: string, followed: Followed | undefined): string | undefined {
  const on = allNotes(change).get(id)?.note.on;
  if (!on?.element) return undefined;
  const which = `Note ${id}, the ${on.element.role} ${quote(on.element.name)} on ${quote(on.moment)}`;
  if (!followed)
    return `${which}: isn't in that moment or any marked since the note was written, so the person will have your answer and nothing to look at. If it asked for a change, mark a moment that shows it.`;
  const { moment, frame, looks } = followed;
  const where = `${moment.name === on.moment ? "" : `in ${quote(moment.name)} `}${frame.name === undefined ? "at its end" : frame.done ? `after ${doneSaid(moment, frame.done)}` : "as it begins"}`;
  const how = looks === undefined ? "" : looks === "the same" ? ", and looks the same as when the note was written" : `, and looks different from when the note was written${looks.length ? `: ${looks.join("; ")}` : ""}`;
  return `${which}: shown ${where}${how}.`;
}

// A thing done, as a recording names it (“click button “Oct 5””), as a person says it: “clicking the button “Oct 5””.
function doneSaid(moment: Moment, done: number): string {
  const what = moment.actions.filter((action) => action.at >= moment.from)[done - 1]?.what;
  if (!what) return `the ${ordinal(done)} thing done`;
  const [does = "", ...rest] = what.split(" ");
  const key = does === "press" ? rest.shift() : undefined;
  const [, role, name] = rest.join(" ").match(/^([\w-]+)(?: (“.*”))?$/) ?? [];
  const on = role ? ` the ${role}${name ? ` ${name}` : ""}` : "";
  const verbs: Record<string, string> = { click: "clicking", dblclick: "double-clicking", type: "typing in", selectOption: "choosing in", check: "checking", uncheck: "unchecking", hover: "pointing at" };
  if (key) return `pressing ${key}${on && ` in${on}`}`;
  return `${verbs[does] ?? does}${on}`;
}
const ordinal = (n: number) => ["first", "second", "third", "fourth", "fifth"][n - 1] ?? `${n}th`;
