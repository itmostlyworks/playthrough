// What's chosen on the stage opens beside the recording: a change, its card the agent's why, your note on it and
// Compare; and at a flow's end, over its last frame, what you said about the whole of it and the flow's one step: whether
// it's good, or, with something of yours in it, sending that to the agent. And the order Up and Down go through a flow's
// notes and changes in.

import { Fragment, useRef, type CSSProperties, type ReactNode } from "react";
import type { Flow, Round } from "@playthrough/review";
import { Answer, Compare, play, Said, tick, Time, useHold } from "./Card.tsx";
import { when, type Changed, type Diamond } from "./changes.ts";
import { ink, type Shown, type Standing } from "./notes.ts";
import type { Step } from "./Step.tsx";
import { opened, type Comparing } from "./Notes.tsx";
import { useNow, type Playhead } from "./playhead.ts";

export type Props = {
  round: Round;
  playhead: Playhead;
  notes: Shown[];
  diamonds: Diamond[];
  // The change you've chosen.
  chosen?: string;
  compare?: Comparing;
  // Where each flow stands for you, on the round you judge; looking back, nothing.
  standing: (flow: string) => Standing | undefined;
  // The answers in a flow you haven't seen: its Looks good never settles them, and its question shows them first.
  unseen: (flow: string) => Shown[];
  // The flow asking whether it's good, at its end, and the one just ticked.
  asked?: string;
  landed?: Landed;
  // A note, or, grown out of a change, what it adds to the change's card.
  note: (note: Shown, grown?: boolean) => ReactNode;
  // Which change each of your notes on a change grew out of, by their ids.
  grown: Map<string, string>;
  onDiamond: (diamond: Diamond) => void;
  onClose: () => void;
  // Pointing at one of several changes in a change's card, by its id, or away again.
  onPoint: (change?: string) => void;
  onPlayOn: () => void;
  onNoteOn: (diamond: Diamond) => void;
  onNote: (note: Shown) => void;
  onGood: (flow: string) => void;
  onNotQuite: (flow: string) => void;
  onSend: (flow: string) => void;
  // What comes after a flow that's answered: the next flow that needs you, or back to every flow; and with nothing left
  // to do, what it's waiting on.
  onward: Step;
  waiting?: string;
  onAgain: (flow: Flow) => void;
  // A note on the whole flow being written, in the flow's card after the others.
  writing?: ReactNode;
};

// A flow that just turned good, and when: its tick pops, in its question and the meter at once.
export type Landed = { flow: string; at: number };
export const justLanded = (landed: Landed | undefined, flow: string) => landed?.flow === flow && performance.now() - landed.at < 700;

// A flow's notes and changes, as Up and Down go through them: a note on a moment and a change by their time, and a note
// on the whole flow last, since it answers the flow as a whole. Settled, only what's still on its way stays.
export type Row = ({ note: Shown } | { diamond: Diamond }) & { at: number };
export function rowsIn(flow: string, notes: Shown[], diamonds: Diamond[], settled = false): Row[] {
  const rows: Row[] = [
    ...notes.filter((note) => note.on?.flow === flow && (!settled || note.unsent || note.state === "with the agent")).map((note) => ({ note, at: note.on?.at ?? Infinity })),
    ...diamonds.filter((diamond) => diamond.flow === flow && diamond.row && !settled).map((diamond) => ({ diamond, at: diamond.at })),
  ];
  return rows.sort((a, b) => a.at - b.at);
}

export function settles(standing: Standing | undefined, on: boolean) {
  return standing?.is === "good" && !on;
}

// What's chosen opens beside the recording: a change by its outline, and a flow's question over its last frame.
export function Chosen(props: Props) {
  const watching = useNow(props.playhead, (now) => now.moment.flow);
  const flow = props.round.flows.find((flow) => flow.name === watching);
  const diamond = props.diamonds.find((diamond) => diamond.id === props.chosen);
  if (diamond) return <ChangeCard {...props} diamond={diamond} yours={props.notes.filter((note) => props.grown.get(note.id) === diamond.id)} />;
  // Over the flow's last frame: what you said about the whole of it, then whether it's good, if that's still asked.
  const standing = flow && props.standing(flow.name);
  const general = flow ? props.notes.filter((note) => note.on?.flow === flow.name && note.on.at === undefined) : [];
  const asking = !!flow && props.asked === flow.name;
  if (!flow || (!asking && !general.length && !props.writing)) return null;
  // Each conversation on its own, and the question under them all, as it answers them all.
  const apart = "mx-4 my-1.5 border-t border-line";
  const laidOut = general.filter((note) => note.state === "needs you" && !note.unsent).length;
  return (
    <>
      {general.map((note, i) => (
        <Fragment key={note.id}>
          {i > 0 && <hr className={apart} />}
          {props.note(note)}
        </Fragment>
      ))}
      {props.writing}
      {asking && (general.length > 0 || !!props.writing) && <hr className={apart} />}
      {asking &&
        (standing ? (
          <Question {...props} flow={flow} standing={standing} laidOut={laidOut} just={justLanded(props.landed, flow.name)} />
        ) : (
          props.onward.kind === "go" && (
            <div className="p-4">
              <Onward step={props.onward} />
            </div>
          )
        ))}
    </>
  );
}

