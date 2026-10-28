// Under the recording: play, the time, and the line, which is the flow you're in end to end with its name under it,
// a dot for each note on it, a diamond where something new to you changed and a band over new steps. The line answers
// the pointer: under it the line thickens, the playhead grows, and a ghost of the playhead with its time says where a
// click lands. Nothing here changes width as it plays. Where someone took the flow over and carried on by hand, a fork
// leaves the line, folded like a thread: a sprout with its notes on the tip, one thing to point at and press, saying who
// and how many. Opened, by a press or by going to one of its notes in the column, it grows to run above the line as long as they were there, and plays like the rest
// of it. Only the one you're on is open.

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { time, type Flow } from "@mostlyworks/vantage-review";
import { CARD, clamp } from "./moments.ts";
import { useNow, type Forked, type Playhead } from "./playhead.ts";

// A note on the line: a dot at its moment, or a pill over its stretch, in its colour (a CSS colour).
export type Dot = { id: string; at: number; until?: number; ink: string; number: number; words: string; fork?: string };
// A fork off the flow: the moment it leaves at, and how long it runs.
export type ForkLine = { name: string; at: number; length: number };
// What changed, under the notes: a diamond at its moment, or a band over new steps, named as its row is. One the agent
// made for a note carries the note's dot on its corner, its number before its name. Lit, it's ringed: the change you're
// on, or what changed for the note you've opened.
export type Mark = { id: string; at: number; until?: number; name: string; note?: { number: number; ink: string }; lit: boolean };

type Props = {
  playhead: Playhead;
  dots: Dot[];
  onDot: (id: string) => void;
  marks: Mark[];
  onMark: (id: string) => void;
  live?: boolean;
  forks?: ForkLine[];
  // The one you're making in the app.
  growing?: ForkLine;
};

const DOT = 14;
// While you're in the app, the fork is this long, its open end breathing as what's under way does everywhere; let go,
// it runs on to its own end.
const UNDER_WAY = 64;
const OPEN_END = 18;
// The fork's curve, before its line: played up to a share of the whole fork is that far along the fork, not its line.
const CURVE = 12;
const filledTo = (share: number) => `calc(${(share * 100).toFixed(4)}% - ${(CURVE * (1 - share)).toFixed(2)}px)`;
// Of the line, so a fork of a moment can still be found and pressed.
const SHORTEST = 0.03;
// Folded, a fork is its curve and this much of its line; folded ones that would touch stand this far apart.
const SPROUT = 22;
const GAP = 6;

