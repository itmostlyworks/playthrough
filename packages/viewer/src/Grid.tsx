// Every flow at once: where you arrive on a round with more than one flow, and where "All flows" brings you back. The
// work's name and where it stands, then its flows as a list, and beside them the frame the recording plays in, showing
// the flow you point at as it opens, its name over its first picture. The flows new in this work come first, then the
// app's own it changed; those it didn't change wait folded on one line. Each row says the flow's length and where it
// stands, over a line with its notes on it as the timeline has them. Choosing one plays it, its picture growing into the
// frame. Under the frame, the one step to take.

import { useState, type ReactNode, type RefObject } from "react";
import { time, type Flow, type Review, type Round } from "@mostlyworks/vantage-review";
import { picture } from "./api.ts";
import { TickMark } from "./Column.tsx";
import { Agent, Go, owned, says, type Step } from "./Foot.tsx";
import type { Standing } from "./notes.ts";
import { Picture } from "./Picture.tsx";
import { roundName } from "./Rounds.tsx";

type Props = {
  room: RefObject<HTMLDivElement | null>;
  review: Review;
  round: Round;
  up: boolean;
  standing: (flow: string) => Standing | undefined;
  needs: (flow: string) => boolean;
  // Whether the work changed one of the app's flows, against Before.
  changed: (flow: string) => boolean;
  // Each note on a flow, at its moment, in its ink.
  marks: (flow: string) => { at: number; ink: string }[];
  // Accepted, how it got there, in fixed words.
  accepted?: string;
  step?: Step;
  // The app's name, for its flows, and, accepting, the new flows to keep with them.
  app?: string;
  keep?: ReactNode;
  // When it came back after you accepted: each flow's tick lands in turn.
  done?: number;
  onFlow: (flow: string) => void;
};

