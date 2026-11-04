// A scene's way through, beside its recording, a stop at a time: each step the agent chose, and after it what was
// said there, your notes and what changed new to you, in the order they come; then what was said about all of it, and
// last, its end, where you say whether it looks good to you, once you've seen it through, or a note on the whole of it.
// A rail runs down through them, filled as far as you've come, and its fill glides along as you go. The stop you're on
// opens: what was said there, all of it; or a step, with a line of its own that fills as it plays, and dragged along,
// goes anywhere in the step and rests where it's let go, with a dot for each note made in the step and a diamond for
// each change, at their moments. The others are a line each, and pressed, go there. Each stop is as tall as what's in
// it: how far the page scrolls for it is the page's to say, the same for every stop.

import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { Scene } from "@playthrough/review";
import { Key } from "./Card.tsx";
import { EndMark, type End } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import type { Clock, Cut } from "./Player.tsx";

// A stop on the way: a step, at its result; steps in a row with nothing new since you last said something, from the
// first, at the last one's result; something said in a step, a note or a change, at its moment; or something said
// about all of it, in no step.
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
  onChange: (id: string) => void;
  // Dragging along the line, and where it was let go.
  onScrub: (scrubbing: boolean) => void;
  onGo: (moment: number) => void;
  // The way's last stop, its end: how it stands, as its mark; whether it looks good to you, and saying so or taking it
  // back, once nothing in it is still open, or else what's open, in words; and a note on the whole scene.
  end?: { mark: End; looksGood?: { good: boolean; onPress: () => void }; says: ReactNode; onNote?: () => void };
  // Taken over: the app is yours, and what plays the recording rests; the stop you're on stays lit, where you took it
  // over, and what you say there answers.
  resting?: boolean;
  // The round you last said something about it on, since when steps kept together have nothing new; with none, they're as
  // they were before the work. And opening them.
  since?: number;
  onUnfold: (stop: number) => void;
};