// A flow's question, at its end: whether it's good, what Looks good would settle that you haven't answered, and a way
// to watch it again first. Looks good settles the notes on the whole flow over it too, and Not quite is another. With something of yours in it, the question is sending it; sent, it's with the agent, and
// what's next is the step. The flow is the one you're watching, so the question doesn't name it.
function Question({ flow, standing, laidOut, just, ...props }: Omit<Props, "standing"> & { flow: Flow; standing: Standing; laidOut: number; just: boolean }) {
  if (standing.is === "to send" || standing.is === "with the agent") return <Sending {...props} flow={flow} standing={standing} just={just} />;
  const good = standing.is === "good";
  const buttons = useRef<HTMLDivElement>(null);
  const held = useHold(flow.name, buttons);
  // An answer you haven't seen is shown before the flow can look good, rather than settled with it unread.
  const unseen = good ? 0 : props.unseen(flow.name).length;
  // Those laid out over it are in plain view; the rest were played past.
  const elsewhere = standing.count - laidOut;
  return (
    <div className={asks}>
      <EndMark end={good ? "good" : "asks"} just={just} className={asksMark} />
      <p className="mb-3 text-[13px] leading-[18px] text-soft">
        <button className="float-right ml-2 inline-flex items-center gap-1 text-xs leading-[18px] text-faint transition-colors duration-150 ease-calm hover:text-fg" onMouseDown={keepKeys} onClick={() => props.onAgain(flow)}>
          <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10a6 6 0 1 0 1.8-4.3" />
            <path d="M4 3.5v3h3" />
          </svg>
          Watch again
        </button>
        Is this flow good?
        {unseen > 0 ? (
          <span className="block text-xs leading-4 text-faint">{unseen} {unseen === 1 ? "answer" : "answers"} you haven’t seen</span>
        ) : good ? (
          props.waiting && <span className="block text-xs leading-4 text-faint">{props.waiting}</span>
        ) : (
          elsewhere > 0 && <span className="block text-xs leading-4 text-faint">{elsewhere} {elsewhere === 1 ? "note" : "notes"} not answered</span>
        )}
      </p>
      <div ref={buttons} className={`flex gap-1.5 transition-opacity duration-150 ease-calm ${held ? "pointer-events-none opacity-45" : ""}`}>
        <Answer keys={good ? undefined : "↵"} tone="good" pressed={good} onClick={() => props.onGood(flow.name)}>
          {unseen > 0 ? "Show it" : <>{tick}Looks good</>}
        </Answer>
        <Answer keys="X" tone="back" onClick={() => props.onNotQuite(flow.name)}>
          Not quite
        </Answer>
      </div>
      {good && (
        <div className="mt-2">
          <Onward step={props.onward} />
        </div>
      )}
    </div>
  );
}

// Answered, what's next is offered under the answer, and taken when you choose.
function Onward({ step }: { step: Props["onward"] }) {
  if (step.kind !== "go") return null;
  return (
    <div className="flex gap-1.5">
      <Answer keys="↵" onClick={step.take}>
        <span className="truncate">
          {step.words}
          {step.what && <span className="font-normal text-soft"> · {step.what}</span>}
        </span>
      </Answer>
    </div>
  );
}

// What you said in a flow goes at its end, so the agent starts on it while you watch the rest. Sent, its mark turns the
// agent's slate, and the step is what's next.
function Sending({ flow, standing, just, ...props }: Omit<Props, "standing"> & { flow: Flow; standing: Standing; just: boolean }) {
  const sent = standing.is === "with the agent";
  const { onward } = props;
  return (
    <div className={asks}>
      <EndMark end={sent ? "with the agent" : "to send"} just={just} className={asksMark} />
      <p className="mb-3 text-[13px] leading-[18px] text-soft">
        <button className="float-right ml-2 inline-flex items-center gap-1 text-xs leading-[18px] text-faint transition-colors duration-150 ease-calm hover:text-fg" onMouseDown={keepKeys} onClick={() => props.onAgain(flow)}>
          <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10a6 6 0 1 0 1.8-4.3" />
            <path d="M4 3.5v3h3" />
          </svg>
          Watch again
        </button>
        {sent ? "With the agent" : `${standing.count} ${standing.count === 1 ? "note" : "notes"} for the agent`}
        {sent && props.waiting && <span className="block text-xs leading-4 text-faint">{props.waiting}</span>}
      </p>
      {!sent ? (
        <div className="flex gap-1.5">
          <Answer keys="↵" onClick={() => props.onSend(flow.name)}>
            Send
          </Answer>
        </div>
      ) : (
        <Onward step={onward} />
      )}
    </div>
  );
}

