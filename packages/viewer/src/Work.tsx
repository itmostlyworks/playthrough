// The work, as one page: what was asked, then each situation it meets, step by step, as it is now, with your notes on
// it, and how it was before the work beside it when you compare. The situation you're on has the bar: you note it,
// compare it and take it over where it is. At the end, how it got here, and the one step to take.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { time, type Flow, type Note, type Place, type Review, type Round, type Verdict } from "@playthrough/review";
import { picture, recording } from "./api.ts";
import { Bar } from "./Bar.tsx";
import { EndMark } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { fill, unchangedSince, type Shown, type Standing } from "./notes.ts";
import { Said } from "./Card.tsx";
import { asWho } from "./people.ts";
import { recorded, type Scrolled } from "./replay.ts";
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
  acting: Acting;
  // The flow you came back from, and where you were in it.
  left?: { flow: string; at: number };
  arrived?: Round;
  working?: string;
  onRound: (round: number) => void;
};

// What can be done on the situation you're on, from the bar across its recording's bottom edge, and how far it's got.
export type Acting = {
  latest: boolean;
  noting: boolean;
  // None where no note can be made, or nothing taken over.
  onNote?: () => void;
  onTakeOver?: () => void;
  onBack: () => void;
  onPlace: (on: Place) => void;
  // Where the situation you're on rests: Take over takes it over there.
  onRest: (flow: string, at: number) => void;
  onClose: () => void;
  // Taken over: the app made ready unseen, being made ready as you wait, or yours.
  live?: { flow: string; address?: string; shown: boolean; inApp: boolean };
  // The note you're writing on a recording: its number, and its card.
  writing?: { note: Note; number: number; card: ReactNode };
  // The note opened last: a note saved stays open.
  opened?: string;
};

