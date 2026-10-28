// The column is the map. Every flow is drawn as the recording it is: a picture of its page, its name and its length.
// Under it, by time, a row for each note in it and for each diamond with something new to you. The flow you're in is one
// line down the column, from under its picture through its rows to its end, where it asks whether it's good, filled to
// where the playhead is. A flow good to you settles once you've left it: its settled rows fold away under its heading.
// In general comes last. Nothing in it moves while it plays, and when it changes, rows glide.

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { list, time, type Flow, type Place, type Review, type Round } from "@mostlyworks/vantage-review";
import { Answer, Compare, play, Said, tick, Time, useHold } from "./Card.tsx";
import { when, type Changed, type Diamond } from "./changes.ts";
import { fades, useFade } from "./fade.ts";
import { useGlide } from "./glide.ts";
import { clamp } from "./moments.ts";
import { ink, type Shown, type Standing } from "./notes.ts";
import { opened, pointed, tinted, type Comparing } from "./Notes.tsx";
import { Picture, useStill } from "./Picture.tsx";
import { useNow, type Playhead } from "./playhead.ts";

export type Props = {
  // Under the settled notes' list, the map keeps its place.
  hidden?: boolean;
  review: Review;
  round: Round;
  playhead: Playhead;
  notes: Shown[];
  diamonds: Diamond[];
  // The row you've chosen, opened, the note that's open, and the change you're on.
  chosen?: string;
  openNote?: string;
  lit?: string;
  compare?: Comparing;
  // Where each flow stands for you, on the round you judge; looking back, nothing.
  standing: (flow: string) => Standing | undefined;
  // The flows you've said look good and haven't sent: their tick takes it back, as a checkbox does.
  saidGood: string[];
  // The flow asking whether it's good, at its end, and the one just ticked.
  asked?: string;
  landed?: Landed;
  // Who else says a flow looks good.
  others: (flow: string) => string[];
  // A note's row, or, grown out of a change's row, what it adds there.
  note: (note: Shown, grown?: boolean) => ReactNode;
  // Your notes that aren't notes yet, or just were: the one you're writing, the ones you haven't saved, one just removed;
  // and grown out of a change's row, what each adds there.
  pending: { id: string; on?: Place; row: ReactNode; grown?: ReactNode; open?: boolean }[];
  // Which change's row each of your notes on a change grew out of, by their ids.
  grown: Map<string, string>;
  onFlow: (flow: Flow) => void;
  onDiamond: (diamond: Diamond) => void;
  onClose: () => void;
  // Pointing at one of several changes in an open row, by its id, or away again.
  onPoint: (change?: string) => void;
  onPlayOn: () => void;
  onNoteOn: (diamond: Diamond) => void;
  onNote: (note: Shown) => void;
  onAsk: (flow: string) => void;
  onGood: (flow: string) => void;
  onNotQuite: (flow: string) => void;
  onAgain: (flow: Flow) => void;
  onTakeBack: (flow: string) => void;
  onGeneral?: () => void;
};

// A flow that just turned good, and when: its tick pops, in the column and the meter at once.
export type Landed = { flow: string; at: number };
export const justLanded = (landed: Landed | undefined, flow: string) => landed?.flow === flow && performance.now() - landed.at < 700;

// A flow's rows, as the column lists them and Up and Down go through them: a note on a moment and a change by their time,
// and a note on the whole flow last, since it answers the flow as a whole. Settled, only what's still on its way stays.
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

