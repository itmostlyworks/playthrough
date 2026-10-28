// What you can do to the moment you're on, across the frame's bottom edge: note it, see how it was, take it over, and
// what you've said on this flow, which opens over it. Only what you can do now is in it: in the app, noting what's
// there, and going back.

import { useEffect, useRef } from "react";
import { Key } from "./Card.tsx";
import { number } from "./Notes.tsx";

// A note on this flow, as the list says it: its number in its colour, its words, and where it is.
export type Said = { id: string; number: number; ink: string; words: string; where: string };

type Props = {
  live?: "waiting" | "shown";
  latest: boolean;
  before: boolean;
  howItWas: boolean;
  noting: boolean;
  onHowItWas: (held: boolean) => void;
  onNote: () => void;
  onTakeOver: () => void;
  onBack: () => void;
  flow: string;
  notes: Said[];
  listed: boolean;
  onList: (listed: boolean) => void;
  onSaid: (id: string) => void;
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
  const count = props.notes.length;
  return (
    <div ref={here} className="relative">
      <div
        role="dialog"
        aria-label={`Notes on ${props.flow}`}
        aria-hidden={!listed}
        className={`absolute right-0 bottom-full mb-2 w-[400px] max-w-[calc(100vw-32px)] origin-bottom-right rounded-xl bg-surface py-2 shadow-[0_0_0_1px_rgba(20,24,34,0.08),0_10px_32px_rgba(20,24,34,0.16)] transition-[opacity,translate] duration-150 ease-calm ${listed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}
      >
        <div className="truncate px-4 pt-1 pb-2 text-[11.5px] text-faint">{props.flow}</div>
        <div className="max-h-[min(55vh,420px)] overflow-y-auto">
          {count ? (
            props.notes.map((said) => (
              <button
                key={said.id}
                tabIndex={listed ? 0 : -1}
                className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 border-t border-line px-4 py-2.5 text-left transition-colors duration-150 ease-calm hover:bg-hover"
                onClick={() => props.onSaid(said.id)}
              >
                <span className={`${number} mt-px text-white`} style={{ background: said.ink }}>
                  {said.number}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="line-clamp-2 text-[13px] leading-[1.4] text-fg">{said.words}</span>
                  <span className="text-[11.5px] text-faint tabular-nums">{said.where}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="border-t border-line px-4 pt-2.5 pb-1.5 text-[13px] text-soft">Nothing said on this flow yet. Note what you see with N.</p>
          )}
        </div>
      </div>
      <div
        role="toolbar"
        aria-label="This moment"
        className={`flex gap-0.5 rounded-xl bg-surface p-1 text-[13px] select-none ${inApp ? "shadow-[0_0_0_1.5px_rgba(236,178,72,0.95),0_6px_20px_rgba(20,24,34,0.12)]" : "shadow-[0_0_0_1px_rgba(20,24,34,0.08),0_6px_20px_rgba(20,24,34,0.12)]"}`}
      >
        <button className={item} aria-pressed={props.noting} onClick={props.onNote}>
          Note <Key>N</Key>
        </button>
        {!inApp && props.before && (
          <button
            className={item}
            aria-pressed={props.howItWas}
            onPointerDown={() => props.onHowItWas(true)}
            onPointerUp={() => props.onHowItWas(false)}
            onPointerLeave={() => props.onHowItWas(false)}
          >
            How it was <Key>B</Key>
          </button>
        )}
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
