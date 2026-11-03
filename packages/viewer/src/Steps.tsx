// A situation's steps, under its recording: its timeline, in the parts the agent thought worth looking at. Each is its
// words and its stretch of one line, full where the recording has been, filling as it plays, empty ahead, with a dot
// where each note is and a diamond where something new to you changed. Pressing a step plays it, once; pressing or
// dragging along its line goes to that moment there. Pointing at one only says it can be pressed.

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Flow } from "@playthrough/review";
import { clamp } from "./moments.ts";
import type { Clock } from "./Player.tsx";

// What's on the line: a note's dot in its fill, or a change's diamond, at its moment.
export type OnLine = { id: string; at: number; fill?: string };

type Props = {
  flow: Flow;
  clock: Clock;
  at: number;
  marks: OnLine[];
  onPlay: (step: number) => void;
  onGo: (at: number) => void;
  className?: string;
};

export function Steps({ flow, clock, at, marks, onPlay, onGo, className = "" }: Props) {
  const end = (step: number) => flow.steps[step + 1]?.at ?? flow.length;
  const stepOf = (moment: number) => Math.max(0, flow.steps.findIndex((_, step) => end(step) >= moment - 0.05));
  const lines = useRef<(HTMLSpanElement | null)[]>([]);
  const [current, setCurrent] = useState(stepOf(at));
  // Each line is as full as the recording has got through its step.
  useEffect(() => {
    const fill = (moment: number) => {
      flow.steps.forEach((step, i) => lines.current[i]?.style.setProperty("--done", String(clamp((moment - step.at) / Math.max(end(i) - step.at, 0.01), 0, 1))));
      setCurrent(stepOf(moment));
    };
    fill(clock.at);
    return clock.follow(fill);
  }, [clock, flow, at]);
  // Pressed or dragged along, a line goes to its moment there, never quite its start, which is the step before's end.
  const going = useRef<number>(undefined);
  const goTo = (event: PointerEvent, step: number) => {
    const line = lines.current[step]?.getBoundingClientRect();
    if (!line) return;
    const from = flow.steps[step]!.at;
    const u = clamp((event.clientX - line.left) / line.width, 0, 1);
    onGo(clamp(from + u * (end(step) - from), from + (step ? 0.06 : 0), end(step) - 0.05));
  };
  return (
    <div role="group" aria-label={`The steps of ${flow.name}`} className={`grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-2 gap-y-4 ${className}`}>
      {flow.steps.map((step, i) => (
        <div key={i} className="grid content-start gap-2">
          <span
            className="relative h-[3px] cursor-ew-resize touch-none"
            onPointerDown={(event) => (event.currentTarget.setPointerCapture(event.pointerId), (going.current = i), goTo(event, i))}
            onPointerMove={(event) => going.current === i && goTo(event, i)}
            onPointerUp={() => (going.current = undefined)}
          >
            {/* Easier to press than to see. */}
            <span className="absolute -inset-y-2.5 inset-x-0" />
            <span ref={(line) => void (lines.current[i] = line)} className="absolute inset-0 overflow-hidden rounded-full bg-line">
              <span className="absolute inset-0 origin-left bg-fg [transform:scaleX(var(--done,0))]" />
            </span>
            {marks
              .filter((mark) => stepOf(mark.at) === i)
              .map((mark) => (
                <i
                  key={mark.id}
                  className={`pointer-events-none absolute top-1/2 size-[7px] -translate-1/2 shadow-[0_0_0_1.5px_var(--ground)] ${mark.fill ? `rounded-full ${mark.fill}` : "rotate-45 bg-fg"}`}
                  style={{ left: `${clamp((mark.at - step.at) / Math.max(end(i) - step.at, 0.01), 0, 1) * 100}%` }}
                />
              ))}
          </span>
          <button
            title={step.title}
            aria-current={i === current ? "step" : undefined}
            className="flex gap-1.5 text-left text-[13px] leading-[18px] text-soft transition-colors duration-150 ease-calm outline-none hover:text-fg focus-visible:text-fg aria-[current]:text-fg"
            onClick={() => onPlay(i)}
          >
            <span className="flex-none text-faint tabular-nums">{i + 1}</span>
            <span className="line-clamp-2 text-balance">{step.title}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
