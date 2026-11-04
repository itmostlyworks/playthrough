// A situation: whose it is and what they do, where it stands, and its recording, with its way through beside it. A step
// gone to plays into its result and rests there; gone back to, it plays again. A note or a change gone to is there at its
// moment, lit. It arrives at the answer waiting on you, else at the first step's result. What's drawn on it, and what the
// bar does, is about the moment it's at: the notes there, outlined, what changed there, a note made there, the app taken
// over there. At rest, a click on it takes it over there; playing, it pauses it. C held is how it was before the work, at
// the same moment, in place; pressed, the two side by side, each close on the step's part of the page. At an answer to
// a note made in the app, how it was is what you did then, played again beside what you did, done again.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { accountOf, allNotes, lastLooked, type Flow, type Place, type Review, type Round, type Verdict } from "@playthrough/review";
import { picture, readings as readingsOf, recording } from "./api.ts";
import { Bar } from "./Bar.tsx";
import { Compare, HOLD, Said } from "./Card.tsx";
import { answersTo, type Diamond } from "./changes.ts";
import { EndMark } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { Conversation, quiet as quietNumber, quietly } from "./Notes.tsx";
import { fill, ink, type Shown, type Standing } from "./notes.ts";
import { asWho, personAt } from "./people.ts";
import { around, Picture, union, type Box, type Frame } from "./Picture.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, CLOSEST, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { Portal, TAG } from "./Portal.tsx";
import { recorded, type Scrolled } from "./replay.ts";
import { says } from "./Step.tsx";
import { Steps, type OnLine, type Saying, type Stop } from "./Steps.tsx";
import type { Acting } from "./Work.tsx";

type SituationProps = {
  review: Review;
  round: Round;
  before?: Round;
  flow: Flow;
  changed: Place[];
  readings?: Reading[];
  glimpsed?: Glimpse[];
  notes: Shown[];
  // Any note of yours, wherever it's on: a change here can be made for one on another situation.
  noteOf: (id: string) => Shown | undefined;
  standing?: Standing;
  same: boolean;
  onLooksGood?: (flow: string) => void;
  threads: Threads;
  diamonds: Diamond[];
  quiet: boolean;
  acting: Acting;
  active: boolean;
  // The stop gone along to, by the wheel or the keys; passing, as a turn of the wheel goes on through it, it plays
  // nothing until the wheel's still there.
  go?: { stop: number; passing?: boolean };
  resting: boolean;
  onPointerDown: () => void;
  // A verdict said on it: an answer judged, or Looks good at the end of the way.
  onSaid: () => void;
  // A stop on its way pressed, to come up to the line.
  onPressed: (stop: number) => void;
};

