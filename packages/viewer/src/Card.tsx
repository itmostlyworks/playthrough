// What a row holds once it's opened in the column, its card: what was said, the way to compare, the question, and the
// answers to it. A key that answers is drawn on its button, faint and outlined, at the button's right edge.

import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import type { Comparing } from "./Notes.tsx";

export const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);

// Someone's words under their name: yours, another person's, or the agent's, quieter.
export function Said({ who, quiet, children, after }: { who: ReactNode; quiet?: boolean; children: ReactNode; after?: ReactNode }) {
  return (
    <div className="grid gap-px">
      <span className="flex items-baseline gap-3 text-[11.5px] text-faint">
        <span className="min-w-0 flex-1">{who}</span>
        {after}
      </span>
      <p className={`leading-normal whitespace-pre-wrap ${quiet ? "text-soft" : "text-fg"}`}>{children}</p>
    </div>
  );
}

// A button that answers, its key at its right edge and its words centred in the room left of it.
export function Answer(props: { children: ReactNode; keys?: string; pressed?: boolean; disabled?: boolean; tone?: "good" | "back"; onClick: () => void }) {
  const { children, keys, pressed, tone, onClick } = props;
  const look = pressed ? (tone === "good" ? "bg-green/12 text-green" : "bg-slate/14 text-slate") : `bg-hover hover:bg-line hover:text-fg ${tone === "good" ? "text-fg" : "text-soft"}`;
  return (
    <button
      className={`inline-flex h-[30px] flex-[1_1_auto] items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150 ease-calm ${keys ? "pr-[7px] before:flex-[1_0_10px] before:content-[''] after:order-1 after:flex-[1_0_10px] after:content-['']" : "px-2.5"} ${look}`}
      aria-pressed={pressed}
      disabled={props.disabled}
      aria-keyshortcuts={keys === "↵" ? "Enter" : keys}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
      {keys && <Key className="order-2">{keys}</Key>}
    </button>
  );
}

export function Key({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`min-w-4 flex-none rounded-[3px] whitespace-nowrap pointer-coarse:hidden px-[3px] text-center font-ui text-[11px] leading-4 font-normal text-faint shadow-[0_0_0_1px_var(--line)] in-aria-pressed:text-inherit in-aria-pressed:opacity-60 in-aria-pressed:shadow-[0_0_0_1px_currentColor] ${className}`}>{children}</kbd>;
}

export const tick = (
  <svg viewBox="0 0 12 12" className="mr-1 size-3 text-green in-aria-pressed:text-inherit" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2.8 6.2l2.2 2.2 4.2-4.6" />
  </svg>
);

export const play = (
  <svg viewBox="0 0 20 20" className="mr-1 size-2.5" fill="currentColor" aria-hidden>
    <path d="M7 4.8v10.4c0 .6.7 1 1.2.6l8-5.2a.7.7 0 000-1.2l-8-5.2c-.5-.4-1.2 0-1.2.6z" />
  </svg>
);

// Compare: this moment as it was, over the recording. In an answer's card it's a row of its own above the question,
// quieter than the answers, its mark a circle half full, now and then. Pressed and let go, it stays on until it's
// pressed again; held, it's on while it's held, as C is. On the action bar, it's one of the bar's own (`bar`).
export function Compare({ on, onPress, onRelease, bar }: Comparing & { bar?: string }) {
  return (
    <button
      className={bar ?? `flex h-[30px] flex-none items-center gap-2 rounded-md px-2.5 text-xs font-medium text-fg shadow-[inset_0_0_0_1px_var(--line)] transition-[background-color,box-shadow] duration-150 ease-calm select-none hover:shadow-[inset_0_0_0_1px_var(--faint)] aria-pressed:bg-hover`}
      aria-pressed={on}
      aria-keyshortcuts="C"
      onPointerDown={(event) => event.button === 0 && (event.preventDefault(), pressedUntilLetGo(onPress, onRelease))}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => event.key === "Enter" && (onPress(), onRelease())}
    >
      {!bar && <span className={`size-2.5 flex-none rounded-full shadow-[inset_0_0_0_1.5px_currentColor] ${on ? "bg-current" : "bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]"}`} />}
      <span className={bar ? "" : "min-w-0 flex-1 truncate text-left"}>Compare</span>
      <Key className={bar ? "" : "text-soft"}>C</Key>
    </button>
  );
}

