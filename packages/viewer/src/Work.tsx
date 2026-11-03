// The work, as one page you go along from the top: what was asked, then each situation it meets, its recording with its
// way through beside it, its steps and what was said in them, a stop at a time. A turn of the wheel, a swipe or a key
// goes one stop on or back, and from a situation's last stop on to the next situation, which comes up to the window's
// top. The situation you're on has the bar: you note it, compare it with how it was and take it over where it is. At the
// end, how it got here, and the one step to take.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Note, Place, Review, Round } from "@playthrough/review";
import { Key } from "./Card.tsx";
import type { Diamond } from "./changes.ts";
import { clamp } from "./moments.ts";
import { fill, unchangedSince, type Shown, type Standing } from "./notes.ts";
import { onPhone } from "./phone.ts";
import { roundName, Rounds } from "./Rounds.tsx";
import { Situation, type Threads } from "./Situation.tsx";
import { Agent, Go, type Step } from "./Step.tsx";
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
                className="flex h-8 w-full items-center gap-3 rounded-lg bg-surface px-3 text-xs leading-4 text-fg shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)] phone:hidden"
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

// Where a note stands, in a word or two after what was said.
const where = (note: Shown): [string, string] | undefined =>
  note.unsent ? ["To send", "text-amber-ink"] : note.toJudge ? ["Does this fix it?", "text-amber-ink"] : note.state === "with the agent" ? ["With the agent", "text-slate"] : note.state === "settled" ? ["Settled", "text-green"] : undefined;