export function Situation(props: SituationProps) {
  const { review, round, before, flow, changed, readings, notes, standing, same, onLooksGood, threads, diamonds, quiet, acting, active } = props;
  const end = flow.length - 0.05;
  const stepOf = (at: number) => Math.max(0, flow.steps.findIndex((_, i) => stepEnd(flow, i) >= at - 0.05));
  // A note's moment: where it was made, or made in the app, where the app was taken over.
  const momentOf = (note: { on?: Place }) => (note.on?.app ? note.on.app.from.at : note.on?.at);
  // The note you're writing on it, here or in the app, at its moment: a stop like any other, where its words are written.
  const writingAt = acting.writing?.note.on?.flow === flow.name ? momentOf(acting.writing.note) : undefined;
  const writing = writingAt !== undefined ? acting.writing : undefined;
  // On the steps' lines, each note's dot and each change's diamond, where they are.
  const onLine: OnLine[] = [
    ...notes.flatMap((note) => (momentOf(note) === undefined ? [] : [{ id: note.id, at: Math.min(momentOf(note)!, end), fill: fill(note), words: note.turns[0]?.words ?? "Your note" }])),
    ...(writing ? [{ id: writing.note.id, at: Math.min(writingAt!, end), fill: "bg-amber", words: "Your new note" }] : []),
    ...diamonds.filter((diamond) => diamond.row).map((diamond) => ({ id: diamond.id, at: Math.min(diamond.at, end), words: diamond.name })),
  ];
  // A step's result, where it rests once it has played.
  const results = flow.steps.map((_, i) => stepEnd(flow, i) - 0.05);
  // Its steps with nothing new to you are kept together: seen on a round before, as you said something about it then,
  // nothing changed in them since; else, the work changed nothing in them, as Before shows. Changed is as the round's
  // comparison found it in this situation, wherever the change is told, but for what the agent says isn't real and what
  // was made for a note on it, which is seen with the note's answer. And no note in them is still open: none waits on
  // anyone, nothing of yours is unsent there.
  const since = lastLooked(review, threads.you, flow.name, round.number);
  const comparison = review.comparisons.find((kept) => kept.round === round.number && kept.since === (since ?? review.rounds[0]?.number));
  const changedIn = (step: number) =>
    !comparison ||
    comparison.changes.some((change) => {
      const account = accountOf(review, round.number, change.id);
      if (account && ("notReal" in account || ("note" in account && allNotes(review).get(account.note)?.note.on?.flow === flow.name))) return false;
      return change.seen.some((seen) => seen.flow === flow.name && seen.at !== undefined && stepOf(Math.min(seen.at, end)) <= step && step <= stepOf(Math.min(seen.until ?? seen.at, end)));
    });
  const [unfolded, setUnfolded] = useState<number[]>([]);
  const together = (step: number) =>
    (since !== undefined || !!before?.flows.some((one) => one.name === flow.name)) &&
    !unfolded.includes(step) &&
    !changedIn(step) &&
    !diamonds.some((diamond) => diamond.row && stepOf(Math.min(diamond.at, end)) === step) &&
    !notes.some((note) => momentOf(note) !== undefined && stepOf(Math.min(momentOf(note)!, end)) === step && (note.toJudge || note.unsent || note.state !== "settled")) &&
    !(writingAt !== undefined && stepOf(Math.min(writingAt, end)) === step);
  const run = (step: number) => {
    let [first, last] = [step, step];
    while (first > 0 && together(first - 1)) first--;
    while (last + 1 < flow.steps.length && together(last + 1)) last++;
    return [first, last] as const;
  };
  // The way through it, a stop at a time: what was said about all of it, then each step, and after it what was said in
  // it, in the order it comes, a change before what you said about it. Two or more steps in a row with nothing new are
  // one stop, played through.
  const stops: Stop[] = [
    ...notes.filter((note) => momentOf(note) === undefined).map((note) => ({ step: -1, id: note.id })),
    ...flow.steps.flatMap((_, i): Stop[] => {
      const [first, last] = together(i) ? run(i) : [i, i];
      if (last > first) return i === first ? [{ step: last, at: results[last]!, from: first }] : [];
      return [
        { step: i, at: results[i]! },
        ...onLine
          .filter((mark) => stepOf(mark.at) === i)
          .sort((a, b) => a.at - b.at || Number(!!a.fill) - Number(!!b.fill))
          .map((mark) => ({ step: i, at: mark.at, id: mark.id })),
      ];
    }),
  ];
  // And last, where it can be said, whether it looks good to you: the way ends in it.
  const looksGood = standing && onLooksGood && JUDGED.includes(standing.is) ? { good: standing.is === "good", onPress: () => (onLooksGood(flow.name), standing.is !== "good" && props.onSaid()) } : undefined;
  const last = stops.length - (looksGood ? 0 : 1);
  const waiting = notes.find((note) => note.toJudge && momentOf(note) !== undefined);
  const [clock] = useState(() => new Clock(waiting ? Math.min(momentOf(waiting)!, end) : results[0]!));
  const [at, setAt] = useState(clock.at);
  const [playing, setPlaying] = useState<{ until: number }>();
  // Dragged along a step's line, it follows the line, and where it's let go, it rests.
  const [scrubbing, setScrubbing] = useState(false);
  const cut = useCut(review.id, round.number, flow);
  // The stop you're on: arriving, the answer waiting on you, else none until you go along. What was said there is open
  // beside its thing, as is what you open on the recording.
  const [stop, setStop] = useState(() => (waiting ? stops.findIndex((one) => one.id === waiting.id) : -1));
  const [picked, setPicked] = useState(waiting?.id);
  // Still on the stop it arrived on, or passed on the way, it's as it was found: nothing plays until you stop there.
  const [still, setStill] = useState(true);
  // Good for you, as nothing's changed since you said so, it arrives folded to its name, and opens when you choose.
  const [folded, setFolded] = useState(quiet);
  const go = (moment: number, id?: string) => (clock.set(moment), setAt(moment), setPlaying(undefined), setPicked(id));
  const playTo = (until: number, from = clock.at) => (clock.set(from), setAt(from), setPicked(undefined), setPlaying({ until }));
  const pause = () => (setAt(clock.at), setPlaying(undefined));
  // Come to rest, played or dragged to, what was said at the stop you're on stays open.
  const stopped = (moment: number) => go(moment, stops[stop]?.id);
  // A step plays from its start, which is the step before's result, so from just after it.
  const startOf = (step: number) => flow.steps[step]!.at + (step ? 0.06 : 0);
  // Gone to, a step plays into its result; what was said in one is there at its moment, still; what was said about all
  // of it, where it is. Before the first stop it rests, and past the last, it's how it ends. Passed, a step is at its
  // start, to play from there once it's stopped on.
  const toStop = (k: number, passing = false) => {
    setStop(k);
    setStill(passing);
    const there = stops[k];
    if (!there) return void (k < 0 ? playing && pause() : go(results.at(-1)!));
    if (there.id === undefined && passing) go(startOf(there.from ?? there.step));
    else if (there.id === undefined) playTo(there.at!, startOf(there.from ?? there.step));
    else if (there.at === undefined) setPicked(there.id);
    else go(there.at, there.id);
  };
  useLayoutEffect(() => void (props.go && toStop(props.go.stop, props.go.passing)), [props.go]);
  // Opened, steps kept together are each a stop again, walked from the first.
  const [unfolding, setUnfolding] = useState<number>();
  const unfold = (k: number) => {
    const there = stops[k];
    if (there?.from === undefined) return;
    setUnfolded((was) => [...was, ...flow.steps.map((_, i) => i).filter((i) => i >= there.from! && i <= there.step)]);
    setUnfolding(k);
  };
  useLayoutEffect(() => void (unfolding !== undefined && (toStop(unfolding), setUnfolding(undefined))), [unfolding]);
  // Opened on the recording, or just saved, what was said there is the stop you're on, there and then; closed there, it
  // isn't open.
  const opened = (id?: string) => (id && stops.some((one) => one.id === id) && setStop(stops.findIndex((one) => one.id === id)), setPicked(id));
  // A note begun is the stop you're on, as you write it; let go unsaved, you're back on the stop you were on.
  const [begun, setBegun] = useState<{ id: string; from: number }>();
  if (writing?.note.id !== begun?.id) {
    if (writing) (setBegun({ id: writing.note.id, from: stop }), setStop(stops.findIndex((one) => one.id === writing.note.id)));
    else (setBegun(undefined), begun && !stops.some((one) => one.id === begun.id) && setStop(begun.from));
  }
  // The last situation can come up to the window's top: there's a window's height under it, less its own. And its way
  // is long enough for its last stop to come up to the line while its recording is still pinned beside it.
  const section = useRef<HTMLElement>(null);
  const block = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const around = section.current;
    if (!around) return;
    const measure = () => (around.style.setProperty("--tall", `${around.offsetHeight}px`), around.style.setProperty("--block", `${block.current?.offsetHeight ?? 0}px`));
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(around);
    if (block.current) watching.observe(block.current);
    return () => watching.disconnect();
  }, [folded]);
  // Playing, a click on it pauses it. Where it can't be taken over, a click plays on into the stop you're on, and there,
  // plays into it again from its step's start; before any stop, or on what was said about all of it, the step it shows.
  const again = () => {
    if (playing) return pause();
    const there = stops[Math.min(stop, stops.length - 1)];
    if (there?.at === undefined) return toStop(stops.findIndex((one) => one.id === undefined && one.step === stepOf(clock.at)));
    if (clock.at < there.at - 0.01) playTo(there.at);
    else playTo(there.at, startOf(there.step));
  };

  // Before the work, the step of the same name, as far into it as now is into its own.
  const then = before?.flows.find((one) => one.name === flow.name);
  const step = stepOf(at);
  const thenStep = then?.steps.findIndex((one) => one.title === flow.steps[step]?.title) ?? -1;
  const thenAt = (moment: number) => {
    const now = stepOf(moment);
    const there = then?.steps.findIndex((one) => one.title === flow.steps[now]?.title) ?? -1;
    if (!then || there < 0) return undefined;
    const from = flow.steps[now]!.at;
    const u = clamp((moment - from) / Math.max(stepEnd(flow, now) - from, 0.01), 0, 1);
    return then.steps[there]!.at + u * (stepEnd(then, there) - then.steps[there]!.at);
  };
  const [side, setSide] = useState(false);
  // Before stays while it goes, as it came.
  const [beside, setBeside] = useState(false);
  useEffect(() => {
    if (side) return setBeside(true);
    const gone = setTimeout(() => setBeside(false), 450);
    return () => clearTimeout(gone);
  }, [side]);
  const [peek, setPeek] = useState(false);
  const holding = useRef<number>(undefined);
  const peeked = useRef(false);
  const press = () => {
    if (holding.current === undefined) holding.current = window.setTimeout(() => ((peeked.current = true), setPeek(true)), HOLD);
  };
  const release = () => {
    if (holding.current === undefined) return;
    clearTimeout(holding.current);
    holding.current = undefined;
    if (peeked.current) (peeked.current = false), setPeek(false);
    else setSide(!side);
  };

  // An answer to a note made in the app is seen the way the note was found: what you did there, done again on this
  // round's work as the agent recorded it, from where you took it over to where the answer shows, or to the end of the
  // step of it the agent says it's seen in, where the page is the answer and nothing is outlined. Before it is what you
  // did then, as you kept it, from where you took it over to where you noted it, as far into it as what's done again is:
  // click for click, where both made as many. Side by side, both are on what was done there: the things clicked and
  // typed in, in the shape of half the picture.
  const [traced, setTraced] = useState<{ id: string; now: number[]; then: number[]; frame?: Frame }>();
  const redone = (() => {
    const id = stops[stop]?.id;
    const on = notes.find((note) => note.id === id)?.on;
    if (!id || !on?.app?.steps || on.at === undefined) return undefined;
    const watched = on.app.steps.findIndex((step) => step.title === round.replies.find((reply) => reply.note === id)?.watch);
    const until = watched < 0 ? on.at : (on.app.steps[watched + 1]?.at ?? on.app.length) - 0.05;
    const from = on.app.from.at;
    const kept = review.sends.flatMap((send) => send.notes).find((sent) => sent.id === id)?.on;
    if (!kept?.app || kept.at === undefined) return { id, on, app: on.app, until, outlined: watched < 0 };
    const [since, to] = [kept.app.from.at, kept.at];
    const [now, then] = traced?.id === id ? [traced.now.filter((at) => at > from && at < until), traced.then.filter((at) => at > since && at < to)] : [[], []];
    const [here, there] = now.length === then.length ? [[from, ...now, until], [since, ...then, to]] : [[from, until], [since, to]];
    return { id, on, app: on.app, until, outlined: watched < 0, then: { recording: kept.app.recording, at: (moment: number) => along(moment, here, there) } };
  })();
  useEffect(() => {
    if (!redone?.then) return;
    let current = true;
    const { id, app, until, then } = redone;
    Promise.all([recording(review.id, round.number, app.recording), recording(review.id, round.number, then.recording), readingsOf(review.id, round.number, app.recording)]).then(
      ([now, before, read]) => {
        const done = recorded(now);
        const things = done.acted.filter(([at]) => at > app.from.at && at <= until).flatMap(([, node]) => read.flatMap((reading) => reading.things.filter((thing) => thing.node === node)).at(-1)?.box ?? []);
        const screen = read.at(-1)?.screen;
        if (current) setTraced({ id, now: done.clicks, then: recorded(before).clicks, frame: things.length && screen ? around(union(things), screen, HALF, CLOSEST) : undefined });
      },
    );
    return () => void (current = false);
  }, [redone?.id]);
  const [redoing, setRedoing] = useState(false);
  // It plays on a clock of its own, which Before follows; and each time Compare comes on, it plays again from where you
  // took it over, as what's compared there is what happens.
  const redoneClock = useRef<Clock>(undefined);
  const [replays, setReplays] = useState(0);
  useEffect(() => void (redone?.then && (side || peek) && setReplays((times) => times + 1)), [side || peek]);

  // Taken over here: the app, unseen until it's yours, and the frame's edge warm from Take over until you're back.
  const live = acting.live?.flow === flow.name ? acting.live : undefined;
  const taken = !!live?.shown;
  if (taken && side) setSide(false);
  // Compare, on the bar and beside what changed or was answered: how it was before the work, at the same moment; at an
  // answer to a note made in the app, what you did then.
  const comparable = !!then || !!redone?.then;
  const comparing = comparable ? { on: side || peek, off: taken, onPress: press, onRelease: release } : undefined;
  const noting = active && acting.noting;
  // C is the situation's you're on; in the app, it's the app's, and noting, it rests until you've chosen what it's on.
  // Gone to another, it stops.
  useEffect(() => {
    if (!active || taken || noting) return;
    const typing = (event: KeyboardEvent) => (event.target as Element).closest?.("input, textarea, [contenteditable]");
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      if (event.key.toLowerCase() === "c" && comparable) press();
    };
    const up = (event: KeyboardEvent) => event.key.toLowerCase() === "c" && release();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => (removeEventListener("keydown", down), removeEventListener("keyup", up));
  });
  useEffect(() => void (!active && playing && pause()), [active]);
  // Noting, it stops where it is: a note is made on the moment it's at; in the app, on what you click there.
  useEffect(() => void (noting && playing && pause()), [noting]);
  // At rest on the situation you're on, that's where Take over takes it over; at such an answer, it's taken over the
  // way it was found, what you did done again in the app.
  const restsAt = Math.round(at * 100) / 100;
  const resting = active && !playing && !scrubbing && !taken;
  useEffect(() => void (resting && acting.onRest(flow.name, restsAt, redone?.id)), [resting, restsAt, redone?.id]);
  // And there, it's a click from being the app: pointing at it says so beside your pointer, as who it's done as. A
  // click on another situation's makes it the one you're on.
  const person = personAt(flow, restsAt);
  const stepIn = resting && !live?.shown && !noting && !acting.writing && acting.latest ? acting.onTakeOver : undefined;
  const noteHere = noting && !taken && !acting.writing;
  // It says so once you point, not each time the way comes to rest under a pointer left there.
  const [aiming, setAiming] = useState(false);
  const pointed = useRef<{ x: number; y: number }>(undefined);
  useEffect(() => setAiming(false), [stop, !!playing]);
  const pill = useRef<HTMLSpanElement>(null);
  const armed = useRef(false);

  // What's drawn is what's at this moment: in its step, the notes made there up to now, and what changed there.
  const shown = (moment: number) => stepOf(moment) === step && moment <= at + 0.05;
  const here = notes.filter((note) => momentOf(note) !== undefined && shown(momentOf(note)!));
  const changedHere = diamonds.filter((diamond) => diamond.row && shown(Math.min(diamond.at, end)));
  // One made in the app is on its thing as it was written, found by its name: the app's nodes aren't this recording's.
  const written = (note: Shown) => review.sends.flatMap((send) => send.notes).find((kept) => kept.id === note.id)?.on ?? note.on;
  // A change is on its thing and on each thing changed alike with it, where they are.
  const marksOn = (id: string, on: Place): Mark[] => [
    { id, node: on.element?.node, name: on.element?.name, point: on.point, box: on.box },
    ...(on.alike ?? []).map((element, i) => ({ id: `${id} ${i}`, node: element.node, name: element.name })),
  ];
  // The note or change pointed at under its step is lit on the recording, else the one you chose. What the agent changed
  // for a note is the note's, outlined with it wherever it's there at this moment.
  const [lit, setLit] = useState<string>();
  const chosen = lit ?? picked;
  const answered = here.some((note) => note.id === chosen) ? answersTo(diamonds, chosen!) : [];
  const answeredMarks = answered.flatMap(({ on }, i) => marksOn(`${chosen} answer ${i}`, on));
  const changedMarks = (diamond: Diamond) => diamond.changes.flatMap(({ on }, i) => marksOn(`${diamond.id} ${i}`, on));
  const marks: Mark[] = [
    ...here.map((note) =>
      note.on?.app ? { id: note.id, name: written(note)?.element?.name ?? note.on.element?.name } : { id: note.id, node: note.on?.element?.node, name: note.on?.element?.name, point: note.on?.point },
    ),
    ...answeredMarks,
    ...changedHere.flatMap(changedMarks),
    ...(writing ? [writing.note.on?.app ? { id: writing.note.id, name: writing.note.on.element?.name } : { id: writing.note.id, node: writing.note.on?.element?.node, point: writing.note.on?.point }] : []),
  ];
  const pins: Pin[] = [
    ...here.map((note) => ({ id: note.id, on: [note.id, ...(note.id === chosen ? answeredMarks.map((mark) => mark.id) : [])], ink: ink(note), number: note.number, fill: fill(note) })),
    ...changedHere.map((diamond) => ({ id: diamond.id, on: changedMarks(diamond).map((mark) => mark.id), ink: RECORDED_INK, diamond: true as const })),
    ...(writing ? [{ id: writing.note.id, on: [writing.note.id], ink: "var(--amber)", number: writing.number, fill: "bg-amber" }] : []),
  ];
  const [placed, setPlaced] = useState<{ view: string; at: Placed }>();
  const [saved, setSaved] = useState(acting.opened);
  if (acting.opened !== saved) (setSaved(acting.opened), acting.opened && notes.some((note) => note.id === acting.opened) && opened(acting.opened));
  // Only a note being written has its card on the recording, where it was dropped; what's said is under its step.
  const open = writing ? writing.note.id : !side && pins.some((pin) => pin.id === chosen) ? chosen : undefined;
  const [asking, setAsking] = useState<string>();
  // At an answer waiting on you, Enter says it looks good and X that it's not quite, as its buttons say; at the way's end,
  // Enter says the situation looks good. It's heard first, on the way in, so the page's own Enter never has it too.
  const answering = notes.find((note) => note.id === stops[stop]?.id && note.toJudge && !threads.readOnly && asking !== note.id);
  const ending = stop === stops.length && looksGood && !looksGood.good ? looksGood : undefined;
  useEffect(() => {
    if (!active || !(answering || ending) || taken || noting || acting.writing) return;
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || (event.target as Element).closest?.("button, input, textarea, [contenteditable], [role=slider]")) return;
      if (event.key === "Enter" && ending) (event.preventDefault(), event.stopImmediatePropagation(), ending.onPress());
      else if (event.key === "Enter" && answering) (event.preventDefault(), event.stopImmediatePropagation(), threads.onJudge(answering, { note: answering.id, verdict: "looks good" }), props.onSaid());
      else if (event.key.toLowerCase() === "x" && answering) (event.preventDefault(), event.stopImmediatePropagation(), setAsking(answering.id));
    };
    addEventListener("keydown", down, true);
    return () => removeEventListener("keydown", down, true);
  });

  // What was said at a stop: a note of yours, its thread, or the one you're writing; or a change new to you, the agent's
  // words on why, or that it was made for a note of yours. Its sign on the rail is the note's number, or a diamond.
  const said = (id: string): Saying => {
    if (id === writing?.note.id)
      return {
        sign: <span className="size-4 rounded-full bg-amber text-center text-[9px] leading-4 font-semibold text-white">{writing.number}</span>,
        line: "Your new note",
        whole: <div className="grid gap-2.5 pt-1 pb-1.5 text-[13px]">{writing.words}</div>,
      };
    const note = notes.find((note) => note.id === id);
    const diamond = diamonds.find((diamond) => diamond.id === id);
    const own = diamond?.changes.filter((changed) => !changed.answers) ?? [];
    const told = own.find((changed) => changed.line);
    const madeFor = own.map((changed) => changed.note && props.noteOf(changed.note)).find(Boolean) || undefined;
    const words = note ? note.turns[0]?.words : madeFor ? madeFor.turns[0]?.words : (told?.line ?? diamond?.name);
    const forNote = madeFor && (
      <span className={`ml-1 inline-block size-3.5 rounded-full text-center text-[8.5px] leading-3.5 font-semibold ${quietNumber}`} style={{ "--c": ink(madeFor) } as CSSProperties}>
        {madeFor.number}
      </span>
    );
    if (note)
      return {
        sign: <span className={`size-4 rounded-full text-center text-[9px] leading-4 font-semibold text-white ${fill(note)}`}>{note.number}</span>,
        line: words,
        whole: (
          <div className="-my-2 -ml-4">
            <Conversation
              note={note}
              you={threads.you}
              readOnly={threads.readOnly}
              asking={asking === note.id}
              unfinished={threads.unfinished[note.id]}
              away={false}
              onAsking={(on) => setAsking(on ? note.id : undefined)}
              onUnfinished={(words) => threads.onUnfinished(note.id, words)}
              onJudge={(verdict) => (threads.onJudge(note, verdict), verdict && props.onSaid())}
              onEdit={(words) => threads.onEdit(note.id, words)}
              onShow={() => {}}
              compare={comparing}
            />
          </div>
        ),
      };
    // Opened, it reads as a note's thread does: who said what, then what it is, with Compare beside it, as a thread has
    // its question.
    return {
      sign: <i className="size-[7px] rotate-45 bg-fg" />,
      line: (
        <>
          {madeFor && <>Changed for your note{forNote} </>}
          {words}
        </>
      ),
      whole: (
        <div className="grid gap-2.5 pr-4">
          {(madeFor || told) && <Said who={madeFor ? <>Your note{forNote}</> : told!.by}>{words}</Said>}
          <div className="flex items-center justify-between gap-2 text-xs leading-[18px] text-soft">
            <span>{madeFor ? "Changed here for it" : told ? "Changed here" : words}</span>
            {comparing && <Compare {...comparing} bar={quietly} />}
          </div>
        </div>
      ),
    };
  };

  const frames = useFrames(review, round, flow, readings, (step) => changed.filter((on) => on.at !== undefined && stepOf(on.at) === step));
  // At rest on a note or a change, the recording is close on what it's on, and on a step, it's the whole page as it
  // plays; and taken over, the whole page the app comes in as. Side by side, Now is close on it in its half, and Before
  // shows the same part of the page; else each is on the step's part of the page.
  const there = stops[stop];
  const onIt = there?.id !== undefined && there.at !== undefined && !playing && !scrubbing && Math.abs(at - there.at) < 0.02;
  const closeOn = !live?.shown && onIt ? pins.find((pin) => pin.id === there!.id)?.on : undefined;
  const [closed, setClosed] = useState<Frame>();
  const frame = side ? ((redone && traced?.id === redone.id && traced.frame) || frames[step]) : undefined;
  const view = `${at} ${side} ${closeOn?.join(" ") ?? ""} ${redone ? "redone" : ""}`;
  // The app is the page the recording was made of, at its size, scrolled where the recording rests.
  const screen = readings?.find((one) => one.step === flow.steps[step]?.title)?.screen ?? { width: 1280, height: 800 };
  const scrolled = useRef<() => Scrolled>(undefined);
  // How it was, at the same moment: following this one as it plays.
  const beforeAt = thenAt(at);
  const was = (frame?: Frame) =>
    redone?.then ? (
      <Player
        review={review.id}
        round={round.number}
        recording={redone.then.recording}
        at={redone.then.at(redoneClock.current?.at ?? redone.until)}
        following={redoing && redoneClock.current ? { clock: redoneClock.current, at: redone.then.at } : undefined}
        frame={frame}
      />
    ) : then && beforeAt !== undefined ? (
      <>
        <Still src={picture(review.id, 0, then.recording, thenStep)} frame={frame} />
        <Player review={review.id} round={0} recording={then.recording} at={beforeAt} following={playing || scrubbing ? { clock, at: (moment) => thenAt(moment) ?? beforeAt } : undefined} frame={frame} />
      </>
    ) : (
      <span className="absolute inset-0 grid place-content-center bg-ground px-6 text-center text-[13px] leading-5 text-soft">{then ? "Before the work, there was no such step" : "New: there was nothing like it before"}</span>
    );

  if (folded)
    return (
      <section className="grid">
        <button className="flex items-baseline justify-between gap-4 px-0.5 text-left opacity-60 transition-opacity duration-150 ease-calm hover:opacity-100" onClick={() => setFolded(false)} aria-expanded={false}>
          <h3 className="min-w-0 text-[15px] leading-[21px] font-semibold text-balance">
            {flow.name}
            {asWho(flow) && <span className="font-normal text-soft"> {asWho(flow)}</span>}
          </h3>
          <span className="flex flex-none items-center gap-1.5 text-xs leading-4 whitespace-nowrap text-green">
            <EndMark end="good" just={false} className="size-3 flex-none" />
            Looks good
          </span>
        </button>
      </section>
    );
  return (
    <section
      ref={section}
      data-situation={flow.name}
      data-stops={last + 1}
      data-stop={stop}
      inert={props.resting}
      className={`relative pt-3 pb-8 transition-opacity duration-500 ease-calm last:mb-[max(0px,calc(var(--room)-var(--tall)-56px))] ${props.resting ? "opacity-30" : ""}`}
      onPointerDown={props.onPointerDown}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-8 phone:grid-cols-1">
        {/* Its name and recording stay at the window's top while its way goes by beside them. */}
        <div ref={block} className="sticky top-(--pin) self-start phone:static">
        <h3 className="mb-3 min-w-0 px-0.5 text-[15px] leading-[21px] font-semibold text-balance">
          {flow.name}
          {asWho(flow) && <span className="font-normal text-soft"> {asWho(flow)}</span>}
        </h3>
        <div className="relative">
          {/* A click pauses it, or plays the step again; noting, it notes what's under it; taken over, it's the app's. */}
          <button
            data-picture={flow.name}
            className="relative block aspect-[1.6] w-full"
            aria-label={stepIn ? `Take over${person ? ` as ${person}` : ""}` : `${playing ? "Pause" : "Play"} “${flow.steps[step]?.title}”`}
            onPointerDown={() => (armed.current = active)}
            onPointerMove={(event) => {
              if (event.pointerType !== "mouse") return;
              const box = event.currentTarget.getBoundingClientRect();
              pill.current?.style.setProperty("translate", `${event.clientX - box.left}px ${event.clientY - box.top}px`);
              // The page scrolled under a pointer that stayed put tells it moved, from where it was: that isn't pointing.
              const was = pointed.current;
              pointed.current = { x: event.clientX, y: event.clientY };
              if (was && Math.hypot(event.clientX - was.x, event.clientY - was.y) > 2) setAiming(true);
            }}
            onPointerLeave={() => setAiming(false)}
            onClick={() => armed.current && !taken && (stepIn ? (setAiming(false), stepIn()) : again())}
          >
            {/* Side by side, Now narrows to its half of the picture as its view glides close on the step's part of the page,
                and Before comes in beside it: nothing around them moves. */}
            <span className={`${FRAMED} left-0 z-1 transition-[width] duration-450 ease-calm ${side ? HALVES : "w-full"}`}>
              <Still src={picture(review.id, round.number, flow.recording, step)} frame={frame} />
              <Player
                review={review.id}
                round={round.number}
                recording={flow.recording}
                at={at}
                playing={playing}
                cut={cut}
                clock={clock}
                onStop={stopped}
                following={scrubbing ? { clock, at: (moment) => moment } : undefined}
                frame={frame}
                marks={marks}
                closeOn={redone || !closeOn ? undefined : { on: closeOn, shape: side ? HALF : WHOLE }}
                onClosed={setClosed}
                onMarks={redone ? undefined : (placed) => setPlaced({ view, at: placed })}
                things={noting && !taken && !writing ? props.glimpsed : undefined}
                onPlace={noting && !taken && !writing ? (on) => acting.onPlace({ flow: flow.name, at: restsAt, ...on }) : undefined}
                scrolled={scrolled}
              />
              {redone && (
                <Redone
                  key={redone.id}
                  review={review.id}
                  round={round.number}
                  flow={flow}
                  app={redone.app}
                  until={redone.until}
                  frame={frame}
                  marks={redone.outlined ? [{ id: redone.id, node: redone.on.element?.node, name: redone.on.element?.name }] : []}
                  closeOn={redone.outlined && !side && !live?.shown && !redoing ? [redone.id] : undefined}
                  onMarks={(placed) => setPlaced({ view, at: placed })}
                  onPlaying={setRedoing}
                  still={still}
                  clock={redoneClock}
                  replays={replays}
                />
              )}
              <span className={`${CHIP} transition-opacity duration-450 ease-calm ${side ? "" : "opacity-0"}`}>Now</span>
            </span>
            {beside && (
              <span className={`${FRAMED} right-0 ${HALVES} transition-opacity duration-450 ease-calm starting:opacity-0 ${side ? "" : "opacity-0"}`}>
                {was(side && closeOn && !redone && closed ? closed : frame)}
                <span className={CHIP}>Before</span>
              </span>
            )}
            {peek && (
              <span className="absolute inset-0 z-2 animate-arrive overflow-hidden rounded-lg">
                {was()}
                <span className={CHIP}>Before</span>
              </span>
            )}
          </button>
          <Portal live={live} person={person} screen={screen} scrolled={() => scrolled.current?.()} />
          {/* Beside your pointer, what a click on the recording does: note what's under it, or take it over. */}
          <span ref={pill} aria-hidden className={`pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-150 ease-calm ${(stepIn || noteHere) && aiming ? "" : "opacity-0"}`}>
            <span className={TAG}>{noteHere ? "Note on this" : person ? `Take over as ${person}` : "Take over"}</span>
          </span>
          {active && (
            <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2">
              <div className="animate-arrive">
                <Bar
                  live={taken ? (live.inApp ? "shown" : "waiting") : undefined}
                  latest={acting.latest}
                  compare={comparing}
                  noting={noting}
                  onNote={taken && !live.inApp ? undefined : acting.onNote}
                  onTakeOver={acting.onTakeOver}
                  onBack={acting.onBack}
                  flow={flow.name}
                />
              </div>
            </div>
          )}
          {!taken && !peek && (
            <div className={`pointer-events-none absolute inset-y-0 left-0 z-1 transition-[width] duration-450 ease-calm ${side ? `${HALVES} overflow-hidden rounded-lg` : "w-full"}`}>
              <Pinned
                pins={redone ? pins.filter((pin) => pin.id === redone.id && redone.outlined) : pins}
                placed={placed?.view === view ? placed.at : {}}
                open={open}
                faded={!!playing || scrubbing || (!!redone && redoing) || placed?.view !== view}
                onOpen={(id) => (writing && id !== writing.note.id ? acting.onClose() : opened(id))}
              />
            </div>
          )}
        </div>
        </div>
        {/* The way goes by beside the recording as the page scrolls: where it stands and what the agent said first, then
            its stops, and room after its last for it to come up to the line while the recording's still pinned. */}
        <div className="flex flex-col pb-[max(0px,calc(var(--block)-var(--line)+var(--pin)))] phone:pb-0">
          <div className="grid content-start gap-5 pb-5">
            {/* Where it stands, and what its recording shows when it's not the situation's own: never over the recording. */}
            <span className="flex min-h-[21px] flex-wrap items-baseline gap-x-1.5 gap-y-0.5 px-0.5 text-xs leading-[21px]">
              {redone && <span className="text-soft">Showing what you did, done again</span>}
              {redone && standing && SAYS.includes(standing.is) && <span className="text-faint">·</span>}
              {standing && SAYS.includes(standing.is) && <span className={INK[standing.is]}>{says(standing)}</span>}
              {standing && SAYS.includes(standing.is) && same && <span className="text-faint">·</span>}
              {same && <span className="text-faint">Unchanged</span>}
              {standing?.is === "good" && <span className="text-green">Looks good</span>}
            </span>
            {flow.line && (
              <div inert={taken} className={`px-0.5 text-[13px] transition-opacity duration-300 ease-calm ${taken ? "opacity-35" : ""}`}>
                <Said who={round.by}>{flow.line}</Said>
              </div>
            )}
          </div>
          <Steps
            flow={flow}
            clock={clock}
            at={at}
            cut={cut}
            stops={stops}
            on={Math.min(stop, last)}
            marks={onLine}
            said={said}
            looksGood={looksGood}
            since={since}
            onUnfold={unfold}
            resting={taken}
            onStop={(k) => (toStop(k), props.onPressed(k))}
            onPoint={setLit}
            onScrub={(on) => (on && ((setPlaying(undefined), setPicked(undefined))), setScrubbing(on))}
            onGo={stopped}
          />
        </div>
      </div>
    </section>
  );
}

