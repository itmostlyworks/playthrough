// The work, as one page you scroll down from the top: what was asked, then each situation it meets, its recording pinned
// at the window's top while its way through goes by beside it, its steps and what was said in them, a stop at a time:
// the one come up to the line is the one you're on. A key goes one stop on or back. The situation you're on has the bar:
// you note it, compare it with how it was and take it over where it is. At the end, how it got here, and the one step
// to take.

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
  const [go, setGo] = useState<{ round: number; flow: string; stop: number; passing?: boolean }>();
  // Begun once you've gone along, or arrived on an answer waiting on you; until then, the foot says how to begin.
  const [arrivedOn] = useState(() => props.notes.some((note) => note.toJudge && round.flows.some((flow) => flow.name === note.on?.flow)));
  const begun = !!go || arrivedOn;
  const busy = acting.noting || !!acting.writing || !!acting.live?.shown;
  // Where you are is where you've scrolled to: the stop you're on is the one come up to the line, a fifth of the way
  // down the window, beside its situation's recording settled at the top. Coming up or going away, a recording is
  // nobody's: nothing plays while it moves, and its bar waits. The page scrolls as any page does, with your hand, and
  // moves by itself only to take you to a stop you asked for. What's passed plays nothing; where you rest a moment
  // plays. On a phone, a stop is gone to by pressing it.
  const steered = useRef(0);
  const lineOf = (room: HTMLElement) => room.getBoundingClientRect().top + room.clientHeight * LINE;
  // Where the page is scrolled for a situation's stop to be at the line; before its first, for the situation to come
  // up to the window's top; past the page's last stop, its end.
  const scrollFor = (room: HTMLElement, situation: HTMLElement, stop: number) => {
    const row = situation.querySelector<HTMLElement>(`li[data-stop="${stop}"]`);
    if (row) return room.scrollTop + row.getBoundingClientRect().top - lineOf(room);
    return stop < 0 ? topOf(room, situation) - PIN : room.scrollHeight;
  };
  // Whether a situation's recording has settled at the window's top.
  const settled = (room: HTMLElement, situation: HTMLElement) =>
    Math.abs((situation.querySelector("[data-block]")?.getBoundingClientRect().top ?? NaN) - room.getBoundingClientRect().top - PIN) < 1.5;
  // There, it plays: gone to while the page glides another situation up, once that's settled.
  const land = () => setGo((go) => (go?.passing ? { ...go, passing: false } : go));
  const goTo = (room: HTMLElement, situation: HTMLElement, stop: number) => {
    const flow = situation.dataset.situation!;
    const there = settled(room, situation);
    setActive(flow);
    setGo({ round: round.number, flow, stop, passing: !there });
    glide(scrollFor(room, situation, stop), there ? undefined : land);
  };
  // With the keys, along the way a stop at a time: from a situation's last stop on to the next one's first, and back to
  // the last of the one before. The page glides it up to the line.
  const move = (by: number) => {
    const room = props.room.current;
    const situations = [...(room?.querySelectorAll<HTMLElement>("[data-situation]") ?? [])];
    let i = situations.findIndex((situation) => situation.dataset.situation === active);
    if (i < 0 && room) i = Math.max(0, situations.findLastIndex((situation) => situation.getBoundingClientRect().top <= lineOf(room)));
    if (!room || !situations[i]) return false;
    const count = (i: number) => Number(situations[i]!.dataset.stops);
    const was = { i, stop: Number(situations[i]!.dataset.stop) };
    let stop = was.stop + by;
    if (stop >= count(i) && i < situations.length - 1) [i, stop] = [i + 1, 0];
    else if (stop < 0 && i > 0) [i, stop] = [i - 1, count(i - 1) - 1];
    else stop = clamp(stop, -1, count(i));
    if (i === was.i && stop === was.stop) return false;
    goTo(room, situations[i]!, stop);
    return true;
  };
  // A stop pressed comes up to the line; on a phone, where the page stays put, it's gone to where it is.
  const bringTo = (flow: string, stop: number) => {
    const room = props.room.current;
    const there = room?.querySelector<HTMLElement>(`[data-situation="${CSS.escape(flow)}"]`);
    if (!room || !there) return;
    if (onPhone()) return void (setActive(flow), setGo({ round: round.number, flow, stop }));
    goTo(room, there, stop);
  };
  // The page glides where it's sent a frame at a time, rather than by the browser's smooth scroll, which another can cut
  // short; meanwhile, what it passes isn't where you are. Asked for less motion, it's there at once; your hand on the
  // wheel or the screen, it lets go.
  const gliding = useRef<number>(undefined);
  const glide = (top: number, done?: () => void) => {
    const room = props.room.current;
    if (!room) return;
    cancelAnimationFrame(gliding.current!);
    const [from, to] = [room.scrollTop, clamp(top, 0, room.scrollHeight - room.clientHeight)];
    if (Math.abs(to - from) <= 1) return done?.();
    const [since, takes] = [performance.now(), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : Math.min(600, 250 + Math.abs(to - from) / 4)];
    steered.current = since + takes + 100;
    const step = () => {
      const u = takes ? Math.min(1, (performance.now() - since) / takes) : 1;
      room.scrollTop = from + (to - from) * (1 - (1 - u) ** 3);
      gliding.current = u < 1 ? requestAnimationFrame(step) : (done?.(), undefined);
    };
    step();
  };
  const letGo = () => (cancelAnimationFrame(gliding.current!), (gliding.current = undefined), (steered.current = 0));
  const now = useRef({ busy, move, active, letGo, settled });
  now.current = { busy, move, active, letGo, settled };
  // A verdict lands where it was said, and the way goes on from there, unless you've gone on already.
  const goOn = (flow: string) => {
    const there = () => props.room.current?.querySelector<HTMLElement>(`[data-situation="${CSS.escape(flow)}"]`)?.dataset.stop;
    const was = there();
    window.setTimeout(() => !now.current.busy && now.current.active === flow && there() === was && now.current.move(1), LANDS);
  };
  useLayoutEffect(() => {
    const room = props.room.current;
    if (!room) return;
    // The last situation can come up to the window's top: there's a window's height under it, less its own. Where the
    // line is, and where a recording is pinned, for the situations to lay their ways out by.
    const tall = () => {
      room.style.setProperty("--room", `${room.clientHeight}px`);
      room.style.setProperty("--line", `${Math.round(room.clientHeight * LINE)}px`);
      room.style.setProperty("--pin", `${PIN}px`);
    };
    tall();
    const watching = new ResizeObserver(tall);
    watching.observe(room);
    // Arriving with an answer waiting on you, you're on it, at the line.
    const waiting = round.flows.find((flow) => props.notes.some((note) => note.on?.flow === flow.name && note.toJudge && (note.on.app ? note.on.app.from.at : note.on.at) !== undefined));
    const held = waiting && room.querySelector<HTMLElement>(`[data-situation="${CSS.escape(waiting.name)}"]`);
    if (held) setActive(waiting.name);
    // Arriving at the top, no situation's yours until one comes up.
    else setActive(undefined);
    if (held && onPhone()) held.querySelector(`[data-stop="${held.dataset.stop}"]`)?.scrollIntoView({ block: "center" });
    else if (held) ((steered.current = performance.now() + 200), (room.scrollTop = scrollFor(room, held, Number(held.dataset.stop))));
    // Scrolled, the stop at the line beside a settled recording is the one you're on, passing; still a moment, it plays.
    let reading: number | undefined;
    let rest: number | undefined;
    const read = () => {
      reading = undefined;
      if (now.current.busy || onPhone() || performance.now() < steered.current) return;
      const line = lineOf(room);
      const here = [...room.querySelectorAll<HTMLElement>("[data-situation]")].find((situation) => now.current.settled(room, situation));
      if (!here) return void (now.current.active !== undefined && setActive(undefined));
      const flow = here.dataset.situation!;
      const stop = Number([...here.querySelectorAll<HTMLElement>("li[data-stop]")].findLast((row) => row.getBoundingClientRect().top <= line)?.dataset.stop ?? -1);
      if (flow !== now.current.active) setActive(flow);
      if (stop !== Number(here.dataset.stop)) setGo({ round: round.number, flow, stop, passing: true });
      clearTimeout(rest);
      rest = window.setTimeout(land, REST);
    };
    const scrolled = () => void (reading ??= requestAnimationFrame(read));
    const handTakes = () => now.current.letGo();
    room.addEventListener("scroll", scrolled, { passive: true });
    room.addEventListener("wheel", handTakes, { passive: true });
    room.addEventListener("touchstart", handTakes, { passive: true });
    return () => (
      cancelAnimationFrame(reading!),
      clearTimeout(rest),
      watching.disconnect(),
      room.removeEventListener("scroll", scrolled),
      room.removeEventListener("wheel", handTakes),
      room.removeEventListener("touchstart", handTakes)
    );
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
              onPressed={(stop) => bringTo(flow.name, stop)}
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

// Where the line is that the stop you're on has come up to, as a share of the window's height down from its top; how far
// below the window's top a situation's recording is pinned, in pixels; and how long the page is still at a stop before
// it plays, in milliseconds.
const LINE = 0.2;
const PIN = 24;
const REST = 180;
// How long a verdict is seen where it was said before the way goes on, in milliseconds.
const LANDS = 600;

// Where the page is scrolled to for a situation to be at the window's top.
const topOf = (room: HTMLElement, situation: HTMLElement) => room.scrollTop + situation.getBoundingClientRect().top - room.getBoundingClientRect().top;

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

