// Every flow at once: where you arrive on a round with more than one flow, and where "All flows" brings you back. The
// work's name and where it stands, then its flows as a list, and beside them the frame the recording plays in, showing
// the flow you point at as it opens, its name over its first picture. Each row says the flow's length and, in words, where it stands. Choosing one plays it, its picture
// growing into the frame. Under the frame, the one step to take.

import { useRef, useState, type RefObject } from "react";
import { time, type Flow, type Review, type Round } from "@mostlyworks/vantage-review";
import { picture } from "./api.ts";
import { EndMark, endOf } from "./Chosen.tsx";
import { asWho, manyIn } from "./people.ts";
import { Agent, Go, says, type Step } from "./Step.tsx";
import type { Standing } from "./notes.ts";
import { Picture, useStill } from "./Picture.tsx";
import { Rounds } from "./Rounds.tsx";

type Props = {
  room: RefObject<HTMLDivElement | null>;
  review: Review;
  round: Round;
  up: boolean;
  standing: (flow: string) => Standing | undefined;
  needs: (flow: string) => boolean;
  // Accepted, how it got there, in fixed words.
  accepted?: string;
  step?: Step;
  // Why sending or accepting didn't go through.
  trouble: string[];
  onFlow: (flow: string) => void;
  // The rounds, under the work's name: going back through them flips every picture at once, and once you've sent, the
  // next round coming, and in.
  arrived?: Round;
  working?: string;
  onRound: (round: number) => void;
};

export function Grid(props: Props) {
  const { review, round, up, step } = props;
  // The flow you point at stays in the frame until you leave the list and the frame both, so you can go across to it.
  // Otherwise it's the flow the step goes to, or the one it last went to: a step that goes to no flow, such as a round
  // arriving, changes nothing in the frame.
  const [pointed, setPointed] = useState<string>();
  const stepped = useRef<string>(undefined);
  if (step?.kind === "go" && step.flow) stepped.current = step.flow;
  const toCheck = round.flows.filter((flow) => props.needs(flow.name)).length;
  const shown = round.flows.find((flow) => flow.name === pointed) ?? round.flows.find((flow) => flow.name === stepped.current) ?? round.flows[0]!;

  const row = (flow: Flow) => (
    <Row key={flow.name} review={review} round={round} flow={flow} standing={props.standing(flow.name)} on={flow === shown} onPoint={setPointed} onFlow={props.onFlow} />
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
    <div ref={props.room} inert={!up} className={`absolute inset-0 z-20 flex overflow-y-auto bg-ground transition-[opacity,visibility] duration-240 ease-calm ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      <div className="m-auto grid w-full max-w-[1240px] grid-cols-[320px_minmax(0,1fr)] gap-10 px-8 py-6 phone:grid-cols-1 phone:gap-5 phone:px-0" onPointerLeave={() => setPointed(undefined)}>
        <div className="flex max-h-[calc(100dvh-140px)] min-h-0 flex-col phone:max-h-none">
          <div className="px-2.5">
            <h2 className="line-clamp-2 text-[15px] leading-[21px] font-semibold">{review.title}</h2>
            {review.asked && <p className="mt-1 line-clamp-6 text-[13px] leading-5 text-soft">{review.asked}</p>}
            <div className={`${review.asked ? "mt-2" : "mt-1"} -ml-2.5 flex items-center gap-1 text-[13px] leading-5 text-soft`}>
              <Rounds quiet rounds={review.rounds} watching={round.number} arrived={props.arrived} working={props.working} onRound={props.onRound} onEarlier={() => {}} />
              <span className="min-w-0 truncate">{props.accepted ? <span className="text-green">· {props.accepted}</span> : left}</span>
            </div>
          </div>
          <div className="-mx-1 mt-5 min-h-0 overflow-y-auto px-1">
            {round.flows.map(row)}
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <Opening review={review} round={round} flow={shown} onFlow={props.onFlow} />
          <div className="mt-3 flex min-h-8 items-start justify-end gap-2">
            <div className="w-[300px] max-w-full">
              {step?.kind === "go" && <Go step={step} className="w-full gap-3" />}
              {step?.kind === "agent" && !props.working && <Agent step={step} className="justify-end" />}
              {props.trouble.length > 0 && <p className="mt-2 text-xs leading-[18px] text-amber-ink">{props.trouble.join(" ")}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// A flow in the list, a thing of its own: its picture, its name and length, and under them where it stands, as its square
// at its end says it, and in words: what asks something of you in amber, what's the agent's in its slate, what looks
// good in green, and not watched yet quietly, its square pale, as everything starts.
function Row({ review, round, flow, standing, on, onPoint, onFlow }: { review: Review; round: Round; flow: Flow; standing?: Standing; on: boolean; onPoint: (flow: string) => void; onFlow: (flow: string) => void }) {
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
        <span className="line-clamp-2 text-[13px] leading-[18px] text-fg">
          {flow.name}
          {manyIn(review) && <span className="text-soft"> {asWho(flow)}</span>}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs leading-4">
          {standing && <EndMark end={endOf(standing)} ahead={standing.is === "to watch"} just={false} className="size-3 flex-none" />}
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
  "to send": "text-amber-ink",
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
      <span className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 bg-[rgba(247,247,245,.45)] p-4 text-center font-recorded text-[20px] leading-[1.2] font-medium tracking-[-0.01em] text-[#222222]">
        {flow.name}
        {manyIn(review) && asWho(flow) && <span className="font-ui text-[14px] leading-[1.4] font-normal tracking-normal text-[#6c707a]">{asWho(flow)}</span>}
      </span>
    </button>
  );
}