// What changed is outlined in the recording's own dark ink, as the frame drew it.
const RECORDED_INK = "#2b2e35";
// A recording's picture; side by side, each round's half, with room between them; and what each is, at its top left.
const FRAMED = "absolute inset-y-0 overflow-hidden rounded-lg bg-paper shadow-frame";
const HALVES = "w-[calc(50%-8px)]";
const CHIP = "pointer-events-none absolute top-2.5 left-2.5 z-3 rounded-md bg-ground px-2 py-0.5 text-xs leading-4 text-soft shadow-tip";

// What you did in the app, done again on this round's work as the agent recorded it, over the situation's recording: it
// plays once from where you took the situation over to where the answer shows, and rests there.
function Redone(props: {
  review: string;
  round: number;
  flow: Flow;
  app: NonNullable<Place["app"]>;
  until: number;
  frame?: Frame;
  marks: Mark[];
  closeOn?: string[];
  onMarks: (placed: Placed) => void;
  onPlaying: (playing: boolean) => void;
  // Arrived on or passed, it rests where it ends, still, as arriving is calm; stopped on, it plays.
  still: boolean;
  // Its clock, for what's beside it to follow; and how many times Compare has come on, each a time to play it again.
  clock: RefObject<Clock | undefined>;
  replays: number;
}) {
  const { app } = props;
  const [fork] = useState<Flow>(() => ({ ...props.flow, recording: app.recording, length: app.length, steps: app.steps ?? [] }));
  const cut = useCut(props.review, props.round, fork);
  const [from] = useState(() => (props.still ? props.until : app.from.at));
  const [clock] = useState(() => new Clock(from));
  props.clock.current = clock;
  const [at, setAt] = useState(from);
  const [playing, setPlaying] = useState<{ until: number }>();
  // It plays once it knows its waits, to cut them short as a step's are, from where you took it over.
  const played = useRef(false);
  useEffect(() => void (cut && !props.still && !played.current && ((played.current = true), clock.set(app.from.at), setAt(app.from.at), setPlaying({ until: props.until }))), [cut, props.still]);
  const [replayed] = useState(props.replays);
  useEffect(() => void (props.replays > replayed && (clock.set(app.from.at), setAt(app.from.at), setPlaying({ until: props.until }))), [props.replays]);
  useEffect(() => props.onPlaying(!!playing), [playing]);
  useEffect(() => () => props.onPlaying(false), []);
  return (
    <span className="absolute inset-0 z-2 animate-arrive">
      <Player
        review={props.review}
        round={props.round}
        recording={fork.recording}
        at={at}
        playing={playing}
        cut={cut}
        clock={clock}
        onStop={(moment) => (setAt(moment), setPlaying(undefined))}
        frame={props.frame}
        marks={props.marks}
        closeOn={playing || !props.closeOn ? undefined : { on: props.closeOn, shape: WHOLE }}
        onMarks={props.onMarks}
      />
    </span>
  );
}

