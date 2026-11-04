// What's chosen on the stage opens beside the recording: a change, its card the agent's why and your note on it. And the
// order Up and Down go through a scene's notes and changes in, and the mark a scene's Looks good wears.

import type { CSSProperties, ReactNode } from "react";
import { Answer, Time } from "./Card.tsx";
import { when, type Diamond } from "./changes.ts";
import { ink, type Shown, type Standing } from "./notes.ts";
import { opened, quiet } from "./Notes.tsx";

export type Props = {
  notes: Shown[];
  diamonds: Diamond[];
  // The change you've chosen.
  chosen?: string;
  // Of the changes at that moment, the one whose why is open.
  one?: string;
  // The pointer coming into a change's card, or leaving it.
  onWhy: (inside: boolean) => void;
  // A note, or, grown out of a change, what it adds to the change's card.
  note: (note: Shown, grown?: boolean) => ReactNode;
  // Which change each of your notes on a change grew out of, by their ids.
  grown: Map<string, string>;
  onDiamond: (diamond: Diamond) => void;
  onClose: () => void;
  onNoteOn: (diamond: Diamond, one?: string) => void;
  onNote: (note: Shown) => void;
};

// A scene that just turned good, and when: its tick pops, in its question and the meter at once.

// A scene's notes and changes, as Up and Down go through them: a note on a moment and a change by their time, and a note
// on the whole scene last, since it answers the scene as a whole. Settled, only what's still on its way stays.
export type Row = ({ note: Shown } | { diamond: Diamond }) & { at: number };
export function rowsIn(scene: string, notes: Shown[], diamonds: Diamond[], settled = false): Row[] {
  const rows: Row[] = [
    ...notes.filter((note) => note.on?.scene === scene && (!settled || note.unsent || note.state === "with the agent")).map((note) => ({ note, at: note.on?.at ?? Infinity })),
    ...diamonds.filter((diamond) => diamond.scene === scene && diamond.row && !settled).map((diamond) => ({ diamond, at: diamond.at })),
  ];
  return rows.sort((a, b) => a.at - b.at);
}

export function settles(standing: Standing | undefined, on: boolean) {
  return standing?.is === "good" && !on;
}

// What's chosen opens beside the recording: a change by its outline, and a scene's question over its last frame.
export function Chosen(props: Props) {
  const diamond = props.diamonds.find((diamond) => diamond.id === props.chosen);
  if (diamond && props.one) return <ChangeCard {...props} diamond={diamond} yours={props.notes.filter((note) => props.grown.get(note.id) === diamond.id)} />;
  return null;
}

// Clicking in a card leaves the keys where they were, so Up and Down afterwards don't ring what you clicked as if you'd
// tabbed to it.
const keepKeys = (event: { preventDefault: () => void }) => event.preventDefault();

