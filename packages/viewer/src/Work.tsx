// The work, as one page you scroll down from the top: what was asked, then each scene it meets, its recording pinned
// at the window's top while its way through goes by beside it, its steps and what was said in them, a stop at a time:
// the one come up to the line is the one you're on. A key goes one stop on or back. The scene you're on has the bar:
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
import { SceneView, type Threads } from "./Scene.tsx";
import { Agent, Go, type Step } from "./Step.tsx";
import type { Read } from "./things.ts";

type Props = {
  room: RefObject<HTMLDivElement | null>;
  review: Review;
  round: Round;
  up: boolean;
  read: Read;
  notes: Shown[];
  standing: (scene: string) => Standing | undefined;
  // Saying a scene looks good, or taking it back; none where nothing can be said.
  onLooksGood?: (scene: string) => void;
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

// What can be done on the scene you're on, from the bar across its recording's bottom edge, and how far it's got.
export type Acting = {
  latest: boolean;
  noting: boolean;
  // None where no note can be made, or nothing taken over.
  onNote?: () => void;
  onTakeOver?: () => void;
  onBack: () => void;
  onPlace: (on: Place) => void;
  // Where the scene you're on rests: Take over takes it over there, or at an answer to a note made in the app, where
  // the note was found, what you did there done again.
  onRest: (scene: string, at: number, again?: string) => void;
  onClose: () => void;
  // Taken over: the app made ready unseen, being made ready as you wait, or yours.
  live?: { scene: string; address?: string; shown: boolean; inApp: boolean; due?: number; at?: { x: number; y: number } };
  // The note you're writing on a recording: its number, and the box its words are written in.
  writing?: { note: Note; number: number; words: ReactNode };
  // The note opened last: a note saved stays open.
  opened?: string;
};

export function Work(props: Props) {
  const { review, round, up, step, acting } = props;
  const before = review.rounds.find((kept) => kept.number === 0 && kept.scenes.length && round.number > 0);
  // What the work changed, against Before where there is one, else against the round before.
  const work = review.comparisons.find((kept) => kept.round === round.number && kept.since === 0) ?? review.comparisons.findLast((kept) => kept.round === round.number);
  const general = props.notes.filter((note) => !note.on || !round.scenes.some((scene) => scene.name === note.on?.scene));
  // The scenes the work left as they were, against Before.
  const same = before ? unchangedSince(review, 0, round.number) : [];
  // The scene you're on, which the bar and the keys are for: the one gone along to, or pressed, or scrolled to the
  // window's top by its bar; and the last move along the way, which its scene goes to. Noting, writing or in the
  // app, you stay where you are, and in the app the page holds still and the rest of it rests.
  const [active, setActive] = useState(round.scenes[0]?.name);
  const [go, setGo] = useState<{ round: number; scene: string; stop: number; passing?: boolean }>();
  // Begun once you've gone along, or arrived on an answer waiting on you; until then, the foot says how to begin.
  const [arrivedOn] = useState(() => props.notes.some((note) => note.toJudge && round.scenes.some((scene) => scene.name === note.on?.scene)));
  const begun = !!go || arrivedOn;
  const busy = acting.noting || !!acting.writing || !!acting.live?.shown;
  // Where you are is where you've scrolled to: the stop you're on is the one come up to the line, just under where a
  // scene's heading ends, beside its recording settled at the top. Coming up or going away, a recording is
  // nobody's: nothing plays while it moves, and its bar waits. The page scrolls as any page does, with your hand, and
  // moves by itself only to take you to a stop you asked for. What's passed plays nothing; where you rest a moment
  // plays. On a phone, a stop is gone to by pressing it.
  const steered = useRef(0);
  const lineOf = (room: HTMLElement) => room.getBoundingClientRect().top + LINE;
  // Where the page is scrolled for a scene's stop to be at the line; before its first, for the scene to come
  // up to the window's top; past the page's last stop, its end.
  const scrollFor = (room: HTMLElement, section: HTMLElement, stop: number) => {
    const row = section.querySelector<HTMLElement>(`li[data-stop="${stop}"]`);
    if (row) return room.scrollTop + row.getBoundingClientRect().top - lineOf(room);
    return stop < 0 ? topOf(room, section) - PIN : room.scrollHeight;
  };
  // Whether a scene's recording has settled at the window's top.
  const settled = (room: HTMLElement, section: HTMLElement) =>
    Math.abs((section.querySelector("[data-block]")?.getBoundingClientRect().top ?? NaN) - room.getBoundingClientRect().top - PIN) < 1.5;
  // There, it plays: gone to while the page glides another scene up, once that's settled.
  const land = () => setGo((go) => (go?.passing ? { ...go, passing: false } : go));
  const goTo = (room: HTMLElement, section: HTMLElement, stop: number) => {
    const scene = section.dataset.scene!;
    const there = settled(room, section);
    setActive(scene);
    setGo({ round: round.number, scene, stop, passing: !there });
    glide(scrollFor(room, section, stop), there ? undefined : land);
  };
  // With the keys, along the way a stop at a time: from a scene's last stop on to the next one's first, and back to
  // the last of the one before. The page glides it up to the line.
  const move = (by: number) => {
    const room = props.room.current;
    const sections = [...(room?.querySelectorAll<HTMLElement>("[data-scene]") ?? [])];
    let i = sections.findIndex((section) => section.dataset.scene === active);
    if (i < 0 && room) i = Math.max(0, sections.findLastIndex((section) => section.getBoundingClientRect().top <= lineOf(room)));
    if (!room || !sections[i]) return false;
    const count = (i: number) => Number(sections[i]!.dataset.stops);
    const was = { i, stop: Number(sections[i]!.dataset.stop) };
    let stop = was.stop + by;
    if (stop >= count(i) && i < sections.length - 1) [i, stop] = [i + 1, 0];
    else if (stop < 0 && i > 0) [i, stop] = [i - 1, count(i - 1) - 1];
    else stop = clamp(stop, -1, count(i));
    if (i === was.i && stop === was.stop) return false;
    goTo(room, sections[i]!, stop);
    return true;
  };
  // A stop pressed comes up to the line; on a phone, where the page stays put, it's gone to where it is.
  const bringTo = (scene: string, stop: number) => {
    const room = props.room.current;
    const there = room?.querySelector<HTMLElement>(`[data-scene="${CSS.escape(scene)}"]`);
    if (!room || !there) return;
    if (onPhone()) return void (setActive(scene), setGo({ round: round.number, scene, stop }));
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
  // What the scroll reading, set up once, needs as it is now: the round you're looking at among it, so a step read on
  // an older round is that round's.
  const now = useRef({ busy, move, active, letGo, settled, goTo, round: round.number });
  now.current = { busy, move, active, letGo, settled, goTo, round: round.number };
  // A verdict lands where it was said, and the way goes on from there, unless you've gone on already.
  const goOn = (scene: string) => {
    const there = () => props.room.current?.querySelector<HTMLElement>(`[data-scene="${CSS.escape(scene)}"]`)?.dataset.stop;
    const was = there();
    window.setTimeout(() => !now.current.busy && now.current.active === scene && there() === was && now.current.move(1), LANDS);
  };
  useLayoutEffect(() => {
    const room = props.room.current;
    if (!room) return;
    // The last scene can come up to the window's top: there's a window's height under it, less its own. Where the
    // line is, and where a recording is pinned, for the scenes to lay their ways out by.
    const tall = () => {
      room.style.setProperty("--room", `${room.clientHeight}px`);
      room.style.setProperty("--to-line", `${LINE}px`);
      room.style.setProperty("--pin", `${PIN}px`);
    };
    tall();
    const watching = new ResizeObserver(tall);
    watching.observe(room);
    // Arriving with an answer waiting on you, you're on it, at the line.
    const waiting = round.scenes.find((scene) => props.notes.some((note) => note.on?.scene === scene.name && note.toJudge && (note.on.app ? note.on.app.from.at : note.on.at) !== undefined));
    const held = waiting && room.querySelector<HTMLElement>(`[data-scene="${CSS.escape(waiting.name)}"]`);
    if (held) setActive(waiting.name);
    // Arriving at the top, no scene's yours until one comes up.
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
      const here = [...room.querySelectorAll<HTMLElement>("[data-scene]")].find((section) => now.current.settled(room, section));
      // Scrolled back above the scene you were on, it's before its first stop again, as it was arrived at, however
      // fast the page went past its first stop: what's under the line, you haven't come to.
      const left = now.current.active === undefined || now.current.active === here?.dataset.scene ? null : room.querySelector<HTMLElement>(`[data-scene="${CSS.escape(now.current.active)}"]`);
      const first = left?.querySelector("li[data-stop]")?.getBoundingClientRect().top;
      if (left && Number(left.dataset.stop) >= 0 && first !== undefined && first > line) setGo({ round: now.current.round, scene: left.dataset.scene!, stop: -1, passing: true });
      if (rest === undefined) {
        const on = here ?? left;
        from = on ? which(on.querySelector<HTMLElement>(`li[data-stop="${on.dataset.stop}"]`) ?? on) : undefined;
      }
      clearTimeout(rest);
      rest = window.setTimeout(() => rested(!!here), REST);
      if (!here) return void (now.current.active !== undefined && setActive(undefined));
      const scene = here.dataset.scene!;
      const stop = Number([...here.querySelectorAll<HTMLElement>("li[data-stop]")].findLast((row) => row.getBoundingClientRect().top <= line)?.dataset.stop ?? -1);
      if (scene !== now.current.active) setActive(scene);
      if (stop !== Number(here.dataset.stop)) setGo({ round: now.current.round, scene, stop, passing: true });
    };
    // Come to rest just off a stop, it's brought to the line, so each turn of the wheel goes a stop from where the last
    // left you, rather than a little further each time until a turn goes past one: the stop at the line, just past it,
    // or the next, just short of it, but only from the stop you were on, so a rest never goes on past one you haven't
    // been on.
    let from: string | undefined;
    const which = (row: HTMLElement) => `${row.closest<HTMLElement>("[data-scene]")?.dataset.scene} ${row.dataset.stop}`;
    const rested = (settled: boolean) => {
      rest = undefined;
      if (now.current.busy) return;
      const line = lineOf(room);
      const rows = [...room.querySelectorAll<HTMLElement>("li[data-stop]")].map((row) => ({ row, by: row.getBoundingClientRect().top - line }));
      const [at, next] = [rows.findLast(({ by }) => by <= 0), rows.find(({ by }) => by > 0)];
      const to = at && -at.by <= SETTLE ? at : next && next.by <= SETTLE && at && which(at.row) === from ? next : undefined;
      const section = to?.row.closest<HTMLElement>("[data-scene]");
      if (section && Math.abs(to!.by) > 1) now.current.goTo(room, section, Number(to!.row.dataset.stop));
      else if (settled) land();
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
  const inApp = acting.live?.shown ? acting.live.scene : undefined;
  return (
    <div ref={props.room} data-room="" inert={!up} className={`absolute inset-0 z-20 bg-ground transition-[opacity,visibility] duration-240 ease-calm ${inApp ? "overflow-hidden" : "overflow-y-auto"} ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      {/* As wide as a scene's recording can be with its name over it and the bar under it, on the screen, and its steps beside it. */}
      <div className="mx-auto w-full max-w-[min(1480px,max(1000px,calc((100dvh_-_150px)_*_1.6_+_436px)))] px-8 pt-8 pb-4 phone:px-0 phone:pt-2">
        <header className="max-w-[680px]">
          <h2 className="text-[20px] leading-[27px] font-semibold tracking-[-0.01em] text-balance">{review.title}</h2>
          {review.asked && <p className="mt-2 text-[14px] leading-[22px] text-soft">{review.asked}</p>}
          <div className="mt-3 -ml-2.5 flex items-center gap-1 text-[13px] leading-5 text-soft">
            <Rounds quiet rounds={review.rounds} watching={round.number} arrived={props.arrived} working={props.working} onRound={props.onRound} />
            <span className="min-w-0 truncate">
              {round.scenes.length} {round.scenes.length === 1 ? "scene" : "scenes"}, recorded by {round.by}
              {props.accepted && <span className="text-green"> · {props.accepted}</span>}
            </span>
          </div>
        </header>
        {/* Scenes that look good to you, folded to their names, sit together as one list. */}
        <div className="mt-10 flex flex-col gap-12 phone:mt-7 phone:gap-9 [&>[data-folded]+[data-folded]]:-mt-12 phone:[&>[data-folded]+[data-folded]]:-mt-9">
          {round.scenes.map((scene) => (
            <SceneView
              key={`${round.number} ${scene.name}`}
              review={review}
              round={round}
              before={before}
              scene={scene}
              changed={(work?.changes ?? []).flatMap((change) => change.seen.filter((on) => on.scene === scene.name).map((on) => (change.gone ? { ...on, element: undefined } : on)))}
              readings={props.read(round.number, scene.name)}
              notes={props.notes.filter((note) => note.on?.scene === scene.name)}
              noteOf={(id) => props.notes.find((note) => note.id === id)}
              standing={props.standing(scene.name)}
              onLooksGood={props.onLooksGood}
              threads={props.threads}
              diamonds={props.diamonds.filter((diamond) => diamond.scene === scene.name)}
              quiet={props.standing(scene.name)?.is === "good"}
              same={same.includes(scene.name)}
              glimpsed={props.read(round.number, scene.name, true)}
              acting={acting}
              active={up && active === scene.name}
              go={go?.round === round.number && go.scene === scene.name ? go : undefined}
              resting={!!inApp && inApp !== scene.name}
              onPointerDown={() => !busy && setActive(scene.name)}
              onSaid={() => goOn(scene.name)}
              onPressed={(stop) => bringTo(scene.name, stop)}
            />
          ))}
        </div>
        <Story review={review} round={round} general={general} onRound={props.onRound} />
        {/* The one step to take floats at the window's foot, over the way rather than across the recordings. */}
        <div className="pointer-events-none sticky bottom-0 z-10 mt-6 flex min-h-8 justify-end py-4">
          {/* As wide as what it says, and on a plate of the page's ground fading in above it, so the way's words go under
              it quietly rather than through it. */}
          <div className="pointer-events-auto relative w-max max-w-full min-w-[300px] empty:hidden before:pointer-events-none before:absolute before:-inset-x-4 before:-top-8 before:-bottom-4 before:-z-10 before:bg-linear-to-b before:from-transparent before:to-ground before:to-35%">
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
            {/* Sent, what the agent does with it is said where Send was, rather than the foot going quiet. */}
            {step?.kind === "agent" && <Agent step={step} className="justify-end rounded-lg bg-surface px-3 shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]" />}
            {props.trouble.length > 0 && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs leading-[18px] text-amber-ink shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]">{props.trouble.join(" ")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Where the line is that the stop you're on has come up to, in pixels down from the window's top: just under a scene's
// heading where it's only where the scene stands, so its first stop comes up to it as the recording settles with no
// room held empty over it; a longer heading, with the agent's line, has it come up a little after. A share of the window
// held a third of a tall one empty. How far below the
// window's top a scene's recording is pinned, in pixels; and how long the page is still at a stop before it plays, in
// milliseconds.
const LINE = 88;
const PIN = 24;
const REST = 180;
// How far from the line a stop can be, in pixels, for the page to bring it there once you rest: under half a stop's room.
const SETTLE = 40;
// How long a verdict is seen where it was said before the way goes on, in milliseconds.
const LANDS = 600;

// Where the page is scrolled to for a scene to be at the window's top.
const topOf = (room: HTMLElement, section: HTMLElement) => room.scrollTop + section.getBoundingClientRect().top - room.getBoundingClientRect().top;

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

