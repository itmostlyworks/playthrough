// A situation's steps, under its recording, in the parts the agent thought worth looking at: each its number and words,
// the one it's on lit, and beside them a dot for each note made in it and a diamond for each change new to you. There's
// no clock here: how long a step took is how fast it was recorded, not how long you need to look. Pressing a step's words
// plays it; a dot or a diamond goes to it and opens it, and pointed at, says what it is. The line over the step it's on
// fills as it plays through it, and pressed or dragged along, goes anywhere in it, for a moment the steps don't rest on.

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Flow } from "@playthrough/review";
import { clamp } from "./moments.ts";
import type { Clock, Cut } from "./Player.tsx";

// What's beside a step: a note's dot in its fill, or a change's diamond, at its moment, and what it says pointed at.
export type OnLine = { id: string; at: number; fill?: string; words: string };

type Props = {
  flow: Flow;
  clock: Clock;
  at: number;
  cut?: Cut;
  marks: OnLine[];
  onPlay: (step: number) => void;
  onMark: (id: string) => void;
  // Dragging along the step it's on, and where it was let go.
  onScrub: (scrubbing: boolean) => void;
  onGo: (moment: number) => void;
  className?: string;
};

export function Steps({ flow, clock, at, cut, marks, onPlay, onMark, onScrub, onGo, className = "" }: Props) {
  const end = (step: number) => flow.steps[step + 1]?.at ?? flow.length;
  const stepOf = (moment: number) => Math.max(0, flow.steps.findIndex((_, step) => end(step) >= moment - 0.05));
  // How far into its step a moment is, in the time it plays in, waiting cut short, so the line fills at one speed, full
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
  const line = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const follow = (moment: number) => {
      setCurrent(stepOf(moment));
      line.current?.style.setProperty("--done", String(share(stepOf(moment), moment)));
    };
    follow(clock.at);
    return clock.follow(follow);
  }, [clock, flow, at, cut, current]);
  // Like a video's, but only the step's: pressed, it goes there and drags from there, never into another step.
  const [held, setHeld] = useState(false);
  const goTo = (clientX: number) => {
    const box = line.current!.getBoundingClientRect();
    clock.set(momentAt(current, clamp((clientX - box.left) / box.width, 0, 1)));
  };
  const press = (event: PointerEvent) => {
    if (event.button !== 0) return;
    // Pressed, it keeps no focus, so Space plays on from where it's let go.
    event.preventDefault();
    const id = event.pointerId;
    setHeld(true);
    onScrub(true);
    goTo(event.clientX);
    const move = (moving: globalThis.PointerEvent) => moving.pointerId === id && goTo(moving.clientX);
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      setHeld(false);
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
      {flow.steps.map((step, i) => (
        <div key={i} className="grid content-start gap-2.5">
          {i === current ? (
            <div
              ref={line}
              role="slider"
              tabIndex={0}
              aria-label={`Where in “${step.title}”`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(share(i, at) * 100)}
              className="group/line relative h-0.5 cursor-pointer touch-none outline-none select-none before:absolute before:-inset-x-0 before:-inset-y-2 before:content-['']"
              onPointerDown={press}
              onKeyDown={(event) => (event.key === "ArrowLeft" || event.key === "ArrowRight") && (event.preventDefault(), nudge(event.key === "ArrowRight" ? 0.05 : -0.05))}
            >
              <span className={`absolute inset-0 overflow-hidden rounded-[1px] bg-line transition-[scale] duration-150 ease-calm group-hover/line:scale-y-200 group-focus-visible/line:scale-y-200 ${held ? "scale-y-200" : ""}`}>
                <span className="absolute inset-0 origin-left bg-fg [scale:var(--done,1)_1]" />
              </span>
            </div>
          ) : (
            <span className="h-0.5 rounded-[1px] bg-line" />
          )}
          <div className="flex items-start gap-1">
            <button
              title={step.title}
              aria-current={i === current ? "step" : undefined}
              className="flex min-w-0 gap-1.5 text-left text-[13px] leading-[18px] text-soft transition-colors duration-150 ease-calm outline-none hover:text-fg focus-visible:text-fg aria-[current]:text-fg"
              onClick={() => onPlay(i)}
            >
              <span className="flex-none text-faint tabular-nums">{i + 1}</span>
              <span className="line-clamp-2 text-balance">{step.title}</span>
            </button>
            {marks
              .filter((mark) => stepOf(mark.at) === i)
              .sort((a, b) => a.at - b.at)
              .map((mark) => (
                <button key={mark.id} aria-label={mark.words} className="group/mark relative grid h-[18px] w-3.5 flex-none place-items-center outline-none" onClick={() => onMark(mark.id)}>
                  {mark.fill ? (
                    <i className={`size-1.5 rounded-full transition-[scale] duration-150 ease-calm group-hover/mark:scale-140 group-focus-visible/mark:scale-140 ${mark.fill}`} />
                  ) : (
                    <i className="size-[7px] rotate-45 bg-fg transition-[scale] duration-150 ease-calm group-hover/mark:scale-130 group-focus-visible/mark:scale-130" />
                  )}
                  <span className="pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 z-6 -translate-x-1/2 translate-y-[2px] rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap text-fg opacity-0 shadow-tip transition-[opacity,translate] duration-150 ease-calm group-hover/mark:translate-y-0 group-hover/mark:opacity-100">
                    <span className="block max-w-[260px] truncate">{mark.words}</span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