export function Column(props: Props) {
  const { round, notes, pending } = props;
  const watching = useNow(props.playhead, (now) => now.moment.flow);
  const map = useRef<HTMLDivElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  useGlide(map, ghosts);
  useFade(map);

  // Playing on into the next flow brings its heading into view, if it's out of view.
  useEffect(() => {
    const heading = map.current?.querySelector(`[data-flow="${CSS.escape(watching)}"]`);
    heading?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [watching]);
  // So does what opens: a note chosen by its pin, one you start on the recording, an answer playing stopped at, a flow's
  // question at its end.
  const question = props.asked && `end:${props.asked}`;
  const opened = props.openNote ?? props.chosen ?? pending.find((kept) => kept.open)?.id ?? question;
  useEffect(() => {
    if (!opened) return;
    const frame = requestAnimationFrame(() =>
      map.current?.querySelector(opened === question ? `[data-key="${CSS.escape(question)}"]` : "[data-open]")?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [opened]);

  const general = notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  return (
    <div
      ref={map}
      data-map
      hidden={props.hidden}
      className={`relative isolate grid min-h-0 flex-1 auto-rows-max grid-cols-[minmax(0,1fr)] content-start gap-px overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [--ahead:color-mix(in_srgb,var(--faint)_45%,var(--ground))] [--rail:var(--soft)] ${fades}`}
    >
      <div ref={ghosts} className="absolute inset-x-0 top-0" aria-hidden />
      {round.flows.map((flow) => {
        const on = flow.name === watching;
        const standing = props.standing(flow.name);
        const inside = (diamond: string) => [
          ...notes.filter((note) => props.grown.get(note.id) === diamond).map((note) => ({ id: note.id, open: props.openNote === note.id, shown: props.note(note, true) })),
          ...pending.filter((kept) => props.grown.get(kept.id) === diamond).map((kept) => ({ id: kept.id, open: !!kept.open, shown: kept.grown })),
        ];
        const rows = rowsIn(flow.name, notes, props.diamonds, settles(standing, on))
          .filter((row) => !("note" in row && props.grown.has(row.note.id)))
          .map((row) => ({
            at: row.at,
            shown: "note" in row ? props.note(row.note) : <ChangeRow {...props} key={row.diamond.id} diamond={row.diamond} inside={inside(row.diamond.id)} />,
          }));
        // What you're writing sits where it will once it's saved, and one just removed where it was.
        for (const { on, row } of pending.filter(({ id, on }) => on?.flow === flow.name && !props.grown.has(id))) {
          const at = on?.at ?? Infinity;
          rows.splice(rows.filter((row) => row.at <= at).length, 0, { at, shown: row });
        }
        return (
          <FlowBlock {...props} key={flow.name} flow={flow} on={on} standing={standing}>
            {rows.map(({ shown }) => shown)}
          </FlowBlock>
        );
      })}
      <div data-key="general" className="mt-2 grid grid-cols-[64px_minmax(0,1fr)_18px] items-center gap-x-3 py-1.5 pr-2.5 pl-[18px]">
        <span className="relative grid h-10 w-16 place-items-center rounded-[5px] text-faint shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden>
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
            <path d="M3 3.5h10a1 1 0 011 1v5.5a1 1 0 01-1 1H7l-3 2.5V11H3a1 1 0 01-1-1V4.5a1 1 0 011-1z" />
          </svg>
        </span>
        <span className="grid min-w-0 gap-1.5">
          <span className="truncate text-[13px] leading-[17px] font-semibold">In general</span>
          <span className="flex min-h-[18px] items-center text-[11.5px] leading-[14px] text-faint">About everything</span>
        </span>
        {props.onGeneral && (
          <button className="group/add relative grid size-[18px] place-items-center rounded-full text-faint transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg" aria-label="Add a general note" onClick={props.onGeneral}>
            <svg viewBox="0 0 12 12" className="size-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
              <path d="M6 2.5v7M2.5 6h7" />
            </svg>
            <span className="pointer-events-none absolute top-1/2 right-[calc(100%+6px)] translate-x-[2px] -translate-y-1/2 rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] font-normal whitespace-nowrap text-fg opacity-0 shadow-tip transition-[opacity,translate] duration-150 ease-calm group-hover/add:translate-x-0 group-hover/add:opacity-100">
              Add a general note
            </span>
          </button>
        )}
      </div>
      {(general.length > 0 || pending.some(({ on }) => !on)) && (
        <div className="-mt-1 grid grid-cols-[minmax(0,1fr)] gap-1.5 pb-1">
          {general.map((note) => props.note(note))}
          {pending.filter(({ on }) => !on).map(({ row }) => row)}
        </div>
      )}
    </div>
  );
}

function FlowBlock(props: Omit<Props, "standing"> & { flow: Flow; on: boolean; standing?: Standing; children: ReactNode }) {
  const { flow, on, standing, playhead } = props;
  const others = props.others(flow.name);
  const block = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  useLine(block, line, playhead, flow, on);
  const playing = useNow(playhead, (now) => now.playing && now.moment.flow === flow.name);
  const good = standing?.is === "good";
  const just = justLanded(props.landed, flow.name);
  return (
    <div ref={block} data-here={on ? "" : undefined} className="relative">
      <div
        data-key={`flow:${flow.name}`}
        data-flow={flow.name}
        role="button"
        tabIndex={0}
        aria-label={`${playing ? "Pause" : "Play"} ${flow.name}`}
        className="group/head relative mt-2 grid cursor-pointer grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 rounded-r-lg py-1.5 pr-2.5 pl-[18px] text-[13px] font-semibold text-fg"
        onMouseDown={keepKeys}
        onClick={() => props.onFlow(flow)}
        onKeyDown={(event) => event.key === "Enter" && props.onFlow(flow)}
      >
        <Still review={props.review} round={props.round} flow={flow} playing={playing} />
        {/* Where it stands, on its picture's corner: good, or good earlier and changed since. In the flow you're in, the end
            of its line says it instead. */}
        {(good || standing?.is === "looked good") && (
          <span className={`absolute top-[calc(50%+11px)] left-[18px] z-2 transition-opacity duration-200 ease-calm peer-data-flying:opacity-0 ${on && standing?.asks ? "pointer-events-none opacity-0" : ""}`}>
            {good && props.saidGood.includes(flow.name) ? (
              <button
                className="block transition-transform duration-150 ease-calm hover:scale-112"
                aria-label={`${flow.name} looks good. Take it back`}
                aria-pressed
                tabIndex={on ? -1 : 0}
                onMouseDown={keepKeys}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onTakeBack(flow.name);
                }}
              >
                <Tick corner travels={flow.name} just={just && !on} />
              </button>
            ) : (
              <span role="img" aria-label={good ? `${flow.name} looks good` : `${flow.name} looked good earlier and has changed since`}>
                <Tick corner travels={good ? flow.name : undefined} just={just && !on} hollow={!good} />
              </span>
            )}
          </span>
        )}
        <span className="grid min-w-0 gap-1.5">
          <span className="line-clamp-2 leading-[17px]">{flow.name}</span>
          <span className="flex min-h-[18px] min-w-0 items-center gap-2.5 text-[11.5px] leading-[14px] font-normal text-faint">
            <span className="tabular-nums">{time(flow.length)}</span>
            {others.length > 0 && <span className="truncate text-green">✓ Looks good to {few(others)}</span>}
          </span>
        </span>
      </div>
      <div className={`relative -mt-1 grid grid-cols-[minmax(0,1fr)] gap-1.5 pb-1 transition-[padding-top] duration-300 ease-calm ${on ? "pt-3" : ""}`}>
        {flow.line && (
          <div data-key={`line:${flow.name}`} className={`grid text-xs leading-[1.45] transition-[grid-template-rows,opacity,visibility] duration-300 ease-calm ${on ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"}`}>
            <div className="min-h-0 overflow-hidden pl-[44px]">
              <span className="block text-[11.5px] text-faint">{props.round.by}</span>
              <span className="block pb-2 text-soft">{flow.line}</span>
            </div>
          </div>
        )}
        {props.children}
      </div>
      {standing?.asks &&
        (props.asked === flow.name && on ? (
          <Question {...props} standing={standing} just={just} />
        ) : (
          <div
            data-key={`end:${flow.name}`}
            data-stop={flow.length}
            data-end
            role="button"
            tabIndex={on ? 0 : -1}
            aria-label={good ? `${flow.name} looks good` : `${flow.name}: is it good?`}
            className={`group/end flex cursor-pointer items-center gap-2 overflow-hidden pl-[18px] text-[12.5px] transition-[height,opacity,visibility] duration-300 ease-calm ${on ? "visible h-8 opacity-100" : "invisible h-0 opacity-0"} ${good ? "text-green" : "text-faint hover:text-soft"}`}
            onMouseDown={keepKeys}
            onClick={() => props.onAsk(flow.name)}
            onKeyDown={(event) => event.key === "Enter" && props.onAsk(flow.name)}
          >
            {good ? (
              <span data-mark className="relative z-1">
                <Tick travels={on ? flow.name : undefined} just={just && on} />
              </span>
            ) : (
              <span data-mark className="relative z-1 size-[18px] rounded-full bg-ground shadow-[inset_0_0_0_1.5px_var(--ahead)] transition-shadow duration-150 ease-calm group-hover/end:shadow-[inset_0_0_0_1.5px_var(--amber)]" />
            )}
            {good ? "Looks good" : "Is it good?"}
          </div>
        ))}
      <div ref={line} aria-hidden className={`pointer-events-none absolute inset-y-0 left-[calc(27px-0.75px)] z-0 w-[1.5px] transition-opacity duration-250 ease-calm ${on ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}

// A flow's question, at its end under its notes: whether it's good, what Looks good would settle that you haven't
// answered, and a way to watch it again first. Its ring is where the flow's line ends. Its heading names the flow, so the
// question doesn't.
// On the stage, what's chosen opens beside the recording as the column's own row: a change by its outline, and a flow's
// question over its last frame.
export function Chosen(props: Props) {
  const watching = useNow(props.playhead, (now) => now.moment.flow);
  const flow = props.round.flows.find((flow) => flow.name === watching);
  const diamond = props.diamonds.find((diamond) => diamond.id === props.chosen);
  if (diamond) {
    const inside = props.notes.filter((note) => props.grown.get(note.id) === diamond.id).map((note) => ({ id: note.id, open: props.openNote === note.id, shown: props.note(note, true) }));
    return <ChangeRow {...props} diamond={diamond} inside={inside} />;
  }
  const standing = flow && props.standing(flow.name);
  if (flow && standing && props.asked === flow.name) return <Question {...props} flow={flow} standing={standing} just={justLanded(props.landed, flow.name)} onStage />;
  return null;
}

function Question({ flow, standing, just, onStage, ...props }: Omit<Props, "standing"> & { flow: Flow; standing: Standing; just: boolean; onStage?: boolean }) {
  const good = standing.is === "good";
  const sent = good && !props.saidGood.includes(flow.name);
  const buttons = useRef<HTMLDivElement>(null);
  const held = useHold(flow.name, buttons);
  return (
    <div
      data-key={`end:${flow.name}`}
      data-stop={flow.length}
      data-end
      className={onStage ? "relative py-2 pr-3 pl-[44px]" : "relative mt-0.5 mb-1.5 ml-[31px] animate-verd rounded-lg bg-hover py-2.5 pr-3 pl-[13px] shadow-[inset_0_0_0_1px_var(--line)]"}
    >
      <span
        data-mark
        data-tick={flow.name}
        className={`absolute ${onStage ? "top-2 left-[18px]" : "top-2.5 -left-[13px]"} z-1 grid size-[18px] place-items-center rounded-full transition-[background-color,box-shadow] duration-250 ease-calm ${good ? "bg-green text-ground shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--green)_70%,var(--fg))]" : "bg-[color-mix(in_srgb,var(--amber)_22%,var(--ground))] shadow-[inset_0_0_0_1.5px_var(--amber)]"} ${just ? "animate-pop" : ""}`}
        aria-hidden
      >
        {good && <TickMark className={`size-[11px] ${just ? "animate-tick" : ""}`} />}
      </span>
      <p className="mb-2 text-[13px] leading-[18px] text-soft">
        <button className="float-right ml-2 inline-flex items-center gap-1 text-xs leading-[18px] text-faint transition-colors duration-150 ease-calm hover:text-fg" onMouseDown={keepKeys} onClick={() => props.onAgain(flow)}>
          <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10a6 6 0 1 0 1.8-4.3" />
            <path d="M4 3.5v3h3" />
          </svg>
          Watch again
        </button>
        Is this flow good?
        {standing.count > 0 && !good && <span className="block text-xs leading-4 text-faint">{standing.count} {standing.count === 1 ? "note" : "notes"} not answered</span>}
      </p>
      <div ref={buttons} className={`flex gap-1.5 transition-opacity duration-150 ease-calm ${held ? "pointer-events-none opacity-45" : ""}`}>
        <Answer keys={good ? undefined : "↵"} tone="good" pressed={good} disabled={sent} onClick={() => props.onGood(flow.name)}>
          {tick}Looks good
        </Answer>
        <Answer keys="X" tone="back" onClick={() => props.onNotQuite(flow.name)}>
          Not quite
        </Answer>
      </div>
    </div>
  );
}

// A few names by name, then how many more.
const few = (names: string[]) => (names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} others` : list(names));

// Clicking a row leaves the keys where they were, so Up and Down afterwards don't ring the row as if you'd tabbed to it.
const keepKeys = (event: { preventDefault: () => void }) => event.preventDefault();

// A change's row is shaped like a note's: its diamond on the flow's line, filling once the playhead has passed it, its
// name, wrapping onto a second line rather than cutting, and its time. Opened, it's the agent's why: what changed isn't
// put in words, since the recording outlines it. Your note on it grows out of it: your words under its name, the note's
// colour a dot on its diamond, and opened, one card, the change, the agent, you and Compare: your note's own, once it's
// open, and none while you write it.
function ChangeRow(props: Props & { diamond: Diamond; inside: { id: string; open: boolean; shown: ReactNode }[] }) {
  const { diamond, chosen, lit, onDiamond, onClose, inside } = props;
  const open = chosen === diamond.id || inside.some((note) => note.open);
  const note = inside[0] && props.notes.find((note) => note.id === inside[0]!.id);
  return (
    <div
      data-key={`change:${diamond.id}`}
      data-stop={diamond.at}
      data-open={open ? "" : undefined}
      className={`relative [--c:var(--soft)] ${open ? opened : lit === diamond.id ? tinted : pointed}`}
    >
      <button className="group/row grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 py-1.5 pr-2.5 pl-[18px] text-left" onMouseDown={keepKeys} onClick={(event) => (open && !(event.target as Element).closest("[data-time]") ? onClose() : onDiamond(diamond))} aria-expanded={open}>
        <span data-mark className="group/mark relative z-1 mt-px grid size-[18px] place-items-center">
          <i className="size-2 rotate-45 bg-ground shadow-[inset_0_0_0_1.5px_var(--fg),0_0_0_2.5px_var(--ground)] group-data-played/mark:bg-fg group-data-played/mark:shadow-[0_0_0_2.5px_var(--ground)]" />
          {inside.length > 0 && <b className="absolute top-[calc(50%-8px)] left-[calc(50%+2px)] size-1.5 rounded-full shadow-[0_0_0_1.5px_var(--ground)]" style={{ background: note ? ink(note) : "var(--amber)" }} />}
        </span>
        {/* Two lines closed, ending in an ellipsis; open, all of it. */}
        <span className={`-mr-[7px] min-w-0 pr-[7px] ${open ? "block" : "line-clamp-2"}`}>
          <span className="block leading-5 [overflow-wrap:anywhere]">
            <Time open={open} className="float-right ml-2 text-faint">{when(diamond)}</Time>
            <span>{diamond.name}</span>
          </span>
        </span>
      </button>
      {open && (
        <div className="grid gap-2.5 pr-3.5 pl-[44px]">
          <Why {...props} />
        </div>
      )}
      {inside.map((note) => note.shown)}
      {open && props.compare && !inside.some((note) => note.open) && (
        <div className="mt-2.5 grid pr-3.5 pl-[44px]">
          <Compare {...props.compare} />
        </div>
      )}
      {open && !inside.some((note) => note.open) && (
        <div className="mt-4 flex flex-wrap gap-1.5 pr-3.5 pl-[44px]">
          <Answer keys="↵" onClick={props.onPlayOn}>
            {play}Play on
          </Answer>
          {!inside.length && (
            <Answer keys="X" onClick={() => props.onNoteOn(diamond)}>
              Note on this
            </Answer>
          )}
        </div>
      )}
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
    return changed.line && <Said who={changed.by} quiet>{changed.line}</Said>;
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

// The flow's tick, green once it looks good, on its picture's corner or where its line ends; hollow where it looked good
// earlier and has changed since. Just ticked, it swells and settles as the green comes in, the tick growing after.
function Tick({ corner, hollow, just, travels }: { corner?: boolean; hollow?: boolean; just?: boolean; travels?: string }) {
  const look = hollow
    ? "bg-ground text-green shadow-[inset_0_0_0_1.5px_var(--green),0_0_0_1.5px_var(--ground)]"
    : corner
      ? "bg-green text-ground shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--green)_70%,var(--fg)),0_0_0_1.5px_var(--ground)]"
      : "bg-green text-ground shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--green)_70%,var(--fg))]";
  return (
    <span data-tick={travels} className={`grid size-[18px] place-items-center rounded-full ${look} ${just ? "animate-pop" : ""}`}>
      <TickMark className={`size-[11px] ${just ? "animate-tick" : ""}`} />
    </span>
  );
}

export function TickMark({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 12 12" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.8 6.2l2.2 2.2 4.2-4.6" />
    </svg>
  );
}

// A flow's picture, small. Pointing at the heading puts the play mark over it, as on any video.
function Still({ review, round, flow, playing }: { review: Review; round: Round; flow: Flow; playing: boolean }) {
  const still = useStill(review, round, flow);
  return (
    <span
      data-still
      data-picture={flow.name}
      className="peer relative grid h-10 w-16 place-items-center overflow-hidden rounded-[5px] bg-hover after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--line)] data-flying:invisible"
      aria-hidden
    >
      <span className="absolute inset-0 transition-opacity duration-150 ease-calm group-hover/head:opacity-80">
        <Picture shot={still} />
      </span>
      <span className="absolute top-[calc(50%-11px)] left-[calc(50%-11px)] z-2 grid size-[22px] scale-70 place-items-center rounded-full bg-ground text-fg opacity-0 transition-[opacity,scale] duration-150 ease-calm group-hover/head:scale-100 group-hover/head:opacity-100">
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3">
          {playing ? (
            <>
              <rect x="5.5" y="4.5" width="3" height="11" rx="1" />
              <rect x="11.5" y="4.5" width="3" height="11" rx="1" />
            </>
          ) : (
            <path d="M7 4.8v10.4c0 .6.7 1 1.2.6l8-5.2a.7.7 0 000-1.2l-8-5.2c-.5-.4-1.2 0-1.2.6z" />
          )}
        </svg>
      </span>
    </span>
  );
}

// The flow's line, drawn in pieces between its stops so it never runs through a number or a diamond: filled in the
// line's ink to where the playhead is, from one stop to the next at one steady pace, and pale ahead. Each number on it
// sits in a ring of the line, drawn round both its sides together as the playhead passes. The other flows' lines wait
// out of sight, full if you've been through them, empty if not.
function useLine(block: RefObject<HTMLDivElement | null>, line: RefObject<HTMLDivElement | null>, playhead: Playhead, flow: Flow, on: boolean) {
  const paint = () => {
    const room = block.current;
    const drawn = line.current;
    if (!room || !drawn) return;
    const top = room.getBoundingClientRect().top;
    const still = room.querySelector("[data-still]")!.getBoundingClientRect();
    const stops = [...room.querySelectorAll<HTMLElement>("[data-stop]")].map((row) => {
      const mark = row.querySelector<HTMLElement>("[data-mark]")!;
      const box = mark.getBoundingClientRect();
      return { at: Number(row.dataset.stop), top: box.top - top, bottom: box.bottom - top, mark, end: row.hasAttribute("data-end") };
    });
    if (!stops.length) return drawn.replaceChildren();

    // Each piece runs from just past one stop to just before the next; the last ends inside the flow's end, if it has one.
    const pieces: [number, number][] = [];
    let from = still.bottom - top + 5;
    for (const stop of stops) {
      pieces.push([from, stop.end ? stop.top + 1 : stop.top - 2.75]);
      from = stop.bottom + 2.75;
    }
    // Where the playhead is along it: each stop is passed in an instant, so stopping on one stops on it full.
    const points: [number, number][] = [[0, still.bottom - top + 5]];
    const pass = (at: number, y: number) => points.push([Math.max(at, points.at(-1)![0] + 0.001), y]);
    for (const stop of stops) {
      const at = clamp(stop.at, points.at(-1)![0], flow.length);
      if (stop.end) pass(flow.length, (stop.top + stop.bottom) / 2);
      else pass(at - 0.001, stop.top - 3), pass(at, stop.bottom + 3);
    }
    if (!stops.at(-1)!.end) pass(flow.length - 0.02, stops.at(-1)!.bottom + 3);

    const { moment } = playhead.now;
    const here = playhead.flows.findIndex((other) => other.name === moment.flow);
    const mine = playhead.flows.findIndex((other) => other.name === flow.name);
    const at = on ? moment.at : mine < here ? Infinity : -Infinity;
    const y = along(points, at);

    while (drawn.children.length > pieces.length) drawn.lastChild!.remove();
    while (drawn.children.length < pieces.length) drawn.append(Object.assign(document.createElement("i"), { className: "absolute left-0 w-full" }));
    pieces.forEach(([start, end], i) => {
      const piece = drawn.children[i] as HTMLElement;
      const filled = clamp((y - start) / Math.max(1, end - start)) * 100;
      Object.assign(piece.style, { top: `${start}px`, height: `${Math.max(0, end - start)}px` });
      // Filled all the way it's one colour, so no hairline of pale is left at its foot.
      piece.style.background = filled >= 100 ? "var(--rail)" : `linear-gradient(var(--rail) ${filled}%, var(--ahead) ${filled}%)`;
    });
    for (const stop of stops) {
      stop.mark.style.setProperty("--a", `${(clamp((y - stop.top + 3) / (stop.bottom - stop.top + 6)) * 180).toFixed(1)}deg`);
      stop.mark.toggleAttribute("data-played", at >= stop.at - 0.001);
    }
  };
  useLayoutEffect(() => {
    paint();
    // While the column's rows glide, the line goes with them.
    let frame = requestAnimationFrame(function follow() {
      paint();
      if (block.current?.getAnimations({ subtree: true }).some((animation) => animation.id === "glide")) frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  });
  // The playhead and the room's size paint it as it is now: which flow you're in changes without either changing.
  const latest = useRef(paint);
  latest.current = paint;
  useEffect(() => playhead.subscribe(() => latest.current()), [playhead]);
  useEffect(() => {
    const observer = new ResizeObserver(() => latest.current());
    if (block.current) observer.observe(block.current);
    return () => observer.disconnect();
  }, []);
}

// The line's end at a moment, straight between the points [moment, y].
function along(points: [number, number][], at: number): number {
  if (at <= points[0]![0]) return points[0]![1];
  if (at >= points.at(-1)![0]) return points.at(-1)![1];
  let k = 0;
  while (at >= points[k + 1]![0]) k++;
  const [a, b] = [points[k]!, points[k + 1]!];
  return a[1] + ((at - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
}
