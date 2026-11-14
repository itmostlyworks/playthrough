// The bar across a moment's foot: its size and its buttons' look, and the slim lines inside Play and Step in.

import { useEffect, useRef } from "react";
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

// The part of Play's line not yet played: there to be seen, a step quieter than what has.
const UNPLAYED = "bg-[color-mix(in_srgb,var(--soft)_32%,transparent)]";

// On a phone, the keys go, so the bar fits with all four.
export const ITEM =
  "phone:[&_kbd]:hidden inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap text-fg transition-colors duration-150 ease-calm enabled:hover:bg-hover disabled:cursor-default disabled:opacity-50 aria-pressed:bg-hover [&_kbd]:text-[color-mix(in_srgb,var(--faint)_55%,var(--soft))]";

export const BAR = 40;
