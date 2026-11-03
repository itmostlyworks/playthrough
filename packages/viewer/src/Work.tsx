// The work, as one page you go along from the top: what was asked, then each situation it meets, its recording with its
// way through beside it, its steps and what was said in them, a stop at a time. A turn of the wheel, a swipe or a key
// goes one stop on or back, and from a situation's last stop on to the next situation, which comes up to the window's
// top. The situation you're on has the bar: you note it, compare it with how it was and take it over where it is. At the
// end, how it got here, and the one step to take.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { lastLooked, type Flow, type Note, type Place, type Review, type Round, type Verdict } from "@playthrough/review";
import { picture, recording } from "./api.ts";
import { Bar } from "./Bar.tsx";
import { EndMark } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { fill, ink, unchangedSince, type Shown, type Standing } from "./notes.ts";
import { HOLD, Key, Said } from "./Card.tsx";
import { asWho, personAt } from "./people.ts";
import { Portal, TAG } from "./Portal.tsx";
import { recorded, type Scrolled } from "./replay.ts";
import type { CloseUp } from "./flight.ts";
import { Clock, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { answersTo, type Diamond } from "./changes.ts";
import { Conversation, quiet as quietNumber } from "./Notes.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Steps, type OnLine, type Saying, type Stop } from "./Steps.tsx";
import { onPhone } from "./phone.ts";
import { around, Picture, union, type Box, type Frame } from "./Picture.tsx";
import { roundName, Rounds } from "./Rounds.tsx";
import { Agent, Go, says, type Step } from "./Step.tsx";
import type { Read } from "./things.ts";

type Props = {
  room: RefObject<HTMLDivElement | null>;
  review: Review;
  round: Round;
  up: boolean;
  read: Read;
  notes: Shown[];
  standing: (flow: string) => Standing | undefined;
  // Saying a situation looks good, or taking it back; none where nothing can be said.
  onLooksGood?: (flow: string) => void;
  threads: Threads;
  // What's new to you on the round, as the player's timeline marks it.
  diamonds: Diamond[];
  accepted?: string;
  step?: Step;
  trouble: string[];
  acting: Acting;
  arrived?: Round;
  working?: string;
  onRound: (round: number) => void;
};

// What can be done on the situation you're on, from the bar across its recording's bottom edge, and how far it's got.
export type Acting = {
  latest: boolean;
  noting: boolean;
  // None where no note can be made, or nothing taken over.
  onNote?: () => void;
  onTakeOver?: () => void;
  onBack: () => void;
  onPlace: (on: Place) => void;
  // Where the situation you're on rests: Take over takes it over there, or at an answer to a note made in the app, where
  // the note was found, what you did there done again.
  onRest: (flow: string, at: number, again?: string) => void;
  onClose: () => void;
  // Taken over: the app made ready unseen, being made ready as you wait, or yours.
  live?: { flow: string; address?: string; shown: boolean; inApp: boolean; due?: number; at?: { x: number; y: number } };
  // The note you're writing on a recording: its number, and the box its words are written in.
  writing?: { note: Note; number: number; words: ReactNode };
  // The note opened last: a note saved stays open.
  opened?: string;
};

export function Work(props: Props) {
  const { review, round, up, step, acting } = props;
  const before = review.rounds.find((kept) => kept.number === 0 && kept.flows.length && round.number > 0);
  // What the work changed, against Before where there is one, else against the round before.
  const work = review.comparisons.find((kept) => kept.round === round.number && kept.since === 0) ?? review.comparisons.findLast((kept) => kept.round === round.number);
  const general = props.notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  // The flows the work left as they were, against Before.
  const same = before ? unchangedSince(review, 0, round.number) : [];
  // The situation you're on, which the bar and the keys are for: the one gone along to, or pressed, or scrolled to the
  // window's top by its bar; and the last move along the way, which its situation goes to. Noting, writing or in the
  // app, you stay where you are, and in the app the page holds still and the rest of it rests.
  const [active, setActive] = useState(round.flows[0]?.name);
  const [go, setGo] = useState<{ round: number; flow: string; stop: number }>();
  // Begun once you've gone along, or arrived on an answer waiting on you; until then, the foot says how to begin.
  const [arrivedOn] = useState(() => props.notes.some((note) => note.toJudge && round.flows.some((flow) => flow.name === note.on?.flow)));
  const begun = !!go || arrivedOn;
  const busy = acting.noting || !!acting.writing || !!acting.live?.shown;
  // Along the way a stop at a time: from a situation's last stop on to the next one's first, and back to the last of the
  // one before; before the first stop, the page's top, and past the last, its end. The page goes to the situation you're
  // on, its top at the window's. Staying, it goes no further than the situation you're on, and says whether it went.
  const steering = useRef(false);
  const move = (by: number, staying = false) => {
    const room = props.room.current;
    const situations = [...(room?.querySelectorAll<HTMLElement>("[data-situation]") ?? [])];
    let i = situations.findIndex((situation) => situation.dataset.situation === active);
    if (i < 0 && room) i = atTop(room, situations);
    if (!room || !situations[i]) return false;
    const count = (i: number) => Number(situations[i]!.dataset.stops);
    const was = { i, stop: Number(situations[i]!.dataset.stop) };
    let stop = was.stop + by;
    if (stop >= count(i) && i < situations.length - 1) [i, stop] = [i + 1, 0];
    else if (stop < 0 && i > 0) [i, stop] = [i - 1, count(i - 1) - 1];
    else stop = clamp(stop, -1, count(i));
    if ((i === was.i && stop === was.stop) || (staying && (i !== was.i || stop < 0 || stop >= count(i)))) return false;
    const flow = situations[i]!.dataset.situation!;
    setActive(flow);
    setGo({ round: round.number, flow, stop });
    const top = stop < 0 ? 0 : stop >= count(i) ? room.scrollHeight - room.clientHeight : topOf(room, situations[i]!);
    if (Math.abs(top - room.scrollTop) > 1) ((steering.current = true), room.scrollTo({ top, behavior: "smooth" }));
    return true;
  };
  const now = useRef({ busy, move, active });
  now.current = { busy, move, active };
  // A verdict lands where it was said, and the way goes on from there, unless you've gone on already.
  const goOn = (flow: string) => {
    const there = () => props.room.current?.querySelector<HTMLElement>(`[data-situation="${CSS.escape(flow)}"]`)?.dataset.stop;
    const was = there();
    window.setTimeout(() => !now.current.busy && now.current.active === flow && there() === was && now.current.move(1), LANDS);
  };
  useLayoutEffect(() => {
    const room = props.room.current;
    if (!room) return;
    // The last situation can come up to the window's top: there's a window's height under it, less its own.
    const tall = () => room.style.setProperty("--room", `${room.clientHeight}px`);
    tall();
    const watching = new ResizeObserver(tall);
    watching.observe(room);
    // Arriving with an answer waiting on you, you're on it.
    const waiting = round.flows.find((flow) => props.notes.some((note) => note.on?.flow === flow.name && note.toJudge && (note.on.app ? note.on.app.from.at : note.on.at) !== undefined));
    const held = waiting && room.querySelector<HTMLElement>(`[data-situation="${CSS.escape(waiting.name)}"]`);
    if (held) setActive(waiting.name);
    if (held && onPhone()) held.querySelector(`[data-stop="${held.dataset.stop}"]`)?.scrollIntoView({ block: "center" });
    else if (held) room.scrollTop = topOf(room, held);
    // A turn of the wheel, or a swipe, goes a stop on at once, and a stop more for each stride further it goes, one after
    // another so each is seen, so a long one goes further; a notch of the wheel is a stride. Only its first stop goes on
    // to another situation: a long one comes to rest at the end of the situation you're on. It's a new turn once the
    // wheel has been still a moment, or turned the other way. On a phone, the page scrolls as any page, and a stop is gone
    // to by pressing it.
    const turn = { last: -Infinity, by: 0, travel: 0, gone: 0, next: undefined as number | undefined };
    const goOn = () => {
      turn.next = undefined;
      const due = turn.travel < 12 ? 0 : 1 + Math.floor((turn.travel - 12) / STRIDE);
      if (turn.gone >= due || now.current.busy) return;
      if (!now.current.move(turn.by, turn.gone > 0)) return void (turn.gone = Infinity);
      turn.gone++;
      if (turn.gone < due) turn.next = window.setTimeout(goOn, PACE);
    };
    const wheel = (event: WheelEvent) => {
      const box = (event.target as Element).closest?.("textarea");
      if (event.ctrlKey || onPhone() || Math.abs(event.deltaX) > Math.abs(event.deltaY) || (box && box.scrollHeight > box.clientHeight)) return;
      event.preventDefault();
      const by = Math.sign(event.deltaY);
      if (now.current.busy || !by) return;
      const notch = event.deltaMode === 1 || (Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 50);
      if (event.timeStamp - turn.last > STILL || by !== turn.by) (clearTimeout(turn.next), Object.assign(turn, { by, travel: 0, gone: 0, next: undefined }));
      turn.last = event.timeStamp;
      turn.travel += notch ? STRIDE : Math.abs(event.deltaY) * (event.deltaMode === 2 ? room.clientHeight : 1);
      if (turn.next === undefined) goOn();
    };
    // Scrolled by its bar, the situation you're on is the one come up to the window's top.
    let still: number | undefined;
    const settle = () => {
      if (steering.current) return void (steering.current = false);
      const situations = [...room.querySelectorAll<HTMLElement>("[data-situation]")];
      const flow = situations[atTop(room, situations)]?.dataset.situation;
      if (flow && !now.current.busy) setActive(flow);
    };
    const scrolled = () => (clearTimeout(still), (still = window.setTimeout(settle, 120)));
    room.addEventListener("wheel", wheel, { passive: false });
    room.addEventListener("scroll", scrolled, { passive: true });
    return () => (clearTimeout(still), clearTimeout(turn.next), watching.disconnect(), room.removeEventListener("wheel", wheel), room.removeEventListener("scroll", scrolled));
  }, []);
  // Space and ↓ go a stop on, ↑ a stop back.
  useEffect(() => {
    if (!up || busy) return;
    const down = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as Element).closest?.("input, textarea, [contenteditable]")) return;
      const by = event.key === "ArrowDown" || (event.key === " " && !event.shiftKey) ? 1 : event.key === "ArrowUp" || (event.key === " " && event.shiftKey) ? -1 : 0;
      if (!by) return;
      event.preventDefault();
      move(by);
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  });
  const inApp = acting.live?.shown ? acting.live.flow : undefined;
  return (
    <div ref={props.room} data-room="" inert={!up} className={`absolute inset-0 z-20 bg-ground transition-[opacity,visibility] duration-240 ease-calm ${inApp ? "overflow-hidden" : "overflow-y-auto"} ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      {/* As wide as a situation's recording can be with its name over it and the bar under it, on the screen, and its steps beside it. */}
      <div className="mx-auto w-full max-w-[min(1480px,max(1000px,calc((100dvh_-_150px)_*_1.6_+_436px)))] px-8 pt-8 pb-4 phone:px-0 phone:pt-2">
        <header className="max-w-[680px]">
          <h2 className="text-[20px] leading-[27px] font-semibold tracking-[-0.01em] text-balance">{review.title}</h2>
          {review.asked && <p className="mt-2 text-[14px] leading-[22px] text-soft">{review.asked}</p>}
          <div className="mt-3 -ml-2.5 flex items-center gap-1 text-[13px] leading-5 text-soft">
            <Rounds quiet rounds={review.rounds} watching={round.number} arrived={props.arrived} working={props.working} onRound={props.onRound} />
            <span className="min-w-0 truncate">
              {round.flows.length} {round.flows.length === 1 ? "situation" : "situations"}, recorded by {round.by}
              {props.accepted && <span className="text-green"> · {props.accepted}</span>}
            </span>
          </div>
        </header>
        <div className="mt-10 grid gap-12 phone:mt-7 phone:gap-9">
          {round.flows.map((flow) => (
            <Situation
              key={`${round.number} ${flow.name}`}
              review={review}
              round={round}
              before={before}
              flow={flow}
              changed={(work?.changes ?? []).flatMap((change) => change.seen.filter((on) => on.flow === flow.name).map((on) => (change.gone ? { ...on, element: undefined } : on)))}
              readings={props.read(round.number, flow.name)}
              notes={props.notes.filter((note) => note.on?.flow === flow.name)}
              noteOf={(id) => props.notes.find((note) => note.id === id)}
              standing={props.standing(flow.name)}
              onLooksGood={props.onLooksGood}
              threads={props.threads}
              diamonds={props.diamonds.filter((diamond) => diamond.flow === flow.name)}
              quiet={props.standing(flow.name)?.is === "good"}
              same={same.includes(flow.name)}
              glimpsed={props.read(round.number, flow.name, true)}
              acting={acting}
              active={up && active === flow.name}
              go={go?.round === round.number && go.flow === flow.name ? go : undefined}
              resting={!!inApp && inApp !== flow.name}
              onPointerDown={() => !busy && setActive(flow.name)}
              onSaid={() => goOn(flow.name)}
            />
          ))}
        </div>
        <Story review={review} round={round} general={general} onRound={props.onRound} />
        {/* The one step to take floats at the window's foot, over the way rather than across the recordings. */}
        <div className="pointer-events-none sticky bottom-0 z-10 mt-6 flex min-h-8 justify-end py-4">
          <div className="pointer-events-auto w-[300px] max-w-full empty:hidden">
            {step?.kind === "go" && <Go step={step} className="w-full gap-3 bg-surface! shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]!" />}
            {!step && !begun && up && (
              <button
                className="flex h-8 w-full items-center gap-3 rounded-lg bg-surface px-3 text-xs leading-4 text-fg shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => move(1)}
              >
                Go through it, a step at a time
                <Key className="ml-auto">↓</Key>
              </button>
            )}
            {step?.kind === "agent" && !props.working && <Agent step={step} className="justify-end rounded-lg bg-surface px-3 shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]" />}
            {props.trouble.length > 0 && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs leading-[18px] text-amber-ink shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]">{props.trouble.join(" ")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// A situation: whose it is and what they do, where it stands, and its recording, with its way through beside it. A step
// gone to plays into its result and rests there; gone back to, it plays again. A note or a change gone to is there at its
// moment, lit. It arrives at the answer waiting on you, else at the first step's result. What's drawn on it, and what the
// bar does, is about the moment it's at: the notes there, outlined, what changed there, a note made there, the app taken
// over there. At rest, a click on it takes it over there; playing, it pauses it. C held is how it was before the work, at
// the same moment, in place; pressed, the two side by side, each close on the step's part of the page.
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
  // The stop gone along to, by the wheel or the keys.
  go?: { stop: number };
  resting: boolean;
  onPointerDown: () => void;
  // A verdict said on it: an answer judged, or Looks good at the end of the way.
  onSaid: () => void;
};

function Situation(props: SituationProps) {
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
  // Seen on a round before, as you said something about it then, its steps with nothing new to you since are kept
  // together: nothing changed in them, no answer waits in them, nothing of yours is unsent there.
  const since = lastLooked(review, threads.you, flow.name, round.number);
  const [unfolded, setUnfolded] = useState<number[]>([]);
  const together = (step: number) =>
    since !== undefined &&
    !unfolded.includes(step) &&
    !diamonds.some((diamond) => diamond.row && stepOf(Math.min(diamond.at, end)) === step) &&
    !notes.some((note) => momentOf(note) !== undefined && stepOf(Math.min(momentOf(note)!, end)) === step && (note.toJudge || note.unsent)) &&
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
  // of it, where it is. Before the first stop it rests, and past the last, it's how it ends.
  const toStop = (k: number) => {
    setStop(k);
    const there = stops[k];
    if (!there) return void (k < 0 ? playing && pause() : go(results.at(-1)!));
    if (there.id === undefined) playTo(there.at!, startOf(there.from ?? there.step));
    else if (there.at === undefined) setPicked(there.id);
    else go(there.at, there.id);
  };
  useLayoutEffect(() => void (props.go && toStop(props.go.stop)), [props.go]);
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
  // The last situation can come up to the window's top: there's a window's height under it, less its own.
  const section = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const around = section.current;
    if (!around) return;
    const measure = () => around.style.setProperty("--tall", `${around.offsetHeight}px`);
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(around);
    return () => watching.disconnect();
  }, [folded]);
  // The stop you're on stays in sight, where the way is longer than the window lets it be.
  const column = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const [list, row] = [column.current, column.current?.querySelector<HTMLElement>(`[data-stop="${Math.min(stop, last)}"]`)];
    if (!list || !row || list.scrollHeight <= list.clientHeight) return;
    const [box, there] = [list.getBoundingClientRect(), row.getBoundingClientRect()];
    const by = there.top < box.top ? there.top - box.top - 8 : there.bottom > box.bottom ? Math.min(there.bottom - box.bottom + 8, there.top - box.top - 8) : 0;
    if (by) list.scrollBy({ top: by, behavior: "smooth" });
  }, [stop]);
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

  // Taken over here: the app, unseen until it's yours, and the frame's edge warm from Take over until you're back.
  const live = acting.live?.flow === flow.name ? acting.live : undefined;
  const taken = !!live?.shown;
  if (taken && side) setSide(false);
  const noting = active && acting.noting;
  // C is the situation's you're on; in the app, it's the app's, and noting, it rests until you've chosen what it's on.
  // Gone to another, it stops.
  useEffect(() => {
    if (!active || taken || noting) return;
    const typing = (event: KeyboardEvent) => (event.target as Element).closest?.("input, textarea, [contenteditable]");
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      if (event.key.toLowerCase() === "c" && then) press();
    };
    const up = (event: KeyboardEvent) => event.key.toLowerCase() === "c" && release();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => (removeEventListener("keydown", down), removeEventListener("keyup", up));
  });
  useEffect(() => void (!active && playing && pause()), [active]);
  // Noting, it stops where it is: a note is made on the moment it's at; in the app, on what you click there.
  useEffect(() => void (noting && playing && pause()), [noting]);
  // An answer to a note made in the app is seen the way the note was found: what you did there, done again on this
  // round's work as the agent recorded it, from where you took it over to where the answer shows, or to the end of the
  // step of it the agent says it's seen in, where the page is the answer and nothing is outlined.
  const redone = (() => {
    const id = stops[stop]?.id;
    const on = notes.find((note) => note.id === id)?.on;
    if (!id || !on?.app?.steps || on.at === undefined) return undefined;
    const watched = on.app.steps.findIndex((step) => step.title === round.replies.find((reply) => reply.note === id)?.watch);
    const until = watched < 0 ? on.at : (on.app.steps[watched + 1]?.at ?? on.app.length) - 0.05;
    return { id, on, app: on.app, until, outlined: watched < 0 };
  })();
  const [redoing, setRedoing] = useState(false);
  // At rest on the situation you're on, that's where Take over takes it over; at such an answer, it's taken over the
  // way it was found, what you did done again in the app.
  const restsAt = Math.round(at * 100) / 100;
  const resting = active && !playing && !scrubbing && !taken;
  useEffect(() => void (resting && acting.onRest(flow.name, restsAt, redone?.id)), [resting, restsAt, redone?.id]);
  // And there, it's a click from being the app: pointing at it says so beside your pointer, as who it's done as. A
  // click on another situation's makes it the one you're on.
  const person = personAt(flow, restsAt);
  const stepIn = resting && !live?.shown && !noting && acting.latest ? acting.onTakeOver : undefined;
  const [aiming, setAiming] = useState(false);
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
    const own = diamonds.find((diamond) => diamond.id === id)?.changes.filter((changed) => !changed.answers) ?? [];
    const told = own.find((changed) => changed.line);
    const madeFor = own.map((changed) => changed.note && props.noteOf(changed.note)).find(Boolean) || undefined;
    const words = note ? note.turns[0]?.words : madeFor ? madeFor.turns[0]?.words : (told?.line ?? diamonds.find((diamond) => diamond.id === id)?.name);
    const forNote = madeFor && (
      <span className={`mr-1.5 inline-block size-4 rounded-full text-center align-[-3px] text-[9px] leading-4 font-semibold ${quietNumber}`} style={{ "--c": ink(madeFor) } as CSSProperties}>
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
            />
          </div>
        ),
      };
    return {
      sign: <i className="size-[7px] rotate-45 bg-fg" />,
      line: (
        <>
          {madeFor && <>Changed for your note {forNote}</>}
          {words}
        </>
      ),
      whole: (
        <Said who={madeFor ? "Changed for your note" : (told?.by ?? "Changed here")}>
          {forNote}
          {words}
        </Said>
      ),
    };
  };

  const frames = useFrames(review, round, flow, readings, (step) => changed.filter((on) => on.at !== undefined && stepOf(on.at) === step));
  const frame = side ? frames[step] : undefined;
  // At rest on a note or a change, the recording is close on what it's on, and on a step, it's the whole page as it
  // plays; side by side, it's the step's part of the page; and taken over, the whole page the app comes in as.
  const there = stops[stop];
  const closeOn = !side && !live?.shown && there?.id !== undefined && there.at !== undefined && Math.abs(at - there.at) < 0.02 ? pins.find((pin) => pin.id === there.id)?.on : undefined;
  const view = `${at} ${side} ${closeOn?.join(" ") ?? ""} ${redone ? "redone" : ""}`;
  // The app is the page the recording was made of, at its size, scrolled where the recording rests.
  const screen = readings?.find((one) => one.step === flow.steps[step]?.title)?.screen ?? { width: 1280, height: 800 };
  const scrolled = useRef<() => Scrolled>(undefined);
  // How it was, at the same moment: following this one as it plays.
  const beforeAt = thenAt(at);
  const was = (frame?: Frame) =>
    then && beforeAt !== undefined ? (
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
      <div className="mb-3 flex items-baseline justify-between gap-x-4 gap-y-1 px-0.5 phone:flex-wrap">
        <h3 className="min-w-0 text-[15px] leading-[21px] font-semibold text-balance">
          {flow.name}
          {asWho(flow) && <span className="font-normal text-soft"> {asWho(flow)}</span>}
        </h3>
        <span className="flex flex-none flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 whitespace-nowrap">
          {standing && SAYS.includes(standing.is) && <span className={INK[standing.is]}>{says(standing)}</span>}
          {standing && SAYS.includes(standing.is) && same && <span className="text-faint">·</span>}
          {same && <span className="text-faint">Same as before</span>}
          {standing?.is === "good" && <span className="text-green">Looks good</span>}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-8 phone:grid-cols-1">
        <div className="relative self-start">
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
              setAiming(true);
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
                closeOn={redone ? undefined : closeOn}
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
                />
              )}
              <span className={`${CHIP} transition-opacity duration-450 ease-calm ${side ? "" : "opacity-0"}`}>Now</span>
            </span>
            {beside && (
              <span className={`${FRAMED} right-0 ${HALVES} transition-opacity duration-450 ease-calm starting:opacity-0 ${side ? "" : "opacity-0"}`}>
                {was(frame)}
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
          <span ref={pill} aria-hidden className={`pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-150 ease-calm ${stepIn && aiming ? "" : "opacity-0"}`}>
            <span className={TAG}>{person ? `Take over as ${person}` : "Take over"}</span>
          </span>
          {active && (
            <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2">
              <div className="animate-arrive">
                <Bar
                  live={taken ? (live.inApp ? "shown" : "waiting") : undefined}
                  latest={acting.latest}
                  compare={then && { on: side || peek, off: taken, onPress: press, onRelease: release }}
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
        {/* As tall as the recording, whatever opens in it, with room inside it for the marker and a line's marks at its
            ends: what's longer scrolls in it rather than pushing the page down. */}
        <div ref={column} className="-mx-3 -mb-2 flex flex-col gap-5 overflow-x-hidden overflow-y-auto px-3 pb-2 contain-size phone:mx-0 phone:px-0 phone:contain-none">
          {flow.line && (
            <div inert={taken} className={`px-0.5 text-[13px] transition-opacity duration-300 ease-calm ${taken ? "opacity-35" : ""}`}>
              <Said who={round.by}>{flow.line}</Said>
            </div>
          )}
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
            onStop={toStop}
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
}) {
  const { app } = props;
  const [fork] = useState<Flow>(() => ({ ...props.flow, recording: app.recording, length: app.length, steps: app.steps ?? [] }));
  const cut = useCut(props.review, props.round, fork);
  const [clock] = useState(() => new Clock(app.from.at));
  const [at, setAt] = useState(app.from.at);
  const [playing, setPlaying] = useState<{ until: number }>();
  // It plays once it knows its waits, to cut them short as a step's are.
  const played = useRef(false);
  useEffect(() => void (cut && !played.current && ((played.current = true), setPlaying({ until: props.until }))), [cut]);
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
        closeOn={playing ? undefined : props.closeOn}
        onMarks={props.onMarks}
      />
      <span className={CHIP}>What you did, done again</span>
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

// A step opened from its close-up: where it starts and ends, and how its picture showed it.
export type Beat = { from: number; until: number; closeUp: CloseUp };

// How long the wheel is still between one turn of it and the next, in milliseconds: turned again sooner, it's the same
// turn going on.
const STILL = 200;
// How much further a turn of the wheel goes for each stop more, in pixels as it would have scrolled the page: a notch of
// the wheel; and how soon the next stop of a long turn comes after the one before, in milliseconds.
const STRIDE = 110;
const PACE = 120;
// How long a verdict is seen where it was said before the way goes on, in milliseconds.
const LANDS = 600;

// Where the page is scrolled to for a situation to be at the window's top.
const topOf = (room: HTMLElement, situation: HTMLElement) => room.scrollTop + situation.getBoundingClientRect().top - room.getBoundingClientRect().top;

// The situation scrolled up to the window's top: the last whose top is in the window's top third, else the first.
const atTop = (room: HTMLElement, situations: HTMLElement[]) => {
  const top = room.getBoundingClientRect().top + room.clientHeight / 3;
  return Math.max(0, situations.findLastIndex((situation) => situation.getBoundingClientRect().top <= top));
};

// A step's end: the next one's start, or the flow's end. Its page is read there.
const stepEnd = (flow: Flow, step: number) => flow.steps[step + 1]?.at ?? flow.length;

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
          if (i === 0 || loads.some((load) => load > step.at && load <= end)) return around({ x: hand.at(-1)?.x ?? width / 2, y: 0, width: 0, height }, reading.screen, HALF);
          const worked = acted
            .filter(([moment]) => moment >= step.at && moment <= end)
            .toReversed()
            .map(([, node]) => reading.things.find((thing) => thing.node === node))
            .find((thing) => thing && thing.box.width * thing.box.height < (width * height) / 8)?.box;
          const what = changedIn(i).map((on) => boxIn(reading, on)).find(Boolean) ?? worked;
          const all = [...(what ? [what] : []), ...hand];
          return around(all.length ? union(all) : { x: width / 2, y: 0, width: 0, height }, reading.screen, HALF);
        });
        if (current) setFrames(found);
      });
    return () => void (current = false);
  }, [review.id, round.number, flow.recording, !!readings]);
  return frames;
}

// Each round in a line: who recorded it, what was said about it, and what came of that. Its name goes to it, as the
// rounds at the top do.
function Story({ review, round, general, onRound }: { review: Review; round: Round; general: Shown[]; onRound: (round: number) => void }) {
  const rounds = review.rounds.filter((kept) => kept.number > 0 && kept.number <= round.number);
  if (rounds.length < 2 && !general.length) return null;
  return (
    <section className="mt-14 max-w-[680px] border-t border-line pt-6">
      <h3 className="text-[13px] leading-5 font-semibold">How it got here</h3>
      <ol className="mt-2 grid gap-1 text-[13px] leading-5 text-soft">
        {rounds.map((kept) => {
          const sent = review.sends.filter((send) => send.round === kept.number);
          const notes = sent.reduce((count, send) => count + send.notes.length, 0);
          return (
            <li key={kept.number}>
              {kept.number === round.number ? (
                <span className="text-fg">{roundName(kept.number)}</span>
              ) : (
                <button className="text-fg underline-offset-[3px] hover:underline" onClick={() => onRound(kept.number)}>
                  {roundName(kept.number)}
                </button>
              )}
              , by {kept.by}
              {kept.replies.length > 0 && `, answering ${kept.replies.length} ${kept.replies.length === 1 ? "note" : "notes"}`}
              {notes > 0 && ` · ${notes} ${notes === 1 ? "note" : "notes"} sent back`}
            </li>
          );
        })}
      </ol>
      {general.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {general.map((note) => (
            <li key={note.id} className="flex min-w-0 items-baseline gap-2 text-[13px] leading-5">
              <span className={`size-1.5 flex-none translate-y-[-1px] rounded-full ${fill(note)}`} />
              <span className="truncate text-fg">{note.turns[0]?.words}</span>
              {where(note) && <span className={`flex-none ${where(note)![1]}`}>· {where(note)![0]}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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

// Side by side, each round has half the picture, as tall as the whole: this wide for its height.
const HALF = 0.8;

// Where a note stands, in a word or two after what was said.
const where = (note: Shown): [string, string] | undefined =>
  note.unsent ? ["To send", "text-amber-ink"] : note.toJudge ? ["Does this fix it?", "text-amber-ink"] : note.state === "with the agent" ? ["With the agent", "text-slate"] : note.state === "settled" ? ["Settled", "text-green"] : undefined;

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
