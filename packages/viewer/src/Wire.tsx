// The line from what's open in the column to its spot on the recording: from its number or diamond, out over the edge
// of the column, curving down to its pin. It's there only while both ends are in view.

import { useEffect, useLayoutEffect, useRef } from "react";

// Playing, it fades with the outlines, and comes back where the pin is once it stops.
export function Wire({ id, colour, hidden, faded }: { id?: string; colour: string; hidden: boolean; faded: boolean }) {
  const path = useRef<SVGPathElement>(null);
  const paint = () => {
    const line = path.current;
    if (!line) return;
    const mark = id && document.querySelector<HTMLElement>("aside [data-open] [data-mark]");
    // The pin on the round you're watching, not the one beside it.
    const pin = id && document.querySelector<HTMLElement>(`[data-frame][data-watched] [data-pin="${CSS.escape(id)}"]`);
    const map = mark && mark.closest<HTMLElement>("[data-map]");
    const from = mark && mark.getBoundingClientRect();
    const to = pin && pin.getBoundingClientRect();
    const room = map && map.getBoundingClientRect();
    // A pin on something scrolled out of the recording is outside it, and so out of view.
    const shown = pin && pin.closest<HTMLElement>("[data-frame]")?.getBoundingClientRect();
    const inside = (box: DOMRect, at: number[]) => at[0]! >= box.left && at[0]! <= box.right && at[1]! >= box.top && at[1]! <= box.bottom;
    if (hidden || !from || !to || !room || !shown || !to.width || from.top < room.top || from.bottom > room.bottom) return line.setAttribute("d", "");
    if (!inside(shown, [to.left + to.width / 2, to.top + to.height / 2])) return line.setAttribute("d", "");
    // From the card's edge facing the pin: from its number when it's to the pin's right, from its side when it's to the
    // left, and straight up or down to the pin when it's under it or over it. Where they overlap, there's no line.
    const card = map.getBoundingClientRect();
    const middle = to.left + to.width / 2;
    if (card.left >= to.right || card.right <= to.left) {
      const rightOf = card.left >= to.right;
      const start = [rightOf ? from.left - 1 : card.right + 1, from.top + from.height / 2];
      const end = [rightOf ? to.right + 1 : to.left - 1, to.top + to.height / 2];
      const reach = Math.max(40, Math.abs(start[0]! - end[0]!) * 0.5) * (rightOf ? 1 : -1);
      return line.setAttribute("d", `M${start[0]},${start[1]} C${start[0]! - reach},${start[1]} ${end[0]! + reach},${end[1]} ${end[0]},${end[1]}`);
    }
    if (card.top >= to.bottom || card.bottom <= to.top) {
      const under = card.top >= to.bottom;
      const x = Math.min(Math.max(middle, card.left + 12), card.right - 12);
      return line.setAttribute("d", `M${x},${under ? card.top - 1 : card.bottom + 1} L${middle},${under ? to.bottom + 1 : to.top - 1}`);
    }
    line.setAttribute("d", "");
  };
  // Both ends move: the view glides, the column scrolls, a card opens. While something is open, it's drawn every frame.
  useLayoutEffect(paint);
  useEffect(() => {
    if (!id) return;
    let frame = requestAnimationFrame(function again() {
      paint();
      frame = requestAnimationFrame(again);
    });
    return () => cancelAnimationFrame(frame);
  });
  return (
    <svg className={`pointer-events-none fixed inset-0 z-20 size-full transition-opacity duration-250 ease-calm phone:hidden ${faded ? "opacity-0" : ""}`} aria-hidden>
      <path ref={path} fill="none" stroke={colour} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