// What a flow's end asks, with room around it: its mark in line with the conversations over it.
const asks = "relative py-4 pr-4 pl-[42px]";
const asksMark = "absolute top-4 left-4 z-1 size-[18px]";

// Clicking in a card leaves the keys where they were, so Up and Down afterwards don't ring what you clicked as if you'd
// tabbed to it.
const keepKeys = (event: { preventDefault: () => void }) => event.preventDefault();

// A change's card: its diamond, its name, wrapping rather than cutting, and its time, which goes to it again, and under
// them the agent's why: what changed isn't put in words, since the recording outlines it. Your note on it grows out of
// it: your words under its name, the note's colour a dot on its diamond. Then Compare, and Play on, with Note on this
// while you've said nothing about it.
function ChangeCard(props: Props & { diamond: Diamond; yours: Shown[] }) {
  const { diamond, yours } = props;
  return (
    <div data-open="" className={`relative ${opened}`}>
      <button className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 py-1.5 pr-2.5 pl-[18px] text-left" onMouseDown={keepKeys} onClick={(event) => ((event.target as Element).closest("[data-time]") ? props.onDiamond(diamond) : props.onClose())} aria-expanded>
        <span data-mark className="relative z-1 mt-px grid size-[18px] place-items-center">
          <i className="size-2 rotate-45 bg-ground shadow-[inset_0_0_0_1.5px_var(--fg),0_0_0_2.5px_var(--ground)]" />
          {yours[0] && <b className="absolute top-[calc(50%-8px)] left-[calc(50%+2px)] size-1.5 rounded-full shadow-[0_0_0_1.5px_var(--ground)]" style={{ background: ink(yours[0]) }} />}
        </span>
        <span className="-mr-[7px] block min-w-0 pr-[7px]">
          <span className="block leading-5 [overflow-wrap:anywhere]">
            <Time open className="float-right ml-2 text-faint">{when(diamond)}</Time>
            <span>{diamond.name}</span>
          </span>
        </span>
      </button>
      <div className="grid gap-2.5 pr-3.5 pl-[44px]">
        <Why {...props} />
      </div>
      {yours.map((note) => props.note(note, true))}
      {props.compare && (
        <div className="mt-2.5 grid pr-3.5 pl-[44px]">
          <Compare {...props.compare} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5 pr-3.5 pl-[44px]">
        <Answer keys="↵" onClick={props.onPlayOn}>
          {play}Play on
        </Answer>
        {!yours.length && (
          <Answer keys="X" onClick={() => props.onNoteOn(diamond)}>
            Note on this
          </Answer>
        )}
      </div>
    </div>
  );
}

// Why each change is there, in the agent's words under its name, or the note it was made for. Several at one moment are
// each on their own line under a small hollow diamond, so they can be counted, the line set off under the ones it explains.
function Why({ diamond, notes, onNote, onPoint }: Props & { diamond: Diamond }) {
  const own = diamond.changes.filter((changed) => !changed.answers);
  const says = (changed: Changed) => {
    const note = changed.note && notes.find((note) => note.id === changed.note);
    if (note)
      return (
        <Said who={`For your note ${note.number}`}>
          <button className="-mx-[3px] rounded px-[3px] text-left transition-colors duration-150 ease-calm hover:bg-line" onClick={() => onNote(note)}>
            {note.turns[0]?.words}
          </button>
        </Said>
      );
    return changed.line && <Said who={changed.by}>{changed.line}</Said>;
  };
  if (own.length === 1) return says(own[0]!);
  // Changes one line explains stand together over it.
  const blocks: Changed[][] = [];
  for (const changed of own) {
    const last = blocks.at(-1);
    if (last && changed.line && last[0]!.line === changed.line) last.push(changed);
    else blocks.push([changed]);
  }
  return blocks.map((block) => (
    <div key={block[0]!.change.id} className="grid gap-0.5">
      {block.map(({ change }) => (
        <span key={change.id} className="group/name flex items-start gap-[9px] leading-normal font-medium" onPointerEnter={() => onPoint(change.id)} onPointerLeave={() => onPoint(undefined)}>
          <i className="mx-0.5 mt-1.5 size-[7px] flex-none rotate-45 shadow-[inset_0_0_0_1.5px_var(--soft)] transition-colors duration-150 ease-calm group-hover/name:bg-soft" aria-hidden />
          {change.words}
        </span>
      ))}
      <div className="mt-[3px] ml-[19px] border-l-2 border-line pl-2.5 text-[12.5px] [&_p]:text-[12.5px]">{says(block[0]!)}</div>
    </div>
  ));
}

// A flow's end, drawn alike wherever it is, in its question over the last frame and capping the timeline: amber while it
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
