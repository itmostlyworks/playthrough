// The work, as the app itself: the scene you're in, which is the app wherever you come to rest along its way, as who
// it's done as, yours to try; and beside it, what was asked and every scene it meets, a line each, the one you're in open
// to its steps. A scene's line takes you into it. The keys go a stop at a time, from a scene's end on to the next. At the
// list's end, how it got here, and the one step to take.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Note, Place, Review, Round, Scene } from "@playthrough/review";
import { Key, mac } from "./Card.tsx";
import type { Diamond } from "./changes.ts";
import { EndMark, endOf } from "./Chosen.tsx";
import { fill, type Shown, type Standing } from "./notes.ts";
import { asWho } from "./people.ts";
import { clock } from "./Rounds.tsx";
import { SceneView, type Threads } from "./Scene.tsx";
import type { Step } from "./Step.tsx";
import type { Read } from "./things.ts";

type Props = {
  room: RefObject<HTMLDivElement | null>;
  review: Review;
  round: Round;
  up: boolean;
  read: Read;
  notes: Shown[];
  // Whether a note was made in the app, on whichever round: shown where this round has its thing, it's tried as it was found.
  madeInApp: (id: string) => boolean;
  standing: (scene: string) => Standing | undefined;
  // Saying a scene looks good, or taking it back; none where nothing can be said.
  onLooksGood?: (scene: string) => void;
  threads: Threads;
  // What's new to you on the round, as the player's timeline marks it.
  diamonds: Diamond[];
  accepted: boolean;
  step?: Step;
  trouble: string[];
  acting: Acting;
};

// What can be done on the scene you're on, from the bar across its frame's bottom edge, and how far the app has got.
export type Acting = {
  noting: boolean;
  // None where no note can be made, or nothing taken over.
  onNote?: () => void;
  onTakeOver?: () => void;
  // Come to rest at a place, the app comes there by itself; gone to one, it's made ready while the recording plays into
  // it; and going on from it, it's left.
  onStepIn: () => void;
  onReady: (scene: string, at: number) => void;
  onAway: () => void;
  onBack: () => void;
  onPlace: (on: Place) => void;
  // Where the scene you're on rests: Take over takes it over there, or at an answer to a note made in the app, where
  // the note was found, what you did there done again.
  onRest: (scene: string, at: number, again?: string) => void;
  onClose: () => void;
  // The app: made ready unseen, being made ready as you wait, or yours; or why it couldn't be; and whether you left it.
  live?: { scene: string; address?: string; shown: boolean; inApp: boolean; due?: number; at?: { x: number; y: number }; problems?: string[]; left?: boolean };
  // The note you're writing on a recording: its number, and the box its words are written in.
  writing?: { note: Note; number: number; words: ReactNode };
  // The note opened last: a note saved stays open.
  opened?: string;
};

