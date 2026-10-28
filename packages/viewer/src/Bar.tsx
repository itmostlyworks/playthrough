// What you can do to the moment you're on, across the frame's bottom edge: note it, see how it was, take it over, and
// what you've said so far. Only what you can do now is in it: in the app, noting what's there, and going back.

import { Key } from "./Card.tsx";

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
  notes: number;
  listed: boolean;
  onList: () => void;
};

export function Bar(props: Props) {
  const item =
    "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap text-fg transition-colors duration-150 ease-calm enabled:hover:bg-hover disabled:cursor-default disabled:opacity-50 aria-pressed:bg-hover";
  const inApp = props.live === "shown";
  return (
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
      <button className={`${item} text-soft`} aria-pressed={props.listed} onClick={props.onList}>
        {props.notes ? `${props.notes} ${props.notes === 1 ? "note" : "notes"}` : "Notes"}
      </button>
    </div>
  );
}