// A picture that gives way to the next softly, the one before staying under it until the next has come.
function Still({ src, frame }: { src: string; frame?: Frame }) {
  const [under, setUnder] = useState(src);
  const [over, setOver] = useState(src);
  if (src !== over) (setUnder(over), setOver(src));
  return (
    <>
      <Picture key={`under ${under}`} shot={{ src: under, frame }} />
      <span key={`over ${over}`} className="absolute inset-0 animate-arrive">
        <Picture shot={{ src: over, frame }} />
      </span>
    </>
  );
}

// What a thread on the page can do: judge an answer, say what's still not right, change a note not sent yet.
export type Threads = {
  you: string;
  readOnly: boolean;
  unfinished: Record<string, string>;
  onUnfinished: (id: string, words: string | undefined) => void;
  onJudge: (note: Shown, verdict: Verdict | undefined) => void;
  onEdit: (id: string, words: string | undefined) => void;
};

// A step's end: the next one's start, or the flow's end. Its page is read there.
const stepEnd = (flow: Flow, step: number) => flow.steps[step + 1]?.at ?? flow.length;

// A moment of one stretch, as far into the other as it is into its own, between the moments paired in both.
function along(moment: number, here: number[], there: number[]): number {
  const i = clamp(here.findLastIndex((at) => at <= moment), 0, here.length - 2);
  const u = clamp((moment - here[i]!) / Math.max(here[i + 1]! - here[i]!, 0.01), 0, 1);
  return there[i]! + u * (there[i + 1]! - there[i]!);
}

