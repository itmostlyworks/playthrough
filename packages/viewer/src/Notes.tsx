// A note in the column: one line while it's closed, saying what was said, and opened in its own row, its card: the
// conversation turn by turn, the older exchanges folded, what the agent changed for it, the way to compare, and the one
// thing you can do with it. A new note is written where it will live, never over the recording.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { list, time, type Turn, type Verdict } from "@mostlyworks/vantage-review";
import { Answer, Compare, mac, play, Said, TakeOverHere, tick, Time } from "./Card.tsx";
import type { Changed } from "./changes.ts";
import { fades, useFade } from "./fade.ts";
import { ink, type Shown } from "./notes.ts";
import { useNow, type Playhead } from "./playhead.ts";

export const number = "size-[18px] flex-none rounded-full text-center text-[10px] leading-[18px] font-semibold";
// A number in the column says where its note stands in its colour: quiet at rest, and real while it's open or on
// screen, as its pin is. On the line down the flow you're in, it sits in a ring of the line.
const quiet = "bg-[color-mix(in_srgb,var(--c)_18%,var(--ground))] text-[color-mix(in_srgb,var(--c)_80%,var(--fg))]";
const real = "bg-(--c) text-white";
// How long past its moment a note is on screen, as its pin is.
const SHOWN_FOR = 1.5;
// An answer lists up to this many changes whole; more, one fewer and how many more.
const LISTED = 4;

// A row's tint hangs to the right of the flow's line, never over it, its number or diamond on the line at its corner:
// while you point at the row, while it's lit, and opened, as its card.
const hangs = "isolate before:pointer-events-none before:absolute before:inset-y-0 before:right-0 before:left-[31px] before:-z-1 before:rounded-lg before:transition-colors before:duration-150 before:ease-calm before:content-['']";
export const pointed = `${hangs} hover:before:bg-hover`;
export const tinted = `${hangs} before:bg-hover`;
export const opened = `${tinted} pb-3`;

// Compare, on or off: pressed and let go it stays on, held it's on while you hold it.
// Off while you're taking the flow over: the app is now, with nothing beside it.
export type Comparing = { on: boolean; off?: boolean; onPress: () => void; onRelease: () => void };

type Props = {
  note: Shown;
  playhead: Playhead;
  open: boolean;
  fresh: boolean;
  you: string;
  readOnly: boolean;
  // What the agent changed for it, in its flow.
  answers: Changed[];
  compare?: Comparing;
  // Made in the app on an earlier round, it's checked by trying it: taken over where you were, in Compare's place, or
  // without onTakeOver, said plainly that this round's recording doesn't go there.
  whereYouWere?: { round: number; live?: "waiting" | "shown"; onTakeOver?: () => void; stopped?: string };
  // Not quite, being written.
  asking: boolean;
  // What it's on isn't on screen: it greys and asks nothing.
  away: boolean;
  // Grown out of a change's row: your words under its name, and opened, the rest of its card.
  grown?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAsking: (asking: boolean) => void;
  onJudge: (verdict: Verdict | undefined) => void;
  onEdit: (words: string | undefined) => void;
  onAnswer: (changed: Changed) => void;
  onPlayOn: () => void;
  onShow: () => void;
};

