// Every flow at once: where you arrive on a round with more than one flow, and where "All flows" brings you back. Each
// flow is a tile: its picture, its name, its length and where it stands. What needs you is large and the rest a quiet row
// under it, so the grid has the shape of the work left. A tile opens on what's new in it, resting on one plays its story,
// and choosing one plays it. Over the tiles, the work, the round and what's left, and the one step to take.

import { useEffect, useLayoutEffect, useRef, type PointerEvent, type RefObject } from "react";
import { time, type Flow, type Review, type Round } from "@mostlyworks/vantage-review";
import type { Diamond } from "./changes.ts";
import { TickMark } from "./Column.tsx";
import { Agent, Go, says, type Step } from "./Foot.tsx";
import type { Standing } from "./notes.ts";
import { onPhone } from "./phone.ts";
import { Picture, useFirstNew, useStill, useStory, type Frame } from "./Picture.tsx";
import { roundName } from "./Rounds.tsx";

type Props = {
  room: RefObject<HTMLDivElement | null>;
  review: Review;
  round: Round;
  up: boolean;
  standing: (flow: string) => Standing | undefined;
  needs: (flow: string) => boolean;
  // What's new to you, which tiles open on.
  diamonds: Diamond[];
  // Accepted, how it got there, in fixed words.
  accepted?: string;
  step?: Step;
  // When the grid came back after you accepted: each flow's tick lands in turn.
  done?: number;
  onFlow: (flow: string) => void;
};

