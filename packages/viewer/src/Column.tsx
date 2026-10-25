// The column is the map. Every flow is drawn as the recording it is: a picture of its page, its name and its length.
// Under it, by time, a row for each note in it and for each diamond with something new to you. The flow you're in is one
// line down the column, from under its picture through its rows to its end, where it asks whether it's good, filled to
// where the playhead is. In general comes last. Nothing in it moves while it plays.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { time, type Flow, type Place, type Review, type Round } from "@vantage/review";
import { recording } from "./api.ts";
import { when, type Diamond } from "./changes.ts";
import { clamp } from "./moments.ts";
import type { Shown } from "./notes.ts";
import { useNow, type Playhead } from "./playhead.ts";
import { recorded } from "./replay.ts";

type Props = {
  review: Review;
  round: Round;
  playhead: Playhead;
  notes: Shown[];
  diamonds: Diamond[];
  // The row you've chosen, and the change you're on.
  chosen?: string;
  lit?: string;
  // Where each flow's line ends: asking whether it's good, saying it is, or nowhere.
  end: (flow: string) => "ask" | "good" | undefined;
  note: (note: Shown) => ReactNode;
  writing?: { on?: Place; box: ReactNode };
  onFlow: (flow: Flow) => void;
  onDiamond: (diamond: Diamond) => void;
  onEnd: (flow: string) => void;
  onGeneral?: () => void;
};

// A flow's rows, as the column lists them and Up and Down go through them: a note on a moment and a change by their time,
// and a note on the whole flow last, since it answers the flow as a whole.
export type Row = ({ note: Shown } | { diamond: Diamond }) & { at: number };
export function rowsIn(flow: string, notes: Shown[], diamonds: Diamond[]): Row[] {
  const rows: Row[] = [
    ...notes.filter((note) => note.on?.flow === flow).map((note) => ({ note, at: note.on?.at ?? Infinity })),
    ...diamonds.filter((diamond) => diamond.flow === flow).map((diamond) => ({ diamond, at: diamond.at })),
  ];
  return rows.sort((a, b) => a.at - b.at);
}