export function Grid(props: Props) {
  const { review, round, up, step } = props;
  const [pointed, setPointed] = useState<string>();
  const [unfolded, setUnfolded] = useState(false);
  const toCheck = round.flows.filter((flow) => props.needs(flow.name)).length;
  const { fresh, changed, unchanged } = groups(round, props.changed);
  const apart = fresh.length < round.flows.length;
  const longest = Math.max(...round.flows.map((flow) => flow.length));
  const first = [...fresh, ...changed, ...unchanged][0]!;
  const shown = round.flows.find((flow) => flow.name === pointed) ?? round.flows.find((flow) => flow.name === (step?.kind === "go" ? step.flow : undefined)) ?? first;

  // Just accepted, the ticks land down the list, for the first few seconds only: coming back later, it's simply done.
  const ago = props.done === undefined ? Infinity : performance.now() - props.done;
  let landing = 0;
  const row = (flow: Flow) => (
    <Row
      key={flow.name}
      flow={flow}
      standing={props.standing(flow.name)}
      marks={props.marks(flow.name)}
      share={flow.length / longest}
      on={flow === shown}
      wave={ago < 3000 && props.standing(flow.name)?.is === "good" ? 450 + landing++ * 110 - ago : undefined}
      onPoint={setPointed}
      onFlow={props.onFlow}
    />
  );
  const heading = (words: string) => <p className="mt-4 mb-1 px-2.5 text-xs leading-[18px] text-faint first:mt-0">{words}</p>;
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
  const theirs = `${capital(owned(props.app))} flows`;

  return (
    <div ref={props.room} inert={!up} className={`absolute inset-0 z-20 flex bg-ground transition-[opacity,visibility] duration-240 ease-calm ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      <div className="m-auto grid w-full max-w-[1240px] grid-cols-[280px_minmax(0,1fr)] gap-10 px-8 py-6 phone:grid-cols-1 phone:gap-5 phone:px-0">
        <div className="flex max-h-[calc(100dvh-140px)] min-h-0 flex-col phone:max-h-none">
          <div className="px-2.5">
            <h2 className="line-clamp-4 text-[17px] leading-[23px] font-semibold tracking-[-0.01em]">{review.title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-soft">
              {props.accepted ?? roundName(round.number)}
              {left}
            </p>
          </div>
          <div className="-mx-1 mt-5 min-h-0 overflow-y-auto px-1" onPointerLeave={() => setPointed(undefined)}>
            {apart && fresh.length > 0 && heading("New in this work")}
            {fresh.map(row)}
            {apart && changed.length > 0 && heading(`${theirs} it changed`)}
            {changed.map(row)}
            {unchanged.length > 0 && (unfolded ? (
              <>
                {heading(`${theirs} it didn't change`)}
                {unchanged.map(row)}
              </>
            ) : (
              <button className="mt-4 px-2.5 text-left text-xs leading-[18px] text-faint transition-colors duration-150 ease-calm hover:text-soft" onClick={() => setUnfolded(true)}>
                {changed.length ? `${unchanged.length} more of ${theirs}` : theirs}, unchanged
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <Opening review={review} round={round} flow={shown} onFlow={props.onFlow} />
          <div className="mt-3 flex min-h-8 items-start justify-end gap-2">
            <div className="w-[300px] max-w-full">
              {step?.kind === "go" && step.final && props.keep}
              {step?.kind === "go" && <Go step={step} className="w-full gap-3" />}
              {step?.kind === "agent" && <Agent step={step} className="justify-end" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// A flow in the list: its name, its length and where it stands, over its line with its notes on it, as long beside the
// others' as the flow is.
function Row({ flow, standing, marks, share, on, wave, onPoint, onFlow }: { flow: Flow; standing?: Standing; marks: { at: number; ink: string }[]; share: number; on: boolean; wave?: number; onPoint: (flow: string) => void; onFlow: (flow: string) => void }) {
  return (
    <button
      data-on={on ? "" : undefined}
      className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2.5 rounded-lg px-2.5 pt-2 pb-2.5 text-left transition-colors duration-150 ease-calm hover:bg-hover data-on:bg-hover"
      aria-label={`Play ${flow.name}${standing ? `. ${says(standing)}` : ""}`}
      onPointerEnter={() => onPoint(flow.name)}
      onFocus={() => onPoint(flow.name)}
      onClick={() => onFlow(flow.name)}
    >
      <span className="truncate text-[13px] leading-[18px] text-fg">{flow.name}</span>
      <span className="text-xs leading-[18px] text-faint tabular-nums">{time(flow.length)}</span>
      {standing ? <Box standing={standing} wave={wave} /> : <span className="size-3" />}
      <span className="relative col-span-full mt-2 block h-px bg-line" style={{ width: `${share * 100}%` }}>
        {marks.map((mark, k) => (
          <i key={k} className="absolute -top-[2px] size-[5px] -translate-x-1/2 rounded-full" style={{ left: `${Math.min(100, (mark.at / flow.length) * 100)}%`, background: mark.ink }} />
        ))}
      </span>
    </button>
  );
}

// The frame, as the flow opens in it: its name over its first picture, softened under a veil in the recorded app's
// background and in its ink and face, as the stage draws it between flows. It's the picture that grows into the frame
// the flow plays in.
function Opening({ review, round, flow, onFlow }: { review: Review; round: Round; flow: Flow; onFlow: (flow: string) => void }) {
  return (
    <button
      data-picture={flow.name}
      className="relative aspect-[1.6] w-full max-w-[calc((100dvh-200px)*1.6)] self-center overflow-hidden rounded-lg bg-paper shadow-frame data-flying:invisible"
      aria-label={`Play ${flow.name}`}
      onClick={() => onFlow(flow.name)}
    >
      <Picture key={flow.name} shot={{ src: picture(review.id, round.number, flow.recording, 0) }} />
      <span className="absolute inset-0 grid place-items-center bg-[rgba(247,247,245,.45)] p-4 text-center font-recorded text-[20px] leading-[1.2] font-medium tracking-[-0.01em] text-[#222222]">
        {flow.name}
      </span>
    </button>
  );
}

// The flows new in this work, then the app's own it changed, then the rest of the app's: the list's order, and so where
// checking starts.
export function groups(round: Round, changed: (flow: string) => boolean) {
  return {
    fresh: round.flows.filter((flow) => !flow.kept),
    changed: round.flows.filter((flow) => flow.kept && changed(flow.name)),
    unchanged: round.flows.filter((flow) => flow.kept && !changed(flow.name)),
  };
}

const capital = (words: string) => words[0]!.toUpperCase() + words.slice(1);

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
