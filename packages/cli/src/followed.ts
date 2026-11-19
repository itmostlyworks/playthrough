// A note followed into what's about to be handed back: where its thing shows there, and how it looks against the frame
// the note was written on. A person notes on what happens along the way, and Playthrough knows a moment by where it
// ends, so its thing is looked for in every frame the hand-back already keeps, never by running anything again. It's
// told as a fact, in Playthrough's words; where the frames don't allow it, nothing is said.

import { differences, inSight, looksAsItWas, type Glimpse, type Reading, type Thing } from "@playthrough/page";
import { allNotes, madeInApp, quote, type Change, type Changes, type HandBack, type Moment, type Note, type Shown } from "@playthrough/change";
import { findingsAt } from "./findings.ts";
import { glimpsesOn, readingsOn } from "./reporter.ts";

// A frame of a moment as it was read: as its step began ("first"), after each thing done or once a scroll it made had
// settled ("after-1"…), each pictured under that name, or its end, read and pictured once it rested. With how many things
// had been done by then, and since when the page it shows was there: from the thing done it follows, or for a scroll's,
// from when the scroll began.
export type MomentFrame = { name?: string; at: number; done: number; since: number; scrolled?: true; read: Reading };

// Where a note's thing is in a hand-back: the moment, the frame, and the thing there; and, where the note's own frame
// was read, whether it looks as it did then, and if not, what's different, as comparing hand-backs says it.
export type Followed = { moment: Moment; frame: MomentFrame; thing: Thing; looks?: "the same" | string[] };

// Each frame of a moment, in order. Its glimpses after its step began are its frames, as they were pictured: one
// that couldn't be read wasn't pictured either.
export function framesOf(moment: Moment, readings: Reading[], glimpses: Glimpse[]): MomentFrame[] {
  const end = readings.at(-1);
  if (!end) return [];
  const shown = moment.actions.filter((action) => action.at >= moment.from);
  const done = (at: number) => shown.filter((action) => action.at <= at).length;
  const begun = glimpses.findIndex((glimpse) => glimpse.at >= moment.from);
  const inStep = begun < 0 ? [] : glimpses.slice(begun).filter((glimpse) => glimpse.at <= end.at);
  const frames: MomentFrame[] = [];
  for (const [i, glimpse] of inStep.entries()) {
    const [count, before] = [done(glimpse.at), frames.at(-1)];
    const scrolled = !!before && count === before.done;
    const since = !before ? -Infinity : scrolled ? (glimpse.scrolled ?? before.at) : shown[count - 1]!.at;
    frames.push({ name: i ? `after-${i}` : "first", at: glimpse.at, done: count, since, ...(scrolled && { scrolled: true as const }), read: { ...glimpse, picture: "" } });
  }
  const last = frames.at(-1);
  const since = !last ? -Infinity : shown.length > last.done ? shown.at(-1)!.at : last.at;
  return [...frames, { at: moment.length, done: shown.length, since, read: end }];
}

// The frame a note was written on, and its thing there: the frame whose page was there at its time, else the one nearest
// its time, with its element, by the recording's own numbering, or else something of its role and name. Written while a
// scroll was under way, it's the page scrolled where it was going.
export function writtenOn(frames: MomentFrame[], on: Note["on"]): { frame: MomentFrame; thing: Thing } | undefined {
  const element = on?.element;
  if (!on || madeInApp(on) || !element || on.at === undefined) return undefined;
  const at = on.at;
  const nearest = (test: (thing: Thing) => boolean) => {
    const there = frames.findLast((frame) => frame.since <= at);
    const found = there?.read.things.find(test);
    if (there && found) return { frame: there, thing: found };
    let best: { frame: MomentFrame; thing: Thing } | undefined;
    for (const frame of frames) {
      const thing = frame.read.things.find(test);
      if (thing && (!best || Math.abs(frame.read.at - at) < Math.abs(best.frame.read.at - at))) best = { frame, thing };
    }
    return best;
  };
  return (element.node === undefined ? undefined : nearest((thing) => thing.node === element.node)) ?? nearest((thing) => thing.role === element.role && thing.name === element.name);
}

