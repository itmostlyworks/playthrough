// What's kept in an older shape, brought to this one once, as the change is first read by this Playthrough: each file
// as it would have been kept had it been made now, by the rule that read it before, so everything shows as it did.
// Each piece comes back unchanged when it's already in this shape, so bringing a change along twice, or again after it
// stopped half-way, changes nothing more.
//
// Format 2: every moment kept with where it starts, and every moment's way doing its way there before its step; Done
// kept as said; a note on a moment as handed back, or in the app, each saying which hand-back; and nothing kept that
// nothing reads: an older hand-back's accounts, a send's verdicts.
//
// Format 3: everything by its name in moments' words. A change's file is change.json (was review.json); its hand-backs
// are hand-backs/<n>/hand-back.json (were rounds/<n>/round.json) and its moments' ways moments/ (were scenes/); a
// hand-back's moments are `moments` (were `scenes`), and what a moment did is one list, `actions` (was one step, its
// title the moment's name); each `round` is `handBack` and each `scene` `moment`; and a comparison's `changes` are its
// `findings`.

import type { Comparison, HandBack, InApp, Moment, Note, OnMoment, Seen, Send, Taken } from "./model.ts";
import { startOf, type Done } from "./shown.ts";

export const FORMAT = 3;

// The names each was kept by before.
export const OLDER = { change: "review.json", handBacks: "rounds", handBack: "round.json", moments: "scenes" };

// A moment as format 1 and 2 kept it: what it did as the one step it took, titled with its name; and in format 1 with no
// start of its own.
type Step = { title: string; at: number; actions?: number[]; began?: { action: string; at: number }[] };
type OlderMoment = Omit<Moment, "from" | "actions"> & { from?: number; steps: Step[] };
type AnyMoment = Moment | OlderMoment;
type OlderHandBack = Omit<HandBack, "moments"> & { scenes?: AnyMoment[]; moments?: AnyMoment[]; accounts?: unknown };

// A hand-back, its moments each as they're kept now, and the accounts older ones kept of what changed left behind.
export function handBackNow({ accounts: _, scenes, moments, ...handBack }: OlderHandBack): HandBack {
  const { number, by, replies, finished } = handBack;
  return { number, by, moments: (moments ?? scenes ?? []).map(momentNow), replies, ...(finished && { finished }) };
}

// A moment kept before moments had a start is given the one it was shown from: where the rule starts it in what was
// recorded. One an older `again` gave 0, by its step starting the recording, is given it too. What it did comes out
// of its one step as one list, each thing done with what it was and when it began where its recording knew them.
export function momentNow(kept: AnyMoment): Moment {
  if (!("steps" in kept)) return kept;
  const { steps, from: _, ...moment } = kept;
  const actions = steps.flatMap((step) =>
    (step.actions ?? []).map((at, i) => {
      const began = step.began?.[i];
      return { at, ...(began && { what: began.action, began: began.at }) };
    }),
  );
  return { ...moment, from: startNow(kept), actions };
}

function startNow(moment: OlderMoment): number {
  const step = moment.steps[0];
  const wronglyAtZero = moment.from === 0 && step?.at === 0 && !!step.actions?.length;
  if (moment.from !== undefined && !wronglyAtZero) return moment.from;
  return Math.round(startedBy(moment) * 1000) / 1000;
}

// Where the rule for a moment's start (shown.ts's startOf) starts one recorded with everything in its step. Its
// recording knows what each action was (`click link “Settings”`), not where it went: a link followed is taken to go
// somewhere, and nothing else to. Where the rule can't tell, it shows the button that brought you, and all of a long one.
function startedBy(moment: OlderMoment): number {
  const step = moment.steps.at(-1);
  const began = step?.began ?? [];
  const ended = step?.actions ?? [];
  // Nothing done at all, it's a still where its end holds.
  if (!began.length) return Math.max(0, moment.length - HELD);
  if (began.length !== ended.length) return 0;
  const { at } = startOf(began.map(({ action }) => doneIn(action)));
  // Nothing done on the page it ends on: a still, from where its end holds, settled, and after the last thing done.
  if (at >= began.length) return Math.min(moment.length, Math.max(ended.at(-1)! + 0.1, moment.length - HELD));
  // A little before the first thing shown, for the pointer to come to it, and never back into the thing before.
  return Math.max(at ? ended[at - 1]! : 0, began[at]!.at - LEAD, 0);
}
const LEAD = 1;
// How long a recording's end holds, as recorded (reporter.ts's HOLD).
const HELD = 1.5;

// An action as a recording names it (`click link “Settings”`, `type textbox “Card prefix”`, `press Enter`), as done.
function doneIn(action: string): Done {
  const [does = "", ...rest] = action.split(" ");
  const role = (does === "press" ? rest.slice(1) : rest)[0];
  return { does, ...(role && !role.startsWith("“") && { role }), went: does === "click" && role === "link" };
}