// Each step's part of the page, in the shape of half the picture, as side by side shows it: what changed there, the
// first thing found, or where nothing did, what the step acted on, the last thing clicked or typed in that's still there
// and is a thing rather than a stretch of the page clicked away on; and where the hand went to get there, in the step's
// last few seconds, so it plays with the hand at work. The first step, and one that goes to another page, is the page's
// full height, where the hand ends: where they are is what it's about.
function useFrames(review: Review, round: Round, flow: Flow, readings: Reading[] | undefined, changedIn: (step: number) => Place[]): (Frame | undefined)[] {
  const [frames, setFrames] = useState<(Frame | undefined)[]>([]);
  useEffect(() => {
    let current = true;
    if (readings)
      recording(review.id, round.number, flow.recording).then((events) => {
        const { acted, pointer, loads } = recorded(events);
        const found = flow.steps.map((step, i) => {
          const reading = readings.find((one) => one.step === step.title);
          if (!reading) return undefined;
          const { width, height } = reading.screen;
          const end = stepEnd(flow, i);
          const hand = pointer.filter(([moment]) => moment >= Math.max(step.at, end - 3) && moment <= end).map(([, x, y]) => ({ x, y, width: 0, height: 0 }));
          if (i === 0 || loads.some((load) => load > step.at && load <= end)) return around({ x: hand.at(-1)?.x ?? width / 2, y: 0, width: 0, height }, reading.screen, HALF, CLOSEST);
          const worked = acted
            .filter(([moment]) => moment >= step.at && moment <= end)
            .toReversed()
            .map(([, node]) => reading.things.find((thing) => thing.node === node))
            .find((thing) => thing && thing.box.width * thing.box.height < (width * height) / 8)?.box;
          const what = changedIn(i).map((on) => boxIn(reading, on)).find(Boolean) ?? worked;
          const all = [...(what ? [what] : []), ...hand];
          return around(all.length ? union(all) : { x: width / 2, y: 0, width: 0, height }, reading.screen, HALF, CLOSEST);
        });
        if (current) setFrames(found);
      });
    return () => void (current = false);
  }, [review.id, round.number, flow.recording, !!readings]);
  return frames;
}

