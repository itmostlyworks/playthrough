// The bar across a moment's foot: its size and its buttons' look, the slim lines inside Play and Step in, and the
// arrows either side of Play.

import { useEffect, useRef, type ReactNode } from "react";
import { Key } from "./Key.tsx";
import { Clock } from "./Player.tsx";

// How far through what's shown playing is: a slim line inside Play, there once the moment has left its end, filling
// as it plays, and gone again once it rests there.
export function Progress({ clock, share, shareOf, moving, shown }: { clock: Clock; share: number; shareOf: (moment: number) => number; moving: boolean; shown: boolean }) {
  const fill = useRef<HTMLSpanElement>(null);
  const told = useRef(shareOf);
  told.current = shareOf;
  useEffect(() => {
    const show = (to: number) => fill.current && (fill.current.style.transform = `scaleX(${to.toFixed(4)})`);
    if (!moving) return void show(share);
    show(told.current(clock.at));
    return clock.follow((moment) => show(told.current(moment)));
  }, [moving, share]);
  return (
    // Along the button's own bottom edge, end to end, its corners taking the line's ends.
    <span aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden rounded-lg transition-opacity duration-300 ease-calm ${shown ? "" : "opacity-0"}`}>
      <span className={`absolute inset-x-0 bottom-0 h-0.5 ${UNPLAYED}`}>
        <span ref={fill} className="block h-full origin-left bg-soft" />
      </span>
    </span>
  );
}

// How far the app is on its way, a slim line inside Step in as Play's is inside Play: by how long it took the last
// time, where that's known, else easing on towards its end; never quite there until it is, and never still.
export function Getting({ since, due }: { since: number; due?: number }) {
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frameId = 0;
    const tick = () => {
      const gone = Date.now() - since;
      const known = due && due > since ? due - since : undefined;
      const share = known ? (gone < known ? 0.9 * (gone / known) : 0.9 + 0.08 * (1 - Math.exp(-(gone - known) / 4000))) : 0.96 * (1 - Math.exp(-gone / 7000));
      if (fill.current) fill.current.style.transform = `scaleX(${share.toFixed(4)})`;
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [since, due]);
  return (
    // As Play's: along the button's bottom edge, end to end.
    <span aria-hidden className="pointer-events-none absolute inset-0 animate-arrive overflow-hidden rounded-lg">
      <span className={`absolute inset-x-0 bottom-0 h-0.5 ${UNPLAYED}`}>
        <span ref={fill} className="block h-full origin-left bg-amber" />
      </span>
    </span>
  );
}

// A small arrow either side of Play: the frame before, or the next. Quiet beside Play, its words and its key come up
// over it when it's pointed at a while, or reached with Tab. Held under the pointer, it walks as its key held does;
// pressed from the keyboard, it's one step.
export function FrameButton({ by, disabled, onStep, held }: { by: 1 | -1; disabled: boolean; onStep: () => void; held: { press: (by: 1 | -1) => void; letGo: () => void } }) {
  const [words, key, named] = by < 0 ? ["Frame before", "←", "ArrowLeft"] : ["Next frame", "→", "ArrowRight"];
  return (
    <button
      className={`${ITEM} group/tip relative w-6 px-0! text-soft! phone:w-5`}
      disabled={disabled}
      aria-label={words}
      aria-keyshortcuts={named}
      onPointerDown={(event) => event.button === 0 && held.press(by)}
      onPointerUp={held.letGo}
      onPointerLeave={held.letGo}
      onPointerCancel={held.letGo}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.detail === 0 && onStep()}
    >
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden className={by < 0 ? "-scale-x-100" : ""}>
        <path d="M3.5 1.5 7 5l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Tip>
        {words} <Key>{key}</Key>
      </Tip>
    </button>
  );
}

// What a button on the bar is, over it when it's pointed at a while, or reached with Tab: on one that rests, why.
export function Tip({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-full left-1/2 mb-2.5 flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs leading-4 whitespace-nowrap text-soft opacity-0 shadow-tip transition-opacity duration-150 ease-calm group-hover/tip:opacity-100 group-hover/tip:delay-500 group-focus-visible/tip:opacity-100 pointer-coarse:hidden [&:has(kbd)]:pr-1.5">
      {children}
    </span>
  );
}

// What the bar has to say, as against what it does: a line of its own just over it, centred on it, so the bar holds
// only what can be pressed and keeps its width whatever's said. On a phone, where over it is the picture, under it.
export function Notice({ children, className = "text-soft" }: { children: ReactNode; className?: string }) {
  return (
    <p role="status" className={`pointer-events-none absolute bottom-full left-1/2 mb-2 phone:top-full phone:bottom-auto phone:mt-2 phone:mb-0 grid w-max max-w-[min(640px,calc(100cqw-32px))] -translate-x-1/2 animate-arrive justify-items-center rounded-md bg-surface px-3 py-1.5 text-center text-xs shadow-tip ${className}`}>
      {children}
    </p>
  );
}

// The part of Play's line not yet played: there to be seen, a step quieter than what has.
const UNPLAYED = "bg-[color-mix(in_srgb,var(--soft)_32%,transparent)]";

// On a phone, the keys go and the buttons sit a little closer, so the bar fits with all of them in 390 wide.
export const ITEM =
  "phone:[&_kbd]:hidden inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 phone:px-2 whitespace-nowrap text-fg transition-colors duration-150 ease-calm enabled:hover:bg-hover disabled:cursor-default disabled:opacity-50 aria-pressed:bg-hover [&_kbd]:text-[color-mix(in_srgb,var(--faint)_55%,var(--soft))]";

export const BAR = 40;