export function NoteRow(props: Props) {
  const { note, open, answers } = props;
  const at = note.on?.at;
  const here = useNow(props.playhead, ({ moment }) => at !== undefined && moment.flow === note.on?.flow && moment.at >= at - 0.05 && moment.at <= (note.on?.until ?? at) + SHOWN_FOR);
  if (props.grown)
    return (
      <div data-key={`note:${note.id}`} className={open ? "mt-4" : ""} style={{ "--c": ink(note) } as CSSProperties}>
        {open ? (
          <Card {...props} />
        ) : (
          <button className="-mt-1 block w-full truncate pr-2.5 pb-1.5 pl-[44px] text-left text-[12.5px] leading-[18px] text-soft transition-colors duration-150 ease-calm hover:text-fg" onMouseDown={(event) => event.preventDefault()} onClick={props.onOpen}>
            {note.turns[0]?.words}
          </button>
        )}
      </div>
    );
  return (
    <div
      data-key={`note:${note.id}`}
      data-stop={at}
      data-open={open ? "" : undefined}
      className={`relative ${open ? opened : pointed} ${props.fresh ? "before:animate-glow" : ""}`}
      style={{ "--c": ink(note) } as CSSProperties}
    >
      <button
        className={`group/row grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-2 py-1.5 pr-2.5 pl-[18px] text-left ${open && props.away ? "[&>:not([data-mark])]:opacity-45" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => (open && !(event.target as Element).closest("[data-time]") ? props.onClose() : props.onOpen())}
        aria-expanded={open}
      >
        <span data-mark className={`${number} relative z-1 mt-px in-data-here:line-ring ${open || here ? real : quiet}`}>
          {note.number}
        </span>
        <span className="truncate">{note.turns[0]?.words}</span>
        {at === undefined ? <span className="w-[78px]" /> : <Time open={open} className={open || here ? "text-[color-mix(in_srgb,var(--c)_80%,var(--fg))]" : "text-faint"}>{time(at)}</Time>}
        {!open && answers.length > 0 && <Listed answers={answers} className="col-start-2 col-end-4 mt-[3px] text-[12.5px] leading-[18px] text-soft" />}
      </button>
      {open && <Card {...props} />}
    </div>
  );
}

// What the agent changed for a note, each under a small hollow diamond, as the timeline draws a change.
function Listed({ answers, className, onAnswer }: { answers: Changed[]; className: string; onAnswer?: (changed: Changed) => void }) {
  const shown = answers.length > LISTED ? answers.slice(0, LISTED - 1) : answers;
  const diamond = <i className="size-1.5 flex-none translate-y-[-1px] rotate-45 shadow-[inset_0_0_0_1.5px_var(--soft)]" aria-hidden />;
  return (
    <span className={`grid gap-px ${className}`}>
      {shown.map((changed) =>
        onAnswer ? (
          <button
            key={changed.change.id}
            className="-ml-1 flex items-baseline gap-[9px] rounded px-1 py-px text-left text-fg transition-colors duration-150 ease-calm hover:bg-line"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onAnswer(changed)}
          >
            {diamond}
            <span className="min-w-0">{changed.change.words}</span>
          </button>
        ) : (
          <span key={changed.change.id} className="flex min-w-0 items-baseline gap-2">
            {diamond}
            <span className="truncate">{changed.change.words}</span>
          </span>
        ),
      )}
      {shown.length < answers.length && <span className="pl-[15px]">{answers.length - shown.length} more changes</span>}
    </span>
  );
}

// The conversation in exchanges: what someone asked, the agent's answer to it, and the Looks good it was given. What asks
// again starts the next.
function exchanges(turns: Turn[]): Turn[][] {
  const grouped: Turn[][] = [];
  for (const turn of turns) {
    const last = grouped.at(-1);
    if (!last || (!turn.agent && turn.verdict !== "looks good" && last.some((said) => said.agent))) grouped.push([turn]);
    else last.push(turn);
  }
  return grouped;
}

function Card(props: Props) {
  const { note, you, readOnly, compare, whereYouWere, asking } = props;
  const draftNote = note.unsent && note.turns.length === 1;
  const judged = note.unsent && !draftNote ? note.turns.at(-1) : undefined;
  // Someone's Looks good, sent, settles the latest answer for everyone, under their name; anyone can still send it back,
  // as a resolved thread is reopened.
  const answeredOn = note.turns.findLast((turn) => turn.agent)?.round;
  const settled = !judged && note.state === "settled" && answeredOn !== undefined && note.turns.findLast((turn) => turn.verdict && turn.round >= answeredOn)?.verdict === "looks good";
  const setAsking = props.onAsking;
  const [editing, setEditing] = useState(false);
  const [earlier, setEarlier] = useState(false);
  const said = judged ? note.turns.slice(0, -1) : note.turns;
  const groups = exchanges(said);
  const shown = earlier ? groups.flat() : (groups.at(-1) ?? []);
  const folded = groups.length - 1;
  const lastAgent = shown.findLastIndex((turn) => turn.agent);
  const name = (turn: Turn) => (turn.agent || turn.by !== you ? turn.by : "You");
  const verdict = (turn: Turn) => turn.verdict && <span className={turn.verdict === "looks good" ? "text-green" : "text-slate"}> · {turn.verdict === "looks good" ? "Looks good" : "Not quite"}</span>;
  const edits = (onEdit: () => void, onRemove?: () => void) => (
    <span className="flex gap-3 text-[11.5px] text-soft">
      <button className="hover:text-fg" onClick={onEdit}>
        Edit
      </button>
      {onRemove && (
        <button className="hover:text-fg" onClick={onRemove}>
          Remove
        </button>
      )}
    </span>
  );

  let words: ReactNode;
  if (draftNote && (editing || !note.turns[0]?.words) && !readOnly)
    words = (
      <Writing
        words={note.turns[0]?.words ?? ""}
        placeholder="What do you think?"
        question="Your note"
        onSave={(words) => (props.onEdit(words), setEditing(false))}
        onCancel={() => setEditing(false)}
      />
    );
  else
    words = (
      <>
        {folded > 0 && (
          <button className="-my-0.5 flex items-center gap-[3px] justify-self-start text-[11.5px] text-soft hover:text-fg" onClick={() => setEarlier(!earlier)} aria-expanded={earlier}>
            {folded} earlier {folded === 1 ? "answer" : "answers"}
            <svg viewBox="0 0 12 12" className={`size-3 transition-transform duration-200 ease-calm ${earlier ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
              <path d="M3.5 7.5L6 5l2.5 2.5" />
            </svg>
          </button>
        )}
        {shown.map((turn, i) => (
          <div key={i} className="grid gap-2.5">
            {(turn.words || turn.verdict) && (
              <Said
                who={
                  <>
                    {name(turn)}
                    {verdict(turn)}
                  </>
                }
                quiet={turn.agent}
                after={draftNote && !readOnly ? edits(() => setEditing(true), () => props.onEdit(undefined)) : undefined}
              >
                {turn.words}
              </Said>
            )}
            {i === lastAgent && props.answers.length > 0 && <Listed answers={props.answers} className="-mt-0.5 text-[13px] leading-normal" onAnswer={props.onAnswer} />}
          </div>
        ))}
        {note.state === "with someone else" && !readOnly && <p className="text-xs leading-[18px] text-slate">Waiting for {list(note.waitingFor)}</p>}
        {judged?.verdict === "not quite" && !asking && (
          <Said who={<>You{verdict(judged)}</>} after={!readOnly && edits(() => setAsking(true))}>
            {judged.words}
          </Said>
        )}
      </>
    );

  const playOn = (
    <Answer keys="↵" onClick={props.onPlayOn}>
      {play}Play on
    </Answer>
  );
  let question: ReactNode;
  let answers: ReactNode;
  if (readOnly) [question, answers] = [note.state === "settled" ? "Settled" : "", undefined];
  else if (asking && !props.away)
    answers = (
      <Writing
        words={judged?.verdict === "not quite" ? judged.words : ""}
        placeholder="What’s still not right?"
        question={<span className="text-slate">Not quite</span>}
        tone="back"
        onSave={(words) => {
          props.onJudge({ note: note.id, verdict: "not quite", words });
          setAsking(false);
        }}
        onCancel={() => setAsking(false)}
      />
    );
  else if ((note.toJudge || judged || settled) && !props.away)
    [question, answers] = [
      "Does this fix it?",
      <>
        <Answer
          keys={judged || settled ? undefined : "↵"}
          tone="good"
          pressed={judged?.verdict === "looks good" || settled}
          onClick={() => {
            if (settled) return;
            props.onJudge(judged?.verdict === "looks good" ? undefined : { note: note.id, verdict: "looks good" });
            if (judged?.verdict !== "looks good") props.onPlayOn();
          }}
        >
          {tick}Looks good
        </Answer>
        <Answer keys={judged || settled ? undefined : "X"} tone="back" pressed={judged?.verdict === "not quite"} onClick={() => (judged?.verdict === "not quite" ? props.onJudge(undefined) : setAsking(true))}>
          Not quite
        </Answer>
      </>,
    ];
  // Away from what it's on, it asks nothing, greyed, and offers the way back to it.
  else if (props.away)
    answers = (
      <button className="h-[30px] flex-[1_1_100%] rounded-[7px] bg-hover font-medium text-fg shadow-[inset_0_0_0_1px_var(--line)] hover:opacity-88" onClick={props.onShow}>
        Show it
      </button>
    );
  else if (!editing)
    [question, answers] = [
      `${note.on?.app ? "In the app · " : ""}${note.unsent ? "Not sent yet" : note.state === "with the agent" ? "Sent to the agent" : note.state === "settled" ? "Settled" : ""}`,
      note.on?.at !== undefined ? playOn : undefined,
    ];

  return (
    <div className="grid gap-2.5 pr-3.5 pl-[44px]">
      {/* Walked again, your steps stopped short: what couldn't be done, over the screen where they stopped. */}
      {whereYouWere?.stopped && <p className="leading-normal text-fg">{whereYouWere.stopped}</p>}
      <div className={`grid gap-2.5 transition-opacity duration-250 ease-calm ${props.away && !readOnly ? "opacity-45" : ""}`}>{words}</div>
      {compare && !asking && !editing && !props.away && <Compare {...compare} />}
      {/* In the app, you're already there. */}
      {whereYouWere && whereYouWere.live !== "shown" && !asking && !editing && !props.away &&
        (whereYouWere.onTakeOver ? (
          <TakeOverHere waiting={whereYouWere.live === "waiting"} onTakeOver={whereYouWere.onTakeOver} />
        ) : (
          !whereYouWere.stopped && <p className="text-xs leading-[18px] text-soft">Where you took this flow over isn’t in round {whereYouWere.round}’s recording.</p>
        ))}
      {question && <p className="mt-1.5 text-xs leading-[18px] text-soft">{question}</p>}
      {answers && <div className="flex flex-wrap gap-1.5">{answers}</div>}
    </div>
  );
}

