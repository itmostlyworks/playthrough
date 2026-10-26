// Under the recording: play, the time, and the line, which is the flow you're in end to end with its name under it,
// a dot for each note on it, a diamond where something new to you changed and a band over new steps. The line answers
// the pointer: under it the line thickens, the playhead grows, and a ghost of the playhead with its time says where a
// click lands. Nothing here changes width as it plays.

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { time, type Flow } from "@mostlyworks/vantage-review";
import { CARD, clamp } from "./moments.ts";
import { useNow, type Playhead } from "./playhead.ts";

// A note on the line: a dot at its moment, or a pill over its stretch, in its colour (a CSS colour).
export type Dot = { id: string; at: number; until?: number; ink: string; number: number; words: string };
// What changed, under the notes: a diamond at its moment, or a band over new steps, named as its row is. One the agent
// made for a note carries the note's dot on its corner, its number before its name. Lit, it's ringed: the change you're
// on, or what changed for the note you've opened.
export type Mark = { id: string; at: number; until?: number; name: string; note?: { number: number; ink: string }; lit: boolean };

type Props = { playhead: Playhead; dots: Dot[]; onDot: (id: string) => void; marks: Mark[]; onMark: (id: string) => void };

export function Timeline({ playhead, dots, onDot, marks, onMark }: Props) {
  const now = useNow(playhead);
  const flow = playhead.flow;
  const flows = playhead.flows;
  const here = flows.indexOf(flow);
  const line = useRef<HTMLDivElement>(null);
  const [pointing, setPointing] = useState<number>();
  const [scrubbing, setScrubbing] = useState(false);
  const [named, setNamed] = useState<string>();

  // Where a moment of a flow sits: the line is the flow you're in, and the others' marks wait at its ends, out of sight.
  const share = (on: Flow, at: number) => {
    const k = flows.indexOf(on);
    return k < here ? 0 : k > here ? 1 : clamp((at + CARD) / (on.length + CARD));
  };
  const percent = (on: Flow, at: number) => `${(share(on, at) * 100).toFixed(4)}%`;

  // Crossing into another flow opens it up in one smooth shift, never while you're dragging.
  const [shifting, setShifting] = useState(false);
  const shown = useRef(flow.name);
  useEffect(() => {
    if (shown.current === flow.name) return;
    shown.current = flow.name;
    if (scrubbing) return;
    setShifting(true);
    const done = setTimeout(() => setShifting(false), 400);
    return () => clearTimeout(done);
  }, [flow.name, scrubbing]);

  // A drag stays inside the open flow and holds at its edges.
  const timeAt = (clientX: number) => {
    const box = line.current!.getBoundingClientRect();
    return -CARD + clamp((clientX - box.left) / box.width, 0, 0.9995) * (flow.length + CARD);
  };
  // While you drag, the playhead settles onto a note's or a change's moment when it comes within a few pixels, so
  // landing on one is easy.
  const snap = (clientX: number, at: number) => {
    let best = at;
    let nearest = Infinity;
    for (const dot of line.current!.querySelectorAll<HTMLElement>("[data-at]")) {
      const box = dot.getBoundingClientRect();
      const off = Math.abs(clientX - (box.left + box.width / 2));
      if (off < 5 && off < nearest) [nearest, best] = [off, Number(dot.dataset.at)];
    }
    return best;
  };

  // Like a video: playing, the picture holds under the pointer while you drag and plays on from where you let go. A press
  // on a note or a change is a click until it moves a few pixels; from then on it scrubs like anywhere else on the line.
  const swallow = useRef(false);
  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const onDot = !!(event.target as Element).closest("[data-mark]");
    const start = event.clientX;
    const id = event.pointerId;
    const playing = playhead.now.playing;
    let live = false;
    const begin = () => {
      live = true;
      setScrubbing(true);
      playhead.scrub(true);
      line.current!.setPointerCapture(id);
    };
    if (!onDot) {
      begin();
      playhead.seek(timeAt(start));
    }
    const move = (moving: globalThis.PointerEvent) => {
      if (moving.pointerId !== id) return;
      if (!live && Math.abs(moving.clientX - start) < 4) return;
      if (!live) begin();
      playhead.seek(snap(moving.clientX, timeAt(moving.clientX)));
    };
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      if (!live) return;
      if (onDot) {
        swallow.current = true;
        setTimeout(() => (swallow.current = false));
      }
      setScrubbing(false);
      playhead.scrub(false);
      // Let go at a flow's very end, it stops there, as playing to it would.
      if (playing && playhead.now.moment.at >= flow.length - 0.06) playhead.pause();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  const at = now.moment.at;
  const head = percent(flow, at);
  const inHand = "group-hover/line:top-1.5 group-hover/line:bottom-1.5 group-hover/line:-ml-[1.5px] group-hover/line:w-[3px] group-hover/line:rounded-[1.5px] group-data-scrubbing/line:top-1.5 group-data-scrubbing/line:bottom-1.5 group-data-scrubbing/line:-ml-[1.5px] group-data-scrubbing/line:w-[3px] group-data-scrubbing/line:rounded-[1.5px]";
  const moving = shifting ? "transition-[left,width,opacity] duration-300 ease-calm" : "";
  const label = "pointer-events-none absolute bottom-[calc(100%-1px)] -translate-x-1/2 rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap shadow-tip transition-[opacity,translate] duration-150 ease-calm";
  const dot = dots.find((dot) => dot.id === named);
  const mark = marks.find((mark) => mark.id === named);
  const tip = dot ?? mark;
  const ghost = !scrubbing && pointing !== undefined && !tip;

  return (
    <>
      <button
        className="grid size-7 flex-none place-items-center rounded-full text-fg transition-colors duration-150 ease-calm hover:bg-hover"
        aria-label={now.playing ? "Pause" : "Play"}
        onClick={() => playhead.toggle()}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden>
          {now.playing ? (
            <>
              <rect x="5.5" y="4.5" width="3" height="11" rx="1" />
              <rect x="11.5" y="4.5" width="3" height="11" rx="1" />
            </>
          ) : (
            <path d="M7 4.8v10.4c0 .6.7 1 1.2.6l8-5.2a.7.7 0 000-1.2l-8-5.2c-.5-.4-1.2 0-1.2.6z" />
          )}
        </svg>
      </button>
      <span className="text-soft tabular-nums">
        {time(Math.max(0, at))}
        <small className="text-[smaller] text-faint"> / {time(flow.length)}</small>
      </span>
      <div
        ref={line}
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={flow.length}
        aria-valuenow={Math.max(0, at)}
        data-scrubbing={scrubbing ? "" : undefined}
        className="group/line relative h-9 min-w-30 flex-[1_1_160px] cursor-pointer touch-none select-none"
        onPointerDown={press}
        // Pressing it with the pointer leaves the keys where they were, so Space afterwards doesn't ring the whole line.
        onMouseDown={(event) => event.preventDefault()}
        onPointerMove={(event) => !scrubbing && setPointing((event.target as Element).closest("[data-mark]") ? undefined : timeAt(event.clientX))}
        onPointerLeave={() => setPointing(undefined)}
      >
        <div className="absolute inset-x-0 top-[17px] h-0.5 rounded-[1px] bg-line transition-[top,height,border-radius] duration-150 ease-calm group-hover/line:top-4 group-hover/line:h-1 group-hover/line:rounded-[2px] group-data-scrubbing/line:top-4 group-data-scrubbing/line:h-1 group-data-scrubbing/line:rounded-[2px]">
          <div
            className={`absolute top-0 left-0 h-full rounded-[inherit] bg-faint group-hover/line:bg-soft group-data-scrubbing/line:bg-soft ${moving}`}
            style={{ width: head }}
          />
        </div>
        {flows.length > 1 &&
          flows.map((other) => (
            <span
              key={other.name}
              className={`pointer-events-none absolute top-[23px] truncate text-[10.5px] leading-3 whitespace-nowrap text-faint ${other === flow ? "" : "invisible opacity-0"} ${moving || "transition-opacity duration-300"}`}
              style={{ left: percent(other, -CARD), width: `calc(${percent(other, other.length)} - ${percent(other, -CARD)})` }}
            >
              {other.name}
            </span>
          ))}
        {marks.map((shown) => {
          const pointed = { onPointerEnter: () => setNamed(shown.id), onPointerLeave: () => setNamed(undefined), onClick: () => !swallow.current && onMark(shown.id) };
          const left = percent(flow, shown.at);
          if (shown.until !== undefined)
            return (
              <button
                key={shown.id}
                data-mark
                aria-label={`${shown.name}, ${time(shown.at)} to ${time(shown.until)}`}
                className={`absolute top-[13px] z-0 h-2.5 rounded-[5px] bg-[color-mix(in_srgb,var(--fg)_16%,transparent)] transition-[background-color,box-shadow] duration-150 ease-calm hover:bg-[color-mix(in_srgb,var(--fg)_26%,transparent)] ${shown.lit ? "shadow-[inset_0_0_0_1.5px_var(--fg)]" : ""} ${moving}`}
                style={{ left, width: `calc(${percent(flow, shown.until)} - ${left})` }}
                {...pointed}
              />
            );
          // Hollow ahead of the playhead and filled once passed, as a dot fills; ringed while it's the one you're on.
          const look = at < shown.at - 0.02
            ? shown.lit
              ? "bg-ground shadow-[inset_0_0_0_1.5px_var(--fg),0_0_0_1.5px_var(--ground),0_0_0_3px_var(--fg)]"
              : "bg-ground shadow-[inset_0_0_0_1.5px_var(--fg),0_0_0_1.5px_var(--ground)]"
            : shown.lit
              ? "bg-fg shadow-[0_0_0_1.5px_var(--ground),0_0_0_3px_var(--fg)]"
              : "bg-fg shadow-[0_0_0_1.5px_var(--ground)]";
          return (
            <button key={shown.id} data-mark data-at={shown.at} aria-label={`${shown.name}, ${time(shown.at)}`} className={`group/mark absolute top-[11px] z-3 -ml-[7px] grid size-3.5 place-items-center ${moving}`} style={{ left }} {...pointed}>
              <i className={`size-[7px] rotate-45 transition-[scale,background-color] duration-150 ease-calm group-hover/mark:scale-130 ${look}`} />
              {shown.note && <b className="absolute top-[calc(50%-8px)] left-[calc(50%+2px)] size-1.5 rounded-full shadow-[0_0_0_1.5px_var(--ground)]" style={{ background: shown.note.ink }} />}
            </button>
          );
        })}
        {dots.map((shown) => {
          const ahead = at < shown.at - 0.02;
          const played = shown.until === undefined ? 0 : clamp((at - shown.at) / (shown.until - shown.at)) * 100;
          const ink = shown.ink;
          const pale = `color-mix(in srgb, ${ink} 35%, var(--ground))`;
          return (
            <button
              key={shown.id}
              data-mark
              data-at={shown.at}
              aria-label={`Note ${shown.number} at ${time(shown.at)}`}
              className={`group/dot absolute z-4 grid place-items-center ${shown.until === undefined ? "top-[11px] size-3.5 -translate-x-1/2" : "top-[15px] -ml-[3px] box-content h-1.5 rounded-[3px] px-[3px] shadow-[0_0_0_2px_var(--ground)] transition-[top,height,border-radius] duration-150 ease-calm hover:top-3.5 hover:h-2 hover:rounded-[4px]"} ${moving}`}
              style={{
                left: percent(flow, shown.at),
                ...(shown.until !== undefined && { width: `calc(${percent(flow, shown.until)} - ${percent(flow, shown.at)})`, background: `linear-gradient(90deg, ${ink} ${played}%, ${pale} ${played}%)` }),
              }}
              onPointerEnter={() => setNamed(shown.id)}
              onPointerLeave={() => setNamed(undefined)}
              onClick={() => !swallow.current && onDot(shown.id)}
            >
              {shown.until === undefined && (
                <span
                  className="size-1.5 rounded-full shadow-[0_0_0_2px_var(--ground)] transition-[scale,background-color] duration-150 ease-calm group-hover/dot:scale-140"
                  style={{ background: ahead ? pale : ink }}
                />
              )}
            </button>
          );
        })}
        <div className={`pointer-events-none absolute top-[9px] bottom-[9px] z-5 -ml-px w-0.5 rounded-[1px] bg-fg transition-[top,bottom,width,margin,border-radius] duration-150 ease-calm ${inHand} ${moving}`} style={{ left: head }} />
        <div
          aria-hidden
          className={`pointer-events-none absolute top-1.5 bottom-1.5 z-4 -ml-[1.5px] w-[3px] rounded-[1.5px] bg-fg transition-opacity duration-120 ease-calm ${ghost ? "opacity-30" : "opacity-0"}`}
          style={{ left: pointing === undefined ? undefined : percent(flow, pointing) }}
        />
        <span aria-hidden className={`${label} z-300 text-fg ${tip ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0"}`} style={{ left: tip ? percent(flow, tip.until === undefined ? tip.at : (tip.at + tip.until) / 2) : undefined }}>
          {dot && (
            <>
              <b className="mr-[5px] font-semibold text-amber-ink">{dot.number}</b>
              {dot.words}
            </>
          )}
          {mark?.note && <b className="mr-[5px] font-semibold text-amber-ink">{mark.note.number}</b>}
          {mark?.name}
        </span>
        <span
          aria-hidden
          className={`${label} z-299 tabular-nums ${scrubbing ? "text-fg" : "text-soft"} ${!tip && (scrubbing || pointing !== undefined) ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0"}`}
          style={{ left: scrubbing ? head : pointing === undefined ? undefined : percent(flow, pointing) }}
        >
          {time(Math.max(0, scrubbing ? at : (pointing ?? 0)))}
        </span>
      </div>
    </>
  );
}