export function Timeline({ playhead, dots, onDot, marks, onMark, live, forks = [], growing }: Props) {
  const now = useNow(playhead);
  const flows = playhead.flows;
  // On a fork, the line is still its flow's.
  const of = (playhead.flow as Forked).fork;
  const flow = (of && flows.find((flow) => flow.name === of)) || playhead.flow;
  const here = flows.indexOf(flow);
  const onFork = forks.find((fork) => fork.name === playhead.flow.name);
  const line = useRef<HTMLDivElement>(null);
  // Where the pointer is on the line, and which line it's on: the flow's, or a fork's by its name.
  const [pointing, setPointing] = useState<{ at: number; fork?: string }>();
  const [scrubbing, setScrubbing] = useState(false);
  const [held, setHeld] = useState<string>();
  const [named, setNamed] = useState<string>();

  // Where a moment of a flow sits: the line is the flow you're in, and the others' marks wait at its ends, out of sight.
  const share = (on: Flow, at: number) => {
    const k = flows.indexOf(on);
    return k < here ? 0 : k > here ? 1 : clamp((at + CARD) / (on.length + CARD));
  };
  const percent = (on: Flow, at: number) => `${(share(on, at) * 100).toFixed(4)}%`;
  const pc = (share: number) => `${(share * 100).toFixed(4)}%`;

  // A fork runs as long as you were there, on the flow's clock, from where it leaves; one longer than what's left of the
  // flow ends with the line, which never moves for it. While you're there, it's a short one, under way, your place
  // where it opens.
  const grown = growing && (forks.find((fork) => fork.name === growing.name) ?? growing);
  const lines = [...forks.filter((fork) => fork.name !== grown?.name), ...(grown ? [grown] : [])];
  // In the app, the playhead rests at the end of the fork you're making; that one, or the one you're on, is open.
  const riding = grown ?? onFork;
  const reach = (fork: ForkLine) => {
    const start = share(flow, fork.at);
    return { start, end: Math.min(1, Math.max(share(flow, fork.length), start + SHORTEST)) };
  };
  const forkShare = (fork: ForkLine, at: number) => {
    const { start, end } = reach(fork);
    return fork.length <= fork.at ? end : start + ((clamp(at, fork.at, fork.length) - fork.at) / (fork.length - fork.at)) * (end - start);
  };
  const forkTimeAt = (fork: ForkLine, clientX: number) => {
    const box = line.current!.getBoundingClientRect();
    const { start, end } = reach(fork);
    return clamp(fork.at + ((clamp((clientX - box.left) / box.width) - start) / Math.max(0.0001, end - start)) * (fork.length - fork.at), fork.at, fork.length);
  };
  const dotShare = (dot: { at: number; fork?: string }) => {
    const fork = dot.fork ? lines.find((line) => line.name === dot.fork) : undefined;
    return fork ? forkShare(fork, dot.at) : share(flow, dot.at);
  };

  // Notes too close to tell apart stand side by side around their moment, each wide enough to click.
  const [wide, setWide] = useState(0);
  useEffect(() => {
    const measured = new ResizeObserver(([seen]) => setWide(seen!.contentRect.width));
    measured.observe(line.current!);
    return () => measured.disconnect();
  }, []);
  const apart = new Map<string, number>();
  const points = dots.filter((dot) => dot.until === undefined).sort((a, b) => a.at - b.at);
  for (let i = 0; i < points.length; ) {
    let j = i + 1;
    while (j < points.length && (share(flow, points[j]!.at) - share(flow, points[j - 1]!.at)) * wide < DOT) j++;
    points.slice(i, j).forEach((dot, k) => apart.set(dot.id, (k - (j - i - 1) / 2) * DOT));
    i = j;
  }

  // Each folded fork where it leaves, unless it would touch the one before: then just after it, with its notes. Its notes
  // sit along its tip, the first capping it.
  const notesOn = (fork: ForkLine) => dots.filter((dot) => dot.fork === fork.name).sort((a, b) => a.at - b.at);
  // Open, it's still kept there, folded, for it to fade back to.
  const sprouts = new Map<string, number>();
  let free = -Infinity;
  for (const fork of [...lines].sort((a, b) => a.at - b.at)) {
    const left = fork === riding ? share(flow, fork.at) * wide : Math.max(share(flow, fork.at) * wide, free);
    sprouts.set(fork.name, left);
    free = left + SPROUT + (fork === riding ? 0 : Math.max(0, notesOn(fork).length - 1) * DOT + DOT / 2) + GAP;
  }
  const folded = (fork: ForkLine | undefined) => !!fork && fork !== riding;
  const tipOf = (dot: Dot) => {
    const fork = lines.find((line) => line.name === dot.fork)!;
    return `calc(0% + ${sprouts.get(fork.name)! + SPROUT + 3 + notesOn(fork).indexOf(dot) * DOT}px)`;
  };
  const said = (fork: ForkLine) => {
    const count = notesOn(fork).length;
    return `${flows.find((flow) => flow.name === fork.name)?.person ?? "You"} · ${count} ${count === 1 ? "note" : "notes"}`;
  };

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
  // landing on one is easy. Measured to the moment itself: a note on a stretch is drawn across it, and its middle pulled
  // the playhead back to its start.
  const snap = (clientX: number, at: number) => {
    const box = line.current!.getBoundingClientRect();
    let best = at;
    let nearest = Infinity;
    for (const dot of line.current!.querySelectorAll<HTMLElement>("[data-at]")) {
      const moment = Number(dot.dataset.at);
      const off = Math.abs(clientX - (box.left + share(flow, moment) * box.width));
      if (off < 5 && off < nearest) [nearest, best] = [off, moment];
    }
    return best;
  };

  // Like a video: playing, the picture holds under the pointer while you drag and plays on from where you let go. A press
  // on a note or a change is a click until it moves a few pixels; from then on it scrubs like anywhere else on the line.
  const swallow = useRef(false);
  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const onDot = !!(event.target as Element).closest("[data-mark]");
    // Pressed on a fork, the drag goes along it; anywhere else, along the flow. A folded one opens, from where it leaves.
    const fork = forks.find((fork) => fork.name === (event.target as Element).closest("[data-fork]")?.getAttribute("data-fork"));
    if (folded(fork)) return void playhead.go({ flow: fork!.name, at: fork!.at });
    const to = (clientX: number) => (fork ? playhead.go({ flow: fork.name, at: forkTimeAt(fork, clientX) }) : playhead.go({ flow: flow.name, at: snap(clientX, timeAt(clientX)) }));
    const start = event.clientX;
    const id = event.pointerId;
    const playing = playhead.now.playing;
    let live = false;
    const begin = () => {
      live = true;
      setHeld(fork?.name ?? "");
      setScrubbing(true);
      playhead.scrub(true);
      line.current!.setPointerCapture(id);
    };
    if (!onDot) {
      begin();
      if (fork) to(start);
      else playhead.go({ flow: flow.name, at: timeAt(start) });
    }
    const move = (moving: globalThis.PointerEvent) => {
      if (moving.pointerId !== id) return;
      if (!live && Math.abs(moving.clientX - start) < 4) return;
      if (!live) begin();
      to(moving.clientX);
    };
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      if (!live) return;
      setHeld(undefined);
      if (onDot) {
        swallow.current = true;
        setTimeout(() => (swallow.current = false));
      }
      setScrubbing(false);
      playhead.scrub(false);
      // Let go at a flow's very end, it stops there, as playing to it would.
      if (playing && playhead.now.moment.at >= playhead.flow.length - 0.06) playhead.pause();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  const at = now.moment.at;
  const underWay = (fork: ForkLine) => `calc(${pc(share(flow, fork.at))} + ${UNDER_WAY - OPEN_END}px)`;
  const head = grown ? underWay(grown) : pc(onFork ? forkShare(onFork, at) : share(flow, at));
  const filled = riding ? percent(flow, riding.at) : head;
  // The line under the pointer, or being dragged along, thickens, and so does the playhead on it: "" for the flow's.
  const hot = held ?? pointing?.fork ?? (pointing ? "" : undefined);
  const headHot = hot !== undefined && hot === (riding ? riding.name : "");
  const thick = "-ml-[1.5px] w-[3px] rounded-[1.5px]";
  const moving = shifting ? "transition-[left,width,opacity] duration-300 ease-calm" : "";
  const label = "pointer-events-none absolute bottom-[calc(100%-1px)] -translate-x-1/2 rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap shadow-tip transition-[opacity,translate] duration-150 ease-calm";
  const dot = dots.find((dot) => dot.id === named);
  const mark = marks.find((mark) => mark.id === named);
  const tip = dot ?? mark;
  const pointedFork = pointing?.fork ? lines.find((line) => line.name === pointing.fork) : undefined;
  // A folded fork pointed at says whose it is and how many notes it holds, over its sprout, with no time to land on.
  const sprout = folded(pointedFork) ? pointedFork : undefined;
  const ghost = !scrubbing && pointing !== undefined && !tip && !sprout;
  const pointed = pointing === undefined ? undefined : sprout ? `${sprouts.get(sprout.name)! + SPROUT / 2}px` : pc(pointedFork ? forkShare(pointedFork, pointing.at) : share(flow, pointing.at));

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
      {/* Taken over, the time says Live in its place, in the room the time keeps, so nothing beside it moves. */}
      <span className="grid text-soft tabular-nums">
        <span className={`col-start-1 row-start-1 ${live ? "invisible" : ""}`}>
          {time(Math.max(0, at))}
          <small className="text-[smaller] text-faint"> / {time(flow.length)}</small>
        </span>
        {live && <span className="col-start-1 row-start-1 text-fg">Live</span>}
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
        onPointerMove={(event) => {
          if (scrubbing) return;
          const target = event.target as Element;
          const fork = lines.find((line) => line.name === target.closest("[data-fork]")?.getAttribute("data-fork"));
          setPointing(target.closest("[data-mark]") ? undefined : fork ? { at: forkTimeAt(fork, event.clientX), fork: fork.name } : { at: timeAt(event.clientX) });
        }}
        onPointerLeave={() => setPointing(undefined)}
      >
        {/* Over the forks, so each rises out of it rather than lying across it. */}
        <div className={`absolute inset-x-0 z-1 bg-line transition-[top,height,border-radius] duration-150 ease-calm ${hot === "" ? "top-4 h-1 rounded-[2px]" : "top-[17px] h-0.5 rounded-[1px]"}`}>
          <div
            className={`absolute top-0 left-0 h-full rounded-[inherit] ${hot === "" ? "bg-soft" : "bg-faint"} ${moving}`}
            style={{ width: filled }}
          />
        </div>
        {/* Each fork twice, open and folded, in the same place where it leaves: opening, one fades into the other, and
            nothing slides. Only the one shown can be pointed at. */}
        {lines.flatMap((fork) => {
          const { start, end } = reach(fork);
          const on = fork === riding;
          const going = fork === grown;
          const played = on ? (going ? 1 : forkShare(fork, at)) : start;
          const lit = hot === fork.name;
          // Faint until it's pointed at or played: an aside to the flow, there when you look for it.
          const ink = lit || on ? "var(--amber)" : "color-mix(in srgb, var(--amber) 40%, var(--ground))";
          const pale = `color-mix(in srgb, var(--amber) ${lit ? 45 : 25}%, var(--ground))`;
          // Folded, its notes are part of it: pressed anywhere along them, it opens.
          const along = 3 + Math.max(0, notesOn(fork).length - 1) * DOT + DOT / 2;
          const layer = (open: boolean) => (
            <div
              key={`${fork.name}/${open ? "open" : "folded"}`}
              data-fork={open === on ? fork.name : undefined}
              aria-label={open || on ? undefined : `${said(fork)}: open`}
              className={`absolute top-0 h-[11px] transition-[width,opacity] ease-calm ${open === on ? "opacity-100" : "pointer-events-none opacity-0"} ${going ? "duration-500" : "duration-200"}`}
              style={open ? { left: pc(start), width: going ? `${UNDER_WAY}px` : pc(end - start) } : { left: `calc(0% + ${sprouts.get(fork.name)}px)`, width: `${SPROUT}px` }}
            >
              <svg width={CURVE} height="14" aria-hidden className="pointer-events-none absolute top-1 left-0 overflow-visible">
                {/* One piece with the line it leaves and the line it runs into: as wide as its line, the colour of its start,
                    and square at both ends, so nothing shows where they meet. Its foot is under the flow's line. */}
                <path d="M0 13 C 6 13, 6 1, 12 1" fill="none" stroke={on ? ink : pale} strokeWidth={lit ? 4 : 2} className="transition-[stroke-width] duration-150 ease-calm" />
              </svg>
              <div
                aria-hidden
                className={`pointer-events-none absolute left-3 transition-[top,height,border-radius] duration-150 ease-calm ${going ? "right-[18px]" : "right-0"} ${lit ? "top-[3px] h-1 rounded-r-[2px]" : "top-1 h-0.5 rounded-r-[1px]"}`}
                style={{ background: going ? ink : `linear-gradient(90deg, ${ink} ${filledTo(open ? clamp((played - start) / Math.max(0.0001, end - start)) : 0)}, ${pale} 0)` }}
              />
              {!open && <span aria-hidden className="absolute -top-1 -bottom-1 -left-1" style={{ width: SPROUT + along + 4 }} />}
              {going && (
                <div
                  aria-hidden
                  className={`pointer-events-none absolute right-0 w-[18px] animate-breathe motion-reduce:animate-none ${lit ? "top-[3px] h-1 rounded-r-[2px]" : "top-1 h-0.5 rounded-r-[1px]"}`}
                  style={{ background: `linear-gradient(90deg, ${ink}, transparent)` }}
                />
              )}
            </div>
          );
          return [layer(true), layer(false)];
        })}
        {flows.filter((other) => !(other as Forked).fork).length > 1 &&
          flows.filter((other) => !(other as Forked).fork).map((other) => (
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
        {dots.flatMap((shown) => {
          // A fork's note is drawn on its tip too, and the two fade into each other as it opens and folds. On the tip,
          // it's ahead until the playhead passes where the fork leaves, and lights with the fork.
          const fork = shown.fork && shown.fork !== grown?.name ? lines.find((line) => line.name === shown.fork) : undefined;
          const tipped = folded(fork);
          const ahead = at < shown.at - 0.02;
          const played = shown.until === undefined ? 0 : clamp((at - shown.at) / (shown.until - shown.at)) * 100;
          const ink = shown.ink;
          const pale = `color-mix(in srgb, ${ink} 35%, var(--ground))`;
          const bead = "size-1.5 rounded-full shadow-[0_0_0_2px_var(--ground)] transition-[scale,background-color] duration-150 ease-calm";
          const onTip = fork && (
            <span
              key={`${shown.id}/tip`}
              aria-hidden
              className={`pointer-events-none absolute -top-0.5 z-4 grid size-3.5 -translate-x-1/2 place-items-center transition-opacity duration-200 ease-calm ${tipped ? "opacity-100" : "opacity-0"}`}
              style={{ left: tipOf(shown) }}
            >
              <span className={`${bead} ${tipped && hot === fork.name ? "scale-140" : ""}`} style={{ background: share(flow, at) < share(flow, fork.at) ? pale : ink }} />
            </span>
          );
          return [
            onTip,
            <button
              key={shown.id}
              data-mark
              data-at={shown.at}
              aria-label={`Note ${shown.number} at ${time(shown.at)}`}
              className={`group/dot absolute z-4 grid place-items-center ${fork ? `transition-opacity duration-200 ease-calm ${tipped ? "pointer-events-none opacity-0" : "opacity-100"}` : ""} ${shown.until === undefined ? `${shown.fork ? "-top-0.5" : "top-[11px]"} size-3.5 -translate-x-1/2` : "top-[15px] -ml-[3px] box-content h-1.5 rounded-[3px] px-[3px] shadow-[0_0_0_2px_var(--ground)] transition-[top,height,border-radius] duration-150 ease-calm hover:top-3.5 hover:h-2 hover:rounded-[4px]"} ${moving}`}
              style={{
                left: `calc(${shown.fork && shown.fork === grown?.name ? underWay(grown) : pc(dotShare(shown))} + ${apart.get(shown.id) ?? 0}px)`,
                ...(shown.until !== undefined && { width: `calc(${percent(flow, shown.until)} - ${percent(flow, shown.at)})`, background: `linear-gradient(90deg, ${ink} ${played}%, ${pale} ${played}%)` }),
              }}
              onPointerEnter={() => setNamed(shown.id)}
              onPointerLeave={() => setNamed(undefined)}
              onClick={() => !swallow.current && onDot(shown.id)}
            >
              {shown.until === undefined && (
                <span className={`${bead} group-hover/dot:scale-140`} style={{ background: ahead ? pale : ink }} />
              )}
            </button>,
          ];
        })}
        <div
          className={`pointer-events-none absolute z-5 bg-fg transition-[top,bottom,width,margin,border-radius] duration-150 ease-calm ${riding ? (headHot ? "-top-[3px] bottom-[21px]" : "-top-[2px] bottom-[22px]") : headHot ? "top-1.5 bottom-1.5" : "top-[9px] bottom-[9px]"} ${headHot ? thick : "-ml-px w-0.5 rounded-[1px]"} ${moving}`}
          style={{ left: head }}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute z-4 -ml-[1.5px] w-[3px] rounded-[1.5px] bg-fg transition-opacity duration-120 ease-calm ${pointedFork ? "-top-[3px] bottom-[21px]" : "top-1.5 bottom-1.5"} ${ghost ? "opacity-30" : "opacity-0"}`}
          style={{ left: pointed }}
        />
        <span aria-hidden className={`${label} z-300 text-fg ${tip ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0"}`} style={{ left: tip ? (dot ? (dot.fork && dot.fork === grown?.name ? underWay(grown) : pc(dotShare(dot))) : percent(flow, tip.until === undefined ? tip.at : (tip.at + tip.until) / 2)) : undefined }}>
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
          className={`${label} z-299 tabular-nums ${scrubbing || sprout ? "text-fg" : "text-soft"} ${!tip && (scrubbing || pointing !== undefined) ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0"}`}
          style={{ left: scrubbing ? head : pointed }}
        >
          {sprout && !scrubbing ? said(sprout) : time(Math.max(0, scrubbing ? at : (pointing?.at ?? 0)))}
        </span>
      </div>
    </>
  );
}