export function Work(props: Props) {
  const { review, round, up, step, acting } = props;
  const before = review.rounds.find((kept) => kept.number === 0 && kept.scenes.length && round.number > 0);
  // What the work changed, against Before where there is one, else against the round before.
  const work = review.comparisons.find((kept) => kept.round === round.number && kept.since === 0) ?? review.comparisons.findLast((kept) => kept.round === round.number);
  const general = props.notes.filter((note) => !note.on || !round.scenes.some((scene) => scene.name === note.on?.scene));
  // The scene you're in: arriving, the first with an answer waiting on you, else the first that asks whether it looks
  // good to you, else the first.
  const answerIn = (scene: Scene) => props.notes.some((note) => note.on?.scene === scene.name && note.state === "needs you" && (note.on.app ? note.on.app.from.at : note.on.at) !== undefined);
  const asks = (scene: Scene) => {
    const standing = props.standing(scene.name);
    return !!standing?.asks && standing.is !== "good";
  };
  const [current, setCurrent] = useState(() => (round.scenes.find(answerIn) ?? round.scenes.find(asks) ?? round.scenes[0])?.name);
  const scene = round.scenes.find((one) => one.name === current) ?? round.scenes[0];
  const i = scene ? round.scenes.indexOf(scene) : -1;
  // A stop gone to in it from elsewhere on the page: by the keys, or a note's.
  const [go, setGo] = useState<{ round: number; scene: string; stop?: number; note?: string }>();
  const busy = acting.noting || !!acting.writing;
  // Going into another scene leaves the app where you were; it comes up at the other's first place, or the stop asked
  // for, with the page back at its top.
  const open = (name: string, there?: { stop?: number; note?: string }) => {
    if (name !== scene?.name) (acting.onAway(), setCurrent(name), props.room.current?.scrollTo({ top: 0 }));
    if (there) setGo({ round: round.number, scene: name, ...there });
  };
  // With the keys, along the way a stop at a time: from a scene's end on to the next one's first place, and back to the
  // end of the one before.
  const move = (by: number) => {
    const section = props.room.current?.querySelector<HTMLElement>("[data-scene]");
    if (!section || !scene) return;
    const to = Number(section.dataset.stop) + by;
    if (to >= Number(section.dataset.stops)) return round.scenes[i + 1] && open(round.scenes[i + 1]!.name);
    if (to < 0) return round.scenes[i - 1] && open(round.scenes[i - 1]!.name, { stop: Infinity });
    open(scene.name, { stop: to });
  };
  const now = useRef({ busy, move, scene: scene?.name });
  now.current = { busy, move, scene: scene?.name };
  useEffect(() => {
    if (!up || busy) return;
    const down = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as Element).closest?.("input, textarea, [contenteditable], [role=slider]")) return;
      const by = event.key === "ArrowDown" || (event.key === " " && !event.shiftKey) ? 1 : event.key === "ArrowUp" || (event.key === " " && event.shiftKey) ? -1 : 0;
      if (!by) return;
      event.preventDefault();
      move(by);
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  });
  // A verdict lands where it was said, and the way goes on from there, unless you've gone on already: an answer judged,
  // to the next stop; Looks good at a scene's end, to the next scene that asks it of you, if one's after it.
  const goOn = (name: string) => {
    const section = () => props.room.current?.querySelector<HTMLElement>(`[data-scene="${CSS.escape(name)}"]`);
    const was = section()?.dataset.stop;
    window.setTimeout(() => {
      const here = section();
      if (now.current.busy || now.current.scene !== name || here?.dataset.stop !== was) return;
      if (Number(here!.dataset.stop) < Number(here!.dataset.stops) - 1) return now.current.move(1);
      const next = round.scenes.slice(round.scenes.findIndex((one) => one.name === name) + 1).find(asks);
      if (next) open(next.name);
    }, LANDS);
  };
  // A note gone to from the review's end: its scene, at its stop if it's one.
  const toNote = (note: Shown) => note.on?.scene && round.scenes.some((one) => one.name === note.on!.scene) && open(note.on.scene, { note: note.id });
  const line = (other: Scene) => <Line key={other.name} scene={other} standing={props.standing(other.name)} onOpen={() => open(other.name)} />;
  const header = (
    <header className="mb-5">
      <h2 className="text-[20px] leading-[27px] font-semibold tracking-[-0.01em] text-balance">{review.title}</h2>
      {review.asked && <p className="mt-2 text-[14px] leading-[22px] text-soft">{review.asked}</p>}
      <p className="mt-2 text-[13px] leading-5 text-soft">
        {round.scenes.length} {round.scenes.length === 1 ? "scene" : "scenes"}, recorded by {round.by}
        {props.accepted && <span className="text-green"> · Accepted</span>}
      </p>
    </header>
  );
  const end = (
    <div className="mt-10 grid content-start gap-8 empty:hidden phone:mt-8">
      <Story review={review} round={round} general={general} />
      <End step={step} trouble={props.trouble} toSend={props.notes.filter((note) => note.unsent)} onNote={toNote} />
    </div>
  );
  return (
    <div ref={props.room} data-room="" inert={!up} className={`absolute inset-0 z-20 overflow-y-auto bg-ground transition-[opacity,visibility] duration-240 ease-calm ${up ? "visible opacity-100" : "invisible opacity-0"}`}>
      {/* As wide as the app can be held whole in the window, its bar under it, with the list beside it. */}
      <div className="mx-auto w-full max-w-[min(1480px,max(1000px,calc((100dvh_-_128px)_*_1.6_+_436px)))] px-8 pt-6 pb-10 phone:px-4 phone:pt-2">
        {scene ? (
          <SceneView
            key={`${round.number} ${scene.name}`}
            review={review}
            round={round}
            before={before}
            scene={scene}
            changed={(work?.changes ?? []).flatMap((change) => change.seen.filter((on) => on.scene === scene.name).map((on) => (change.gone ? { ...on, element: undefined } : on)))}
            readings={props.read(round.number, scene.name)}
            notes={props.notes.filter((note) => note.on?.scene === scene.name)}
            noteOf={(id) => props.notes.find((note) => note.id === id)}
            madeInApp={props.madeInApp}
            standing={props.standing(scene.name)}
            onLooksGood={props.onLooksGood}
            threads={props.threads}
            diamonds={props.diamonds.filter((diamond) => diamond.scene === scene.name)}
            glimpsed={props.read(round.number, scene.name, true)}
            acting={acting}
            active={up}
            go={go?.round === round.number && go.scene === scene.name ? go : undefined}
            above={
              <>
                {header}
                {i > 0 && <ul className="mb-4 grid gap-0.5">{round.scenes.slice(0, i).map(line)}</ul>}
              </>
            }
            below={
              <>
                {i < round.scenes.length - 1 && <ul className="mt-4 grid gap-0.5">{round.scenes.slice(i + 1).map(line)}</ul>}
                {end}
              </>
            }
            onSaid={() => goOn(scene.name)}
          />
        ) : (
          <>
            {header}
            {end}
          </>
        )}
      </div>
    </div>
  );
}