export function Column(props: Props) {
  const { round, notes, writing } = props;
  const watching = useNow(props.playhead, (now) => now.moment.flow);
  const map = useRef<HTMLDivElement>(null);

  // Playing on into the next flow brings its heading into view, if it's out of view.
  useEffect(() => {
    const heading = map.current?.querySelector(`[data-flow="${CSS.escape(watching)}"]`);
    heading?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [watching]);

  const general = notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  return (
    <div
      ref={map}
      className="relative isolate grid min-h-0 flex-1 auto-rows-max content-start gap-px overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [--ahead:color-mix(in_srgb,var(--faint)_45%,var(--ground))] [--rail:var(--soft)]"
    >
      {round.flows.map((flow) => {
        const rows = rowsIn(flow.name, notes, props.diamonds).map((row) => ({
          at: row.at,
          shown: "note" in row ? props.note(row.note) : <ChangeRow {...props} key={row.diamond.id} diamond={row.diamond} />,
        }));
        // What you're writing sits where it will once it's saved.
        if (writing?.on?.flow === flow.name) {
          const at = writing.on.at ?? Infinity;
          rows.splice(rows.filter((row) => row.at <= at).length, 0, { at, shown: <div key="writing">{writing.box}</div> });
        }
        return (
          <FlowBlock {...props} key={flow.name} flow={flow} on={flow.name === watching} end={props.end(flow.name)}>
            {rows.map(({ shown }) => shown)}
          </FlowBlock>
        );
      })}
      <div className="mt-2 grid grid-cols-[64px_minmax(0,1fr)_18px] items-center gap-x-3 py-1.5 pr-2.5 pl-[18px]">
        <span className="relative grid h-10 w-16 place-items-center rounded-[5px] text-faint shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden>
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
            <path d="M3 3.5h10a1 1 0 011 1v5.5a1 1 0 01-1 1H7l-3 2.5V11H3a1 1 0 01-1-1V4.5a1 1 0 011-1z" />
          </svg>
        </span>
        <span className="grid min-w-0 gap-1.5">
          <span className="truncate text-[13px] leading-[17px] font-semibold">In general</span>
          <span className="flex min-h-[18px] items-center text-[11.5px] leading-[14px] text-faint">About everything</span>
        </span>
        {props.onGeneral && (
          <button className="group/add relative grid size-[18px] place-items-center rounded-full text-faint transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg" aria-label="Add a general note" onClick={props.onGeneral}>
            <svg viewBox="0 0 12 12" className="size-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
              <path d="M6 2.5v7M2.5 6h7" />
            </svg>
            <span className="pointer-events-none absolute top-1/2 right-[calc(100%+6px)] translate-x-[2px] -translate-y-1/2 rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] font-normal whitespace-nowrap text-fg opacity-0 shadow-tip transition-[opacity,translate] duration-150 ease-calm group-hover/add:translate-x-0 group-hover/add:opacity-100">
              Add a general note
            </span>
          </button>
        )}
      </div>
      {(general.length > 0 || (writing && !writing.on)) && (
        <div className="-mt-1 grid gap-1.5 pb-1">
          {general.map(props.note)}
          {writing && !writing.on && writing.box}
        </div>
      )}
    </div>
  );
}

function FlowBlock(props: Omit<Props, "end"> & { flow: Flow; on: boolean; end?: "ask" | "good"; children: ReactNode }) {
  const { flow, on, end, playhead } = props;
  const block = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  useLine(block, line, playhead, flow, on);
  const playing = useNow(playhead, (now) => now.playing && now.moment.flow === flow.name);
  return (
    <div ref={block} data-here={on ? "" : undefined} className={`relative ${end === "good" ? "[--rail:var(--green)]" : ""}`}>
      <div
        data-flow={flow.name}
        role="button"
        tabIndex={0}
        aria-label={`${playing ? "Pause" : "Play"} ${flow.name}`}
        className="group/head relative mt-2 grid cursor-pointer grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 rounded-r-lg py-1.5 pr-2.5 pl-[18px] text-[13px] font-semibold text-fg"
        onMouseDown={keepKeys}
        onClick={() => props.onFlow(flow)}
        onKeyDown={(event) => event.key === "Enter" && props.onFlow(flow)}
      >
        <Still review={props.review} round={props.round} flow={flow} playing={playing} />
        {end === "good" && (
          <span className={`absolute top-[calc(50%+11px)] left-[18px] z-2 transition-opacity duration-200 ease-calm ${on ? "opacity-0" : ""}`} aria-label={`${flow.name} looks good`}>
            <Tick corner />
          </span>
        )}
        <span className="grid min-w-0 gap-1.5">
          <span className="line-clamp-2 leading-[17px]">{flow.name}</span>
          <span className="flex min-h-[18px] items-center text-[11.5px] leading-[14px] font-normal text-faint tabular-nums">{time(flow.length)}</span>
        </span>
      </div>
      <div className={`relative -mt-1 grid gap-1.5 pb-1 transition-[padding-top] duration-300 ease-calm ${on ? "pt-3" : ""}`}>
        {flow.line && (
          <div className={`grid text-xs leading-[1.45] transition-[grid-template-rows,opacity,visibility] duration-300 ease-calm ${on ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"}`}>
            <div className="min-h-0 overflow-hidden pl-[44px]">
              <span className="block text-[11.5px] text-faint">{props.round.by}</span>
              <span className="block pb-2 text-soft">{flow.line}</span>
            </div>
          </div>
        )}
        {props.children}
      </div>
      {end && (
        <div
          data-stop={flow.length}
          data-end
          role="button"
          tabIndex={on ? 0 : -1}
          className={`group/end flex cursor-pointer items-center gap-2 overflow-hidden pl-[18px] text-[12.5px] transition-[height,opacity,visibility] duration-300 ease-calm ${on ? "visible h-8 opacity-100" : "invisible h-0 opacity-0"} ${end === "good" ? "text-green" : "text-faint hover:text-soft"}`}
          onMouseDown={keepKeys}
          onClick={() => props.onEnd(flow.name)}
        >
          {end === "good" ? (
            <span data-mark className="relative z-1">
              <Tick />
            </span>
          ) : (
            <span data-mark className="relative z-1 size-[18px] rounded-full bg-ground shadow-[inset_0_0_0_1.5px_var(--ahead)] transition-shadow duration-150 ease-calm group-hover/end:shadow-[inset_0_0_0_1.5px_var(--amber)]" />
          )}
          {end === "good" ? "Looks good" : "Is it good?"}
        </div>
      )}
      <div ref={line} aria-hidden className={`pointer-events-none absolute inset-y-0 left-[calc(27px-0.75px)] z-0 w-[1.5px] transition-opacity duration-250 ease-calm ${on ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}

// Clicking a row leaves the keys where they were, so Up and Down afterwards don't ring the row as if you'd tabbed to it.
const keepKeys = (event: { preventDefault: () => void }) => event.preventDefault();

// A change's row is shaped like a note's: its diamond on the flow's line, filling once the playhead has passed it, its
// name, wrapping onto a second line rather than cutting, and its time.
function ChangeRow({ diamond, chosen, lit, onDiamond }: Props & { diamond: Diamond }) {
  const marked = chosen === diamond.id || lit === diamond.id;
  return (
    <button
      data-stop={diamond.at}
      className={`relative grid grid-cols-[18px_minmax(0,1fr)] gap-2 rounded-r-lg py-1.5 pr-2.5 pl-[18px] text-left transition-colors duration-150 ease-calm hover:bg-hover ${marked ? "bg-hover" : ""}`}
      onMouseDown={keepKeys}
      onClick={() => onDiamond(diamond)}
    >
      <span data-mark className="group/mark relative z-1 mt-px grid size-[18px] place-items-center">
        <i className="size-2 rotate-45 bg-ground shadow-[inset_0_0_0_1.5px_var(--fg),0_0_0_2.5px_var(--ground)] group-data-played/mark:bg-fg group-data-played/mark:shadow-[0_0_0_2.5px_var(--ground)]" />
      </span>
      <span className="block max-h-10 min-w-0 overflow-hidden">
        <span className="float-right ml-2 inline-flex h-5 min-w-[78px] items-center justify-end text-xs text-faint tabular-nums">{when(diamond)}</span>
        <span className="block leading-5 [overflow-wrap:anywhere]">{diamond.name}</span>
      </span>
    </button>
  );
}

// The flow's tick, green once it looks good: on its picture's corner, or where its line ends.
function Tick({ corner }: { corner?: boolean }) {
  return (
    <span
      className={`grid size-[18px] place-items-center rounded-full bg-green text-white ${corner ? "shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--green)_70%,var(--fg)),0_0_0_1.5px_var(--ground)]" : "shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--green)_70%,var(--fg))]"}`}
    >
      <svg viewBox="0 0 12 12" className="size-[11px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.8 6.2l2.2 2.2 4.2-4.6" />
      </svg>
    </span>
  );
}

// A flow's picture: its page just before its last step, close on what that step clicks, so flows on one page look
// different. Pointing at the heading puts the play mark over it, as on any video.
function Still({ review, round, flow, playing }: { review: Review; round: Round; flow: Flow; playing: boolean }) {
  const shown = Math.max(1, flow.steps.length - 1);
  const [close, setClose] = useState<{ x: number; y: number; width: number; height: number }>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let current = true;
    const last = flow.steps.at(-1);
    if (flow.steps.length > 1 && last)
      recording(review.id, round.number, flow.recording).then((events) => {
        const { width, height, clicks, pointer } = recorded(events);
        const click = clicks.find((click) => click >= last.at);
        const point = click === undefined ? undefined : pointer.findLast(([moment]) => moment <= click + 0.01)?.slice(1);
        if (current && point && Math.abs(width / height - 1.6) < 0.05) setClose({ x: point[0]!, y: point[1]!, width, height });
      });
    return () => void (current = false);
  }, [review.id, round.number, flow]);

  // Two and a half times closer, centred on the click and kept inside the page.
  const zoom = 2.5;
  const scale = close && (64 * zoom) / close.width;
  const placed = close && scale
    ? { width: 64 * zoom, height: close.height * scale, left: clamp(32 - close.x * scale, 64 - close.width * scale, 0), top: clamp(20 - close.y * scale, 40 - close.height * scale, 0) }
    : undefined;
  return (
    <span data-still className="relative grid h-10 w-16 place-items-center overflow-hidden rounded-[5px] bg-hover after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden>
      {!missing && (
        <img
          src={`/api/reviews/${review.id}/rounds/${round.number}/files/readings/${flow.recording.replace(/\.json$/, "")}/${shown}.png`}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute transition-opacity duration-150 ease-calm group-hover/head:opacity-80 ${placed ? "max-w-none" : "inset-0 size-full object-contain"}`}
          style={placed && { width: placed.width, height: placed.height, left: placed.left, top: placed.top }}
          onError={() => setMissing(true)}
        />
      )}
      <span className="absolute top-[calc(50%-11px)] left-[calc(50%-11px)] z-2 grid size-[22px] scale-70 place-items-center rounded-full bg-ground text-fg opacity-0 transition-[opacity,scale] duration-150 ease-calm group-hover/head:scale-100 group-hover/head:opacity-100">
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3">
          {playing ? (
            <>
              <rect x="5.5" y="4.5" width="3" height="11" rx="1" />
              <rect x="11.5" y="4.5" width="3" height="11" rx="1" />
            </>
          ) : (
            <path d="M7 4.8v10.4c0 .6.7 1 1.2.6l8-5.2a.7.7 0 000-1.2l-8-5.2c-.5-.4-1.2 0-1.2.6z" />
          )}
        </svg>
      </span>
    </span>
  );
}