// Pressed, and let go wherever the pointer is by then.
function pressedUntilLetGo(onPress: () => void, onRelease: () => void) {
  onPress();
  const up = () => {
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", up);
    onRelease();
  };
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
}

// Held this long, Compare is a look; let go sooner, it's a click.
export const HOLD = 160;

// Take over where you were: on the answer to a note made in the app, in Compare's place, as such a note is checked by
// trying it, the way it was found. While the app is made ready, it says so, as Take over on the bar does.
export function TakeOverHere({ waiting, onTakeOver }: { waiting: boolean; onTakeOver: () => void }) {
  return (
    <button
      className="flex h-[30px] flex-none items-center gap-2 rounded-md px-2.5 text-xs font-medium text-fg shadow-[inset_0_0_0_1px_var(--line)] transition-[background-color,box-shadow] duration-150 ease-calm select-none hover:shadow-[inset_0_0_0_1px_var(--faint)] aria-pressed:bg-hover"
      aria-pressed={waiting}
      aria-keyshortcuts="T"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onTakeOver}
    >
      <ForkMark className="h-2 w-2.5 flex-none" />
      <span className="min-w-0 flex-1 truncate text-left">{waiting ? "Taking over…" : "Take over where you were"}</span>
      <Key className="text-soft">T</Key>
    </button>
  );
}

// What was made in the app: a fork's own curve, as it leaves the line.
export function ForkMark({ className, label }: { className: string; label?: string }) {
  return (
    <svg viewBox="0 0 10 8" className={className} fill="none" stroke="var(--amber)" strokeWidth="1.5" aria-label={label} aria-hidden={!label}>
      <path d="M0 7 C 2.5 7, 2.5 1, 5 1 L 10 1" />
    </svg>
  );
}

// A row's time plays its moment, as the time on a comment on a video does: quiet at rest, and a pill with the play mark
// when you point at it. Closed, the whole row opens and plays, so pointing at the row lights it; open, the row closes,
// and only the time itself plays its moment again.
export function Time({ children, open = false, className = "" }: { children: ReactNode; open?: boolean; className?: string }) {
  const lit = open ? "hover:bg-hover hover:text-fg" : "group-hover/row:bg-hover group-hover/row:text-fg";
  return (
    <span data-time className={`group/time -mr-[7px] inline-flex h-5 min-w-[78px] items-center justify-end gap-[3px] rounded-[10px] pr-[7px] pl-1 text-xs tabular-nums transition-colors duration-150 ease-calm ${lit} ${className}`}>
      <svg viewBox="0 0 20 20" fill="currentColor" className={`size-2.5 opacity-0 transition-opacity duration-150 ease-calm ${open ? "group-hover/time:opacity-100" : "group-hover/row:opacity-100"}`} aria-hidden>
        <path d="M7 4.8v10.4c0 .6.7 1 1.2.6l8-5.2a.7.7 0 000-1.2l-8-5.2c-.5-.4-1.2 0-1.2.6z" />
      </svg>
      {children}
    </span>
  );
}

// Buttons that come up under the pointer hold: dimmed, they take no click until the pointer moves off them, or for a
// little over a second, so one extra click never takes something you haven't looked at. A key always goes through.
let pointer: { x: number; y: number } | undefined;
for (const kind of ["pointermove", "pointerdown"] as const) addEventListener(kind, (event) => (pointer = { x: event.clientX, y: event.clientY }), true);

export function useHold(key: string, buttons: RefObject<HTMLElement | null>): boolean {
  const [held, setHeld] = useState(false);
  useLayoutEffect(() => {
    const over = () => {
      const box = buttons.current?.getBoundingClientRect();
      return !!box && !!pointer && pointer.x >= box.left && pointer.x <= box.right && pointer.y >= box.top && pointer.y <= box.bottom;
    };
    setHeld(over());
    if (!over()) return;
    const free = () => setHeld(false);
    const timer = setTimeout(free, 1200);
    const moved = () => over() || free();
    addEventListener("pointermove", moved);
    return () => {
      clearTimeout(timer);
      removeEventListener("pointermove", moved);
    };
  }, [key, buttons]);
  return held;
}