// How long a verdict is seen where it was said before the way goes on, in milliseconds.
const LANDS = 600;

// Another scene, a line in the list: where it stands, as its end's square, in the column the steps' numbers are in, and
// its name, as who; pressed, you're in it. As pictures side by side, scenes were a second row of stills under what's new
// to you; a small picture beside each name read as a broken image.
function Line({ scene, standing, onOpen }: { scene: Scene; standing?: Standing; onOpen: () => void }) {
  const end = standing && endOf(standing);
  return (
    <li>
      <button className="group relative isolate flex w-full min-w-0 items-center py-1.5 pl-8 text-left before:absolute before:inset-y-0 before:left-6 before:-right-3 before:-z-1 before:rounded-xl before:transition-colors before:duration-150 before:ease-calm hover:before:bg-hover" onClick={onOpen}>
        <span className="absolute top-1/2 left-0 grid size-5 -translate-y-1/2 place-items-center">{end && <EndMark end={end} ahead={end === "asks"} just={false} className="size-3.5" />}</span>
        <span className={`min-w-0 truncate text-[14px] leading-5 transition-colors duration-150 ease-calm group-hover:text-fg ${end === "good" ? "text-soft" : "text-fg"}`}>
          {scene.name}
          {asWho(scene) && <span className="text-soft"> {asWho(scene)}</span>}
        </span>
      </button>
    </li>
  );
}

