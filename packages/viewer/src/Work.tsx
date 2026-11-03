// The work, as one page: what was asked, then each situation it meets, as a still of how it ends, framed on what changed
// there, with Before beside it. Pointing at one steps through how they got there; choosing it plays it in the frame.
// At the end, how it got here, and the one step to take. Where you arrive, and what "All flows" brings you back to.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Reading } from "@playthrough/page";
import { time, type Flow, type Place, type Review, type Round } from "@playthrough/review";
import { picture, recording } from "./api.ts";
import { EndMark, endOf } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { fill, type Shown, type Standing } from "./notes.ts";
import { asWho } from "./people.ts";
import { recorded } from "./replay.ts";
import { Picture, type Frame } from "./Picture.tsx";
import { roundName, Rounds } from "./Rounds.tsx";
import { Agent, Go, says, type Step } from "./Step.tsx";
import type { Read } from "./things.ts";

type Props = {
  room: RefObject<HTMLDivElement | null>;
  review: Review;
  round: Round;
  up: boolean;
  read: Read;
  notes: Shown[];
  standing: (flow: string) => Standing | undefined;
  accepted?: string;
  step?: Step;
  trouble: string[];
  onFlow: (flow: string) => void;
  arrived?: Round;
  working?: string;
  onRound: (round: number) => void;
};