// A change's card, opened from its pin, beside it: its diamond, who says why, and its time, which goes to it again, and
// under them why it's there, in the agent's words. Made for a note, it's that note's answer seen here: the note, one line
// as the notes list has it, going to it, where it's judged, then the agent's answer to it, which is the why. What changed
// isn't put in words: the recording marks it, and Compare, on the bar, shows what it was. One seen only in the pictures,
// which the agent wasn't asked about, has nothing said. Your note on it grows out of it: your words under its name; else
// Note on this. Its diamond carries the colour of the note it's for, as its pin does.
function ChangeCard(props: Props & { diamond: Diamond; yours: Shown[] }) {
  const { diamond, yours, notes, onNote } = props;
  const changed = diamond.changes.find(({ change }) => change.id === props.one);
  const note = changed?.note && notes.find((note) => note.id === changed.note);
  const answer = note ? note.turns.findLast((turn) => turn.agent) : undefined;
  const [who, why] = note ? [answer?.by ?? changed?.by, answer?.words] : [changed?.line && changed.by, changed?.line];
  const dot = yours[0] ?? note;
  return (
    <div data-open="" className={`relative ${opened}`} onPointerEnter={() => props.onWhy(true)} onPointerLeave={() => props.onWhy(false)}>
      <button className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 py-1.5 pr-2.5 pl-[18px] text-left" onMouseDown={keepKeys} onClick={(event) => ((event.target as Element).closest("[data-time]") ? props.onDiamond(diamond) : props.onClose())} aria-expanded>
        <span data-mark className="relative z-1 mt-px grid size-[18px] place-items-center">
          <i className="size-2 rotate-45 bg-ground shadow-[inset_0_0_0_1.5px_var(--fg),0_0_0_2.5px_var(--ground)]" />
          {dot && <b className="absolute top-[calc(50%-8px)] left-[calc(50%+2px)] size-1.5 rounded-full shadow-[0_0_0_1.5px_var(--ground)]" style={{ background: ink(dot) }} />}
        </span>
        <span className="block text-[11.5px] leading-5 text-faint">
          <Time open className="float-right ml-2">{when(diamond)}</Time>
          <span>{who ?? "Changed here"}</span>
        </span>
      </button>
      <div className="grid pr-3.5 pl-[44px]">
        {note && (
          <button
            className="-mx-[3px] mb-1 flex min-w-0 items-center gap-1.5 rounded px-[3px] text-left text-[12.5px] leading-[18px] text-soft transition-colors duration-150 ease-calm hover:bg-line hover:text-fg"
            style={{ "--c": ink(note) } as CSSProperties}
            onClick={() => onNote(note)}
          >
            <span className={`size-4 flex-none rounded-full text-center text-[9px] leading-4 font-semibold ${quiet}`}>{note.number}</span>
            <span className="truncate">{note.turns[0]?.words}</span>
          </button>
        )}
        {why && <p className="leading-normal whitespace-pre-wrap text-fg">{why}</p>}
      </div>
      {yours.map((note) => props.note(note, true))}
      {!yours.length && (
        <div className="mt-3 flex flex-wrap gap-1.5 pr-3.5 pl-[44px]">
          <Answer keys="X" onClick={() => props.onNoteOn(diamond, props.one)}>
            Note on this
          </Answer>
        </div>
      )}
    </div>
  );
}

// A scene's end, drawn alike wherever it is, in its question over the last frame and capping the timeline: amber while it
// asks you, with ↑ when what it asks is sending what you said in it; green and ticked once it looks good, the agent's
// slate and ticked once what you said is with the agent. Ahead of the playhead on the timeline it's pale, as a note's dot
// is. Answered, it pops in both at once. Square, as a round mark is a note.
export type End = "asks" | "to send" | "good" | "with the agent";
export const endOf = (standing: Standing): End => (standing.is === "good" || standing.is === "with the agent" || standing.is === "to send" ? standing.is : "asks");

export function EndMark({ end, ahead, just, className }: { end: End; ahead?: boolean; just: boolean; className: string }) {
  const look =
    end === "good"
      ? "bg-green text-ground shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--green)_70%,var(--fg))]"
      : end === "with the agent"
        ? "bg-slate text-ground"
        : ahead
          ? "bg-ground text-amber-ink shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--amber)_50%,var(--ground))]"
          : "bg-[color-mix(in_srgb,var(--amber)_22%,var(--ground))] text-amber-ink shadow-[inset_0_0_0_1.5px_var(--amber)]";
  return (
    <span aria-hidden className={`grid place-items-center rounded-[28%] transition-[background-color,box-shadow,color,scale] duration-250 ease-calm ${look} ${just ? "animate-pop" : ""} ${className}`}>
      {(end === "good" || end === "with the agent") && <TickMark className={`size-[62%] ${just ? "animate-tick" : ""}`} />}
      {end === "to send" && (
        <svg viewBox="0 0 12 12" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9.6V2.8M3.2 5.5 6 2.7l2.8 2.8" />
        </svg>
      )}
    </span>
  );
}

function TickMark({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 12 12" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.8 6.2l2.2 2.2 4.2-4.6" />
    </svg>
  );
}
