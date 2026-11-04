// The work, as one page you scroll down from the top: what was asked, then each scene it meets, held at the window's
// top while you go through it, its recording beside its way through, its steps and what was said in them: each turn of
// the wheel there is a stop along its way, and past its end, the page goes on to the next. A key goes one stop on or
// back. The scene you're on has the bar: you note it, compare it with how it was and take it over where it is. At the
// end, how it got here, and the one step to take.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Note, Place, Review, Round } from "@playthrough/review";
import { Key } from "./Card.tsx";
import type { Diamond } from "./changes.ts";
import { clamp } from "./moments.ts";
import { fill, unchangedSince, type Shown, type Standing } from "./notes.ts";
import { onPhone } from "./phone.ts";
import { clock } from "./Rounds.tsx";
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
  accepted: boolean;
  step?: Step;
  trouble: string[];
  acting: Acting;
  // The notes whose thing this round no longer has, as a comment on a line that's since changed is outdated, each by
  // what it was on.
  outdated: Map<string, string>;
};

// What can be done on the scene you're on, from the bar across its recording's bottom edge, and how far it's got.
export type Acting = {
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
  // Where you are is where you've scrolled to. A scene's name, recording and way are held at the window's top while
  // you go through it, and each stop along its way is a turn of the wheel's worth of scrolling, whatever's in it: the
  // way itself stays put, and what moves is where you are on it. Past its end the page goes on, the scene leaving whole
  // and the next coming up whole. Coming up or going away, a scene is nobody's: nothing plays while it moves, and its
  // bar waits. The page scrolls as any page does, with your hand, and moves by itself only to take you to a stop you
  // asked for. What's passed plays nothing; where you rest a moment plays. On a phone, a stop is gone to by pressing it.
  const steered = useRef(0);
  // How far the page has scrolled since a scene came to be held at the top: none as it arrives, its stops' worth as it
  // leaves.
  const through = (room: HTMLElement, section: HTMLElement) => PIN - (section.getBoundingClientRect().top - room.getBoundingClientRect().top);
  const stopsOf = (section: HTMLElement) => Number(section.dataset.stops);
  // Where the page is scrolled for a scene's stop: the middle of its stretch, so a turn of the wheel goes one stop either
  // way; before its first, as far again before the scene is held; past the page's last stop, its end.
  const scrollFor = (room: HTMLElement, section: HTMLElement, stop: number) =>
    stop >= stopsOf(section) ? room.scrollHeight : room.scrollTop - through(room, section) + (Math.max(stop, -1) + 0.5) * STEP;
  // Whether a scene is held at the window's top.
  const settled = (room: HTMLElement, section: HTMLElement) => {
    const by = through(room, section);
    return by >= -0.5 && by <= stopsOf(section) * STEP + 0.5;
  };
  // There, it plays: gone to while the page glides another scene up, once that's settled.
  const land = () => setGo((go) => (go?.passing ? { ...go, passing: false } : go));
  const goTo = (room: HTMLElement, section: HTMLElement, stop: number) => {
    const scene = section.dataset.scene!;
    const there = settled(room, section);
    setActive(scene);
    setGo({ round: round.number, scene, stop, passing: !there });
    // In the scene that's held, nothing on the page moves but where you are on its way, so the page is put there at once.
    if (there && stop >= 0 && stop < stopsOf(section)) return void ((steered.current = performance.now() + 100), (room.scrollTop = scrollFor(room, section, stop)));
    glide(scrollFor(room, section, stop), there ? undefined : land);
  };
  // With the keys, along the way a stop at a time: from a scene's last stop on to the next one's first, and back to
  // the last of the one before. The page glides it up to the line.
  const move = (by: number) => {
    const room = props.room.current;
    const sections = [...(room?.querySelectorAll<HTMLElement>("[data-scene]") ?? [])];
    let i = sections.findIndex((section) => section.dataset.scene === active);
    if (i < 0 && room) i = Math.max(0, sections.findLastIndex((section) => through(room, section) >= 0));
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
  // A note gone to from the line under the title: its stop on its scene's way, or where it's said at the page's end, or
  // the scene, folded as it looks good to you.
  const toNote = (note: Shown) => {
    const room = props.room.current;
    const stop = room?.querySelector<HTMLElement>(`[data-scene] [data-note="${CSS.escape(note.id)}"]`);
    const scene = stop?.closest<HTMLElement>("[data-scene]")?.dataset.scene;
    if (scene) return bringTo(scene, Number(stop!.dataset.stop));
    room?.querySelector(`[data-note="${CSS.escape(note.id)}"], [data-folded="${CSS.escape(note.on?.scene ?? "")}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  const now = useRef({ busy, move, active, letGo, settled, round: round.number });
  now.current = { busy, move, active, letGo, settled, round: round.number };
  // A verdict lands where it was said, and the way goes on from there, unless you've gone on already.
  // On the last scene's last stop there's nothing on to go to: it stays, rather than scrolling past how it ends.
  const goOn = (scene: string) => {
    const section = () => props.room.current?.querySelector<HTMLElement>(`[data-scene="${CSS.escape(scene)}"]`);
    const was = section()?.dataset.stop;
    const lastOfAll = () => {
      const here = section();
      return !!here && [...props.room.current!.querySelectorAll("[data-scene]")].at(-1) === here && Number(here.dataset.stop) >= Number(here.dataset.stops) - 1;
    };
    window.setTimeout(() => !now.current.busy && now.current.active === scene && section()?.dataset.stop === was && !lastOfAll() && now.current.move(1), LANDS);
  };
  useLayoutEffect(() => {
    const room = props.room.current;
    if (!room) return;
    // How tall the window is, where a scene is held and how far a stop's stretch is, for the scenes to be as long as
    // their stops.
    const tall = () => {
      room.style.setProperty("--room", `${room.clientHeight}px`);
      room.style.setProperty("--pin", `${PIN}px`);
      room.style.setProperty("--step", `${STEP}px`);
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
    // Scrolled, the stop whose stretch you're in, in the scene that's held, is the one you're on, passing; still a
    // moment, it plays.
    let reading: number | undefined;
    let rest: number | undefined;
    const atTop = () => [...room.querySelectorAll<HTMLElement>("[data-scene]")].find((section) => now.current.settled(room, section));
    const stopIn = (section: HTMLElement) => clamp(Math.floor(through(room, section) / STEP), 0, stopsOf(section) - 1);
    const read = () => {
      reading = undefined;
      if (now.current.busy || onPhone() || performance.now() < steered.current) return;
      const here = atTop();
      // Scrolled back above the scene you were on, it's before its first stop again, as it was arrived at, however
      // fast the page went past its first stop: what's under you, you haven't come to.
      const left = now.current.active === undefined || now.current.active === here?.dataset.scene ? null : room.querySelector<HTMLElement>(`[data-scene="${CSS.escape(now.current.active)}"]`);
      if (left && Number(left.dataset.stop) >= 0 && through(room, left) < 0) setGo({ round: now.current.round, scene: left.dataset.scene!, stop: -1, passing: true });
      clearTimeout(rest);
      rest = window.setTimeout(rested, REST);
      if (!here) return void (now.current.active !== undefined && setActive(undefined));
      const scene = here.dataset.scene!;
      const stop = stopIn(here);
      if (scene !== now.current.active) setActive(scene);
      if (stop !== Number(here.dataset.stop)) setGo({ round: now.current.round, scene, stop, passing: true });
    };
    // Come to rest in a held scene, the page is put in the middle of the stop's stretch, which nothing on it shows, so
    // the next turn of the wheel goes one stop either way, however far into a stretch the last one ended; and it plays.
    const rested = () => {
      rest = undefined;
      const here = atTop();
      if (now.current.busy || !here) return;
      const middle = (stopIn(here) + 0.5) * STEP;
      const by = through(room, here);
      if (Math.abs(by - middle) > 1) ((steered.current = performance.now() + 50), (room.scrollTop += middle - by));
      land();
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
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-5 text-soft">
            <span>
              {round.scenes.length} {round.scenes.length === 1 ? "scene" : "scenes"}, recorded by {round.by}
              {props.accepted && <span className="text-green"> · Accepted</span>}
            </span>
            {standsAt(props.notes).map(([words, notes]) => {
              const first = notes.find((note) => props.standing(note.on?.scene ?? "")?.is !== "good" && round.scenes.some((scene) => scene.name === note.on?.scene)) ?? notes[0]!;
              return (
                <button key={words} className="inline-flex items-center gap-1.5 underline-offset-[3px] hover:text-fg hover:underline" onClick={() => toNote(first)}>
                  <i className={`size-1.5 rounded-full ${fill(first)}`} />
                  {notes.length} {words}
                </button>
              );
            })}
          </p>
        </header>
        {/* Scenes that look good to you, folded to their pictures, sit side by side. */}
        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-12 phone:mt-7 phone:gap-y-9 [&>[data-scene]]:basis-full [&>[data-folded]+[data-folded]]:mt-0">
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
              outdated={props.outdated}
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
        <Story review={review} round={round} general={general} />
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

// How far below the window's top a scene is held, in pixels; and how long the page is still at a stop before it plays,
// in milliseconds.
const PIN = 24;
const REST = 180;
// How far the page scrolls for each stop along a held scene's way, in pixels, whatever's in the stop: a turn of the
// wheel (100px on Windows), so from the middle of a stop's stretch, where a rest leaves you, a turn goes one stop either
// way, and two quick turns two.
const STEP = 100;
// How long a verdict is seen where it was said before the way goes on, in milliseconds.
const LANDS = 600;

// How it got here, a line each time the agent recorded it: by whom and when, what it answered, and what was sent back,
// as a pull request's pushes are told among its comments. A round is the agent's turn, not a place to go. Then the
// notes on scenes this round doesn't have, outdated as their scene is gone.
function Story({ review, round, general }: { review: Review; round: Round; general: Shown[] }) {
  const rounds = review.rounds.filter((kept) => kept.number > 0 && kept.number <= round.number);
  if (rounds.length < 2 && !general.length) return null;
  return (
    <section className="mt-14 max-w-[680px] border-t border-line pt-6">
      <h3 className="text-[13px] leading-5 font-semibold">How it got here</h3>
      <ol className="mt-2 grid gap-1 text-[13px] leading-5 text-soft">
        {rounds.map((kept, i) => {
          const sent = review.sends.filter((send) => send.round === kept.number);
          const notes = sent.reduce((count, send) => count + send.notes.length, 0);
          return (
            <li key={kept.number}>
              {i ? "Recorded again" : "Recorded"} by {kept.by}
              {kept.finished && ` at ${clock(kept.finished)}`}
              {kept.replies.length > 0 && `, answering ${kept.replies.length} ${kept.replies.length === 1 ? "note" : "notes"}`}
              {notes > 0 && ` · ${notes} ${notes === 1 ? "note" : "notes"} sent back`}
            </li>
          );
        })}
      </ol>
      {general.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {general.map((note) => (
            <li key={note.id} data-note={note.id} className="flex min-w-0 items-baseline gap-2 text-[13px] leading-5">
              <span className={`size-1.5 flex-none translate-y-[-1px] rounded-full ${fill(note)}`} />
              <span className="truncate text-fg">{note.turns[0]?.words}</span>
              {note.on && <span className="flex-none text-soft">· Outdated</span>}
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

// Where your notes stand, all of them, as a count each beside the dot a note has, for the line under the title: as a
// pull request says how many conversations are still open. Those with none are left out.
const standsAt = (notes: Shown[]): [string, Shown[]][] =>
  (
    [
      ["to send", notes.filter((note) => note.unsent)],
      ["to check", notes.filter((note) => !note.unsent && note.toJudge)],
      ["with the agent", notes.filter((note) => !note.unsent && note.state === "with the agent")],
      ["settled", notes.filter((note) => !note.unsent && note.state === "settled")],
    ] as [string, Shown[]][]
  ).filter(([, some]) => some.length);