export function Grid(props: Props) {
  const { review, round, up, step } = props;
  const grid = useRef<HTMLDivElement>(null);
  const toCheck = round.flows.filter((flow) => props.needs(flow.name)).length;
  const fold = toCheck > 0 && toCheck < round.flows.length && !review.accepted;
  useLayoutEffect(() => lay(grid.current!));
  useEffect(() => {
    const observer = new ResizeObserver(() => lay(grid.current!));
    observer.observe(grid.current!);
    return () => observer.disconnect();
  }, []);

  // Just accepted, the ticks land across then down, for the first few seconds only: coming back later, it's simply done.
  const ago = props.done === undefined ? Infinity : performance.now() - props.done;
  let landing = 0;
  const tile = (flow: Flow, small: boolean) => (
    <Tile key={flow.name} {...props} flow={flow} small={small} wave={ago < 3000 && props.standing(flow.name)?.is === "good" ? 450 + landing++ * 110 - ago : undefined} />
  );
  const left = review.accepted ? null : toCheck ? (
    <>
      {" "}
      <span className="ml-1.5 whitespace-nowrap text-fg before:mr-[5px] before:mb-px before:ml-px before:inline-block before:size-1.5 before:rounded-full before:bg-amber before:align-middle before:content-['']">
        {toCheck} {toCheck === 1 ? "flow" : "flows"} to check
      </span>
    </>
  ) : round.flows.every((flow) => props.standing(flow.name)?.is === "good") ? (
    " · All good"
  ) : null;

  return (
    <div ref={props.room} inert={!up} className={`absolute inset-0 z-20 flex flex-col bg-ground transition-[opacity,visibility] duration-240 ease-calm ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      <div ref={grid} className="grid min-h-0 flex-1 auto-rows-max content-center-safe justify-center gap-6 overflow-y-auto px-8 pb-[30px] phone:content-start phone:px-0 phone:pb-4">
        <div data-head className="col-span-full flex h-12 items-end gap-6 phone:h-auto phone:flex-wrap phone:gap-y-2.5 phone:pt-2">
          {/* As wide as the tiles: a long title is cut, never widening the grid. */}
          <div className="w-0 min-w-0 flex-[1_0_auto] *:truncate phone:w-auto phone:flex-[1_1_auto] phone:*:whitespace-normal">
            <h2 className="text-[20px] leading-[26px] font-semibold tracking-[-0.01em]">{review.title}</h2>
            <p className="mt-0.5 text-[13px] leading-5 text-soft">
              {props.accepted ?? roundName(round.number)}
              {left}
            </p>
          </div>
          <div className="flex max-w-full min-w-0 items-center gap-2">
            {step?.kind === "go" && <Go step={step} className="flex-none gap-3" />}
            {step?.kind === "agent" && <Agent step={step} className="flex-none" />}
          </div>
        </div>
        {round.flows.filter((flow) => !fold || props.needs(flow.name)).map((flow) => tile(flow, false))}
        {fold && (
          <div data-quiet className="col-span-full mt-2 grid gap-2 justify-self-start">
            <p className="text-xs leading-[18px] text-faint">Nothing to check</p>
            <div className="flex flex-wrap gap-4 phone:gap-3">{round.flows.filter((flow) => !props.needs(flow.name)).map((flow) => tile(flow, true))}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ review, round, flow, small, up, standing, diamonds, wave, onFlow }: Props & { flow: Flow; small: boolean; wave?: number }) {
  const still = useStill(review, round, flow);
  const fresh = useFirstNew(review, round, flow, diamonds);
  const story = useStory(review, round, flow);
  const skim = useSkim(fresh ? 0 : story.length, up);
  const shown = standing(flow.name);
  return (
    <button
      ref={skim.tile}
      data-tile
      data-small={small ? "" : undefined}
      className={`group/tile grid min-w-0 content-start text-left focus-visible:outline-none ${small ? "w-[150px] phone:w-[calc((100%-24px)/3)]" : "row-span-3 grid-rows-subgrid gap-y-0"}`}
      aria-label={`Play ${flow.name}${shown ? `. ${says(shown)}` : ""}`}
      onClick={() => onFlow(flow.name)}
      onPointerEnter={skim.enter}
      onPointerLeave={skim.leave}
    >
      {/* Pointing at a tile outlines its picture at once, with nothing to animate, so a quick pass leaves nothing half done. */}
      <span
        data-picture={flow.name}
        className={`relative block aspect-[1.6] overflow-hidden bg-paper shadow-frame group-hover/tile:shadow-[0_0_0_1px_var(--faint)] group-focus-visible/tile:outline-2 group-focus-visible/tile:outline-offset-2 group-focus-visible/tile:outline-amber data-flying:invisible ${small ? "rounded-md" : "rounded-lg"}`}
      >
        <Picture shot={fresh ?? still} />
        {/* Resting on what's new shows how it was, the outline held where it is. */}
        {fresh?.was && (
          <span data-pointing className="absolute inset-0 opacity-0 transition-opacity duration-160 ease-calm group-hover/tile:opacity-100 group-hover/tile:delay-120">
            <Picture shot={fresh.was} />
            <span className="absolute bottom-2 left-2 rounded-full bg-[rgba(20,24,34,0.62)] px-[7px] py-0.5 text-[11px] leading-4 text-white">{roundName(fresh.was.round)}</span>
          </span>
        )}
        {fresh && <span className="absolute rounded-[3px] outline-[1.5px] outline-offset-3 outline-[#2b2e35] outline-solid" style={placed(fresh.outline)} />}
        {!fresh &&
          story.length > 1 &&
          story.map((shot, k) => (
            <span
              key={k}
              data-story
              className="absolute inset-0 opacity-0 transition-opacity duration-160 ease-calm group-data-skimming/tile:transition-none data-was:z-1 data-was:opacity-100 data-on:z-2 group-data-skimming/tile:data-on:opacity-100 group-data-skimming/tile:data-on:transition-opacity group-data-skimming/tile:data-on:duration-300"
            >
              <Picture shot={shot} />
            </span>
          ))}
      </span>
      <span className={small ? "mt-1.5 line-clamp-1 text-xs leading-[18px] font-medium text-soft" : "mt-2.5 line-clamp-2 text-[13px] leading-[18px] font-semibold"}>{flow.name}</span>
      <span className="flex items-center justify-between gap-2 text-xs leading-[18px] text-faint tabular-nums">
        {time(flow.length)}
        {shown && <Box standing={shown} wave={wave} />}
      </span>
    </button>
  );
}

const placed = (frame: Frame) => ({ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.width * 100}%`, height: `${frame.height * 100}%` });

// Where the flow stands, drawn small where it can't be pressed, since the tile is a button already: green and ticked
// once good, hollow if it was good before and changed; amber while it needs you, with how many answers wait; slate
// while it's the agent's, with how many notes go when you send, or its dot once they've gone.
const LOOK: Record<Standing["is"], string> = {
  good: "bg-green text-ground",
  "looked good": "bg-ground text-green shadow-[inset_0_0_0_1.25px_var(--green)]",
  "to watch": "shadow-[inset_0_0_0_1.25px_var(--amber)]",
  "not saved": "shadow-[inset_0_0_0_1.25px_var(--amber)]",
  "needs you": "text-amber-ink shadow-[inset_0_0_0_1.25px_var(--amber)]",
  "is it good": "bg-[color-mix(in_srgb,var(--amber)_22%,var(--ground))] shadow-[inset_0_0_0_1.25px_var(--amber)]",
  "to send": "text-slate shadow-[inset_0_0_0_1.25px_var(--slate)]",
  "with the agent": "shadow-[inset_0_0_0_1.25px_var(--slate)]",
};

function Box({ standing, wave }: { standing: Standing; wave?: number }) {
  const { is, count } = standing;
  const lands = wave !== undefined;
  const mark =
    is === "good" || is === "looked good" ? (
      <TickMark className={`size-2 ${lands ? "animate-tick" : ""}`} style={lands ? { animationDelay: `${wave + 100}ms` } : undefined} />
    ) : is === "with the agent" ? (
      <i className="size-1 rounded-full bg-slate" />
    ) : (is === "needs you" || is === "to send") && count > 0 ? (
      count
    ) : null;
  return (
    <span className={`grid size-3 flex-none place-items-center rounded-full text-[8px] leading-none font-semibold tabular-nums ${LOOK[is]} ${lands ? "animate-pop" : ""}`} style={lands ? { animationDelay: `${wave}ms` } : undefined} aria-hidden>
      {mark}
    </span>
  );
}

// Resting on a tile plays its story by itself, a picture at a time, looping; leaving it brings its picture back. Each
// picture fades in over the last one that arrived whole, never more than two stacked.
const SKIM = { rest: 400, every: 800, whole: 160 };

function useSkim(pictures: number, up: boolean) {
  const tile = useRef<HTMLButtonElement>(null);
  const timer = useRef<number>(undefined);
  const stop = () => {
    clearTimeout(timer.current);
    const element = tile.current;
    if (!element) return;
    element.removeAttribute("data-skimming");
    delete element.dataset.at;
    delete element.dataset.k;
    for (const layer of element.querySelectorAll("[data-story]")) {
      layer.removeAttribute("data-on");
      layer.removeAttribute("data-was");
    }
  };
  useEffect(() => {
    if (!up) stop();
    return () => clearTimeout(timer.current);
  }, [up]);

  const show = (element: HTMLElement, k: number) => {
    const layers = [...element.querySelectorAll<HTMLElement>("[data-story]")];
    const now = performance.now();
    const whole = now - Number(element.dataset.at ?? 0) >= SKIM.whole;
    const was = layers.map((layer) => (layer.hasAttribute("data-on") ? "on" : layer.hasAttribute("data-was") ? "was" : ""));
    // The one coming in always fades in from nothing, the one beneath included.
    if (was[k] === "was") {
      layers[k]!.removeAttribute("data-was");
      void layers[k]!.offsetWidth;
    }
    layers.forEach((layer, j) => {
      layer.toggleAttribute("data-on", j === k);
      layer.toggleAttribute("data-was", j !== k && was[j] === (whole ? "on" : "was"));
    });
    Object.assign(element.dataset, { at: String(now), k: String(k) });
    element.toggleAttribute("data-skimming", true);
  };
  const next = () => {
    const element = tile.current;
    if (!element?.isConnected) return;
    show(element, element.dataset.k === undefined ? 0 : (Number(element.dataset.k) + 1) % pictures);
    timer.current = window.setTimeout(next, SKIM.every);
  };
  return {
    tile,
    enter: (event: PointerEvent) => {
      if (pictures < 2 || event.pointerType === "touch") return;
      clearTimeout(timer.current);
      timer.current = window.setTimeout(next, SKIM.rest);
    },
    leave: stop,
  };
}

// As many to a row as lets the pictures be largest with every flow that needs you in view, and where more to a row lets
// them be as large, more, so the grid fills across before down; never larger than the pictures are. One or two to check
// are as large as that; three or more, smaller. The quiet row is as wide as the tiles over it, and its height can change
// their size, so it's laid out twice. The grid is never narrower than its heading.
const TILE = { most: 340, picture: 512, gap: 24, label: 64, head: 48, small: 150 };

function lay(grid: HTMLElement) {
  const style = getComputedStyle(grid);
  const width = grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const quiet = grid.querySelector<HTMLElement>("[data-quiet]");
  const large = grid.querySelectorAll("[data-tile]:not([data-small])").length;
  const head = grid.querySelector<HTMLElement>("[data-head]");
  const headWidth = head ? head.firstElementChild!.scrollWidth + TILE.gap + head.lastElementChild!.scrollWidth : 0;
  const most = large <= 2 ? TILE.picture : TILE.most;
  if (quiet) quiet.style.width = `${Math.floor(width)}px`;
  for (let pass = 0; pass < (quiet ? 2 : 1); pass++) {
    const height = grid.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - TILE.head - TILE.gap - (quiet ? quiet.offsetHeight + TILE.gap : 0);
    const fits = Array.from({ length: large }, (_, i) => {
      const across = i + 1;
      const rows = Math.ceil(large / across);
      return { across, size: Math.min(most, (width - (across - 1) * TILE.gap) / across, ((height - (rows - 1) * TILE.gap) / rows - TILE.label) * 1.6) };
    });
    const top = Math.max(0, ...fits.map((fit) => fit.size));
    let best = fits.findLast((fit) => fit.size >= top - 0.5) ?? { across: 1, size: 0 };
    // Where they can't all be in view at a size worth looking at, they fill the width and scroll.
    if (best.size < 120 || onPhone()) {
      const across = Math.max(1, Math.floor((width + TILE.gap) / (TILE.small + TILE.gap)));
      best = { across, size: Math.min(TILE.most, (width - (across - 1) * TILE.gap) / across) };
    }
    const tiles = best.across * Math.floor(best.size) + (best.across - 1) * TILE.gap;
    const room = Math.min(width, Math.max(tiles, headWidth)) - tiles;
    grid.style.gridTemplateColumns = `repeat(${best.across}, ${Math.floor(best.size)}px)${room > TILE.gap ? ` ${Math.floor(room - TILE.gap)}px` : ""}`;
    if (quiet) quiet.style.width = `${tiles + Math.max(0, room)}px`;
  }
}