// Writing a note, or what's still not right: the box, what it is, and its two ways out. Escape never throws words away:
// it closes an empty box, and steps out of one with words in it. A new note keeps its words as you write (onWords).
export function Writing(props: {
  words: string;
  placeholder: string;
  question?: ReactNode;
  tone?: "back";
  onSave: (words: string) => void;
  onCancel: () => void;
  onWords?: (words: string) => void;
}) {
  const [words, setWords] = useState(props.words);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.focus(), []);
  const keep = useRef(props.onWords);
  keep.current = props.onWords;
  const latest = useRef(words);
  latest.current = words;
  useEffect(() => {
    const later = setTimeout(() => keep.current?.(words), 300);
    return () => clearTimeout(later);
  }, [words]);
  useEffect(() => () => keep.current?.(latest.current), []);
  const save = () => words.trim() && props.onSave(words.trim());
  return (
    <>
      <textarea
        ref={box}
        rows={5}
        value={words}
        placeholder={props.placeholder}
        className={`block min-h-14 w-full resize-none rounded-md bg-hover px-2.5 py-2 leading-normal shadow-[inset_0_0_0_1px_var(--line)] placeholder:text-faint focus-visible:outline-none ${props.tone === "back" ? "focus:shadow-[inset_0_0_0_1px_var(--slate)]" : "focus:shadow-[inset_0_0_0_1px_var(--amber)]"}`}
        onChange={(event) => setWords(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) save();
          if (event.key === "Escape") {
            keep.current?.(words);
            if (words.trim()) event.currentTarget.blur();
            else props.onCancel();
          }
        }}
      />
      {props.question && <p className="mt-1.5 text-xs leading-[18px] text-soft">{props.question}</p>}
      <div className="flex flex-wrap gap-1.5">
        <Answer onClick={props.onCancel}>Cancel</Answer>
        <button
          className="inline-flex h-[30px] flex-[1_1_auto] items-center justify-center rounded-[7px] bg-fg pr-[7px] font-medium text-ground transition-opacity duration-150 ease-calm before:flex-[1_0_10px] after:order-1 after:flex-[1_0_10px] hover:opacity-88 disabled:bg-transparent disabled:text-faint disabled:shadow-[inset_0_0_0_1px_var(--line)]"
          disabled={!words.trim()}
          aria-keyshortcuts={mac ? "Meta+Enter" : "Control+Enter"}
          onClick={save}
        >
          Save
          <kbd className="order-2 flex-none rounded-[3px] px-1 font-ui whitespace-nowrap pointer-coarse:hidden text-[11px] leading-4 font-normal opacity-60 shadow-[0_0_0_1px_currentColor]">{mac ? "⌘↵" : "Ctrl ↵"}</kbd>
        </button>
      </div>
    </>
  );
}