// The flow's line, drawn in pieces between its stops so it never runs through a number or a diamond: filled in the
// line's ink to where the playhead is, from one stop to the next at one steady pace, and pale ahead. Each number on it
// sits in a ring of the line, drawn round both its sides together as the playhead passes. The other flows' lines wait
// out of sight, full if you've been through them, empty if not.
function useLine(block: RefObject<HTMLDivElement | null>, line: RefObject<HTMLDivElement | null>, playhead: Playhead, flow: Flow, on: boolean) {
  const paint = () => {
    const room = block.current;
    const drawn = line.current;
    if (!room || !drawn) return;
    const top = room.getBoundingClientRect().top;
    const still = room.querySelector("[data-still]")!.getBoundingClientRect();
    const stops = [...room.querySelectorAll<HTMLElement>("[data-stop]")].map((row) => {
      const mark = row.querySelector<HTMLElement>("[data-mark]")!;
      const box = mark.getBoundingClientRect();
      return { at: Number(row.dataset.stop), top: box.top - top, bottom: box.bottom - top, mark, end: row.hasAttribute("data-end") };
    });
    if (!stops.length) return drawn.replaceChildren();

    // Each piece runs from just past one stop to just before the next; the last ends inside the flow's end, if it has one.
    const pieces: [number, number][] = [];
    let from = still.bottom - top + 5;
    for (const stop of stops) {
      pieces.push([from, stop.end ? stop.top + 1 : stop.top - 2.75]);
      from = stop.bottom + 2.75;
    }
    // Where the playhead is along it: each stop is passed in an instant, so stopping on one stops on it full.
    const points: [number, number][] = [[0, still.bottom - top + 5]];
    const pass = (at: number, y: number) => points.push([Math.max(at, points.at(-1)![0] + 0.001), y]);
    for (const stop of stops) {
      const at = clamp(stop.at, points.at(-1)![0], flow.length);
      if (stop.end) pass(flow.length, (stop.top + stop.bottom) / 2);
      else pass(at - 0.001, stop.top - 3), pass(at, stop.bottom + 3);
    }
    if (!stops.at(-1)!.end) pass(flow.length - 0.02, stops.at(-1)!.bottom + 3);

    const { moment } = playhead.now;
    const here = playhead.flows.findIndex((other) => other.name === moment.flow);
    const mine = playhead.flows.findIndex((other) => other.name === flow.name);
    const at = on ? moment.at : mine < here ? Infinity : -Infinity;
    const y = along(points, at);

    while (drawn.children.length > pieces.length) drawn.lastChild!.remove();
    while (drawn.children.length < pieces.length) drawn.append(Object.assign(document.createElement("i"), { className: "absolute left-0 w-full" }));
    pieces.forEach(([start, end], i) => {
      const piece = drawn.children[i] as HTMLElement;
      const filled = clamp((y - start) / Math.max(1, end - start)) * 100;
      Object.assign(piece.style, { top: `${start}px`, height: `${Math.max(0, end - start)}px` });
      // Filled all the way it's one colour, so no hairline of pale is left at its foot.
      piece.style.background = filled >= 100 ? "var(--rail)" : `linear-gradient(var(--rail) ${filled}%, var(--ahead) ${filled}%)`;
    });
    for (const stop of stops) {
      stop.mark.style.setProperty("--a", `${(clamp((y - stop.top + 3) / (stop.bottom - stop.top + 6)) * 180).toFixed(1)}deg`);
      stop.mark.toggleAttribute("data-played", at >= stop.at - 0.001);
    }
  };
  useLayoutEffect(paint);
  useEffect(() => playhead.subscribe(paint), [playhead]);
  useEffect(() => {
    const observer = new ResizeObserver(() => paint());
    if (block.current) observer.observe(block.current);
    return () => observer.disconnect();
  }, []);
}

// The line's end at a moment, straight between the points [moment, y].
function along(points: [number, number][], at: number): number {
  if (at <= points[0]![0]) return points[0]![1];
  if (at >= points.at(-1)![0]) return points.at(-1)![1];
  let k = 0;
  while (at >= points[k + 1]![0]) k++;
  const [a, b] = [points[k]!, points[k + 1]!];
  return a[1] + ((at - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
}
