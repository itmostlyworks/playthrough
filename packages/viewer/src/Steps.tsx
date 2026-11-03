// A situation's steps, beside its recording, one under another: the journey the agent chose, gone along in order. The
// step it's on is lit and open, with what was said about it (what changed there and why, and your notes on it) and a
// line of its own that fills as it plays, and dragged along, goes anywhere in the step and rests where it's let go. On
// that line, a dot for each note made in the step and a diamond for each change new to you, at their moments: pressed,
// it goes there. The others say only what's there. Pressing a step's words goes to it, and the step it's on, plays it
// again.

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Flow } from "@playthrough/review";
import { clamp } from "./moments.ts";
import type { Clock, Cut } from "./Player.tsx";

// What's on the line: a note's dot in its fill, or a change's diamond, at its moment, and what it says pointed at.
export type OnLine = { id: string; at: number; fill?: string; words: string };

type Props = {
  flow: Flow;
  clock: Clock;
  at: number;
  cut?: Cut;
  marks: OnLine[];
  // What was said about the step it's on, under its words; and about the others, only what's there.
  about: (step: number) => ReactNode;
  hint: (step: number) => ReactNode;
  onStep: (step: number) => void;
  onMark: (id: string) => void;
  // Dragging along the line, and where it was let go.
  onScrub: (scrubbing: boolean) => void;
  onGo: (moment: number) => void;
};

export function Steps({ flow, clock, at, cut, marks, about, hint, onStep, onMark, onScrub, onGo }: Props) {
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
  // The step it's on, as it plays through it, and how far into it.
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
      if (!dragging) return mark ? onMark(mark) : onGo(momentAt(current, along(start)));
      setHeld(false);
      onScrub(false);
      onGo(clock.at);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  return (
    <ol aria-label={`The steps of ${flow.name}`} className="grid">
      {flow.steps.map((step, i) => {
        const on = i === current;
        return (
          <li key={i} data-step={i} className="relative py-[7px]">
            <span aria-hidden className={`absolute top-2 bottom-2 -left-3 w-[3px] rounded-full bg-fg transition-opacity duration-200 ease-calm phone:hidden ${on ? "" : "opacity-0"}`} />
            <button
              aria-current={on ? "step" : undefined}
              className="flex w-full min-w-0 gap-2 text-left text-[14px] leading-5 text-soft transition-colors duration-150 ease-calm outline-none hover:text-fg focus-visible:text-fg aria-[current]:text-fg"
              onClick={() => onStep(i)}
            >
              <span className="w-4 flex-none text-faint tabular-nums">{i + 1}</span>
              <span className="text-balance">{step.title}</span>
              {!on && hint(i)}
            </button>
            {on && (
              <div
                ref={line}
                role="slider"
                tabIndex={0}
                aria-label={`Where in “${step.title}”`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share(i, at) * 100)}
                className="group/line relative mt-2.5 ml-6 h-0.5 w-[calc(100%-24px)] cursor-pointer touch-none outline-none select-none before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
                onPointerDown={press}
                onKeyDown={(event) =>
                  (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                  (event.preventDefault(), event.stopPropagation(), onGo(momentAt(i, clamp(share(i, clock.at) + (event.key === "ArrowRight" ? 0.05 : -0.05), 0, 1))))
                }
              >
                <span className={`absolute inset-0 overflow-hidden rounded-[1px] bg-line transition-[scale] duration-150 ease-calm group-hover/line:scale-y-200 group-focus-visible/line:scale-y-200 ${held ? "scale-y-200" : ""}`}>
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
                      onKeyDown={(event) => event.key === "Enter" && onMark(mark.id)}
                    >
                      {mark.fill ? (
                        <i className={`size-1.5 rounded-full shadow-[0_0_0_2px_var(--ground)] transition-[scale] duration-150 ease-calm group-hover/mark:scale-140 group-focus-visible/mark:scale-140 ${mark.fill}`} />
                      ) : (
                        <i className="size-[7px] rotate-45 bg-fg shadow-[0_0_0_1.5px_var(--ground)] transition-[scale] duration-150 ease-calm group-hover/mark:scale-130 group-focus-visible/mark:scale-130" />
                      )}
                    </button>
                  ))}
              </div>
            )}
            {on && about(i)}
          </li>
        );
      })}
    </ol>
  );
}
