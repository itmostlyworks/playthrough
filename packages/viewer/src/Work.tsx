// The work, as one page you read from the top: what was asked, then each situation it meets, its recording with its
// steps beside it, both held at the window's top while scrolling goes along the steps, each playing into its result as
// you come to it, with what was said about it under it. The situation held there has the bar: you note it, compare it
// with how it was and take it over where it is. At the end, how it got here, and the one step to take.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
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
import { answersTo, type Diamond } from "./changes.ts";
import { Conversation, quiet as quietNumber } from "./Notes.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Steps, type OnLine } from "./Steps.tsx";
import { onPhone } from "./phone.ts";
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
  // The situation you're on, which the bar and the keys are for, is the one held at the window's top, and the step it's
  // on, as far along its steps as the scrolling has come, once it stops; or one you press. Noting, writing or in the app,
  // you stay where you are, and in the app the page holds still and the rest of it rests.
  const [active, setActive] = useState(round.flows[0]?.name);
  const [reached, setReached] = useState<{ flow: string; step: number }>();
  const busy = acting.noting || !!acting.writing || !!acting.live?.shown;
  const now = useRef({ busy });
  now.current = { busy };
  useLayoutEffect(() => {
    const room = props.room.current;
    if (!room) return;
    // On a phone, nothing's held at the top: the page scrolls as any page, and a step plays when you press it.
    const look = () => {
      const at = atDial(room);
      if (!at || now.current.busy || onPhone()) return;
      setActive(at.flow);
      setReached((was) => (was?.flow === at.flow && was.step === at.step ? was : { flow: at.flow, step: at.step }));
    };
    // Arriving with an answer waiting on you, you're on its step.
    const waiting = round.flows
      .map((flow) => {
        const note = props.notes.find((note) => note.on?.flow === flow.name && note.toJudge && (note.on.app ? note.on.app.from.at : note.on.at) !== undefined);
        const moment = note?.on && (note.on.app ? note.on.app.from.at : note.on.at)!;
        return moment === undefined ? undefined : { flow: flow.name, step: Math.max(0, flow.steps.findIndex((_, i) => stepEnd(flow, i) >= moment - 0.05)) };
      })
      .find(Boolean);
    // The last situation's last step can be scrolled to: there's a window's height under it, less what's held.
    const tall = () => room.style.setProperty("--room", `${room.clientHeight}px`);
    tall();
    const watching = new ResizeObserver(tall);
    watching.observe(room);
    const held = waiting && room.querySelector<HTMLElement>(`[data-situation="${CSS.escape(waiting.flow)}"]`);
    if (held && onPhone()) held.querySelector(`[data-step="${waiting.step}"]`)?.scrollIntoView({ block: "center" });
    else if (held) room.scrollTop = along(room, held, waiting.step);
    look();
    let still: number | undefined;
    const scrolled = () => (clearTimeout(still), (still = window.setTimeout(look, LOOK)));
    room.addEventListener("scroll", scrolled, { passive: true });
    return () => (clearTimeout(still), watching.disconnect(), room.removeEventListener("scroll", scrolled));
  }, []);
  // Space and ↓ go to the next step, ↑ to the one before, from one situation into the next.
  useEffect(() => {
    if (!up || busy) return;
    const down = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as Element).closest?.("input, textarea, [contenteditable]")) return;
      const by = event.key === "ArrowDown" || (event.key === " " && !event.shiftKey) ? 1 : event.key === "ArrowUp" || (event.key === " " && event.shiftKey) ? -1 : 0;
      const room = props.room.current;
      if (!by || !room) return;
      event.preventDefault();
      const at = atDial(room);
      if (!at) return;
      const count = (i: number) => Number(at.situations[i]?.dataset.steps ?? 0);
      let [i, step] = [at.index, at.step + by];
      if (step >= count(i)) [i, step] = [i + 1, 0];
      else if (step < 0) [i, step] = [i - 1, count(i - 1) - 1];
      const situation = at.situations[i];
      if (situation) room.scrollTo({ top: along(room, situation, step), behavior: "smooth" });
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
              reached={reached?.flow === flow.name ? reached.step : undefined}
              resting={!!inApp && inApp !== flow.name}
              onPointerDown={() => !busy && setActive(flow.name)}
            />
          ))}
        </div>
        <Story review={review} round={round} general={general} onRound={props.onRound} />
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

