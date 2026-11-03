// The work, as one page: what was asked, then each situation it meets, step by step, as it is now beside how it was
// before the work. Choosing a step plays the flow from there in the frame. At the end, how it got here, and the one step
// to take. Where you arrive, and what "All flows" brings you back to.

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { Reading } from "@playthrough/page";
import { time, type Flow, type Place, type Review, type Round } from "@playthrough/review";
import { picture, recording } from "./api.ts";
import { EndMark, endOf } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { fill, type Shown, type Standing } from "./notes.ts";
import { asWho } from "./people.ts";
import { recorded } from "./replay.ts";
import type { CloseUp } from "./flight.ts";
import { HOLD, Loop } from "./Loop.tsx";
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
  onFlow: (flow: string, beat: Beat) => void;
  // The flow you came back from, and where you were in it.
  left?: { flow: string; at: number };
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
              left={props.left?.flow === flow.name ? props.left : undefined}
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

// A situation: whose it is and what they do, where it stands, and its steps, each a part the agent thought worth looking
// at. One step shows at a time, as it is now beside how it was before the work, the two moving together: to start with,
// the last step where something changed.
function Situation({ review, round, before, flow, changed, readings, notes, standing, onFlow, left }: { review: Review; round: Round; before?: Round; flow: Flow; changed: Place[]; readings?: Reading[]; notes: Shown[]; standing?: Standing; onFlow: (flow: string, beat: Beat) => void; left?: { flow: string; at: number } }) {
  const stepOf = (at: number) => Math.max(0, flow.steps.findIndex((_, i) => stepEnd(flow, i) >= at - 0.05));
  const changedAt = new Set(changed.flatMap((on) => (on.at === undefined ? [] : [stepOf(on.at)])));
  const notedAt = (step: number) => notes.filter((note) => note.on?.at !== undefined && stepOf(note.on.at) === step);
  const [chosen, setChosen] = useState(() => (changedAt.size ? Math.max(...changedAt) : flow.steps.length - 1));
  // Back from watching it, it's on the step you were on.
  const [cameBack, setCameBack] = useState(left);
  if (left !== cameBack) (setCameBack(left), left && setChosen(stepOf(left.at)));
  const frames = useFrames(review, round, flow, readings, (step) => changed.filter((on) => on.at !== undefined && stepOf(on.at) === step));
  const then = before?.flows.find((one) => one.name === flow.name);
  const thenAt = (step: number) => then?.steps.findIndex((one) => one.title === flow.steps[step]?.title) ?? -1;
  // Pointed at, its steps or the pair, the step plays over and over, on both sides at once, from the start each time
  // another is chosen. The loops are made the first time, and kept.
  const [started, setStarted] = useState<number>();
  const [woken, setWoken] = useState(false);
  const play = () => (setWoken(true), setStarted(performance.now()));
  const choose = (step: number) => (setChosen(step), started !== undefined && setStarted(performance.now()));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const arrows = (event: KeyboardEvent<HTMLButtonElement>) => {
    const by = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!by) return;
    event.preventDefault();
    tabs.current[clamp(chosen + by, 0, flow.steps.length - 1)]?.focus();
  };
  const frame = frames[chosen];
  const thenStep = thenAt(chosen);
  const now = { from: flow.steps[chosen]!.at, until: stepEnd(flow, chosen) };
  const was = then && thenStep >= 0 ? { from: then.steps[thenStep]!.at, until: stepEnd(then, thenStep) } : undefined;
  // Each side says how long its step plays once its recording is in; both go round together, as long as the longer.
  const [lengths, setLengths] = useState<{ now?: number; was?: number }>({});
  const cycle = Math.max(lengths.now ?? 0, (was && lengths.was) || 0) + HOLD;
  const here = notedAt(chosen);
  // Opened, the step plays in the frame as it plays here, once, from the page as it begins: that picture's at hand.
  const begins = chosen > 0 ? picture(review.id, round.number, flow.recording, chosen - 1) : undefined;
  useEffect(() => void (begins && (new Image().src = begins)), [begins]);
  return (
    <section className="grid gap-3" onPointerEnter={play} onPointerLeave={() => setStarted(undefined)}>
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
      <div role="tablist" aria-label={`The steps of ${flow.name}`} className="-mx-2 flex flex-wrap gap-0.5">
        {flow.steps.map((step, i) => (
          <button
            key={i}
            ref={(tab) => void (tabs.current[i] = tab)}
            role="tab"
            aria-selected={i === chosen}
            tabIndex={i === chosen ? 0 : -1}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] leading-[18px] text-soft transition-colors duration-150 ease-calm hover:text-fg aria-selected:bg-hover aria-selected:text-fg"
            onPointerEnter={() => choose(i)}
            onFocus={() => choose(i)}
            onKeyDown={arrows}
          >
            <span className="text-faint tabular-nums">{i + 1}</span>
            {step.title}
            {changedAt.has(i) && <i title="Changed here" className="size-[6px] flex-none rotate-45 bg-fg" />}
            {notedAt(i).map((note) => <b key={note.id} className={`size-1.5 flex-none rounded-full ${fill(note)}`} />)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 phone:grid-cols-1">
        <figure className="grid gap-2">
          <button
            data-picture={flow.name}
            className="relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame transition-shadow duration-150 ease-calm hover:shadow-[0_0_0_1px_var(--edge),0_8px_24px_var(--drop)] data-flying:invisible"
            aria-label={`Play ${flow.name} from ${flow.steps[chosen]?.title}`}
            onClick={() => onFlow(flow.name, { ...now, closeUp: { src: begins, frame, page: readings?.[chosen]?.screen ?? { width: 1600, height: 1000 } } })}
          >
            <Still src={picture(review.id, round.number, flow.recording, chosen)} frame={frame} />
            {woken && <Loop review={review.id} round={round.number} recording={flow.recording} {...now} frame={frame} started={started} cycle={cycle} onLength={(now) => setLengths((all) => ({ ...all, now }))} />}
            {here.length > 0 && (
              <span className="absolute top-2.5 left-2.5 flex gap-1">
                {here.map((note) => (
                  <span key={note.id} className={`grid size-5 place-content-center rounded-full text-[11px] leading-none font-semibold text-white ${fill(note)}`}>
                    {note.number}
                  </span>
                ))}
              </span>
            )}
          </button>
          <figcaption className="px-0.5 text-xs leading-4 text-soft">Now</figcaption>
        </figure>
        <figure className="grid gap-2">
          {then && was ? (
            <span className="relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame">
              <Still src={picture(review.id, 0, then.recording, thenStep)} frame={frame} />
              {woken && <Loop review={review.id} round={0} recording={then.recording} {...was} frame={frame} started={started} cycle={cycle} onLength={(was) => setLengths((all) => ({ ...all, was }))} />}
            </span>
          ) : (
            <span className="grid aspect-[1.6] place-content-center rounded-lg border border-dashed border-line px-6 text-center text-[13px] leading-5 text-soft">
              {then ? "Before the work, there was no such step" : "New: there was nothing like it before"}
            </span>
          )}
          <figcaption className="px-0.5 text-xs leading-4 text-soft">Before</figcaption>
        </figure>
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

// A picture that gives way to the next softly, the one before staying under it until the next has come.
function Still({ src, frame }: { src: string; frame?: Frame }) {
  const [under, setUnder] = useState(src);
  const [over, setOver] = useState(src);
  if (src !== over) (setUnder(over), setOver(src));
  return (
    <>
      <Picture key={`under ${under}`} shot={{ src: under, frame }} />
      <span key={`over ${over}`} className="absolute inset-0 animate-arrive">
        <Picture shot={{ src: over, frame }} />
      </span>
    </>
  );
}

// A step opened from its close-up: where it starts and ends, and how its picture showed it.
export type Beat = { from: number; until: number; closeUp: CloseUp };

// A step's end: the next one's start, or the flow's end. Its page is read there.
const stepEnd = (flow: Flow, step: number) => flow.steps[step + 1]?.at ?? flow.length;

// Each step's part of the page: what changed there, the first thing found, or where nothing did, what the step acted
// on, the last thing clicked or typed in that's still there and is a thing rather than a stretch of the page clicked
// away on; and where the hand went to get there, in the step's last few seconds, so its loop shows the hand at work. The
// first step, and one that goes to another page, shows the whole page: where they are is what it's about.
function useFrames(review: Review, round: Round, flow: Flow, readings: Reading[] | undefined, changedIn: (step: number) => Place[]): (Frame | undefined)[] {
  const [frames, setFrames] = useState<(Frame | undefined)[]>([]);
  useEffect(() => {
    let current = true;
    if (readings)
      recording(review.id, round.number, flow.recording).then((events) => {
        const { acted, pointer, loads } = recorded(events);
        const found = flow.steps.map((step, i) => {
          const reading = readings.find((one) => one.step === step.title);
          if (!reading || i === 0 || loads.some((load) => load > step.at && load <= stepEnd(flow, i))) return undefined;
          const { width, height } = reading.screen;
          const end = stepEnd(flow, i);
          const worked = acted
            .filter(([moment]) => moment >= step.at && moment <= end)
            .toReversed()
            .map(([, node]) => reading.things.find((thing) => thing.node === node))
            .find((thing) => thing && thing.box.width * thing.box.height < (width * height) / 8)?.box;
          const what = changedIn(i).map((on) => boxIn(reading, on)).find(Boolean) ?? worked;
          const hand = pointer.filter(([moment]) => moment >= Math.max(step.at, end - 3) && moment <= end).map(([, x, y]) => ({ x, y, width: 0, height: 0 }));
          const all = [...(what ? [what] : []), ...hand];
          return all.length ? around(union(all), reading) : undefined;
        });
        if (current) setFrames(found);
      });
    return () => void (current = false);
  }, [review.id, round.number, flow.recording, !!readings]);
  return frames;
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

type Box = { x: number; y: number; width: number; height: number };

// Where something that changed is on a page: the things there by its role and name, or its part of the page.
function boxIn(reading: Reading, on: Place): Box | undefined {
  const { width: across, height: down } = reading.screen;
  const named = (role: string, name: string) => on.element?.role === role && on.element.name === name;
  const boxes = [
    ...reading.things.filter((thing) => named(thing.role, thing.name)).map((thing) => thing.box),
    ...(reading.items ?? []).filter((item) => named(item.role, item.words)).map((item) => item.box),
    ...(on.box ? [{ x: on.box.x * across, y: on.box.y * down, width: on.box.width * across, height: on.box.height * down }] : []),
  ];
  return boxes.length ? union(boxes) : undefined;
}

const union = (boxes: Box[]): Box => {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return { x: left, y: top, width: Math.max(...boxes.map((box) => box.x + box.width)) - left, height: Math.max(...boxes.map((box) => box.y + box.height)) - top };
};

// A part of the page with room around it, at most two and a half times as close as the whole page, in the page's own shape.
function around(box: Box, reading: Reading): Frame {
  const { width: across, height: down } = reading.screen;
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height];
  const width = Math.min(across, Math.max(right - left + across * 0.08, ((bottom - top + down * 0.25) * across) / down, across / 2.6));
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
