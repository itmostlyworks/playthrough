// What you can do to the moment you're on, across the frame's bottom edge: note it, compare it with how it was, take it
// over, and what you've said on this flow, which opens over it. Only what you can do now is in it: in the app, noting what's
// there, and going back.

import { useEffect, useRef } from "react";
import { Compare, ForkMark, Key } from "./Card.tsx";
import { EndMark, type End } from "./Chosen.tsx";
import type { Comparing } from "./Notes.tsx";

// A note on this flow, as the list says it: its dot in its colour, its words, and its moment, made in the app or not.
export type Said = { id: string; ink: string; words: string; at: string; app: boolean };

type Props = {
  live?: "waiting" | "shown";
  latest: boolean;
  // How it was, where there's a round before this one to compare it with.
  compare?: Comparing;
  noting: boolean;
  // None where no note can be made: an accepted review, or a round gone by.
  onNote?: () => void;
  onTakeOver: () => void;
  onBack: () => void;
  flow: string;
  notes: Said[];
  // The flow as a whole, last: its square, how many notes are on the whole of it, and what its end says.
  whole?: { end: End; notes: number; words: string };
  onWhole: () => void;
  listed: boolean;
  onList: (listed: boolean) => void;
  onSaid: (id: string) => void;
  // The note pointed at in the list, lit on the line too.
  onLight: (id: string | undefined) => void;
};

export function Bar(props: Props) {
  const item =
    "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap text-fg transition-colors duration-150 ease-calm enabled:hover:bg-hover disabled:cursor-default disabled:opacity-50 aria-pressed:bg-hover";
  const inApp = props.live === "shown";
  // Open, a click anywhere else or Escape closes it.
  const here = useRef<HTMLDivElement>(null);
  const { listed, onList } = props;
  useEffect(() => {
    if (!listed) return;
    const away = (event: PointerEvent) => !here.current?.contains(event.target as Node) && onList(false);
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onList(false);
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", escape);
    return () => (removeEventListener("pointerdown", away, true), removeEventListener("keydown", escape));
  }, [listed, onList]);
  const count = props.notes.length + (props.whole?.notes ?? 0);
  const row = "grid w-full grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-lg px-2.5 py-[7px] text-left transition-colors duration-150 ease-calm hover:bg-hover focus-visible:bg-hover";
  return (
    <div ref={here} className="relative">
      <div
        role="dialog"
        aria-label={`Notes on ${props.flow}`}
        aria-hidden={!listed}
        className={`absolute right-0 bottom-full mb-2 w-[340px] max-w-[calc(100vw-32px)] rounded-xl bg-surface p-1.5 shadow-float transition-[opacity,translate] duration-150 ease-calm ${listed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}
      >
        <div className="max-h-[min(55vh,420px)] overflow-y-auto">
          {props.notes.map((said) => (
              <button
                key={said.id}
                tabIndex={listed ? 0 : -1}
                className={row}
                onPointerEnter={() => props.onLight(said.id)}
                onPointerLeave={() => props.onLight(undefined)}
                onFocus={() => props.onLight(said.id)}
                onBlur={() => props.onLight(undefined)}
                onClick={() => props.onSaid(said.id)}
              >
                <span className="size-1.5 justify-self-center rounded-full" style={{ background: said.ink }} />
                <span className="truncate text-[13px] leading-[18px] text-fg">{said.words}</span>
                <span className="flex items-center gap-1 text-[11.5px] text-faint tabular-nums">
                  {said.app && <ForkMark className="h-2 w-2.5" label="In the app" />}
                  {said.at}
                </span>
              </button>
            ))}
          {props.whole ? (
            <button tabIndex={listed ? 0 : -1} className={row} onClick={props.onWhole}>
              <EndMark end={props.whole.end} just={false} className="size-3" />
              <span className="truncate text-[13px] leading-[18px] text-fg">
                The whole flow
                {props.whole.notes > 0 && <span className="text-soft"> · {props.whole.notes} {props.whole.notes === 1 ? "note" : "notes"}</span>}
              </span>
              <span className="text-[11.5px] text-faint">{props.whole.words}</span>
            </button>
          ) : (
            !count && <p className="px-2.5 py-[7px] text-[13px] text-soft">No notes on this flow yet.</p>
          )}
        </div>
      </div>
      <div
        role="toolbar"
        aria-label="This moment"
        data-bar=""
        className={`flex gap-0.5 rounded-xl bg-surface p-1 text-[13px] select-none [&_kbd]:text-[color-mix(in_srgb,var(--faint)_55%,var(--soft))] ${inApp ? "shadow-[0_0_0_1.5px_rgba(236,178,72,0.95),0_6px_20px_rgba(20,24,34,0.12)]" : "shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"}`}
      >
        <button className={item} disabled={!props.onNote} aria-pressed={props.noting} onClick={props.onNote}>
          Note <Key>N</Key>
        </button>
        {!inApp && props.compare && <Compare {...props.compare} bar={item} />}
        {inApp ? (
          <button className={item} onClick={props.onBack}>
            Back to the recording <Key>Esc</Key>
          </button>
        ) : (
          <button className={item} disabled={!props.latest} aria-pressed={props.live === "waiting"} onClick={props.onTakeOver}>
            {props.live === "waiting" ? "Taking over…" : "Take over"} <Key>T</Key>
          </button>
        )}
        <span className="my-1.5 w-px bg-line" />
        <button className={`${item} text-soft`} aria-pressed={listed} onClick={() => onList(!listed)}>
          {count ? `${count} ${count === 1 ? "note" : "notes"}` : "Notes"}
        </button>
      </div>
    </div>
  );
}
