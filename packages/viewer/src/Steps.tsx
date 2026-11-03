// A situation's steps, as the page and the frame both list them: each its number and words, a dot for each note on it,
// and a line beside it, full on the step shown and filling as that step plays, all as tall as the tallest. Where
// something's new to you, a diamond sits on the line level with the number, as the timeline marks it on its line. On the
// page, pointing at a step loops it; beside the frame, pressing one plays it.

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import type { Flow } from "@playthrough/review";
import { clamp } from "./moments.ts";
import { fill, type Shown } from "./notes.ts";
import { useNow, type Playhead } from "./playhead.ts";

type Props = {
  flow: Flow;
  chosen: number;
  // When something new to you happens in the flow.
  changed: number[];
  notedAt: (step: number) => Shown[];
  // The line of the step shown: full, or as far as it's played, its `--done` from 0 to 1.
  progress: RefObject<HTMLSpanElement | null>;
  // Beside the frame it's always a column; on the page, a column on a wide screen and a row of segments on a narrower one.
  column?: boolean;
  by: "point" | "press";
  onChoose: (step: number) => void;
  className?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

export function Steps({ flow, chosen, changed, notedAt, progress, column, by, onChoose, className = "", onPointerEnter, onPointerLeave }: Props) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const arrows = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    tabs.current[clamp(chosen + step, 0, flow.steps.length - 1)]?.focus();
  };
  const end = (step: number) => flow.steps[step + 1]?.at ?? flow.length;
  const fresh = new Set(changed.map((at) => Math.max(0, flow.steps.findIndex((_, step) => end(step) >= at - 0.05))));
  // In a row, the diamond is before the number, the line being over it.
  const look = column
    ? { list: "grid auto-rows-fr", step: "min-h-9 content-center py-1.5 pl-4", line: "absolute inset-y-0.5 left-0 w-[3px]", fill: "[transform:scaleY(var(--done,1))]", diamond: "absolute top-[5.5px] -left-[18px]", words: "line-clamp-2" }
    : {
        list: "grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-2 gap-y-4 wide:grid-cols-1 wide:auto-rows-fr wide:gap-0",
        step: "content-start gap-2 wide:min-h-9 wide:content-center wide:py-1.5 wide:pl-4",
        line: "relative h-[3px] wide:absolute wide:inset-y-0.5 wide:left-0 wide:h-auto wide:w-[3px]",
        fill: "[transform:scaleX(var(--done,1))] wide:[transform:scaleY(var(--done,1))]",
        diamond: "mt-[5.5px] mr-0.5 flex-none wide:absolute wide:top-[5.5px] wide:-left-[18px] wide:m-0",
        words: "line-clamp-3 wide:line-clamp-2",
      };
  return (
    <div role="tablist" aria-label={`The steps of ${flow.name}`} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} className={`${look.list} ${className}`}>
      {flow.steps.map((step, i) => (
        <button
          key={i}
          ref={(tab) => void (tabs.current[i] = tab)}
          role="tab"
          title={step.title}
          aria-selected={i === chosen}
          tabIndex={i === chosen ? 0 : -1}
          className={`relative grid text-left text-[13px] leading-[18px] text-soft transition-colors duration-150 ease-calm outline-none hover:text-fg focus-visible:text-fg aria-selected:text-fg ${look.step}`}
          onPointerEnter={by === "point" ? () => onChoose(i) : undefined}
          onFocus={by === "point" ? () => onChoose(i) : undefined}
          onClick={by === "press" ? () => onChoose(i) : undefined}
          onKeyDown={arrows}
        >
          <span ref={i === chosen ? progress : undefined} className={look.line}>
            <span className="absolute inset-0 overflow-hidden rounded-full bg-line">{i === chosen && <span className={`absolute inset-0 origin-top-left bg-fg ${look.fill}`} />}</span>
          </span>
          <span className="relative flex gap-1.5">
            {fresh.has(i) && <i title="New here" className={`size-[7px] rotate-45 bg-fg shadow-[0_0_0_1.5px_var(--ground)] ${look.diamond}`} />}
            <span className="flex-none text-faint tabular-nums">{i + 1}</span>
            <span className={`text-balance ${look.words}`}>
              {step.title}
              {notedAt(i).map((note) => <b key={note.id} className={`ml-1 inline-block size-1.5 translate-y-[-1px] rounded-full ${fill(note)}`} />)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

// Beside the frame, the steps of the situation you're in, where they were on the page: the one the playhead's in is shown,
// its line filling as it plays, and pressing one plays it, once, as its loop did.
export function StepsBeside({ playhead, flow, changed, notes, className }: { playhead: Playhead; flow: Flow; changed: number[]; notes: Shown[]; className?: string }) {
  const end = (step: number) => flow.steps[step + 1]?.at ?? flow.length;
  const stepOf = (at: number) => Math.max(0, flow.steps.findIndex((_, step) => end(step) >= at - 0.05));
  const shown = useNow(playhead, ({ moment }) => (moment.flow === flow.name ? stepOf(moment.at) : 0));
  const progress = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      playhead.subscribe(() => {
        const { moment } = playhead.now;
        if (moment.flow !== flow.name || !progress.current) return;
        const step = stepOf(moment.at);
        const from = flow.steps[step]!.at;
        progress.current.style.setProperty("--done", String(clamp((moment.at - from) / Math.max(end(step) - from, 0.01), 0, 1)));
      }),
    [playhead, flow],
  );
  return (
    <Steps
      flow={flow}
      chosen={shown}
      changed={changed}
      notedAt={(step) => notes.filter((note) => note.on?.at !== undefined && stepOf(note.on.at) === step)}
      progress={progress}
      column
      by="press"
      onChoose={(step) => playhead.run({ flow: flow.name, at: flow.steps[step]!.at }, end(step))}
      className={className}
    />
  );
}