// A moment's way kept before moments had a start does everything in its step. Brought along, what was done before where
// it's shown from goes before the step, as the way there, so running it again starts the moment where its step does,
// as it does for every moment marked since. Its things done are read as its recording counted them; where the two
// don't agree, the file is left as it is.
export function wayNow(file: string, moment: Moment): string {
  const lines = file.split("\n");
  const opens = lines.findIndex((line) => line.startsWith("test("));
  const step = lines.findIndex((line) => line.includes("await test.step("));
  if (opens < 0 || step !== opens + 1) return file;
  const ends = lines.findIndex((line, i) => i > step && line === "  });");
  if (ends < 0) return file;
  const body = lines.slice(step + 1, ends);
  const acting = body.flatMap((line, i) => (/^\s*await page\.(?!waitForURL\(|goto\(|evaluate\(|waitForFunction\()/.test(line) ? [i] : []));
  if (acting.length !== moment.actions.length) return file;
  const before = moment.actions.filter((action) => action.at <= moment.from).length;
  if (!before) return file;
  // Up to the first thing it shows; for a still, everything done, and the page it led to, up to what's checked.
  const checked = body.findIndex((line, i) => i > acting.at(-1)! && line.includes("expect("));
  const cut = before < acting.length ? acting[before]! : checked < 0 ? body.length : checked;
  const way = body.slice(0, cut).map((line) => line.replace(/^ {2}/, ""));
  return [...lines.slice(0, step), ...way, lines[step]!, ...body.slice(cut), ...lines.slice(ends)].join("\n");
}

// A send that said Done said every moment of its hand-back looks good, by name, and nothing more; now it says Done.
type OlderSend = Omit<Send, "handBack"> & { handBack?: number; round?: number; looksGood?: string[]; verdicts?: unknown; takenBack?: unknown };
export function sendNow({ looksGood, verdicts: _, takenBack: __, round, handBack, ...send }: OlderSend, moments: { name: string }[]): Send {
  const on = (handBack ?? round)!;
  const saidDone = !!looksGood?.length && !send.notes.length && !send.replies?.length && moments.every((moment) => looksGood.includes(moment.name));
  const { id, by, sent, notes, replies, done } = send;
  return { id, handBack: on, by, sent, notes: notes.map((note) => noteNow(note, on)), ...(replies && { replies }), ...((done || saidDone) && { done: true as const }) };
}

// The hand-back a send, a taking or something seen is on, and the moment, by the names they were kept by before.
type Older<T> = Omit<T, "handBack" | "moment"> & { handBack?: number; round?: number; moment?: string; scene?: string };
const inNow = <T extends { moment: string }>({ scene, moment, ...rest }: Older<T>): T => ({ moment: (moment ?? scene)!, ...rest }) as unknown as T;

export const takenNow = (taken: Older<Taken>[]): Taken[] => taken.map(({ send, round, handBack, at }) => ({ send, handBack: (handBack ?? round)!, at }));
export const seenNow = (seen: Record<string, Older<Seen>[]>): Record<string, Seen[]> =>
  Object.fromEntries(Object.entries(seen).map(([by, all]) => [by, all.map((one) => ({ handBack: (one.handBack ?? one.round)!, moment: (one.moment ?? one.scene)! }))]));

type OlderComparison = Omit<Comparison, "handBack" | "findings"> & { handBack?: number; round?: number; findings?: Comparison["findings"]; changes?: Comparison["findings"] };
export function comparisonNow({ round, handBack, since, findings, changes }: OlderComparison): Comparison {
  return { handBack: (handBack ?? round)!, since, findings: (findings ?? changes ?? []).map((finding) => ({ ...finding, seen: finding.seen.map((place) => inNow(place as Older<typeof place>)) })) };
}

// An older note's place said one in the app by an `app` beside its scene, its `at` then in the person's own recording;
// and named no hand-back: it was on the one it was sent on, or, not yet sent, the latest. In format 2 it said its
// hand-back as `round` and its moment as `scene`.
type OnBefore = { scene: string; at?: number; element?: OnMoment["element"]; box?: OnMoment["box"]; point?: OnMoment["point"]; app?: { from: { scene: string; at: number }; did: InApp["did"]; recording: string; length: number } };
type OnFormat2 = Omit<OnMoment, "handBack" | "moment"> & { round: number; scene: string };
export function noteNow(note: Note, handBack: number): Note {
  const on = note.on as OnMoment | InApp | OnFormat2 | OnBefore | undefined;
  if (!on || "handBack" in on) return note;
  if ("round" in on) {
    const { round, scene, ...rest } = on;
    return { ...note, on: { handBack: round, moment: scene, ...rest } as OnMoment | InApp };
  }
  const { app, scene, at, element, box, point } = on;
  const thing = { ...(element && { element }), ...(box && { box }), ...(point && { point }) };
  if (!app) return { ...note, on: { handBack, moment: scene, ...(at !== undefined && { at }), ...thing } };
  return { ...note, on: { handBack, moment: app.from.scene, steppedIn: app.from.at, did: app.did, recording: app.recording, length: app.length, at: at ?? app.length, ...thing } };
}
