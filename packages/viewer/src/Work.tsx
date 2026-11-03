// The work, as one page: what was asked, then each situation it meets, step by step, as it is now, with your notes on
// it, and how it was before the work beside it when you compare. Choosing a step plays the flow from there in the frame.
// At the end, how it got here, and the one step to take. Where you arrive, and what "All flows" brings you back to.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Reading } from "@playthrough/page";
import { time, type Flow, type Place, type Review, type Round, type Verdict } from "@playthrough/review";
import { picture, recording } from "./api.ts";
import { EndMark } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { fill, unchangedSince, type Shown, type Standing } from "./notes.ts";
import { Compare, Said } from "./Card.tsx";
import { asWho } from "./people.ts";
import { recorded } from "./replay.ts";
import type { CloseUp } from "./flight.ts";
import { HOLD, Loop, ON, type Mark, type Placed } from "./Loop.tsx";
import type { Diamond } from "./changes.ts";
import { Conversation } from "./Notes.tsx";
import { Pinned } from "./Pinned.tsx";
import { Steps } from "./Steps.tsx";
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
  // Saying a situation looks good, or taking it back; none where nothing can be said.
  onLooksGood?: (flow: string) => void;
  threads: Threads;
  // What's new to you on the round, as the player's timeline marks it.
  diamonds: Diamond[];
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
  // The flows the work left as they were, against Before.
  const same = before ? unchangedSince(review, 0, round.number) : [];
  // The situation you last pointed at, which C and Space are for.
  const [active, setActive] = useState(round.flows[0]?.name);
  return (
    <div ref={props.room} inert={!up} className={`absolute inset-0 z-20 overflow-y-auto bg-ground transition-[opacity,visibility] duration-240 ease-calm ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      <div className="mx-auto w-full max-w-[1040px] px-8 wide:max-w-[1320px] pt-8 pb-4 phone:px-0 phone:pt-2">
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
              key={`${round.number} ${flow.name}`}
              review={review}
              round={round}
              before={before}
              flow={flow}
              changed={(work?.changes ?? []).flatMap((change) => change.seen.filter((on) => on.flow === flow.name).map((on) => (change.gone ? { ...on, element: undefined } : on)))}
              readings={props.read(round.number, flow.name)}
              notes={props.notes.filter((note) => note.on?.flow === flow.name)}
              standing={props.standing(flow.name)}
              onLooksGood={props.onLooksGood}
              threads={props.threads}
              fresh={props.diamonds.filter((diamond) => diamond.flow === flow.name).map((diamond) => diamond.at)}
              quiet={props.standing(flow.name)?.is === "good"}
              same={same.includes(flow.name)}
              onFlow={props.onFlow}
              left={props.left?.flow === flow.name ? props.left : undefined}
              active={up && active === flow.name}
              onActive={() => setActive(flow.name)}
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
// at. One step shows at a time, as it is now, its notes on it: to start with, the step with an answer waiting on you,
// else the last step where something changed. Compare puts how it was before the work beside it, the two moving together.
function Situation(props: { review: Review; round: Round; before?: Round; flow: Flow; changed: Place[]; readings?: Reading[]; notes: Shown[]; standing?: Standing; same: boolean; onLooksGood?: (flow: string) => void; threads: Threads; fresh: number[]; quiet: boolean; onFlow: (flow: string, beat: Beat) => void; left?: { flow: string; at: number }; active: boolean; onActive: () => void }) {
  const { review, round, before, flow, changed, readings, notes, standing, same, onLooksGood, threads, fresh, quiet, onFlow, left, active, onActive } = props;
  const stepOf = (at: number) => Math.max(0, flow.steps.findIndex((_, i) => stepEnd(flow, i) >= at - 0.05));
  // Its diamonds are what's new to you, as on the player's timeline: on the first round, what changed since Before.
  const changedAt = new Set(fresh.map(stepOf));
  // A note's step: where it was made, or made in the app, where the app was taken over from.
  const stepOfNote = (note: Shown) => (note.on?.at === undefined ? undefined : stepOf(note.on.app ? note.on.app.from.at : note.on.at));
  const notedAt = (step: number) => notes.filter((note) => stepOfNote(note) === step);
  // Where nothing changed, the step where the most is done: what it shows still working.
  const busiest = flow.steps.reduce((most, step, i) => ((step.actions?.length ?? 0) > (flow.steps[most]!.actions?.length ?? 0) ? i : most), 0);
  // It opens on an answer waiting on you, else on the last of what's new, else where the most is done.
  const waiting = notes.find((note) => note.toJudge && note.on?.at !== undefined);
  const [chosen, setChosen] = useState(() => (waiting ? stepOfNote(waiting)! : changedAt.size ? Math.max(...changedAt) : busiest));
  // Good for you, as nothing's changed since you said so, it arrives folded to its name, and opens when you choose.
  const [folded, setFolded] = useState(quiet);
  // Back from watching it, it's on the step you were on.
  const [cameBack, setCameBack] = useState(left);
  if (left !== cameBack) (setCameBack(left), left && setChosen(stepOf(left.at)));
  const frames = useFrames(review, round, flow, readings, (step) => changed.filter((on) => on.at !== undefined && stepOf(on.at) === step));
  const then = before?.flows.find((one) => one.name === flow.name);
  const thenAt = (step: number) => then?.steps.findIndex((one) => one.title === flow.steps[step]?.title) ?? -1;
  // Now shows on its own, the whole page; with Before beside it, each is close on the step's part of the page.
  const [comparing, setComparing] = useState(false);
  // Pointed at, a step in the list plays over and over, from the start each time another is chosen. Space plays on from
  // the step shown, each step into the next as the recording goes, and round again from the first. At rest, the step's
  // end, with its notes on it.
  const [started, setStarted] = useState<number>();
  const [through, setThrough] = useState(false);
  const play = () => setStarted(performance.now());
  const rest = () => (setThrough(false), setStarted(undefined));
  const choose = (step: number) => (setThrough(false), setChosen(step), started !== undefined && setStarted(performance.now()));
  // C and Space are the situation's you last pointed at.
  useEffect(() => {
    if (!active) return rest();
    const down = (event: KeyboardEvent) => {
      const target = event.target as Element;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || target.closest?.("input, textarea, [contenteditable]")) return;
      if (event.key === " ") {
        event.preventDefault();
        if (through) rest();
        else (setThrough(true), play());
      } else if (event.key.toLowerCase() === "c") setComparing(!comparing);
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, [active, through, comparing]);
  const frame = comparing ? frames[chosen] : undefined;
  const thenStep = thenAt(chosen);
  const now = { from: flow.steps[chosen]!.at, until: stepEnd(flow, chosen) };
  const was = then && thenStep >= 0 ? { from: then.steps[thenStep]!.at, until: stepEnd(then, thenStep) } : undefined;
  // Each side says how long its step plays once its recording is in; both go round together, as long as the longer.
  const [lengths, setLengths] = useState<{ now?: number; was?: number }>({});
  // Played through, a step goes straight on into the next, holding only before it goes round again.
  const last = chosen === flow.steps.length - 1;
  const cycle = Math.max(lengths.now ?? 0, (comparing && was && lengths.was) || 0) + (through && !last ? ON : HOLD);
  useEffect(() => {
    if (!through || started === undefined) return;
    const next = setTimeout(() => (setChosen(last ? 0 : chosen + 1), setStarted(performance.now())), started + cycle * 1000 - performance.now());
    return () => clearTimeout(next);
  }, [through, started, cycle]);
  // How long until a step plays again: played through, it isn't, and waits on its end for the next.
  const again = through ? Infinity : cycle;
  // The step's notes, where Now finds their things at rest; each place is for the step and the view it was found in.
  const here = notedAt(chosen);
  // One made in the app is on its thing as it was written, found by its name: the app's nodes aren't this recording's.
  const written = (note: Shown) => review.sends.flatMap((send) => send.notes).find((kept) => kept.id === note.id)?.on ?? note.on;
  const marks: Mark[] = here.map((note) =>
    note.on?.app ? { id: note.id, name: written(note)?.element?.name ?? note.on.element?.name } : { id: note.id, node: note.on?.element?.node, name: note.on?.element?.name, point: note.on?.point },
  );
  const view = `${chosen} ${comparing}`;
  const [placed, setPlaced] = useState<{ view: string; at: Placed }>();
  // Open beside its thing, the answer waiting on you, until you open another or close it; judged, it stays open.
  const [picked, setPicked] = useState<{ step: number; id?: string }>();
  const open = comparing ? undefined : picked?.step === chosen ? picked.id : here.find((note) => note.toJudge)?.id;
  const opened = here.find((note) => note.id === open);
  const [asking, setAsking] = useState<string>();
  // The step's segment is where its picture is in it: full at rest, as the picture is its end, and filling as it plays.
  const progress = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bar = progress.current;
    if (!bar) return;
    if (started === undefined || !lengths.now) return void bar.style.removeProperty("--done");
    let frameId = 0;
    const tick = () => {
      bar.style.setProperty("--done", String(Math.min(1, (((performance.now() - started) / 1000) % again) / lengths.now!)));
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [started, again, lengths.now, chosen]);
  // Opened, the step plays in the frame as it plays here, once, from the page as it begins: that picture's at hand.
  const begins = chosen > 0 ? picture(review.id, round.number, flow.recording, chosen - 1) : undefined;
  useEffect(() => void (begins && (new Image().src = begins)), [begins]);
  if (folded)
    return (
      <section className="grid wide:grid-cols-[260px_1fr] wide:gap-x-8">
        <button className="flex items-baseline justify-between gap-4 px-0.5 text-left opacity-60 transition-opacity duration-150 ease-calm hover:opacity-100 wide:col-start-2" onClick={() => setFolded(false)} aria-expanded={false}>
          <h3 className="min-w-0 text-[15px] leading-[21px] font-semibold text-balance">
            {flow.name}
            {asWho(flow) && <span className="font-normal text-soft"> {asWho(flow)}</span>}
          </h3>
          <span className="flex flex-none items-center gap-1.5 text-xs leading-4 whitespace-nowrap text-green">
            <EndMark end="good" just={false} className="size-3 flex-none" />
            Looks good
          </span>
        </button>
      </section>
    );
  return (
    <section className="grid gap-3 wide:grid-cols-[260px_1fr] wide:gap-x-8 wide:gap-y-4" onPointerEnter={onActive}>
      <div className="grid content-start gap-3 wide:col-start-2 wide:row-start-1">
        <div className="flex items-baseline justify-between gap-4 px-0.5">
          <h3 className="min-w-0 text-[15px] leading-[21px] font-semibold text-balance">
            {flow.name}
            {asWho(flow) && <span className="font-normal text-soft"> {asWho(flow)}</span>}
          </h3>
          <span className="flex flex-none flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 whitespace-nowrap">
            {standing && SAYS.includes(standing.is) && <span className={INK[standing.is]}>{says(standing)} ·</span>}
            {same && <span className="text-faint">Same as before ·</span>}
            <span className="text-faint tabular-nums">{time(flow.length)}</span>
            {before && <Compare on={comparing} onPress={() => setComparing(!comparing)} onRelease={() => {}} bar="-my-1 ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg aria-pressed:text-fg" />}
            {standing && onLooksGood && JUDGED.includes(standing.is) && (
              <button
                aria-pressed={standing.is === "good"}
                className="-my-1 ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg aria-pressed:text-green"
                onClick={() => onLooksGood(flow.name)}
              >
                <EndMark end={standing.is === "good" ? "good" : "asks"} ahead just={false} className="size-3 flex-none" />
                Looks good
              </button>
            )}
          </span>
        </div>
        {flow.line && (
          <div className="px-0.5 text-[13px]">
            <Said who={round.by}>{flow.line}</Said>
          </div>
        )}
      </div>
      <Steps
        flow={flow}
        chosen={chosen}
        changed={changedAt}
        notedAt={notedAt}
        progress={progress}
        by="point"
        onChoose={choose}
        onPointerEnter={() => (setThrough(false), play())}
        onPointerLeave={rest}
        className="wide:col-start-1 wide:row-start-2 wide:self-start"
      />
      <div className="grid content-start gap-3 wide:col-start-2">
        <div className={`grid gap-4 ${comparing ? "grid-cols-2 phone:grid-cols-1" : ""}`}>
          <figure className="grid content-start gap-2">
            <div className="relative">
              <button
                data-picture={flow.name}
                className="relative block aspect-[1.6] w-full overflow-hidden rounded-lg bg-paper shadow-frame transition-shadow duration-150 ease-calm hover:shadow-[0_0_0_1px_var(--edge),0_8px_24px_var(--drop)] data-flying:invisible"
                aria-label={`Play ${flow.name} from ${flow.steps[chosen]?.title}`}
                onClick={() => onFlow(flow.name, { ...now, closeUp: { src: begins, frame, page: readings?.[chosen]?.screen ?? { width: 1600, height: 1000 } } })}
              >
                <Still src={picture(review.id, round.number, flow.recording, chosen)} frame={frame} />
                <Loop
                  review={review.id}
                  round={round.number}
                  recording={flow.recording}
                  {...now}
                  frame={frame}
                  started={started}
                  cycle={again}
                  marks={marks}
                  onMarks={(at) => setPlaced({ view, at })}
                  onLength={(now) => setLengths((all) => ({ ...all, now }))}
                />
              </button>
              <Pinned notes={here} placed={placed?.view === view ? placed.at : {}} open={open} faded={started !== undefined || placed?.view !== view} onOpen={(id) => setPicked({ step: chosen, id })}>
                {opened && (
                  <Conversation
                    note={opened}
                    you={threads.you}
                    readOnly={threads.readOnly}
                    asking={asking === opened.id}
                    unfinished={threads.unfinished[opened.id]}
                    away={false}
                    onAsking={(on) => setAsking(on ? opened.id : undefined)}
                    onUnfinished={(words) => threads.onUnfinished(opened.id, words)}
                    onJudge={(verdict) => (threads.onJudge(opened, verdict), setPicked({ step: chosen, id: opened.id }))}
                    onEdit={(words) => threads.onEdit(opened.id, words)}
                    onShow={() => {}}
                  />
                )}
              </Pinned>
            </div>
            {comparing && <figcaption className="px-0.5 text-xs leading-4 text-soft">Now</figcaption>}
          </figure>
          {comparing && (
            <figure className="grid content-start gap-2">
              {then && was ? (
                <span className="relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame">
                  <Still src={picture(review.id, 0, then.recording, thenStep)} frame={frame} />
                  <Loop review={review.id} round={0} recording={then.recording} {...was} frame={frame} started={started} cycle={again} onLength={(was) => setLengths((all) => ({ ...all, was }))} />
                </span>
              ) : (
                <span className="grid aspect-[1.6] place-content-center rounded-lg border border-dashed border-line px-6 text-center text-[13px] leading-5 text-soft">
                  {then ? "Before the work, there was no such step" : "New: there was nothing like it before"}
                </span>
              )}
              <figcaption className="px-0.5 text-xs leading-4 text-soft">Before</figcaption>
            </figure>
          )}
        </div>
      </div>
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

// What a thread on the page can do: judge an answer, say what's still not right, change a note not sent yet.
export type Threads = {
  you: string;
  readOnly: boolean;
  unfinished: Record<string, string>;
  onUnfinished: (id: string, words: string | undefined) => void;
  onJudge: (note: Shown, verdict: Verdict | undefined) => void;
  onEdit: (id: string, words: string | undefined) => void;
};

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

// What a situation's standing says in words beside its Looks good, and when it can be judged at all.
const SAYS: Standing["is"][] = ["not saved", "needs you", "to send", "with the agent", "looked good"];
const JUDGED: Standing["is"][] = ["good", "is it good", "needs you", "looked good"];

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