// What was settled on earlier rounds is a fact about the round, not a row under a flow: a quiet count under its name,
// the newest three as small green dots, which opens their list. Its room is kept on a round with none, so nothing below
// it moves.
export function SettledCount({ notes, open, onOpen }: { notes: Shown[]; open: boolean; onOpen: () => void }) {
  const newest = notes.slice(-3).reverse();
  return (
    <button
      className={`-mt-[5px] mb-1.5 ml-3 flex w-max flex-none items-center gap-[7px] rounded-md py-[3px] pr-2 pl-2.5 text-xs transition-colors duration-150 ease-calm ${notes.length ? "" : "invisible"} ${open ? "bg-hover text-fg" : "text-soft hover:text-fg"}`}
      aria-expanded={open}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onOpen}
    >
      <span className="ml-1.5 flex items-center" aria-hidden>
        {newest.map((note, i) => (
          <span key={note.id} className={`relative size-2.5 rounded-full bg-[color-mix(in_srgb,var(--green)_45%,var(--ground))] ${open ? "shadow-[0_0_0_1.5px_var(--hover)]" : "shadow-[0_0_0_1.5px_var(--ground)]"} ${i ? "-ml-[3px]" : ""}`} style={{ zIndex: newest.length - i }} />
        ))}
      </span>
      <span>
        <span className="tabular-nums">{notes.length}</span> settled {notes.length === 1 ? "note" : "notes"}
      </span>
    </button>
  );
}