export function Work(props: Props) {
  const { review, round, up, step, acting } = props;
  const before = review.rounds.find((kept) => kept.number === 0 && kept.flows.length && round.number > 0);
  // What the work changed, against Before where there is one, else against the round before.
  const work = review.comparisons.find((kept) => kept.round === round.number && kept.since === 0) ?? review.comparisons.findLast((kept) => kept.round === round.number);
  const general = props.notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  // The flows the work left as they were, against Before.
  const same = before ? unchangedSince(review, 0, round.number) : [];
  // The situation you're on, which the bar and the keys are for: the one the pointer settles on, not one it passes over.
  // Noting, writing or in the app, you stay on it, and in the app the page holds still and the rest of it rests.
  const [active, setActive] = useState(round.flows[0]?.name);
  const busy = acting.noting || !!acting.writing || !!acting.live?.shown;
  const settling = useRef<number>(undefined);
  const pointed = useRef<string>(undefined);
  const settleOn = (name?: string) => {
    clearTimeout(settling.current);
    pointed.current = name;
    if (name && !busy) settling.current = window.setTimeout(() => setActive(name), SETTLE);
  };
  // Done, you're on the one the pointer's on.
  useEffect(() => void (!busy && settleOn(pointed.current)), [busy]);
  const inApp = acting.live?.shown ? acting.live.flow : undefined;
  return (
    <div ref={props.room} inert={!up} className={`absolute inset-0 z-20 bg-ground transition-[opacity,visibility] duration-240 ease-calm ${inApp ? "overflow-hidden" : "overflow-y-auto"} ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      {/* As wide as a situation's recording can be with its name over it, the bar and its steps under it, and the foot, on the screen. */}
      <div className="mx-auto w-full max-w-[min(1320px,max(760px,calc((100dvh_-_250px)_*_1.6_+_64px)))] px-8 pt-8 pb-4 phone:px-0 phone:pt-2">
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
              left={props.left?.flow === flow.name ? props.left : undefined}
              glimpsed={props.read(round.number, flow.name, true)}
              acting={acting}
              active={up && active === flow.name}
              resting={!!inApp && inApp !== flow.name}
              onPointerEnter={() => settleOn(flow.name)}
              onPointerLeave={() => settleOn()}
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
// On the one you're on, the bar: a note is made on the step's end, as it rests, and taken over, the app is there in its
// place.
type SituationProps = {
  review: Review;
  round: Round;
  before?: Round;
  flow: Flow;
  changed: Place[];
  readings?: Reading[];
  glimpsed?: Glimpse[];
  notes: Shown[];
  standing?: Standing;
  same: boolean;
  onLooksGood?: (flow: string) => void;
  threads: Threads;
  fresh: number[];
  quiet: boolean;
  left?: { flow: string; at: number };
  acting: Acting;
  active: boolean;
  resting: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

function Situation(props: SituationProps) {
  const { review, round, before, flow, changed, readings, notes, standing, same, onLooksGood, threads, fresh, quiet, left, acting, active } = props;
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
  const playThrough = () => (through ? rest() : (setThrough(true), play()));
  // Taken over here: the app, unseen until it's yours, and the frame's edge warm from Take over until you're back.
  const live = acting.live?.flow === flow.name ? acting.live : undefined;
  const taken = !!live?.shown;
  if (taken && comparing) setComparing(false);
  // C and Space are the situation's you're on; in the app, they're the app's.
  useEffect(() => {
    if (!active) return rest();
    if (taken) return;
    const down = (event: KeyboardEvent) => {
      const target = event.target as Element;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || target.closest?.("input, textarea, [contenteditable]")) return;
      if (event.key === " ") {
        event.preventDefault();
        playThrough();
      } else if (event.key.toLowerCase() === "c") setComparing(!comparing);
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, [active, through, comparing, taken]);
  // Noting, it rests, as a note is made on the step's end; in the app, the app notes what you click.
  const noting = active && acting.noting;
  useEffect(() => void (noting && rest()), [noting]);
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
  // At rest on the situation you're on, that's where Take over takes it over.
  const resting = active && started === undefined && !taken;
  const restsAt = Math.round((now.until - 0.05) * 100) / 100;
  useEffect(() => void (resting && acting.onRest(flow.name, restsAt)), [resting, restsAt]);
  // The step's notes, where Now finds their things at rest; each place is for the step and the view it was found in.
  const here = notedAt(chosen);
  // The one you're writing, where you clicked on this step.
  const writing = acting.writing?.note.on?.flow === flow.name && !acting.writing.note.on.app && acting.writing.note.on.at !== undefined && stepOf(acting.writing.note.on.at) === chosen ? acting.writing : undefined;
  // One made in the app is on its thing as it was written, found by its name: the app's nodes aren't this recording's.
  const written = (note: Shown) => review.sends.flatMap((send) => send.notes).find((kept) => kept.id === note.id)?.on ?? note.on;
  const marks: Mark[] = [
    ...here.map((note) =>
      note.on?.app ? { id: note.id, name: written(note)?.element?.name ?? note.on.element?.name } : { id: note.id, node: note.on?.element?.node, name: note.on?.element?.name, point: note.on?.point },
    ),
    ...(writing ? [{ id: writing.note.id, node: writing.note.on?.element?.node, point: writing.note.on?.point }] : []),
  ];
  const view = `${chosen} ${comparing}`;
  const [placed, setPlaced] = useState<{ view: string; at: Placed }>();
  // Open beside its thing, the answer waiting on you, until you open another or close it; judged, it stays open. The
  // note you're writing is open until it's saved, and then it's the note that's open.
  const [picked, setPicked] = useState<{ step: number; id?: string }>();
  const [saved, setSaved] = useState(acting.opened);
  if (acting.opened !== saved) {
    setSaved(acting.opened);
    const note = notes.find((note) => note.id === acting.opened);
    const step = note && stepOfNote(note);
    if (step !== undefined) (setChosen(step), setPicked({ step, id: note!.id }));
  }
  const open = writing ? writing.note.id : comparing ? undefined : picked?.step === chosen ? picked.id : here.find((note) => note.toJudge)?.id;
  const opened = here.find((note) => note.id === open);
  const [asking, setAsking] = useState<string>();
  // The app is the page the recording was made of, at its size, as wide as the picture.
  const box = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(0);
  useEffect(() => {
    const shown = box.current;
    if (!shown) return;
    const watching = new ResizeObserver(() => setWide(shown.clientWidth));
    watching.observe(shown);
    return () => watching.disconnect();
  }, [folded]);
  const screen = readings?.find((one) => one.step === flow.steps[chosen]?.title)?.screen ?? { width: 1280, height: 800 };
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
  // Handed to you, the app is scrolled where the recording rests, records what you do, and has your keys; given back,
  // it's no longer yours.
  const app = useRef<HTMLIFrameElement>(null);
  const scrolled = useRef<() => Scrolled>(undefined);
  const yours = !!live?.inApp && !!live.shown;
  useEffect(() => {
    const there = app.current?.contentWindow;
    if (!there) return;
    if (yours) there.postMessage({ playthrough: "scroll", ...scrolled.current?.() }, "*");
    there.postMessage({ playthrough: "yours", yours }, "*");
    if (yours) app.current!.focus();
  }, [yours]);
  if (folded)
    return (
      <section className="grid">
        <button className="flex items-baseline justify-between gap-4 px-0.5 text-left opacity-60 transition-opacity duration-150 ease-calm hover:opacity-100" onClick={() => setFolded(false)} aria-expanded={false}>
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
    <section
      inert={props.resting}
      className={`grid gap-3 transition-opacity duration-500 ease-calm ${props.resting ? "opacity-30" : ""}`}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
    >
      <div className="grid content-start gap-3">
        <div className="flex items-baseline justify-between gap-4 px-0.5">
          <h3 className="min-w-0 text-[15px] leading-[21px] font-semibold text-balance">
            {flow.name}
            {asWho(flow) && <span className="font-normal text-soft"> {asWho(flow)}</span>}
          </h3>
          <span className="flex flex-none flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 whitespace-nowrap">
            {standing && SAYS.includes(standing.is) && <span className={INK[standing.is]}>{says(standing)} ·</span>}
            {same && <span className="text-faint">Same as before ·</span>}
            <span className="text-faint tabular-nums">{time(flow.length)}</span>
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
      <div className="grid content-start gap-3">
        <div className={`grid gap-4 ${comparing ? "grid-cols-2 phone:grid-cols-1" : ""}`}>
          <figure className="grid content-start gap-2">
            <div ref={box} className="relative">
              {/* A click plays it through and stops it, as Space does; noting, it notes what's under it. */}
              <button
                data-picture={flow.name}
                className="relative block aspect-[1.6] w-full overflow-hidden rounded-lg bg-paper shadow-frame"
                aria-label={`Play ${flow.name} from ${flow.steps[chosen]?.title}`}
                onClick={playThrough}
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
                  things={noting && !taken && !writing ? props.glimpsed : undefined}
                  onPlace={noting && !taken && !writing ? (on) => acting.onPlace({ flow: flow.name, at: restsAt, ...on }) : undefined}
                  scrolled={scrolled}
                />
              </button>
              {/* Made ready unseen, see-through rather than hidden, as a hidden frame from another address never settles. */}
              {live?.address && (
                <div data-live data-yours={yours || undefined} className={`absolute inset-0 z-10 overflow-hidden rounded-lg transition-opacity duration-300 ease-calm ${yours ? "" : "pointer-events-none opacity-0"}`}>
                  <iframe
                    ref={app}
                    key={live.address}
                    src={live.address}
                    title="The app, taken over"
                    className="absolute top-0 left-0 origin-top-left border-0 bg-paper"
                    style={{ width: screen.width, height: screen.height, transform: `scale(${wide / screen.width})` }}
                  />
                </div>
              )}
              {taken && <div className={`pointer-events-none absolute inset-0 z-10 rounded-lg shadow-[inset_0_0_0_1.5px_rgba(217,162,58,0.75),inset_0_0_22px_rgba(217,162,58,0.16)] ${live.inApp ? "" : "animate-pulse"}`} />}
              {active && (
                <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2">
                  <div className="animate-arrive">
                    <Bar
                      live={taken ? (live.inApp ? "shown" : "waiting") : undefined}
                      latest={acting.latest}
                      compare={before && { on: comparing, off: taken, onPress: () => setComparing(!comparing), onRelease: () => {} }}
                      noting={noting}
                      onNote={acting.onNote}
                      onTakeOver={acting.onTakeOver}
                      onBack={acting.onBack}
                      flow={flow.name}
                    />
                  </div>
                </div>
              )}
              {!taken && (
              <Pinned
                notes={here}
                writing={writing && { id: writing.note.id, number: writing.number }}
                placed={placed?.view === view ? placed.at : {}}
                open={open}
                faded={started !== undefined || placed?.view !== view}
                onOpen={(id) => (writing && id !== writing.note.id ? acting.onClose() : setPicked({ step: chosen, id }))}
              >
                {writing?.card}
                {!writing && opened && (
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
              )}
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
      <Steps
        flow={flow}
        chosen={chosen}
        changed={fresh}
        notedAt={notedAt}
        progress={progress}
        by="point"
        onChoose={choose}
        onPointerEnter={() => (setThrough(false), play())}
        onPointerLeave={rest}
        className="mt-6"
      />
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

// How long the pointer stays on a situation before it's the one you're on, so passing over one on the way doesn't move
// the bar there, in milliseconds.
const SETTLE = 250;

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
