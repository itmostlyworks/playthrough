// A scene's way through, beside its recording, a stop at a time: each step the agent chose with something new to you in
// it, and after it what was said there, your notes and what changed, in the order they come; then what was said about
// all of it, and last, its end, where you say whether it looks good to you, once you've seen it through, or a note on the
// whole of it. The steps between are a quiet line each, played through on the way to the next stop.
// A rail runs down through them, filled as far as you've come, and its fill glides along as you go. The stop you're on
// opens: what was said there, all of it; or a step, with a line of its own that fills as it plays, and dragged along,
// goes anywhere in the step and rests where it's let go, with a dot for each note made in the step and a diamond for
// each change, at their moments. The others are a line each, and pressed, go there. Each stop is as tall as what's in
// it: how far the page scrolls for it is the page's to say, the same for every stop.

import { Fragment, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Scene } from "@playthrough/review";
import { Key } from "./Card.tsx";
import { EndMark, type End } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import type { Clock, Cut } from "./Player.tsx";

// A stop on the way: a step, at its result; something said in a step, a note, at its moment; or something said about
// all of it, in no step. And the moment it plays from, where quiet steps come before it.
export type Stop = { step: number; at?: number; id?: string; from?: number };

// Where a step starts playing: its start is the step before's result, so just after it; the first, where its page has
// drawn itself, not the blank page the app is still loading into.
export const stepStart = (scene: Scene, step: number, cut?: Cut) => (step ? scene.steps[step]!.at + 0.06 : Math.max(scene.steps[0]!.at, cut?.drawn ?? 0));

// What's on the line: a note's dot in its fill, or a change's diamond, at its moment, and what it says pointed at.
export type OnLine = { id: string; at: number; fill?: string; words: string };

// What was said at a stop: its sign on the rail, a line of it, and all of it.
export type Saying = { sign: ReactNode; line: ReactNode; whole: ReactNode };

type Props = {
  scene: Scene;
  clock: Clock;
  at: number;
  cut?: Cut;
  stops: Stop[];
  // The stop you're on; before the first, none.
  on: number;
  marks: OnLine[];
  said: (id: string) => Saying;
  onStop: (stop: number) => void;
  // Pointed at, what was said is lit on the recording.
  onPoint: (id?: string) => void;
  // What changed in a step, under its line; and going to one, from its diamond there.
  changesIn: (step: number) => ReactNode;
  // Above the first of steps new to you, ones it takes that it couldn't before: how many, and what the agent says of them.
  newFrom: (step: number) => ReactNode;
  onChange: (id: string) => void;
  // Dragging along the line, and where it was let go.
  onScrub: (scrubbing: boolean) => void;
  onGo: (moment: number) => void;
  // The way's last stop, its end: how it stands, as its mark; whether it looks good to you, and saying so or taking it
  // back, once nothing in it is still open, or else what's open, in words; and a note on the whole scene.
  end?: { mark: End; looksGood?: { good: boolean; onPress: () => void }; says: ReactNode; onNote?: () => void };
  // The steps that are quiet lines, not stops; and whether it's playing.
  quiet: boolean[];
  playing: boolean;
  // Taken over: the app is yours, and what plays the recording rests; the stop you're on stays lit, where you took it
  // over, and what you say there answers.
  resting?: boolean;
  // A quiet step pressed, to be a stop of its own.
  onUnfold: (step: number) => void;
  // What was said in a step that asks nothing of you, a line each under it; and about the whole scene, at its end.
  quietIn: (step?: number) => ReactNode;
};

