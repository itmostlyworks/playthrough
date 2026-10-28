// Every flow at once: where you arrive on a round with more than one flow, and where "All flows" brings you back. The
// work's name and where it stands, then its flows as a list, and beside them the frame the recording plays in, showing
// the flow you point at as it opens, its name over its first picture. The flows new in this work come first, then the
// app's own; those the work didn't change and you're done with wait folded on one line, so nothing that needs you is
// ever out of sight. Each row says the flow's length and, in words, where it stands. Choosing one plays it, its picture
// growing into the frame. Under the frame, the one step to take.

import { useState, type ReactNode, type RefObject } from "react";
import { time, type Flow, type Review, type Round } from "@mostlyworks/vantage-review";
import { picture } from "./api.ts";
import { TickMark } from "./Column.tsx";
import { Agent, Go, owned, says, type Step } from "./Foot.tsx";
import type { Standing } from "./notes.ts";
import { Picture, useStill } from "./Picture.tsx";
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
  // Accepted, how it got there, in fixed words.
  accepted?: string;
  step?: Step;
  // The app's name, for its flows, and, accepting, the new flows to keep with them.
  app?: string;
  keep?: ReactNode;
  onFlow: (flow: string) => void;
};

export function Grid(props: Props) {
  const { review, round, up, step } = props;
  const [pointed, setPointed] = useState<string>();
  const [unfolded, setUnfolded] = useState(false);
  const toCheck = round.flows.filter((flow) => props.needs(flow.name)).length;
  const { fresh, changed, unchanged } = groups(round, props.changed);
  const apart = fresh.length < round.flows.length;
  const kept = [...changed, ...unchanged];
  const folded = unfolded ? [] : unchanged.filter((flow) => !props.needs(flow.name));
  const first = [...fresh, ...kept][0]!;
  const shown = round.flows.find((flow) => flow.name === pointed) ?? round.flows.find((flow) => flow.name === (step?.kind === "go" ? step.flow : undefined)) ?? first;

  const row = (flow: Flow) => (
    <Row key={flow.name} review={review} round={round} flow={flow} standing={props.standing(flow.name)} changed={!!flow.kept && changed.includes(flow)} on={flow === shown} onPoint={setPointed} onFlow={props.onFlow} />
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
      <div className="m-auto grid w-full max-w-[1240px] grid-cols-[320px_minmax(0,1fr)] gap-10 px-8 py-6 phone:grid-cols-1 phone:gap-5 phone:px-0">
        <div className="flex max-h-[calc(100dvh-140px)] min-h-0 flex-col phone:max-h-none">
          <div className="px-2.5">
            <h2 className="line-clamp-4 text-[15px] leading-[21px] font-semibold">{review.title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-soft">
              {props.accepted ?? roundName(round.number)}
              {left}
            </p>
          </div>
          <div className="-mx-1 mt-5 min-h-0 overflow-y-auto px-1" onPointerLeave={() => setPointed(undefined)}>
            {apart && fresh.length > 0 && heading("New in this work")}
            {fresh.map(row)}
            {apart && kept.length > folded.length && heading(theirs)}
            {kept.filter((flow) => !folded.includes(flow)).map(row)}
            {folded.length > 0 && (
              <button className="mt-3 px-2.5 text-left text-xs leading-[18px] text-faint transition-colors duration-150 ease-calm hover:text-soft" onClick={() => setUnfolded(true)}>
                {folded.length < kept.length ? `${folded.length} more, unchanged` : `${theirs}, ${folded.length} unchanged`}
              </button>
            )}
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

// A flow in the list, a thing of its own: its picture, its name and length, and under them, in words, whether the work changed it, if it's one of the
// app's, and where it stands: what asks something of you in amber, what's the agent's in its slate, what looks good in
// green, and not watched yet quietly, as everything starts.
function Row({ review, round, flow, standing, changed, on, onPoint, onFlow }: { review: Review; round: Round; flow: Flow; standing?: Standing; changed: boolean; on: boolean; onPoint: (flow: string) => void; onFlow: (flow: string) => void }) {
  return (
    <button
      data-on={on ? "" : undefined}
      className="group/row grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg p-2 text-left transition-colors duration-150 ease-calm hover:bg-hover data-on:bg-hover"
      aria-label={`Play ${flow.name}${standing ? `. ${says(standing)}` : ""}`}
      onPointerEnter={() => onPoint(flow.name)}
      onFocus={() => onPoint(flow.name)}
      onClick={() => onFlow(flow.name)}
    >
      <span className="relative block aspect-[1.6] overflow-hidden rounded-[5px] bg-paper shadow-frame">
        <Picture shot={useStill(review, round, flow)} />
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-[13px] leading-[18px] text-fg">{flow.name}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs leading-4">
          {changed && <span className="flex-none text-soft">Changed{standing && " ·"}</span>}
          {standing?.is === "good" && <TickMark className="size-2.5 flex-none text-green" />}
          {standing && <span className={`truncate ${INK[standing.is]}`}>{says(standing)}</span>}
        </span>
      </span>
      <span className="self-start text-xs leading-[18px] text-faint tabular-nums">{time(flow.length)}</span>
    </button>
  );
}

const INK: Record<Standing["is"], string> = {
  good: "text-green",
  "looked good": "text-amber-ink",
  "to watch": "text-faint",
  "not saved": "text-amber-ink",
  "needs you": "text-amber-ink",
  "is it good": "text-amber-ink",
  "to send": "text-slate",
  "with the agent": "text-slate",
};

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
