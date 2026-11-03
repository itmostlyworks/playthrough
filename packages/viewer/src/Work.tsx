// The work, as one page: what was asked, then each situation it meets, step by step, as it is now, with your notes on
// it, and how it was before the work beside it when you compare. The situation you're on has the bar: you note it,
// compare it and take it over where it is. At the end, how it got here, and the one step to take.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { type Flow, type Note, type Place, type Review, type Round, type Verdict } from "@playthrough/review";
import { picture, recording } from "./api.ts";
import { Bar } from "./Bar.tsx";
import { EndMark } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { fill, ink, unchangedSince, type Shown, type Standing } from "./notes.ts";
import { HOLD, Said } from "./Card.tsx";
import { asWho, personAt } from "./people.ts";
import { Portal } from "./Portal.tsx";
import { recorded, type Scrolled } from "./replay.ts";
import type { CloseUp } from "./flight.ts";
import { Clock, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import type { Diamond } from "./changes.ts";
import { Conversation } from "./Notes.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Steps, type OnLine } from "./Steps.tsx";
import { Picture, type Frame } from "./Picture.tsx";
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
  // Where the situation you're on rests: Take over takes it over there.
  onRest: (flow: string, at: number) => void;
  onClose: () => void;
  // Taken over: the app made ready unseen, being made ready as you wait, or yours.
  live?: { flow: string; address?: string; shown: boolean; inApp: boolean; due?: number; at?: { x: number; y: number } };
  // The note you're writing on a recording: its number, and its card.
  writing?: { note: Note; number: number; card: ReactNode };
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
  // The situation you're on, which the bar and the keys are for: the one the pointer settles on, not one it passes over.
  // Noting, writing or in the app, you stay on it, and in the app the page holds still and the rest of it rests.
  const [active, setActive] = useState(round.flows[0]?.name);
  const busy = acting.noting || !!acting.writing || !!acting.live?.shown;
  const settling = useRef<number>(undefined);
  const pointed = useRef<string>(undefined);
  const settleOn = (name?: string) => {
    clearTimeout(settling.current);
    pointed.current = name;
    if (name && !busy) settling.current = window.setTimeout(() => setActive(name), SETTLE);
  };
  // Done, you're on the one the pointer's on.
  useEffect(() => void (!busy && settleOn(pointed.current)), [busy]);
  const inApp = acting.live?.shown ? acting.live.flow : undefined;
  return (
    <div ref={props.room} inert={!up} className={`absolute inset-0 z-20 bg-ground transition-[opacity,visibility] duration-240 ease-calm ${inApp ? "overflow-hidden" : "overflow-y-auto"} ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      {/* As wide as a situation's recording can be with its name over it, the bar and its steps under it, and the foot, on the screen. */}
      <div className="mx-auto w-full max-w-[min(1320px,max(760px,calc((100dvh_-_265px)_*_1.6_+_64px)))] px-8 pt-8 pb-4 phone:px-0 phone:pt-2">
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
              standing={props.standing(flow.name)}
              onLooksGood={props.onLooksGood}
              threads={props.threads}
              diamonds={props.diamonds.filter((diamond) => diamond.flow === flow.name)}
              quiet={props.standing(flow.name)?.is === "good"}
              same={same.includes(flow.name)}
              glimpsed={props.read(round.number, flow.name, true)}
              acting={acting}
              active={up && active === flow.name}
              resting={!!inApp && inApp !== flow.name}
              onPointerEnter={() => settleOn(flow.name)}
              onPointerLeave={() => settleOn()}
            />
          ))}
        </div>
        <Story review={review} round={round} general={general} />
        <div className="sticky bottom-0 z-10 mt-6 flex min-h-8 justify-end bg-ground py-4">
          <div className="w-[300px] max-w-full">
            {step?.kind === "go" && <Go step={step} className="w-full gap-3" />}
            {step?.kind === "agent" && !props.working && <Agent step={step} className="justify-end" />}
            {props.trouble.length > 0 && <p className="mt-2 text-xs leading-[18px] text-amber-ink">{props.trouble.join(" ")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// A situation: whose it is and what they do, where it stands, and its recording at one moment, with its steps under it.
// You walk it a step at a time: it rests on each step's result, and on the way at each answer waiting on you and each
// change new to you, and never moves on without you. It arrives at what needs you first, else at the first step's
// result. What's drawn on it, and what the bar does, is about the moment it's at: the notes there, what changed there and
// why, a note made there, the app taken over there. Space or → plays on to the next resting place, and Space while it
// moves stops it there; ← goes back to the one before. C held is how it was before the work, at the same moment, in
// place; pressed, the two side by side, each close on the step's part of the page.
type SituationProps = {
  review: Review;
  round: Round;
  before?: Round;
  flow: Flow;
  changed: Place[];
  readings?: Reading[];
  glimpsed?: Glimpse[];
  notes: Shown[];
  standing?: Standing;
  same: boolean;
  onLooksGood?: (flow: string) => void;
  threads: Threads;
  diamonds: Diamond[];
  quiet: boolean;
  acting: Acting;
  active: boolean;
  resting: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

function Situation(props: SituationProps) {
  const { review, round, before, flow, changed, readings, notes, standing, same, onLooksGood, threads, diamonds, quiet, acting, active } = props;
  const end = flow.length - 0.05;
  const stepOf = (at: number) => Math.max(0, flow.steps.findIndex((_, i) => stepEnd(flow, i) >= at - 0.05));
  // A note's moment: where it was made, or made in the app, where the app was taken over.
  const momentOf = (note: Shown) => (note.on?.app ? note.on.app.from.at : note.on?.at);
  // Where it rests: each step's result, and on the way, each answer waiting on you and each change new to you that has
  // something to say of its own (one made for a note is in the note's answer), its card open there. One a moment from a
  // step's end is that step's result.
  const stops = [
    ...notes.flatMap((note) => (note.toJudge && momentOf(note) !== undefined ? [{ id: note.id, at: Math.min(momentOf(note)!, end) }] : [])),
    ...diamonds.filter((diamond) => diamond.row).map((diamond) => ({ id: diamond.id, at: Math.min(diamond.at, end) })),
  ];
  const rests = [...stops, ...flow.steps.map((_, i) => ({ id: undefined, at: stepEnd(flow, i) - 0.05 }))]
    .sort((a, b) => a.at - b.at)
    .reduce<{ id?: string; at: number }[]>((all, rest) => {
      const last = all.at(-1);
      if (last && rest.at - last.at < 0.08) all[all.length - 1] = { id: last.id ?? rest.id, at: rest.at };
      else all.push(rest);
      return all;
    }, []);
  const waiting = notes.find((note) => note.toJudge && momentOf(note) !== undefined);
  const first = (waiting && rests.find((rest) => rest.id === waiting.id)) ?? rests.find((rest) => rest.id) ?? rests[0];
  const [clock] = useState(() => new Clock(first?.at ?? end));
  const [at, setAt] = useState(clock.at);
  const [playing, setPlaying] = useState<{ until: number }>();
  const cut = useCut(review.id, round.number, flow);
  // Open beside its thing: on arriving, the answer waiting on you; then what you open, or what it came to rest at.
  const [picked, setPicked] = useState(waiting?.id);
  // Good for you, as nothing's changed since you said so, it arrives folded to its name, and opens when you choose.
  const [folded, setFolded] = useState(quiet);
  const go = (moment: number, id?: string) => (clock.set(moment), setAt(moment), setPlaying(undefined), setPicked(id));
  const playTo = (until: number, from = clock.at) => (clock.set(from), setAt(from), setPicked(undefined), setPlaying({ until }));
  const pause = () => (setAt(clock.at), setPlaying(undefined));
  // On to the next resting place; from the last, the first step again. Moving, it stops where it is.
  const playOn = () => {
    if (playing) return pause();
    const from = clock.at >= rests.at(-1)!.at - 0.01 ? 0 : clock.at;
    playTo(rests.find((rest) => rest.at > from + 0.01)!.at, from);
  };
  // Back to the resting place before, at once; before the first, the start.
  const back = () => {
    const rest = rests.findLast((rest) => rest.at < clock.at - 0.01);
    go(rest?.at ?? 0, rest?.id);
  };
  const stopped = (moment: number) => {
    clock.set(moment);
    setAt(moment);
    setPlaying(undefined);
    setPicked(rests.find((rest) => Math.abs(rest.at - moment) < 0.01)?.id);
  };
  // A step plays from its start to its first resting place.
  const playStep = (step: number) => playTo(rests.find((rest) => rest.at > flow.steps[step]!.at + 0.01)!.at, flow.steps[step]!.at);

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
  // Space, the arrows and C are the situation's you're on; in the app, they're the app's. Gone to another, it stops.
  // → while it moves is where it was going.
  useEffect(() => {
    if (!active || taken) return;
    const typing = (event: KeyboardEvent) => (event.target as Element).closest?.("input, textarea, [contenteditable], [role=slider]");
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      if (event.key === " ") {
        event.preventDefault();
        playOn();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (playing) stopped(playing.until);
        else playOn();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      } else if (event.key.toLowerCase() === "c" && then) press();
    };
    const up = (event: KeyboardEvent) => event.key.toLowerCase() === "c" && release();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => (removeEventListener("keydown", down), removeEventListener("keyup", up));
  });
  useEffect(() => void (!active && playing && pause()), [active]);
  // Noting, it stops where it is: a note is made on the moment it's at; in the app, on what you click there.
  const noting = active && acting.noting;
  useEffect(() => void (noting && playing && pause()), [noting]);
  // At rest on the situation you're on, that's where Take over takes it over.
  const restsAt = Math.round(at * 100) / 100;
  const resting = active && !playing && !taken;
  useEffect(() => void (resting && acting.onRest(flow.name, restsAt)), [resting, restsAt]);

  // What's drawn is what's at this moment: in its step, the notes made there up to now, and what changed there.
  const shown = (moment: number) => stepOf(moment) === step && moment <= at + 0.05;
  const here = notes.filter((note) => momentOf(note) !== undefined && shown(momentOf(note)!));
  const changedHere = diamonds.filter((diamond) => diamond.row && shown(Math.min(diamond.at, end)));
  const writing = acting.writing?.note.on?.flow === flow.name && !acting.writing.note.on.app && acting.writing.note.on.at !== undefined && shown(acting.writing.note.on.at) ? acting.writing : undefined;
  // One made in the app is on its thing as it was written, found by its name: the app's nodes aren't this recording's.
  const written = (note: Shown) => review.sends.flatMap((send) => send.notes).find((kept) => kept.id === note.id)?.on ?? note.on;
  const marks: Mark[] = [
    ...here.map((note) =>
      note.on?.app ? { id: note.id, name: written(note)?.element?.name ?? note.on.element?.name } : { id: note.id, node: note.on?.element?.node, name: note.on?.element?.name, point: note.on?.point },
    ),
    ...changedHere.flatMap((diamond) => diamond.changes.map(({ on }, i) => ({ id: `${diamond.id} ${i}`, node: on.element?.node, name: on.element?.name, point: on.point, box: on.box }))),
    ...(writing ? [{ id: writing.note.id, node: writing.note.on?.element?.node, point: writing.note.on?.point }] : []),
  ];
  const pins: Pin[] = [
    ...here.map((note) => ({ id: note.id, on: [note.id], ink: ink(note), number: note.number, fill: fill(note) })),
    ...changedHere.map((diamond) => ({ id: diamond.id, on: diamond.changes.map((_, i) => `${diamond.id} ${i}`), ink: RECORDED_INK, diamond: true as const })),
    ...(writing ? [{ id: writing.note.id, on: [writing.note.id], ink: "var(--amber)", number: writing.number, fill: "bg-amber" }] : []),
  ];
  const view = `${at} ${side}`;
  const [placed, setPlaced] = useState<{ view: string; at: Placed }>();
  const [saved, setSaved] = useState(acting.opened);
  if (acting.opened !== saved) (setSaved(acting.opened), notes.some((note) => note.id === acting.opened) && setPicked(acting.opened));
  const open = writing ? writing.note.id : !side && pins.some((pin) => pin.id === picked) ? picked : undefined;
  const opened = here.find((note) => note.id === open);
  const changeOpen = changedHere.find((diamond) => diamond.id === open);
  const said = changeOpen?.changes.find((changed) => changed.line);
  const [asking, setAsking] = useState<string>();
  // On the line, each note's dot and each change's diamond, where they are.
  const onLine: OnLine[] = [
    ...notes.flatMap((note) => (momentOf(note) === undefined ? [] : [{ id: note.id, at: momentOf(note)!, fill: fill(note), words: note.turns[0]?.words ?? "Your note" }])),
    ...diamonds.filter((diamond) => diamond.row).map((diamond) => ({ id: diamond.id, at: Math.min(diamond.at, end), words: diamond.name })),
  ];

  const frames = useFrames(review, round, flow, readings, (step) => changed.filter((on) => on.at !== undefined && stepOf(on.at) === step));
  const frame = side ? frames[step] : undefined;
  // The app is the page the recording was made of, at its size, scrolled where the recording rests.
  const screen = readings?.find((one) => one.step === flow.steps[step]?.title)?.screen ?? { width: 1280, height: 800 };
  const scrolled = useRef<() => Scrolled>(undefined);
  // How it was, at the same moment: following this one as it plays.
  const beforeAt = thenAt(at);
  const was = (frame?: Frame) =>
    then && beforeAt !== undefined ? (
      <>
        <Still src={picture(review.id, 0, then.recording, thenStep)} frame={frame} />
        <Player review={review.id} round={0} recording={then.recording} at={beforeAt} following={playing ? { clock, at: (moment) => thenAt(moment) ?? beforeAt } : undefined} frame={frame} />
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
      inert={props.resting}
      className={`grid gap-3 transition-opacity duration-500 ease-calm ${props.resting ? "opacity-30" : ""}`}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
    >
      <div className="grid content-start gap-3">
        <div className="flex items-baseline justify-between gap-4 px-0.5">
          <h3 className="min-w-0 text-[15px] leading-[21px] font-semibold text-balance">
            {flow.name}
            {asWho(flow) && <span className="font-normal text-soft"> {asWho(flow)}</span>}
          </h3>
          <span className="flex flex-none flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 whitespace-nowrap">
            {standing && SAYS.includes(standing.is) && <span className={INK[standing.is]}>{says(standing)}</span>}
            {standing && SAYS.includes(standing.is) && same && <span className="text-faint">·</span>}
            {same && <span className="text-faint">Same as before</span>}
            {standing && onLooksGood && JUDGED.includes(standing.is) && (
              <button
                aria-pressed={standing.is === "good"}
                className="-my-1 ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg aria-pressed:text-green"
                onClick={() => onLooksGood(flow.name)}
              >
                <EndMark end={standing.is === "good" ? "good" : "asks"} ahead just={false} className="size-3 flex-none" />
                Looks good
              </button>
            )}
          </span>
        </div>
        {flow.line && (
          <div className="px-0.5 text-[13px]">
            <Said who={round.by}>{flow.line}</Said>
          </div>
        )}
      </div>
      <div className="relative">
        {/* A click plays it on and stops it, as Space does; noting, it notes what's under it. */}
        <button data-picture={flow.name} className="relative block aspect-[1.6] w-full" aria-label={playing ? `Pause ${flow.name}` : `Play ${flow.name}`} onClick={playOn}>
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
              frame={frame}
              marks={marks}
              onMarks={(placed) => setPlaced({ view, at: placed })}
              things={noting && !taken && !writing ? props.glimpsed : undefined}
              onPlace={noting && !taken && !writing ? (on) => acting.onPlace({ flow: flow.name, at: restsAt, ...on }) : undefined}
              scrolled={scrolled}
            />
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
        <Portal live={live} person={personAt(flow, restsAt)} screen={screen} scrolled={() => scrolled.current?.()} />
        {active && (
          <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2">
            <div className="animate-arrive">
              <Bar
                live={taken ? (live.inApp ? "shown" : "waiting") : undefined}
                latest={acting.latest}
                compare={then && { on: side || peek, off: taken, onPress: press, onRelease: release }}
                noting={noting}
                onNote={acting.onNote}
                onTakeOver={acting.onTakeOver}
                onBack={acting.onBack}
                flow={flow.name}
              />
            </div>
          </div>
        )}
        {!taken && !peek && (
          <div className={`pointer-events-none absolute inset-y-0 left-0 z-1 transition-[width] duration-450 ease-calm ${side ? `${HALVES} overflow-hidden rounded-lg` : "w-full"}`}>
            <Pinned pins={pins} placed={placed?.view === view ? placed.at : {}} open={open} faded={!!playing || placed?.view !== view} onOpen={(id) => (writing && id !== writing.note.id ? acting.onClose() : setPicked(id))}>
              {writing?.card}
              {!writing && opened && (
                <Conversation
                  note={opened}
                  you={threads.you}
                  readOnly={threads.readOnly}
                  asking={asking === opened.id}
                  unfinished={threads.unfinished[opened.id]}
                  away={false}
                  onAsking={(on) => setAsking(on ? opened.id : undefined)}
                  onUnfinished={(words) => threads.onUnfinished(opened.id, words)}
                  onJudge={(verdict) => (threads.onJudge(opened, verdict), setPicked(opened.id))}
                  onEdit={(words) => threads.onEdit(opened.id, words)}
                  onShow={() => {}}
                />
              )}
              {!writing && changeOpen && (
                <div className="grid gap-1 py-1.5 pr-9 pl-4">
                  <span className="text-[11.5px] leading-5 text-faint">{said?.by ?? "Changed here"}</span>
                  {said?.line && <p className="text-[13px] leading-normal whitespace-pre-wrap">{said.line}</p>}
                  {!threads.readOnly && (
                    <button
                      className="mt-1.5 justify-self-start rounded-md bg-hover px-2.5 py-1 text-[12.5px] transition-colors duration-150 ease-calm hover:bg-line"
                      onClick={() => {
                        const on = changeOpen.changes[0]!.on;
                        acting.onPlace({ flow: flow.name, at: restsAt, ...(on.element ? { element: on.element } : on.box ? { box: on.box } : on.point && { point: on.point }) });
                      }}
                    >
                      Note on this
                    </button>
                  )}
                </div>
              )}
            </Pinned>
          </div>
        )}
      </div>
      <Steps
        flow={flow}
        clock={clock}
        at={at}
        marks={onLine}
        onPlay={playStep}
        onMark={(id) => {
          const mark = onLine.find((mark) => mark.id === id);
          if (mark) go(mark.at, id);
        }}
        className="mt-10"
      />
    </section>
  );
}

// What changed is outlined in the recording's own dark ink, as the frame drew it.
const RECORDED_INK = "#2b2e35";
// A recording's picture; side by side, each round's half, with room between them; and what each is, at its top left.
const FRAMED = "absolute inset-y-0 overflow-hidden rounded-lg bg-paper shadow-frame";
const HALVES = "w-[calc(50%-8px)]";
const CHIP = "pointer-events-none absolute top-2.5 left-2.5 z-1 rounded-md bg-ground px-2 py-0.5 text-xs leading-4 text-soft shadow-tip";

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

// How long the pointer stays on a situation before it's the one you're on, so passing over one on the way doesn't move
// the bar there, in milliseconds.
const SETTLE = 250;

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
          if (i === 0 || loads.some((load) => load > step.at && load <= end)) return around({ x: hand.at(-1)?.x ?? width / 2, y: 0, width: 0, height }, reading);
          const worked = acted
            .filter(([moment]) => moment >= step.at && moment <= end)
            .toReversed()
            .map(([, node]) => reading.things.find((thing) => thing.node === node))
            .find((thing) => thing && thing.box.width * thing.box.height < (width * height) / 8)?.box;
          const what = changedIn(i).map((on) => boxIn(reading, on)).find(Boolean) ?? worked;
          const all = [...(what ? [what] : []), ...hand];
          return around(all.length ? union(all) : { x: width / 2, y: 0, width: 0, height }, reading);
        });
        if (current) setFrames(found);
      });
    return () => void (current = false);
  }, [review.id, round.number, flow.recording, !!readings]);
  return frames;
}

// Each round in a line: who recorded it, what was said about it, and what came of that.
function Story({ review, round, general }: { review: Review; round: Round; general: Shown[] }) {
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
              <span className="text-fg">{roundName(kept.number)}</span>, by {kept.by}
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

type Box = { x: number; y: number; width: number; height: number };

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

const union = (boxes: Box[]): Box => {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return { x: left, y: top, width: Math.max(...boxes.map((box) => box.x + box.width)) - left, height: Math.max(...boxes.map((box) => box.y + box.height)) - top };
};

// Side by side, each round has half the picture, as tall as the whole: this wide for its height.
const HALF = 0.8;

// A part of the page with room around it, in the shape of half the picture, at most twice as close as the page's full
// height.
function around(box: Box, reading: Reading): Frame {
  const { width: across, height: down } = reading.screen;
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height];
  const height = Math.min(down, across / HALF, Math.max((right - left + across * 0.08) / HALF, bottom - top + down * 0.25, down / 2));
  const width = height * HALF;
  const x = clamp((left + right) / 2 - width / 2, 0, across - width);
  const y = clamp((top + bottom) / 2 - height / 2, 0, down - height);
  return { x: x / across, y: y / down, width: width / across, height: height / down };
}

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