export function Steps({ scene, clock, at, cut, stops, on, marks, said, onStop, onPoint, onScrub, onGo, end, resting, since, onUnfold, changesIn, onChange }: Props) {
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
  useLayoutEffect(() => {
    if (current < 0) return;
    const follow = (moment: number) => line.current?.style.setProperty("--done", String(share(current, moment)));
    follow(clock.at);
    return clock.follow(follow);
  }, [clock, scene, at, cut, current]);
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
      const centres = [...way.querySelectorAll("[data-sign]")].map((sign) => {
        const box = sign.getBoundingClientRect();
        return box.top + box.height / 2 - top;
      });
      const first = centres[0] ?? 0;
      const rail = (centres.at(-1) ?? first) - first;
      way.style.setProperty("--rail-top", `${first}px`);
      way.style.setProperty("--rail", `${rail}px`);
      // How much of the rail is filled, as a share of it, for it to fill without laying the page out each frame.
      way.style.setProperty("--reach", String(on < 0 || rail <= 0 ? 0 : ((centres[on] ?? first) - first) / rail));
      const here = way.querySelector<HTMLElement>("[aria-current=step]");
      // The surface fits what's in the stop, with as much room under it as over it, not the room after it.
      const fits = here && Math.max(...[...here.children].map((child) => (child as HTMLElement).offsetTop + (child as HTMLElement).offsetHeight)) + 8;
      if (here && fits) (way.style.setProperty("--here-top", `${here.offsetTop}px`), way.style.setProperty("--here", `${fits}px`));
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

  // Every stop is laid out open, so the way never reflows under you as you go along it: the one you're on sits on the
  // page's surface, the others' words quieter, their signs still whole on the rail, and a press anywhere on another goes
  // there first, so what's pressed in it, as its Compare, is about it. Before you've gone along it, none is quieter: it's
  // the map of what's ahead.
  const row = (k: number) => ({
    "data-stop": k,
    "aria-current": k === on ? ("step" as const) : undefined,
    className: `relative flex-none py-2 pb-4 pl-8 transition-opacity duration-300 ease-calm [&>*]:transition-opacity [&>*]:duration-300 [&>*]:ease-calm ${k === on ? "[--under:var(--surface)]" : resting ? "opacity-35" : on < 0 ? "" : "[&>:not([data-sign])]:opacity-60 hover:[&>:not([data-sign])]:opacity-100"}`,
    onPointerDownCapture: () => k !== on && onStop(k),
  });

  return (
    <ol ref={list} aria-label={`The way through “${scene.name}”`} className="relative flex flex-col">
      <li aria-hidden className={`pointer-events-none absolute top-(--rail-top) left-[9.5px] h-(--rail) w-px bg-track transition-opacity duration-300 ease-calm phone:hidden ${resting ? "opacity-35" : ""}`}>
        <span className="absolute inset-0 origin-top bg-soft [scale:1_var(--reach,0)] transition-[scale] duration-300 ease-calm" />
      </li>
      {/* The surface the stop you're on sits on: one, gliding along with the rail's fill as you go. */}
      <li aria-hidden className={`pointer-events-none absolute top-0 left-6 -right-3 h-(--here) translate-y-(--here-top) rounded-xl transition-[translate,height,opacity,background-color] duration-300 ease-calm phone:left-5 ${on === stops.length && looksGood ? "bg-[color-mix(in_srgb,var(--green)_13%,var(--surface))]" : "bg-surface"} ${on < 0 || resting ? "opacity-0" : ""}`} />
      {stops.map((stop, k) => {
        const here = k === on;
        const gone = k < on;
        if (stop.from !== undefined) {
          const kept = scene.steps.slice(stop.from, stop.step + 1);
          return (
            <li key={`together ${stop.from}`} {...row(k)} inert={resting}>
              <span
                data-sign=""
                className={`absolute top-2 left-2.5 grid h-5 min-w-5 -translate-x-1/2 place-items-center rounded-full px-1.5 phone:left-0 phone:translate-x-0 phone:px-1 phone:text-[9.5px] text-[10.5px] leading-none font-medium whitespace-nowrap tabular-nums transition-colors duration-300 ease-calm ${here ? "bg-fg text-ground" : gone ? "bg-track text-soft" : "bg-ground text-faint shadow-[inset_0_0_0_1px_var(--track)]"}`}
              >
                {stop.from + 1}–{stop.step + 1}
              </span>
              <button className={`block w-full text-left text-[14px] leading-5 outline-none hover:text-fg focus-visible:text-fg ${here ? "text-fg" : "text-soft"}`} onClick={() => onStop(k)}>
                {since === undefined ? "Unchanged" : `Nothing new since round ${since}`}
              </button>
              <ol className="grid gap-0.5 pt-1.5 text-[13px] leading-[18px] text-soft">
                {kept.map((one, i) => (
                  <li key={i} className="truncate">
                    {one.title}
                  </li>
                ))}
              </ol>
              <button className="mt-1.5 mb-0.5 text-[12.5px] leading-[18px] text-soft underline-offset-[3px] hover:text-fg hover:underline" onClick={() => onUnfold(k)}>
                Go through each step
              </button>
            </li>
          );
        }
        if (stop.id !== undefined) {
          const { sign, whole } = said(stop.id);
          return (
            <li key={stop.id} {...row(k)} inert={resting && !here} onPointerEnter={() => onPoint(stop.id)} onPointerLeave={() => onPoint(undefined)}>
              <span data-sign="" className={`absolute top-2.5 left-0.5 grid size-4 place-items-center rounded-full bg-ground transition-[box-shadow] duration-300 ease-calm ${here ? RING : ""}`}>
                {sign}
              </span>
              <div className="text-[13px]">{whole}</div>
            </li>
          );
        }
        const i = stop.step;
        const title = scene.steps[i]!.title;
        return (
          <li key={`step ${i}`} {...row(k)} inert={resting}>
            <span
              data-sign=""
              className={`absolute top-2 left-0 grid size-5 place-items-center rounded-full text-[10.5px] leading-none font-medium tabular-nums transition-colors duration-300 ease-calm ${i === current ? "bg-fg text-ground" : gone ? "bg-track text-soft" : "bg-ground text-faint shadow-[inset_0_0_0_1px_var(--track)]"}`}
            >
              {i + 1}
            </span>
            <button className={`block w-full text-left text-[14px] leading-5 text-balance outline-none hover:text-fg focus-visible:text-fg ${i === current ? "text-fg" : "text-soft"}`} onClick={() => onStop(k)}>
              {title}
            </button>
            <div className="pt-3 pr-2 pb-1.5">
              <div
                ref={i === current ? line : undefined}
                role="slider"
                tabIndex={i === current ? 0 : -1}
                aria-label={`Where in “${title}”`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share(i, at) * 100)}
                style={i === current ? undefined : ({ "--done": i < current ? 1 : 0 } as CSSProperties)}
                className={`group/line relative h-0.5 w-full cursor-pointer touch-none outline-none select-none before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] ${i === current ? "" : "pointer-events-none"}`}
                onPointerDown={press}
                onKeyDown={(event) =>
                  (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                  (event.preventDefault(), event.stopPropagation(), onGo(momentAt(i, clamp(share(i, clock.at) + (event.key === "ArrowRight" ? 0.05 : -0.05), 0, 1))))
                }
              >
                <span className={`absolute inset-0 overflow-hidden rounded-[1px] bg-track transition-[scale] duration-150 ease-calm group-hover/line:scale-y-200 group-focus-visible/line:scale-y-200 ${held ? "scale-y-200" : ""}`}>
                  <span className="absolute inset-0 origin-left bg-soft [scale:var(--done,1)_1]" />
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
          </li>
        );
      }).concat(
        end ? (
          <li key="end" {...row(stops.length)} inert={resting}>
            <span data-sign="" className={`absolute top-2 left-0 grid size-5 place-items-center rounded-full bg-ground transition-[scale] duration-300 ease-calm ${on === stops.length ? "scale-125" : ""}`}>
              <EndMark end={end.mark} ahead={on !== stops.length} just={false} className="size-3.5" />
            </span>
            {/* At the end, saying it is the one thing to do here: the surface it's on takes the colour it turns. */}
            {looksGood ? (
              <button
                aria-pressed={looksGood.good}
                className={`flex w-full items-center justify-between gap-2.5 pr-2 text-left text-[14px] leading-5 transition-colors duration-300 ease-calm ${looksGood.good || on === stops.length ? "text-green" : "text-soft hover:text-fg"}`}
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
            {end.onNote && (
              <button className="mt-1.5 mb-0.5 text-[12.5px] leading-[18px] text-soft underline-offset-[3px] hover:text-fg hover:underline" onClick={end.onNote}>
                Note on the whole scene
              </button>
            )}
          </li>
        ) : [],
      )}
    </ol>
  );
}

// The ring around the sign of the stop you're on.
const RING = "shadow-[0_0_0_2px_var(--ground),0_0_0_3.5px_var(--fg)]";