// The review's end, under the last scene's line: where what you've said goes, all of it at once, as a pull request's
// review is submitted at its foot. The one step left once you've been through it (finish a note, send, accept) and,
// sent, what the agent is doing with it, said where Send was. Under Send, the notes it sends, each going to where it was
// written.
function End({ step, trouble, toSend, onNote }: { step?: Step; trouble: string[]; toSend: Shown[]; onNote: (note: Shown) => void }) {
  if (step?.kind !== "go" && step?.kind !== "agent") return null;
  const sign =
    step.kind === "agent" ? (
      <i className={`size-1.5 rounded-full bg-slate ${step.busy ? "animate-breathe" : "opacity-45"}`} />
    ) : (
      <EndMark end={step.final === "accept" ? "good" : step.final === "send" ? "to send" : "asks"} just={false} className="size-3.5" />
    );
  const words = (
    <>
      <span className="flex-none">{step.words}</span>
      {step.what && <span className="min-w-0 truncate text-soft">· {step.what}</span>}
    </>
  );
  return (
    <div className="w-full min-w-0">
      <div className="relative isolate py-2 pl-8">
        <span className="absolute top-2 left-0 grid size-5 place-items-center">{sign}</span>
        {step.kind === "go" ? (
          <button
            className="flex w-full min-w-0 items-center gap-1.5 pr-2 text-left text-[14px] leading-5 font-medium before:absolute before:inset-y-0 before:left-6 before:-right-3 before:-z-1 before:rounded-xl before:bg-surface before:shadow-[0_0_0_1px_var(--edge)] hover:before:bg-hover"
            aria-keyshortcuts={step.final === "accept" ? undefined : step.final ? (mac ? "Meta+Enter" : "Control+Enter") : "Enter"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={step.take}
          >
            {words}
            {step.final !== "accept" && <Key className="ml-auto">{step.final ? (mac ? "⌘↵" : "Ctrl ↵") : "↵"}</Key>}
          </button>
        ) : (
          <p key={step.words} className="flex min-w-0 animate-arrive items-center gap-1.5 text-[14px] leading-5 font-medium" role="status">
            {words}
          </p>
        )}
      </div>
      {step.kind === "go" && step.final === "send" && toSend.length > 0 && (
        <ul className="mt-1.5 grid gap-1 pl-8">
          {toSend.map((note) => (
            <li key={note.id}>
              <button className="flex w-full min-w-0 items-baseline gap-2 text-left text-[13px] leading-5 text-soft hover:text-fg" onClick={() => onNote(note)}>
                <i className={`size-1.5 flex-none translate-y-[-1px] rounded-full ${fill(note)}`} />
                <span className="truncate">{note.turns[0]?.words}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {trouble.length > 0 && <p className="mt-2 pl-8 text-[12.5px] leading-[18px] text-amber-ink">{trouble.join(" ")}</p>}
    </div>
  );
}

// How it got here, a line each time the agent recorded it: by whom and when, what it answered, and what was sent back,
// as a pull request's pushes are told among its comments. A round is the agent's turn, not a place to go. Then the
// notes on scenes this round doesn't have, outdated as their scene is gone.
function Story({ review, round, general }: { review: Review; round: Round; general: Shown[] }) {
  const rounds = review.rounds.filter((kept) => kept.number > 0 && kept.number <= round.number);
  if (rounds.length < 2 && !general.length) return null;
  return (
    <section className="border-t border-line pt-6">
      <h3 className="text-[13px] leading-5 font-semibold">How it got here</h3>
      <ol className="mt-2 grid gap-1 text-[13px] leading-5 text-soft">
        {rounds.map((kept, i) => {
          const sent = review.sends.filter((send) => send.round === kept.number);
          const notes = sent.reduce((count, send) => count + send.notes.length, 0);
          return (
            <li key={kept.number}>
              {i ? "Recorded again" : "Recorded"} by {kept.by}
              {kept.finished && ` at ${clock(kept.finished)}`}
              {kept.replies.length > 0 && `, answering ${kept.replies.length} ${kept.replies.length === 1 ? "note" : "notes"}`}
              {notes > 0 && ` · ${notes} ${notes === 1 ? "note" : "notes"} sent back`}
            </li>
          );
        })}
      </ol>
      {general.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {general.map((note) => (
            <li key={note.id} data-note={note.id} className="flex min-w-0 items-baseline gap-2 text-[13px] leading-5">
              <span className={`size-1.5 flex-none translate-y-[-1px] rounded-full ${fill(note)}`} />
              <span className="truncate text-fg">{note.turns[0]?.words}</span>
              {note.on && <span className="flex-none text-soft">· Outdated</span>}
              {where(note) && <span className={`flex-none ${where(note)![1]}`}>· {where(note)![0]}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Where a note stands, in a word or two after what was said.
const where = (note: Shown): [string, string] | undefined =>
  note.unsent ? ["To send", "text-amber-ink"] : note.toJudge ? ["Does this fix it?", "text-amber-ink"] : note.state === "with the agent" ? ["With the agent", "text-slate"] : note.state === "settled" ? ["Settled", "text-green"] : undefined;