export function Work(props: Props) {
  const { review, round, up, step } = props;
  const before = review.rounds.find((kept) => kept.number === 0 && kept.flows.length && round.number > 0);
  // What the work changed, against Before where there is one, else against the round before.
  const work = review.comparisons.find((kept) => kept.round === round.number && kept.since === 0) ?? review.comparisons.findLast((kept) => kept.round === round.number);
  const general = props.notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  return (
    <div ref={props.room} inert={!up} className={`absolute inset-0 z-20 overflow-y-auto bg-ground transition-[opacity,visibility] duration-240 ease-calm ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      <div className="mx-auto w-full max-w-[1040px] px-8 pt-8 pb-4 phone:px-0 phone:pt-2">
        <header className="max-w-[680px]">
          <h2 className="text-[20px] leading-[27px] font-semibold tracking-[-0.01em] text-balance">{review.title}</h2>
          {review.asked && <p className="mt-2 text-[14px] leading-[22px] text-soft">{review.asked}</p>}
          <div className="mt-3 -ml-2.5 flex items-center gap-1 text-[13px] leading-5 text-soft">
            <Rounds quiet rounds={review.rounds} watching={round.number} arrived={props.arrived} working={props.working} onRound={props.onRound} />
            <span className="min-w-0 truncate">
              {round.flows.length} {round.flows.length === 1 ? "situation" : "situations"}, recorded by {round.by}
              {props.accepted && <span className="text-green"> · {props.accepted}</span>}
            </span>
          </div>
        </header>
        <div className="mt-10 grid gap-12 phone:mt-7 phone:gap-9">
          {round.flows.map((flow) => (
            <Situation
              key={flow.name}
              review={review}
              round={round}
              before={before}
              flow={flow}
              changed={(work?.changes ?? []).flatMap((change) => change.seen.filter((on) => on.flow === flow.name).map((on) => (change.gone ? { ...on, element: undefined } : on)))}
              readings={props.read(round.number, flow.name)}
              notes={props.notes.filter((note) => note.on?.flow === flow.name)}
              standing={props.standing(flow.name)}
              onFlow={props.onFlow}
            />
          ))}
        </div>
        <Story review={review} round={round} general={general} />
        <div className="sticky bottom-0 z-10 mt-6 flex min-h-8 justify-end bg-ground py-4">
          <div className="w-[300px] max-w-full">
            {step?.kind === "go" && <Go step={step} className="w-full gap-3" />}
            {step?.kind === "agent" && !props.working && <Agent step={step} className="justify-end" />}
            {props.trouble.length > 0 && <p className="mt-2 text-xs leading-[18px] text-amber-ink">{props.trouble.join(" ")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// A situation: whose it is and what they do, where it stands, and how it ends, now and before. The still is where the
// work first shows, framed on what changed there; where nothing changed, the end, framed on what its last step acted on.
function Situation({ review, round, before, flow, changed, readings, notes, standing, onFlow }: { review: Review; round: Round; before?: Round; flow: Flow; changed: Place[]; readings?: Reading[]; notes: Shown[]; standing?: Standing; onFlow: (flow: string) => void }) {
  const stepOf = (at: number) => Math.max(0, flow.steps.findIndex((_, i) => (flow.steps[i + 1]?.at ?? flow.length) >= at - 0.05));
  const readingAt = (step: number) => readings?.find((one) => one.step === flow.steps[step]?.title);
  const changedAt = [...new Set(changed.filter((on) => on.at !== undefined).map((on) => stepOf(on.at!)))].toSorted((a, b) => a - b);
  const shows = changedAt.map((step) => ({ step, frame: framed(readingAt(step), changed.filter((on) => on.at !== undefined && stepOf(on.at) === step)) }));
  const first = shows.find((one) => one.frame) ?? shows[0];
  const result = first?.step ?? flow.steps.length - 1;
  const acted = useActed(review, round, flow, first ? undefined : readingAt(result));
  const frame = first?.frame ?? acted;
  const title = flow.steps[result]?.title;
  const then = before?.flows.find((one) => one.name === flow.name);
  const thenStep = then?.steps.findIndex((one) => one.title === title) ?? -1;
  const same = !changed.length;
  return (
    <section className="grid gap-3.5">
      <div className="flex items-baseline justify-between gap-4 px-0.5">
        <h3 className="min-w-0 text-[15px] leading-[21px] font-semibold">
          {flow.name}
          {asWho(flow) && <span className="font-normal text-soft"> {asWho(flow)}</span>}
        </h3>
        <span className="flex flex-none items-center gap-1.5 text-xs leading-4">
          {standing && <EndMark end={endOf(standing)} ahead={standing.is === "to watch"} just={false} className="size-3 flex-none" />}
          {standing && <span className={INK[standing.is]}>{says(standing)}</span>}
          <span className="text-faint tabular-nums">· {time(flow.length)}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 phone:grid-cols-1">
        <Still review={review} round={round} flow={flow} result={result} frame={frame} notes={notes} onFlow={onFlow} />
        {then && !same ? (
          <figure className="grid gap-2">
            <span className="relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame">
              {thenStep >= 0 ? (
                <Picture shot={{ src: picture(review.id, 0, then.recording, thenStep), frame }} />
              ) : (
                <span className="absolute inset-0 grid place-content-center text-[13px] text-soft">Not in {roundName(0)}</span>
              )}
            </span>
            <figcaption className="px-0.5 text-xs leading-4 text-soft">Before</figcaption>
          </figure>
        ) : (
          <figure className="grid gap-2 phone:hidden">
            <span className="grid aspect-[1.6] place-content-center rounded-lg border border-dashed border-line px-6 text-center text-[13px] leading-5 text-soft">
              {then ? "The same as before the work" : "New: there was nothing like it before"}
            </span>
            <figcaption className="px-0.5 text-xs leading-4 text-soft">Before</figcaption>
          </figure>
        )}
      </div>
      {notes.length > 0 && (
        <ul className="grid gap-1.5 px-0.5">
          {notes.map((note) => (
            <li key={note.id} className="flex min-w-0 items-baseline gap-2 text-[13px] leading-5">
              <span className={`size-1.5 flex-none translate-y-[-1px] rounded-full ${fill(note)}`} />
              <span className="truncate text-fg">{note.turns[0]?.words}</span>
              {where(note) && <span className={`flex-none ${where(note)![1]}`}>· {where(note)![0]}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// How it ends, still; pointed at, how they got there, a step at a time, back to how it ends. Chosen, it plays.
function Still({ review, round, flow, result, frame, notes, onFlow }: { review: Review; round: Round; flow: Flow; result: number; frame?: Frame; notes: Shown[]; onFlow: (flow: string) => void }) {
  const [shown, setShown] = useState<number>();
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const stop = () => (clearInterval(timer.current), setShown(undefined));
  const start = () => {
    for (let i = 0; i <= result; i++) new Image().src = picture(review.id, round.number, flow.recording, i);
    setShown(0);
    clearInterval(timer.current);
    timer.current = setInterval(() => setShown((at) => (at === undefined || at >= result ? (clearInterval(timer.current), undefined) : at + 1)), 750);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  const at = shown ?? result;
  return (
    <figure className="grid gap-2">
      <button
        data-picture={flow.name}
        className="group/still relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame transition-shadow duration-150 ease-calm hover:shadow-[0_0_0_1px_var(--edge),0_8px_24px_var(--drop)] data-flying:invisible"
        aria-label={`Play ${flow.name}`}
        onPointerEnter={start}
        onPointerLeave={stop}
        onFocus={start}
        onBlur={stop}
        onClick={() => (stop(), onFlow(flow.name))}
      >
        <Picture key={at === result ? "result" : at} shot={{ src: picture(review.id, round.number, flow.recording, at), frame: at === result ? frame : undefined }} />
        {notes.length > 0 && (
          <span className="absolute top-2.5 left-2.5 flex gap-1">
            {notes.map((note) => (
              <span key={note.id} className={`grid size-5 place-content-center rounded-full text-[11px] leading-none font-semibold text-white ${fill(note)}`}>
                {note.number}
              </span>
            ))}
          </span>
        )}
        <span className="pointer-events-none absolute right-2.5 bottom-2.5 rounded-md bg-surface px-2 py-0.5 text-xs leading-4 text-soft opacity-0 shadow-tip transition-opacity duration-150 ease-calm group-hover/still:opacity-100 group-focus-visible/still:opacity-100">
          {flow.steps[at]?.title}
        </span>
      </button>
      <figcaption className="px-0.5 text-xs leading-4 text-soft">Now</figcaption>
    </figure>
  );
}

// Each round in a line: who recorded it, what was said about it, and what came of that.
function Story({ review, round, general }: { review: Review; round: Round; general: Shown[] }) {
  const rounds = review.rounds.filter((kept) => kept.number > 0 && kept.number <= round.number);
  if (rounds.length < 2 && !general.length) return null;
  return (
    <section className="mt-14 max-w-[680px] border-t border-line pt-6">
      <h3 className="text-[13px] leading-5 font-semibold">How it got here</h3>
      <ol className="mt-2 grid gap-1 text-[13px] leading-5 text-soft">
        {rounds.map((kept) => {
          const sent = review.sends.filter((send) => send.round === kept.number);
          const notes = sent.reduce((count, send) => count + send.notes.length, 0);
          return (
            <li key={kept.number}>
              <span className="text-fg">{roundName(kept.number)}</span>, by {kept.by}
              {kept.replies.length > 0 && `, answering ${kept.replies.length} ${kept.replies.length === 1 ? "note" : "notes"}`}
              {notes > 0 && ` · ${notes} ${notes === 1 ? "note" : "notes"} sent back`}
            </li>
          );
        })}
      </ol>
      {general.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {general.map((note) => (
            <li key={note.id} className="flex min-w-0 items-baseline gap-2 text-[13px] leading-5">
              <span className={`size-1.5 flex-none translate-y-[-1px] rounded-full ${fill(note)}`} />
              <span className="truncate text-fg">{note.turns[0]?.words}</span>
              {where(note) && <span className={`flex-none ${where(note)![1]}`}>· {where(note)![0]}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The end, framed on what the flow worked on.
function useActed(review: Review, round: Round, flow: Flow, reading: Reading | undefined): Frame | undefined {
  const [frame, setFrame] = useState<Frame>();
  const step = flow.steps.at(-1);
  useEffect(() => {
    let current = true;
    if (reading && step)
      recording(review.id, round.number, flow.recording).then((events) => {
        // What the flow worked on before its last step, which is how it ends, saving or leaving: the last thing acted on
        // that's still there, and is a thing rather than a stretch of the page clicked away on.
        const { width, height } = reading.screen;
        const small = (thing: Reading["things"][number]) => thing.box.width * thing.box.height < (width * height) / 8;
        const acted = recorded(events).acted.toReversed();
        const found = (moments: typeof acted) => moments.map(([, node]) => reading.things.find((thing) => thing.node === node)).find((thing) => thing && small(thing));
        const box = (found(acted.filter(([moment]) => moment < step.at)) ?? found(acted))?.box;
        if (current && box) setFrame(around(box, reading));
      });
    return () => void (current = false);
  }, [review.id, round.number, flow.recording, !!reading]);
  return frame;
}

// A still framed on what changed there, close enough to read: the things that changed, with room around them. The whole
// page where nothing is found.
function framed(reading: Reading | undefined, on: Place[]): Frame | undefined {
  if (!reading || !on.length) return undefined;
  const { width: across, height: down } = reading.screen;
  const named = (role: string, name: string) => on.some(({ element }) => element?.role === role && element.name === name);
  const boxes = [
    ...reading.things.filter((thing) => named(thing.role, thing.name)).map((thing) => thing.box),
    ...(reading.items ?? []).filter((item) => named(item.role, item.words)).map((item) => item.box),
    ...on.flatMap(({ box }) => (box ? [{ x: box.x * across, y: box.y * down, width: box.width * across, height: box.height * down }] : [])),
  ];
  if (!boxes.length) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return around({ x: left, y: top, width: Math.max(...boxes.map((box) => box.x + box.width)) - left, height: Math.max(...boxes.map((box) => box.y + box.height)) - top }, reading);
}

// A part of the page with room around it, at most four and a half times as close as the whole page, in the page's own shape.
function around(box: { x: number; y: number; width: number; height: number }, reading: Reading): Frame {
  const { width: across, height: down } = reading.screen;
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height];
  const width = Math.min(across, Math.max(right - left + across * 0.08, ((bottom - top + down * 0.25) * across) / down, across / 4.5));
  const height = (width * down) / across;
  const x = clamp((left + right) / 2 - width / 2, 0, across - width);
  const y = clamp((top + bottom) / 2 - height / 2, 0, down - height);
  return { x: x / across, y: y / down, width: width / across, height: height / down };
}

// Where a note stands, in a word or two after what was said.
const where = (note: Shown): [string, string] | undefined =>
  note.unsent ? ["To send", "text-amber-ink"] : note.toJudge ? ["Does this fix it?", "text-amber-ink"] : note.state === "with the agent" ? ["With the agent", "text-slate"] : note.state === "settled" ? ["Settled", "text-green"] : undefined;

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