export function Steps({ scene, clock, at, cut, stops, on, marks, said, onStop, onPoint, onScrub, onGo, end, quiet, playing, resting, onUnfold, quietIn, changesIn, onChange, newFrom }: Props) {
  const looksGood = end?.looksGood;
  const stepEnd = (step: number) => scene.steps[step + 1]?.at ?? scene.length;
  const stepOf = (moment: number) => Math.max(0, scene.steps.findIndex((_, step) => stepEnd(step) >= moment - 0.05));
  // How far into its step a moment is, in the time it plays in, waiting cut short, so the line fills at one speed, from
  // where the step starts playing to its result; and the moment that far in.
  const span = (step: number) => [stepStart(scene, step, cut), stepEnd(step) - 0.05].map((moment) => (cut ? cut.cut(moment) : moment)) as [number, number];
  const share = (step: number, moment: number) => {
    const [from, to] = span(step);
    return clamp(((cut ? cut.cut(moment) : moment) - from) / Math.max(to - from, 0.01), 0, 1);
  };
  const momentAt = (step: number, u: number) => {
    const [from, to] = span(step);
    const moment = from + u * (to - from);
    return Math.max(cut ? cut.real(moment) : moment, stepStart(scene, step, cut));
  };
  // The step you're on, and how far into it it's played.
  const current = stops[on]?.step ?? -1;
  const line = useRef<HTMLDivElement>(null);
  // Its line follows only moments in its step: going on to the next stop, the playhead goes there before this step's
  // line has let go of it, and a step left half played filled to its end as it folded away.
  useLayoutEffect(() => {
    if (current < 0) return;
    const [element, from, until] = [line.current, stepStart(scene, current, cut), stepEnd(current)];
    const follow = (moment: number) => moment >= from && moment < until && element?.style.setProperty("--done", String(share(current, moment)));
    follow(clock.at);
    return clock.follow(follow);
  }, [clock, scene, at, cut, current, on]);
  // The quiet step it's playing through, lit as it goes.
  const [through, setThrough] = useState<number>();
  useLayoutEffect(() => clock.follow((moment) => setThrough(stepOf(moment))), [clock, scene]);
  // A note's dot goes to its stop; a change's diamond, to it under its step.
  const toMark = (id: string) => {
    const k = stops.findIndex((stop) => stop.id === id);
    if (k < 0) onChange(id);
    else onStop(k);
  };

  // The rail, from the first stop's sign to the last's, and filled to the one you're on, measured as the stops open and
  // close.
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const way = list.current;
    if (!way) return;
    const measure = () => {
      const top = way.getBoundingClientRect().top;
      const centreOf = (sign: Element) => {
        const box = sign.getBoundingClientRect();
        return box.top + box.height / 2 - top;
      };
      const centres = [...way.querySelectorAll("[data-sign]")].map(centreOf);
      const first = centres[0] ?? 0;
      const rail = (centres.at(-1) ?? first) - first;
      const reached = way.querySelector(`[data-stop="${on}"] > [data-sign]`);
      way.style.setProperty("--rail-top", `${first}px`);
      way.style.setProperty("--rail", `${rail}px`);
      // How much of the rail is filled, as a share of it, for it to fill without laying the page out each frame.
      way.style.setProperty("--reach", String(on < 0 || rail <= 0 || !reached ? 0 : (centreOf(reached) - first) / rail));
    };
    measure();
    const watching = new ResizeObserver(measure);
    for (const row of way.children) watching.observe(row);
    return () => watching.disconnect();
  }, [on, stops.length, !!end]);

  const along = (clientX: number) => {
    const box = line.current!.getBoundingClientRect();
    return clamp((clientX - box.left) / box.width, 0, 1);
  };
  const [held, setHeld] = useState(false);
  // A press goes there; moved a few pixels, it drags. On a dot or a diamond, a press goes to it.
  const press = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const mark = (event.target as Element).closest<HTMLElement>("[data-mark]")?.dataset.mark;
    const [start, id] = [event.clientX, event.pointerId];
    let dragging = false;
    const move = (moving: globalThis.PointerEvent) => {
      if (moving.pointerId !== id || (!dragging && Math.abs(moving.clientX - start) < 4)) return;
      if (!dragging) ((dragging = true), setHeld(true), onScrub(true));
      clock.set(momentAt(current, along(moving.clientX)));
    };
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      if (!dragging) return mark ? toMark(mark) : onGo(momentAt(current, along(start)));
      setHeld(false);
      onScrub(false);
      onGo(clock.at);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  // Every stop is a line, the same distance apart, and the one you're on opens out of it as the one you left folds back:
  // what it says, and what you can do there, is only ever where you are. Laid out open, every step's why, every note's
  // thread and every answer's buttons stood beside each other, some to read and some to press ("too many different things
  // going on in the sidebar"). The one you're on sits on the page's surface, its own, so it opens and folds with it (one
  // surface gliding from stop to stop trailed behind them); the others' words are quieter, their signs still whole on
  // the rail, and a press anywhere on another goes there. Before you've gone along it, all are folded and quieter.
  const row = (k: number) => ({
    "data-stop": k,
    "data-step": stops[k]?.step,
    "aria-current": k === on ? ("step" as const) : undefined,
    className: `relative isolate flex-none py-2 pl-8 transition-opacity duration-300 ease-calm before:absolute before:inset-y-0 before:left-6 before:-right-3 before:-z-1 before:rounded-xl before:transition-[opacity,background-color] before:duration-300 before:ease-calm phone:before:left-5 [&>*]:transition-opacity [&>*]:duration-300 [&>*]:ease-calm ${k === on && !resting ? "before:opacity-100" : "before:opacity-0"} ${k === stops.length && looksGood ? "before:bg-[color-mix(in_srgb,var(--green)_13%,var(--surface))]" : "before:bg-surface"} ${k === on ? "[--under:var(--surface)]" : resting ? "opacity-35" : "[&>:not([data-sign])]:opacity-60 hover:[&>:not([data-sign])]:opacity-100"}`,
    onPointerDownCapture: () => k !== on && onStop(k),
  });

  // A quiet step, a line smaller than a stop's: the scene's story, played through on the way to the next stop, lit as it
  // plays. Pressed, it's a stop of its own, and gone to.
  const reached = on >= stops.length ? scene.steps.length : current;
  const quietLine = (i: number) => {
    const lit = playing && through === i && !resting;
    return (
      <li key={`quiet ${i}`} className={`relative flex-none py-1.5 pl-8 transition-opacity duration-300 ease-calm ${resting ? "opacity-35" : ""}`} inert={resting}>
        <span
          data-sign=""
          className={`absolute top-2 left-0.5 grid size-4 place-items-center rounded-full text-[9.5px] leading-none font-medium tabular-nums transition-colors duration-300 ease-calm ${lit ? "bg-soft text-ground" : i < reached ? "bg-track text-soft" : "bg-ground text-faint shadow-[inset_0_0_0_1px_var(--track)]"}`}
        >
          {i + 1}
        </span>
        <button className={`block w-full text-left text-[13px] leading-5 text-balance transition-colors duration-300 ease-calm outline-none hover:text-fg focus-visible:text-fg ${lit ? "text-fg" : "text-faint"}`} onClick={() => onUnfold(i)}>
          {scene.steps[i]!.title}
        </button>
        {quietIn(i)}
      </li>
    );
  };
  // Step by step, each a stop or a quiet line, and after it the notes in it that are stops; then those about all of it.
  const stopsIn = (step: number) => stops.flatMap((stop, k) => (stop.step === step ? [k] : []));

  const stopAt = (k: number) => {
    const stop = stops[k]!;
    const here = k === on;
    const gone = k < on;
    if (stop.id !== undefined) {
      const { sign, line, whole } = said(stop.id);
      return (
        <li key={stop.id} data-note={stop.id} {...row(k)} inert={resting && !here} onPointerEnter={() => onPoint(stop.id)} onPointerLeave={() => onPoint(undefined)}>
          <span data-sign="" className={`absolute top-2 left-0.5 grid size-4 translate-y-0.5 place-items-center rounded-full bg-ground transition-[box-shadow] duration-300 ease-calm ${here ? RING : ""}`}>
            {sign}
          </span>
          {/* Folded, its first words and where it stands; open, the whole of it, which starts with them, its thread's own
              room at its left kept in what it opens in. */}
          <Opens open={!here}>{line}</Opens>
          <Opens open={here} className="-ml-4 pl-4">
            <div className="text-[13px]">{whole}</div>
          </Opens>
        </li>
      );
    }
    const i = stop.step;
    const title = scene.steps[i]!.title;
    return (
      <Fragment key={`step ${i}`}>
      {newFrom(i)}
      <li {...row(k)} inert={resting}>
        <span
          data-sign=""
          className={`absolute top-2 left-0 grid size-5 place-items-center rounded-full text-[10.5px] leading-none font-medium tabular-nums transition-colors duration-300 ease-calm ${i === current ? "bg-fg text-ground" : gone ? "bg-track text-soft" : "bg-ground text-faint shadow-[inset_0_0_0_1px_var(--track)]"}`}
        >
          {i + 1}
        </span>
        <button className={`block w-full text-left text-[14px] leading-5 text-balance outline-none hover:text-fg focus-visible:text-fg ${i === current ? "text-fg" : "text-soft"}`} onClick={() => onStop(k)}>
          {title}
        </button>
        <Opens open={here}>
        <div className="pt-[11px] pr-2 pb-[3px]">
          <div
            ref={here ? line : undefined}
            role="slider"
            tabIndex={here ? 0 : -1}
            aria-label={`Where in “${title}”`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share(i, at) * 100)}
            className="group/line relative h-0.5 w-full cursor-pointer touch-none outline-none select-none before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
            onPointerDown={press}
            onKeyDown={(event) =>
              (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
              (event.preventDefault(), event.stopPropagation(), onGo(momentAt(i, clamp(share(i, clock.at) + (event.key === "ArrowRight" ? 0.05 : -0.05), 0, 1))))
            }
          >
            <span className={`absolute inset-0 overflow-hidden rounded-[1px] bg-track transition-[scale] duration-150 ease-calm group-hover/line:scale-y-200 group-focus-visible/line:scale-y-200 ${held ? "scale-y-200" : ""}`}>
              <span className="absolute inset-0 origin-left bg-soft [scale:var(--done,0)_1]" />
            </span>
            {marks
              .filter((mark) => stepOf(mark.at) === i)
              .map((mark) => (
                <button
                  key={mark.id}
                  data-mark={mark.id}
                  aria-label={mark.words}
                  className="group/mark absolute top-1/2 z-3 grid size-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center outline-none"
                  style={{ left: `${share(i, mark.at) * 100}%` }}
                  onKeyDown={(event) => event.key === "Enter" && toMark(mark.id)}
                >
                  {mark.fill ? (
                    <i className={`size-1.5 rounded-full shadow-[0_0_0_2px_var(--under,var(--ground))] transition-[scale] duration-150 ease-calm group-hover/mark:scale-140 group-focus-visible/mark:scale-140 ${mark.fill}`} />
                  ) : (
                    <i className="size-[7px] rotate-45 bg-fg shadow-[0_0_0_1.5px_var(--under,var(--ground))] transition-[scale] duration-150 ease-calm group-hover/mark:scale-130 group-focus-visible/mark:scale-130" />
                  )}
                </button>
              ))}
          </div>
        </div>
        {changesIn(i)}
        {quietIn(i)}
        </Opens>
      </li>
      </Fragment>
    );
  };

  return (
    <ol ref={list} aria-label={`The way through “${scene.name}”`} className="relative flex flex-col">
      <li aria-hidden className={`pointer-events-none absolute top-(--rail-top) left-[9.5px] h-(--rail) w-px bg-track transition-opacity duration-300 ease-calm phone:hidden ${resting ? "opacity-35" : ""}`}>
        <span className="absolute inset-0 origin-top bg-soft [scale:1_var(--reach,0)] transition-[scale] duration-300 ease-calm" />
      </li>
      {[...scene.steps.flatMap((_, i) => [...(quiet[i] ? [quietLine(i)] : []), ...stopsIn(i).map(stopAt)]), ...stopsIn(-1).map(stopAt)].concat(
        end ? (
          <li key="end" {...row(stops.length)} data-end={looksGood ? "looks good" : ""} inert={resting}>
            <span data-sign="" className={`absolute top-2 left-0 grid size-5 place-items-center rounded-full bg-ground transition-[scale] duration-300 ease-calm ${on === stops.length ? "scale-125" : ""}`}>
              <EndMark end={end.mark} ahead={on !== stops.length} just={false} className="size-3.5" />
            </span>
            {/* At the end, saying it is the one thing to do here: the surface it's on takes the colour it turns. */}
            {looksGood ? (
              <button
                aria-pressed={looksGood.good}
                // Its square is a checkbox's box: pressed too, as the button reaches over it.
                className={`flex w-full items-center justify-between gap-2.5 pr-2 text-left text-[14px] leading-5 transition-colors duration-300 ease-calm after:absolute after:inset-y-0 after:left-0 after:w-8 ${looksGood.good || on === stops.length ? "text-green" : "text-soft hover:text-fg"}`}
                // Said, the way goes on, and the key that said it is the page's again, not this button's: Enter on the next
                // scene's Looks good would otherwise press this one again and take it back.
                onClick={(event) => (looksGood.onPress(), event.currentTarget.blur())}
              >
                Looks good
                {on === stops.length && !looksGood.good && <Key>↵</Key>}
              </button>
            ) : (
              <p className="text-[14px] leading-5">{end.says}</p>
            )}
            <Opens open={on === stops.length}>
              {end.onNote && (
                <button className="mt-1.5 mb-0.5 text-[12.5px] leading-[18px] text-soft underline-offset-[3px] hover:text-fg hover:underline" onClick={end.onNote}>
                  Note on the whole scene
                </button>
              )}
              {quietIn()}
            </Opens>
          </li>
        ) : [],
      )}
    </ol>
  );
}

// What a stop says beyond its line, there while you're on it: it grows out of the line, and folds back into it.
// It's the row's child, whose opacity the row sets; the fold is on the one inside it, so neither undoes the other's.
function Opens({ open, className = "", children }: { open: boolean; className?: string; children: ReactNode }) {
  return (
    <div inert={!open}>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-calm ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"}`}>
        <div className={`min-h-0 overflow-hidden ${className}`}>{children}</div>
      </div>
    </div>
  );
}

// The ring around the sign of the stop you're on.
const RING = "shadow-[0_0_0_2px_var(--ground),0_0_0_3.5px_var(--fg)]";