// A situation: whose it is and what they do, where it stands, and its recording, held at the window's top as its steps
// scroll up under it. The step that comes up to the recording's edge plays into its result and rests there; scrolled
// back to, it plays again. It arrives at the answer waiting on you, else at the first step's result. What's drawn on it,
// and what the bar does, is about the moment it's at: the notes there, outlined, what changed there, a note made there,
// the app taken over there; what was said about them is under their step. A click on it pauses it, or plays the step
// again. C held is how it was before the work, at the same moment, in place; pressed, the two side by side, each close
// on the step's part of the page.
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
  // The step scrolled up to the recording's edge, while it's held at the window's top.
  reached?: number;
  resting: boolean;
  onPointerDown: () => void;
};

function Situation(props: SituationProps) {
  const { review, round, before, flow, changed, readings, notes, standing, same, onLooksGood, threads, diamonds, quiet, acting, active } = props;
  const end = flow.length - 0.05;
  const stepOf = (at: number) => Math.max(0, flow.steps.findIndex((_, i) => stepEnd(flow, i) >= at - 0.05));
  // A note's moment: where it was made, or made in the app, where the app was taken over.
  const momentOf = (note: Shown) => (note.on?.app ? note.on.app.from.at : note.on?.at);
  // On the steps' lines, each note's dot and each change's diamond, where they are.
  const onLine: OnLine[] = [
    ...notes.flatMap((note) => (momentOf(note) === undefined ? [] : [{ id: note.id, at: Math.min(momentOf(note)!, end), fill: fill(note), words: note.turns[0]?.words ?? "Your note" }])),
    ...diamonds.filter((diamond) => diamond.row).map((diamond) => ({ id: diamond.id, at: Math.min(diamond.at, end), words: diamond.name })),
  ];
  // A step's result, where it rests once it has played; and what's there, its card open as it comes to rest on it.
  const resultOf = (step: number) => stepEnd(flow, step) - 0.05;
  const results = flow.steps.map((_, i) => resultOf(i));
  const markAt = (moment: number) => onLine.find((mark) => Math.abs(mark.at - moment) < 0.08)?.id;
  const waiting = notes.find((note) => note.toJudge && momentOf(note) !== undefined);
  const [clock] = useState(() => new Clock(waiting ? Math.min(momentOf(waiting)!, end) : results[0]!));
  const [at, setAt] = useState(clock.at);
  const [playing, setPlaying] = useState<{ until: number }>();
  // Dragged along a step's line, it follows the line, and where it's let go, it rests.
  const [scrubbing, setScrubbing] = useState(false);
  const cut = useCut(review.id, round.number, flow);
  // Open beside its thing: on arriving, the answer waiting on you; then what you open, or what it came to rest at.
  const [picked, setPicked] = useState(waiting?.id);
  // Good for you, as nothing's changed since you said so, it arrives folded to its name, and opens when you choose.
  const [folded, setFolded] = useState(quiet);
  const go = (moment: number, id?: string) => (clock.set(moment), setAt(moment), setPlaying(undefined), setPicked(id));
  const playTo = (until: number, from = clock.at) => (clock.set(from), setAt(from), setPicked(undefined), setPlaying({ until }));
  const pause = () => (setAt(clock.at), setPlaying(undefined));
  const stopped = (moment: number) => go(moment, markAt(moment));
  // A step plays into its result from its start, which is the step before's result, so from just after it.
  const playStep = (step: number) => playTo(results[step]!, flow.steps[step]!.at + (step ? 0.06 : 0));
  // Scrolled up to the recording's edge, a step plays, unless it's the one already there: as it arrived, or just
  // scrolled past and back.
  const edge = useRef(stepOf(clock.at));
  useEffect(() => {
    if (props.reached === undefined || props.reached === edge.current) return;
    edge.current = props.reached;
    playStep(props.reached);
  }, [props.reached]);
  // What's held at the window's top, the recording and its steps, stays there for a turn of the wheel per step: the
  // situation is as tall as that, and as it.
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const [held, around] = [stage.current, section.current];
    if (!held || !around) return;
    const measure = () => around.style.setProperty("--held", `${held.offsetHeight}px`);
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(held);
    return () => watching.disconnect();
  }, [folded]);
  // Pressed, a step plays again, or the page goes along to it and it plays there.
  const toStep = (step: number) => {
    edge.current = step;
    playStep(step);
    const [room, around] = [section.current?.closest<HTMLElement>("[data-room]"), section.current];
    if (room && around && !onPhone()) room.scrollTo({ top: along(room, around, step), behavior: "smooth" });
  };
  // A click on it pauses it; paused partway, it plays on to the result; at the result, the step plays again.
  const again = () => {
    if (playing) return pause();
    const now = stepOf(clock.at);
    if (clock.at < results[now]! - 0.01) playTo(results[now]!);
    else playStep(now);
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
  // At rest on the situation you're on, that's where Take over takes it over.
  const restsAt = Math.round(at * 100) / 100;
  const resting = active && !playing && !scrubbing && !taken;
  useEffect(() => void (resting && acting.onRest(flow.name, restsAt)), [resting, restsAt]);

  // What's drawn is what's at this moment: in its step, the notes made there up to now, and what changed there.
  const shown = (moment: number) => stepOf(moment) === step && moment <= at + 0.05;
  const here = notes.filter((note) => momentOf(note) !== undefined && shown(momentOf(note)!));
  const changedHere = diamonds.filter((diamond) => diamond.row && shown(Math.min(diamond.at, end)));
  const writing = acting.writing?.note.on?.flow === flow.name && !acting.writing.note.on.app && acting.writing.note.on.at !== undefined && shown(acting.writing.note.on.at) ? acting.writing : undefined;
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
    ...(writing ? [{ id: writing.note.id, node: writing.note.on?.element?.node, point: writing.note.on?.point }] : []),
  ];
  const pins: Pin[] = [
    ...here.map((note) => ({ id: note.id, on: [note.id, ...(note.id === chosen ? answeredMarks.map((mark) => mark.id) : [])], ink: ink(note), number: note.number, fill: fill(note) })),
    ...changedHere.map((diamond) => ({ id: diamond.id, on: changedMarks(diamond).map((mark) => mark.id), ink: RECORDED_INK, diamond: true as const })),
    ...(writing ? [{ id: writing.note.id, on: [writing.note.id], ink: "var(--amber)", number: writing.number, fill: "bg-amber" }] : []),
  ];
  const view = `${at} ${side}`;
  const [placed, setPlaced] = useState<{ view: string; at: Placed }>();
  const [saved, setSaved] = useState(acting.opened);
  if (acting.opened !== saved) (setSaved(acting.opened), notes.some((note) => note.id === acting.opened) && setPicked(acting.opened));
  // Only a note being written has its card on the recording, where it was dropped; what's said is under its step.
  const open = writing ? writing.note.id : !side && pins.some((pin) => pin.id === chosen) ? chosen : undefined;
  const [asking, setAsking] = useState<string>();

  // A step you're not on says only what's there: a diamond for what changed new to you, and each note's number.
  const hint = (i: number) => {
    const changes = diamonds.some((diamond) => diamond.row && stepOf(Math.min(diamond.at, end)) === i);
    const theirs = notes.filter((note) => momentOf(note) !== undefined && stepOf(Math.min(momentOf(note)!, end)) === i);
    if (!changes && !theirs.length) return null;
    return (
      <span className="ml-auto flex flex-none items-center gap-1.5 pl-3">
        {changes && <i className="mr-0.5 size-[7px] rotate-45 bg-fg" />}
        {theirs.map((note) => (
          <span key={note.id} className={`size-4 rounded-full text-center text-[9px] leading-4 font-semibold text-white ${fill(note)}`}>
            {note.number}
          </span>
        ))}
      </span>
    );
  };
  // What was said about a step, under its words: why each thing new to you changed there, in the agent's words, or that
  // it was made for a note of yours; and each of your notes made there, its thread. Pointed at, it's lit on the recording.
  const about = (i: number, whole?: boolean) => {
    const changes = whole ? [] : diamonds.filter((diamond) => diamond.row && stepOf(Math.min(diamond.at, end)) === i);
    const theirs = notes.filter((note) => (whole ? momentOf(note) === undefined : momentOf(note) !== undefined && stepOf(Math.min(momentOf(note)!, end)) === i));
    if (!changes.length && !theirs.length) return null;
    return (
      <div className="mt-2.5 ml-6 grid max-w-[540px] gap-3">
        {changes.map((diamond) => {
          const said = diamond.changes.find((changed) => changed.line);
          const madeFor = diamond.changes.map((changed) => changed.note && props.noteOf(changed.note)).find(Boolean) || undefined;
          return (
            <div key={diamond.id} className="grid gap-1 text-[13px]" onPointerEnter={() => setLit(diamond.id)} onPointerLeave={() => setLit(undefined)}>
              <span className="flex items-center gap-2 text-[11.5px] leading-5 text-faint">
                <i className="size-[7px] flex-none rotate-45 bg-fg" />
                {madeFor ? "Changed for your note" : (said?.by ?? "Changed here")}
                {madeFor && (
                  <span className="flex min-w-0 items-center gap-1.5 text-soft" style={{ "--c": ink(madeFor) } as CSSProperties}>
                    <span className={`size-4 flex-none rounded-full text-center text-[9px] leading-4 font-semibold ${quietNumber}`}>{madeFor.number}</span>
                    <span className="truncate">{madeFor.turns[0]?.words}</span>
                  </span>
                )}
              </span>
              {!madeFor && <p className="leading-normal whitespace-pre-wrap">{said?.line ?? diamond.name}</p>}
            </div>
          );
        })}
        {theirs.map((note) => (
          <div key={note.id} className="flex gap-2" onPointerEnter={() => setLit(note.id)} onPointerLeave={() => setLit(undefined)}>
            <span className={`mt-2 size-[18px] flex-none rounded-full text-center text-[10px] leading-[18px] font-semibold text-white shadow-pin ${fill(note)}`}>{note.number}</span>
            <div className="-ml-2 min-w-0 flex-1 text-[13px]">
              <Conversation
                note={note}
                you={threads.you}
                readOnly={threads.readOnly}
                asking={asking === note.id}
                unfinished={threads.unfinished[note.id]}
                away={false}
                onAsking={(on) => setAsking(on ? note.id : undefined)}
                onUnfinished={(words) => threads.onUnfinished(note.id, words)}
                onJudge={(verdict) => threads.onJudge(note, verdict)}
                onEdit={(words) => threads.onEdit(note.id, words)}
                onShow={() => {}}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

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
      data-steps={flow.steps.length}
      inert={props.resting}
      style={{ height: `calc(var(--held) + ${(flow.steps.length - 1) * STEP}px)` }}
      className={`relative transition-opacity duration-500 ease-calm last:mb-[max(0px,calc(var(--room)-var(--held)-56px))] phone:h-auto! ${props.resting ? "opacity-30" : ""}`}
      onPointerDown={props.onPointerDown}
    >
      {/* Held at the window's top while scrolling goes along its steps. */}
      <div ref={stage} data-stage="" className="sticky top-0 z-10 bg-ground pt-3 pb-8 phone:static">
        <div className="mb-3 flex items-baseline justify-between gap-x-4 gap-y-1 px-0.5 phone:flex-wrap">
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
        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-8 phone:grid-cols-1">
          <div className="relative">
            {/* A click pauses it, or plays the step again; noting, it notes what's under it; taken over, it's the app's. */}
            <button data-picture={flow.name} className="relative block aspect-[1.6] w-full" aria-label={`${playing ? "Pause" : "Play"} “${flow.steps[step]?.title}”`} onClick={() => !taken && again()}>
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
                <Pinned pins={pins} placed={placed?.view === view ? placed.at : {}} open={open} faded={!!playing || scrubbing || placed?.view !== view} onOpen={(id) => (writing && id !== writing.note.id ? acting.onClose() : setPicked(id))}>
                  {writing?.card}
                </Pinned>
              </div>
            )}
          </div>
          <div className="grid content-start gap-4">
            {(flow.line || about(-1, true)) && (
              <div className="px-0.5 text-[13px]">
                {flow.line && <Said who={round.by}>{flow.line}</Said>}
                {about(-1, true)}
              </div>
            )}
            <Steps
              flow={flow}
              clock={clock}
              at={at}
              cut={cut}
              marks={onLine}
              about={about}
              hint={hint}
              onStep={toStep}
              onScrub={(on) => (on && ((setPlaying(undefined), setPicked(undefined))), setScrubbing(on))}
              onGo={stopped}
              onMark={(id) => {
                const mark = onLine.find((mark) => mark.id === id);
                if (mark) go(mark.at, id);
              }}
            />
          </div>
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

// How long scrolling stops before the step you've come to plays, so a step scrolled past on the way doesn't, in
// milliseconds.
const LOOK = 90;
// How far the page scrolls from one step to the next while a situation is held at the window's top, in pixels: a turn
// of the wheel.
export const STEP = 100;

// Where you are on the page: the last situation scrolled up to the window's top, else the first, and how far along its
// steps the scrolling has come.
function atDial(room: HTMLElement): { index: number; flow: string; step: number; situations: HTMLElement[] } | undefined {
  const top = room.getBoundingClientRect().top;
  const situations = [...room.querySelectorAll<HTMLElement>("[data-situation]")];
  const index = Math.max(0, situations.findLastIndex((situation) => situation.getBoundingClientRect().top <= top + 1));
  const situation = situations[index];
  if (!situation) return undefined;
  const step = clamp(Math.round((top - situation.getBoundingClientRect().top) / STEP), 0, Number(situation.dataset.steps) - 1);
  return { index, flow: situation.dataset.situation!, step, situations };
}

// Where the page is scrolled to for a situation's step.
const along = (room: HTMLElement, situation: HTMLElement, step: number) => room.scrollTop + situation.getBoundingClientRect().top - room.getBoundingClientRect().top + step * STEP;

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