// Whether the page at a time in a moment was where a scroll it made had brought it, with nothing done since.
export const scrolledAt = (frames: MomentFrame[], at: number): boolean => !!frames.findLast((frame) => frame.since <= at)?.scrolled;

// Where it is now: on its own moment, at the frame lined up with the one it was written on by the things done, as it
// became there, or the first frame after that where it's in sight; else the first frame of its own moment with something
// of its role and name in sight; else, the same way, the first moment marked since the note that has it. A frame where
// it's out of sight, past the screen's edge or scrolled away inside a part, doesn't show it. Then is what it was on,
// where that was read; how it looks against that is said only where it was in sight then too.
export function follow(note: Note, then: { frames: MomentFrame[]; moment?: Moment } | undefined, now: { moment: Moment; frames: MomentFrame[]; own: boolean; since: boolean }[]): Followed | undefined {
  const element = note.on?.element;
  if (!element) return undefined;
  const was = then && writtenOn(then.frames, note.on);
  const named = (thing: Thing) => thing.role === (was?.thing.role ?? element.role) && thing.name === (was?.thing.name ?? element.name);
  const looks = (frame: MomentFrame, thing: Thing): Followed["looks"] => {
    if (!was || !inSight(was.thing, was.frame.read.screen)) return undefined;
    if (looksAsItWas(was.thing, thing)) return "the same";
    return findingsAt(was.frame.read, frame.read)
      .filter((found) => [found.element, ...(found.alike ?? [])].some((one) => one && one.node === thing.node && one.role === thing.role))
      .map((found) => found.words);
  };
  const shownIn = (moment: Moment, frame: MomentFrame, test: (thing: Thing) => boolean): Followed | undefined => {
    const thing = frame.read.things.find((one) => test(one) && inSight(one, frame.read.screen));
    return thing && { moment, frame, thing, looks: looks(frame, thing) };
  };
  const own = now.find((one) => one.own);
  if (own && was && then?.moment) {
    const lined = linedUp(was.frame, then.frames, then.moment, own.frames, own.moment);
    const became = lined && [...differences(was.frame.read, lined.read).was].find(([, before]) => before === was.thing)?.[0];
    const same = (thing: Thing) => (became?.node !== undefined ? thing.node === became.node : thing.role === became?.role && thing.name === became.name);
    if (lined && became)
      for (const frame of own.frames.slice(own.frames.indexOf(lined))) {
        const found = shownIn(own.moment, frame, same);
        if (found) return found;
      }
  }
  for (const { moment, frames } of [...(own ? [own] : []), ...now.filter((one) => one.since)])
    for (const frame of frames) {
      const found = shownIn(moment, frame, named);
      if (found) return found;
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
  const noted = allNotes(change).get(id);
  const on = noted?.note.on;
  if (!on?.element) return undefined;
  // A guest's thing is theirs to name, and only `wait` says it, in their quotes: here it's the thing they pointed at.
  const which = noted?.guest ? `Note ${id}, a guest's, the thing they pointed at` : `Note ${id}, the ${on.element.role} ${quote(on.element.name)} on ${quote(on.moment)}`;
  if (!followed)
    return `${which}: isn't in sight in that moment or any marked since the note was written. Fine if the note asked for it to go; otherwise the person has your answer and nothing to look at, so mark a moment that shows what you did.`;
  const { moment, frame, looks } = followed;
  const where = `${moment.name === on.moment ? "" : `in ${quote(moment.name)} `}${frame.name === undefined ? "at its end" : frame.done ? `after ${doneSaid(moment, frame.done)}${frame.scrolled ? " and the scroll after it" : ""}` : frame.scrolled ? "once it has scrolled, before anything is done" : "as it begins"}`;
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