// Where something that changed is on a page: the things there by its role and name, or its part of the page.
function boxIn(reading: Reading, on: Place): Box | undefined {
  const { width: across, height: down } = reading.screen;
  const named = (role: string, name: string) => on.element?.role === role && on.element.name === name;
  const boxes = [
    ...reading.things.filter((thing) => named(thing.role, thing.name)).map((thing) => thing.box),
    ...(reading.items ?? []).filter((item) => named(item.role, item.words)).map((item) => item.box),
    ...(on.box ? [{ x: on.box.x * across, y: on.box.y * down, width: on.box.width * across, height: on.box.height * down }] : []),
  ];
  return boxes.length ? union(boxes) : undefined;
}

// A situation's picture is this wide for its height; side by side, each round has half of it, as tall as the whole.
const WHOLE = 1.6;
const HALF = 0.8;

// What a situation's standing says in words beside its Looks good, and when it can be judged at all.
const SAYS: Standing["is"][] = ["not saved", "needs you", "to send", "with the agent", "looked good"];
const JUDGED: Standing["is"][] = ["good", "is it good", "needs you", "looked good"];

const INK: Record<Standing["is"], string> = {
  good: "text-green",
  "looked good": "text-amber-ink",
  "to watch": "text-faint",
  "not saved": "text-amber-ink",
  "needs you": "text-amber-ink",
  "is it good": "text-amber-ink",
  "to send": "text-amber-ink",
  "with the agent": "text-slate",
};
