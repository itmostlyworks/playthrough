// A situation's steps, under its recording, in the parts the agent thought worth looking at: each its number and words,
// the one it's on lit, and beside them a dot for each note made in it and a diamond for each change new to you. There's
// no clock here: how long a step took is how fast it was recorded, not how long you need to look. Pressing a step's words
// plays it; a dot or a diamond goes to it and opens it, and pointed at, says what it is.

import { useEffect, useState } from "react";
import type { Flow } from "@playthrough/review";
import type { Clock } from "./Player.tsx";

// What's beside a step: a note's dot in its fill, or a change's diamond, at its moment, and what it says pointed at.
export type OnLine = { id: string; at: number; fill?: string; words: string };

type Props = {
  flow: Flow;
  clock: Clock;
  at: number;
  marks: OnLine[];
  onPlay: (step: number) => void;
  onMark: (id: string) => void;
  className?: string;
};

export function Steps({ flow, clock, at, marks, onPlay, onMark, className = "" }: Props) {
  const end = (step: number) => flow.steps[step + 1]?.at ?? flow.length;
  const stepOf = (moment: number) => Math.max(0, flow.steps.findIndex((_, step) => end(step) >= moment - 0.05));
  // The step it's on, as it plays through them.
  const [current, setCurrent] = useState(stepOf(at));
  useEffect(() => {
    setCurrent(stepOf(clock.at));
    return clock.follow((moment) => setCurrent(stepOf(moment)));
  }, [clock, flow, at]);

  return (
    <div role="group" aria-label={`The steps of ${flow.name}`} className={`grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-2 gap-y-4 ${className}`}>
      {flow.steps.map((step, i) => (
        <div key={i} className="grid content-start gap-2.5">
          <span className={`h-0.5 rounded-[1px] transition-colors duration-200 ease-calm ${i === current ? "bg-fg" : "bg-line"}`} />
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
