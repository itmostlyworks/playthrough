// A situation's steps, under its recording: its timeline, in the parts the agent thought worth looking at. Each is its
// words and its stretch of the line, filled where the recording has been, with the playhead where it is now, a dot for
// each note and a diamond for each change new to you at its moment, hollow until the playhead has passed it. The line
// runs on the time it plays in, waiting cut short, so it fills at one speed. It answers the pointer as the frame's
// timeline did: under it the line thickens, and a ghost of the playhead with its time says where a press lands. Pressed
// or dragged along, it goes there, settling on a note or a change within a few pixels; a dot or a diamond pressed goes
// to it and opens it, and pointed at, says what it is. Pressing a step's words plays it, once.

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { time, type Flow } from "@playthrough/review";
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
  onPlay: (step: number) => void;
  onGo: (at: number) => void;
  onMark: (id: string) => void;
  // While you drag, the clock goes where you are and nothing else is drawn again; let go, it's where it rests.
  onScrub: (scrubbing: boolean) => void;
  className?: string;
};

export function Steps({ flow, clock, at, cut, marks, onPlay, onGo, onMark, onScrub, className = "" }: Props) {
  const end = (step: number) => flow.steps[step + 1]?.at ?? flow.length;
  const stepOf = (moment: number) => Math.max(0, flow.steps.findIndex((_, step) => end(step) >= moment - 0.05));
  // How far into its step a moment is on the line, and the moment that far in.
  const share = (step: number, moment: number) => {
    const [from, to] = [flow.steps[step]!.at, end(step)];
    return cut ? clamp((cut.cut(moment) - cut.cut(from)) / Math.max(cut.cut(to) - cut.cut(from), 0.01), 0, 1) : clamp((moment - from) / Math.max(to - from, 0.01), 0, 1);
  };
  const momentAt = (step: number, u: number) => {
    const [from, to] = [flow.steps[step]!.at, end(step)];
    const moment = cut ? cut.real(cut.cut(from) + u * (cut.cut(to) - cut.cut(from))) : from + u * (to - from);
    // Never quite its start, which is the step before's end.
    return clamp(moment, from + (step ? 0.06 : 0), to - 0.05);
  };
  const lines = useRef<(HTMLDivElement | null)[]>([]);
  const dots = useRef(new Map<string, HTMLElement>());
  // Dragged along, the time where you are, told as the clock goes.
  const times = useRef<(HTMLSpanElement | null)[]>([]);
  const [current, setCurrent] = useState(stepOf(at));
  // Each line is as full as the recording has got through its step, and what's ahead of it is hollow.
  useEffect(() => {
    const fill = (moment: number) => {
      flow.steps.forEach((_, i) => lines.current[i]?.style.setProperty("--done", String(moment < flow.steps[i]!.at ? 0 : share(i, moment))));
      for (const mark of marks) dots.current.get(mark.id)?.toggleAttribute("data-ahead", moment < mark.at - 0.02);
      const told = times.current[stepOf(moment)];
      if (told) told.textContent = time(moment);
      setCurrent(stepOf(moment));
    };
    fill(clock.at);
    return clock.follow(fill);
  }, [clock, flow, at, cut, marks.map((mark) => `${mark.id} ${mark.at}`).join()]);

  const [pointing, setPointing] = useState<{ step: number; u: number }>();
  const [named, setNamed] = useState<string>();
  const [held, setHeld] = useState<number>();
  // Where the pointer is along a line: the line it's over, in the same row as the one pressed, else that one.
  const along = (clientX: number, pressed: number) => {
    const row = lines.current[pressed]!.getBoundingClientRect().top;
    const step = lines.current.findIndex((line) => {
      const box = line?.getBoundingClientRect();
      return box && box.top === row && clientX >= box.left && clientX <= box.right;
    });
    const over = step < 0 ? pressed : step;
    const box = lines.current[over]!.getBoundingClientRect();
    return { step: over, x: clientX, u: clamp((clientX - box.left) / box.width, 0, 1), box };
  };
  const goTo = (clientX: number, pressed: number) => {
    const { step, x, u, box } = along(clientX, pressed);
    const near = marks.filter((mark) => stepOf(mark.at) === step).find((mark) => Math.abs(box.left + share(step, mark.at) * box.width - x) < 5);
    clock.set(near ? near.at : momentAt(step, u));
    setHeld(step);
  };
  // Like a video: a press on the line goes there and drags from there; on a dot or a diamond it's a press until it moves
  // a few pixels, then it drags too.
  const press = (event: PointerEvent, step: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const mark = (event.target as Element).closest<HTMLElement>("[data-mark]")?.dataset.mark;
    const [start, id] = [event.clientX, event.pointerId];
    let live = false;
    const begin = () => ((live = true), setPointing(undefined), onScrub(true));
    if (!mark) (begin(), goTo(start, step));
    const move = (moving: globalThis.PointerEvent) => {
      if (moving.pointerId !== id || (!live && Math.abs(moving.clientX - start) < 4)) return;
      if (!live) begin();
      goTo(moving.clientX, step);
    };
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      if (!live) return mark && onMark(mark);
      setHeld(undefined);
      onScrub(false);
      onGo(clock.at);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };
  const label = "pointer-events-none absolute bottom-[calc(100%-12px)] z-6 -translate-x-1/2 rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap shadow-tip transition-[opacity,translate] duration-150 ease-calm";

  return (
    <div role="group" aria-label={`The steps of ${flow.name}`} className={`grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-2 gap-y-1 ${className}`}>
      {flow.steps.map((step, i) => {
        const hot = held === i || (held === undefined && pointing?.step === i);
        const said = marks.find((mark) => mark.id === named && stepOf(mark.at) === i);
        const ghost = held === undefined && pointing?.step === i && !named;
        return (
          <div key={i} className="grid content-start">
            <div
              ref={(line) => void (lines.current[i] = line)}
              className="relative h-9 cursor-pointer touch-none select-none"
              onPointerDown={(event) => press(event, i)}
              onPointerMove={(event) => held === undefined && setPointing((event.target as Element).closest("[data-mark]") ? undefined : { step: i, u: along(event.clientX, i).u })}
              onPointerLeave={() => setPointing(undefined)}
            >
              <div className={`absolute inset-x-0 overflow-hidden bg-line transition-[top,height,border-radius] duration-150 ease-calm ${hot ? "top-4 h-1 rounded-[2px]" : "top-[17px] h-0.5 rounded-[1px]"}`}>
                <div className={`absolute inset-0 origin-left [transform:scaleX(var(--done,0))] ${hot ? "bg-soft" : "bg-faint"}`} />
              </div>
              {marks
                .filter((mark) => stepOf(mark.at) === i)
                .map((mark) => (
                  <button
                    key={mark.id}
                    ref={(dot) => void (dot ? dots.current.set(mark.id, dot) : dots.current.delete(mark.id))}
                    data-mark={mark.id}
                    aria-label={mark.words}
                    className="group/mark absolute top-[11px] z-3 grid size-3.5 -translate-x-1/2 place-items-center"
                    style={{ left: `${share(i, mark.at) * 100}%` }}
                    onPointerEnter={() => setNamed(mark.id)}
                    onPointerLeave={() => setNamed(undefined)}
                  >
                    {mark.fill ? (
                      <i className={`size-1.5 rounded-full shadow-[0_0_0_2px_var(--ground)] transition-[scale,opacity] duration-150 ease-calm group-hover/mark:scale-140 group-data-ahead/mark:opacity-45 ${mark.fill}`} />
                    ) : (
                      <i className="size-[7px] rotate-45 bg-fg shadow-[0_0_0_1.5px_var(--ground)] transition-[scale,background-color,box-shadow] duration-150 ease-calm group-hover/mark:scale-130 group-data-ahead/mark:bg-ground group-data-ahead/mark:shadow-[inset_0_0_0_1.5px_var(--fg),0_0_0_1.5px_var(--ground)]" />
                    )}
                  </button>
                ))}
              {i === current && (
                <div
                  className={`pointer-events-none absolute z-5 bg-fg transition-[top,bottom,width,margin,border-radius] duration-150 ease-calm ${hot ? "top-1.5 bottom-1.5 -ml-[1.5px] w-[3px] rounded-[1.5px]" : "top-[9px] bottom-[9px] -ml-px w-0.5 rounded-[1px]"}`}
                  style={{ left: "calc(var(--done, 0) * 100%)" }}
                />
              )}
              <div
                aria-hidden
                className={`pointer-events-none absolute top-1.5 bottom-1.5 z-4 -ml-[1.5px] w-[3px] rounded-[1.5px] bg-fg transition-opacity duration-120 ease-calm ${ghost ? "opacity-30" : "opacity-0"}`}
                style={{ left: `${(pointing?.step === i ? pointing.u : 0) * 100}%` }}
              />
              <span aria-hidden className={`${label} text-fg ${said ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0"}`} style={{ left: said ? `${share(i, said.at) * 100}%` : undefined }}>
                <span className="block max-w-[260px] truncate">{said?.words}</span>
              </span>
              <span aria-hidden className={`${label} text-soft tabular-nums ${!said && ghost ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0"}`} style={{ left: `${(pointing?.step === i ? pointing.u : 0) * 100}%` }}>
                {time(pointing?.step === i ? momentAt(i, pointing.u) : 0)}
              </span>
              <span
                ref={(told) => void (times.current[i] = told)}
                aria-hidden
                className={`${label} text-fg tabular-nums ${held === i ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0"}`}
                style={{ left: "calc(var(--done, 0) * 100%)" }}
              />
            </div>
            <button
              title={step.title}
              aria-current={i === current ? "step" : undefined}
              className="-mt-1 flex gap-1.5 text-left text-[13px] leading-[18px] text-soft transition-colors duration-150 ease-calm outline-none hover:text-fg focus-visible:text-fg aria-[current]:text-fg"
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
