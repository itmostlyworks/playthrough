// The pointer's tag (tag.ts), drawn the same on every pointer that wears it: the recording's, and the one that stands in
// for it taking over, which takes its place in the very frame the recording's goes, so the two are one tag. It stands at
// the pointer's tip, at one size however close the picture is; its words stand one over the other, the agent's and then
// yours, and taking over it rolls from one to the next.

import type { CSSProperties, Ref } from "react";
import { BELOW, CLEAR, RIGHT } from "./tag.ts";

// `unplaced`, it's hidden until it's first put by a pointer, so it's never seen where it starts.
export function PointerTag(props: { at: Ref<HTMLSpanElement>; tag: Ref<HTMLSpanElement>; words: string; unplaced?: boolean; className?: string; style?: CSSProperties }) {
  const { at, tag, words, unplaced, className = "", style } = props;
  return (
    <span ref={at} data-part="tag" aria-hidden className={`pointer-events-none absolute top-0 left-0 size-0 origin-top-left ${className}`} style={style}>
      <span ref={tag} className={`absolute block overflow-hidden ${LOOK}`} style={{ left: RIGHT, top: BELOW, height: TALL, ...(unplaced && { visibility: "hidden" }) }}>
        <span className="flex w-max flex-col items-start">
          <span className="px-[7px]">{words}</span>
          <span className="px-[7px]">You</span>
        </span>
      </span>
    </span>
  );
}

// Below and right of the tip, or turned where the picture's edge would cut it off, in a pointer drawn `grown` times its size.
export function turn(tag: HTMLElement, { left, above }: { left: boolean; above: boolean }, grown: number) {
  Object.assign(tag.style, {
    left: left ? "" : `${RIGHT * grown}px`,
    right: left ? `${CLEAR * grown}px` : "",
    top: above ? "" : `${BELOW * grown}px`,
    bottom: above ? `${CLEAR * grown}px` : "",
  });
}

// Its size, as wide as its longer words, so it never turns as it rolls.
export const sizeOf = (tag: HTMLElement) => ({ width: (tag.firstElementChild as HTMLElement).offsetWidth, height: TALL });

// A name on a pointer: small, dark and quiet over any page, light or dark. Yours, noting, says "Note on this" in it
// (`TAG`), where your own pointer is.
const LOOK = "rounded-full bg-[#2B2E35] font-ui text-[11px] leading-[17px] whitespace-nowrap text-white tabular-nums shadow-[0_1px_3px_rgba(0,0,0,0.25)]";
export const TAG = `absolute top-[17px] left-[13px] overflow-hidden px-[7px] ${LOOK}`;
export const TALL = 17;
// Yours, in the amber the app's edge has while it's yours.
export const YOURS = { backgroundColor: "rgb(236, 178, 72)", color: "#3B2A07" };
