// A situation's steps, under its recording, in the parts the agent thought worth looking at: each a short clip, its
// line over its number and words, the one it's on lit as it plays through it. Every line is its step's timeline, alike:
// pressed, it plays from there to the step's result; dragged along, it goes anywhere in the step and rests where it's
// let go. On it, a dot for each note made in the step and a diamond for each change new to you, at their moments:
// pressed, it goes there, its card open; pointed at, it says what it is. Pressing a step's words plays it from its start.

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Flow } from "@playthrough/review";
import { clamp } from "./moments.ts";
import type { Clock, Cut } from "./Player.tsx";

// What's on a line: a note's dot in its fill, or a change's diamond, at its moment, and what it says pointed at.
export type OnLine = { id: string; at: number; fill?: string; words: string };

type Props = {
  flow: Flow;
  clock: Clock;
  at: number;
  cut?: Cut;
  marks: OnLine[];
  // A step played to its result, from its start or from a moment in it.
  onPlay: (step: number, from?: number) => void;
  onMark: (id: string) => void;
  // Dragging along a line, and where it was let go.
  onScrub: (scrubbing: boolean) => void;
  onGo: (moment: number) => void;
  className?: string;
};

export function Steps({ flow, clock, at, cut, marks, onPlay, onMark, onScrub, onGo, className = "" }: Props) {
  const end = (step: number) => flow.steps[step + 1]?.at ?? flow.length;
  const stepOf = (moment: number) => Math.max(0, flow.steps.findIndex((_, step) => end(step) >= moment - 0.05));
  // How far into its step a moment is, in the time it plays in, waiting cut short, so a line fills at one speed, full
  // at its result; and the moment that far in, never quite its start, which is the step before's result.
  const span = (step: number) => [flow.steps[step]!.at, end(step) - 0.05].map((moment) => (cut ? cut.cut(moment) : moment)) as [number, number];
  const share = (step: number, moment: number) => {
    const [from, to] = span(step);
    return clamp(((cut ? cut.cut(moment) : moment) - from) / Math.max(to - from, 0.01), 0, 1);
  };
  const momentAt = (step: number, u: number) => {
    const [from, to] = span(step);
    const moment = from + u * (to - from);
    return Math.max(cut ? cut.real(moment) : moment, flow.steps[step]!.at + (step ? 0.06 : 0));
  };
  // The step it's on, as it plays through them, and how far into it.
  const [current, setCurrent] = useState(stepOf(at));
  const lines = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const follow = (moment: number) => {
      setCurrent(stepOf(moment));
      lines.current[stepOf(moment)]?.style.setProperty("--done", String(share(stepOf(moment), moment)));
    };
    follow(clock.at);
    return clock.follow(follow);
  }, [clock, flow, at, cut, current]);

  const along = (clientX: number, step: number) => {
    const box = lines.current[step]!.getBoundingClientRect();
    return clamp((clientX - box.left) / box.width, 0, 1);
  };
  // Where the pointer is on a line, as a press there would play from; and the line being dragged.
  const [pointing, setPointing] = useState<{ step: number; u: number }>();
  const [held, setHeld] = useState<number>();
  // A press plays from there; moved a few pixels, it drags, never into another step. On a dot or a diamond, a press goes
  // to it. Pressed, a line keeps no focus, so Space plays on from where it's let go.
  const press = (event: PointerEvent, step: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const mark = (event.target as Element).closest<HTMLElement>("[data-mark]")?.dataset.mark;
    const [start, id] = [event.clientX, event.pointerId];
    let dragging = false;
    const move = (moving: globalThis.PointerEvent) => {
      if (moving.pointerId !== id || (!dragging && Math.abs(moving.clientX - start) < 4)) return;
      if (!dragging) ((dragging = true), setHeld(step), setPointing(undefined), onScrub(true));
      clock.set(momentAt(step, along(moving.clientX, step)));
    };
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      if (!dragging) return mark ? onMark(mark) : onPlay(step, momentAt(step, along(start, step)));
      setHeld(undefined);
      onScrub(false);
      onGo(clock.at);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };
  const nudge = (by: number) => onGo(momentAt(current, clamp(share(current, clock.at) + by, 0, 1)));

  return (
    <div role="group" aria-label={`The steps of ${flow.name}`} className={`grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-2 gap-y-4 ${className}`}>
      {flow.steps.map((step, i) => {
        const here = pointing?.step === i && held === undefined;
        return (
          <div key={i} className="grid content-start gap-2.5">
            <div
              ref={(line) => void (lines.current[i] = line)}
              role="slider"
              tabIndex={i === current ? 0 : -1}
              aria-label={`Where in “${step.title}”`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={i === current ? Math.round(share(i, at) * 100) : 0}
              className="group/line relative h-0.5 cursor-pointer touch-none outline-none select-none before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
              onPointerDown={(event) => press(event, i)}
              onPointerMove={(event) => held === undefined && setPointing((event.target as Element).closest("[data-mark]") ? undefined : { step: i, u: along(event.clientX, i) })}
              onPointerLeave={() => setPointing(undefined)}
              onKeyDown={(event) => (event.key === "ArrowLeft" || event.key === "ArrowRight") && (event.preventDefault(), nudge(event.key === "ArrowRight" ? 0.05 : -0.05))}
            >
              <span className={`absolute inset-0 overflow-hidden rounded-[1px] bg-line transition-[scale] duration-150 ease-calm group-hover/line:scale-y-200 group-focus-visible/line:scale-y-200 ${held === i ? "scale-y-200" : ""}`}>
                {i === current && <span className="absolute inset-0 origin-left bg-fg [scale:var(--done,1)_1]" />}
              </span>
              {/* Pointed at, a press plays from here. */}
              <span
                aria-hidden
                className={`pointer-events-none absolute top-1/2 z-4 grid size-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface text-fg shadow-tip transition-[opacity,scale] duration-150 ease-calm ${here ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
                style={{ left: `${(here ? pointing.u : 0.5) * 100}%` }}
              >
                <svg viewBox="0 0 8 8" className="ml-px size-2" fill="currentColor">
                  <path d="M1.5 1v6l5-3z" />
                </svg>
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
                    onKeyDown={(event) => event.key === "Enter" && onMark(mark.id)}
                  >
                    {mark.fill ? (
                      <i className={`size-1.5 rounded-full shadow-[0_0_0_2px_var(--ground)] transition-[scale] duration-150 ease-calm group-hover/mark:scale-140 group-focus-visible/mark:scale-140 ${mark.fill}`} />
                    ) : (
                      <i className="size-[7px] rotate-45 bg-fg shadow-[0_0_0_1.5px_var(--ground)] transition-[scale] duration-150 ease-calm group-hover/mark:scale-130 group-focus-visible/mark:scale-130" />
                    )}
                    <span className="pointer-events-none absolute bottom-[calc(100%+2px)] left-1/2 z-6 -translate-x-1/2 translate-y-[2px] rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap text-fg opacity-0 shadow-tip transition-[opacity,translate] duration-150 ease-calm group-hover/mark:translate-y-0 group-hover/mark:opacity-100">
                      <span className="block max-w-[260px] truncate">{mark.words}</span>
                    </span>
                  </button>
                ))}
            </div>
            <button
              title={step.title}
              aria-current={i === current ? "step" : undefined}
              className="flex min-w-0 gap-1.5 justify-self-start text-left text-[13px] leading-[18px] text-soft transition-colors duration-150 ease-calm outline-none hover:text-fg focus-visible:text-fg aria-[current]:text-fg"
              onClick={() => onPlay(i)}
            >
              <span className="flex-none text-faint tabular-nums">{i + 1}</span>
              <span className="line-clamp-2 text-balance">{step.title}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