// The settled notes as a list over the map, grouped by the round each was settled on, newest first; each says which
// flow it was in, and goes to it on that round.
export function SettledList({ notes, onNote }: { notes: Shown[]; onNote: (note: Shown) => void }) {
  const settledOn = (note: Shown) => note.turns.at(-1)?.round ?? 0;
  const rounds = [...new Set(notes.map(settledOn))].sort((a, b) => b - a);
  const shown = useRef<HTMLDivElement>(null);
  useFade(shown);
  return (
    <div ref={shown} className={`min-h-0 flex-1 animate-rise overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] ${fades}`}>
      {rounds.map((round) => (
        <div key={round} className="grid gap-px">
          <p className="mt-2 mb-0.5 pl-[18px] text-xs text-faint">{round === 0 ? "Before" : `Round ${round}`}</p>
          {notes
            .filter((note) => settledOn(note) === round)
            .map((note) => (
              <button
                key={note.id}
                className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-2 rounded-r-lg py-1.5 pr-2.5 pl-[18px] text-left transition-colors duration-150 ease-calm hover:bg-hover"
                style={{ "--c": "var(--green)" } as CSSProperties}
                onClick={() => onNote(note)}
              >
                <span className={`${number} mt-px ${quiet}`}>{note.number}</span>
                <span className="truncate">{note.turns[0]?.words}</span>
                <span className="max-w-30 truncate text-xs leading-5 text-faint">{note.on?.flow ?? "In general"}</span>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
