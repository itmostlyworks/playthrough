// The line from what's open in the column to its spot on the recording: from its number or diamond, out over the edge
// of the column, curving down to its pin. It's there only while both ends are in view.

import { useEffect, useLayoutEffect, useRef } from "react";

export function Wire({ id, colour, hidden }: { id?: string; colour: string; hidden: boolean }) {
  const path = useRef<SVGPathElement>(null);
  const paint = () => {
    const line = path.current;
    if (!line) return;
    const mark = id && document.querySelector<HTMLElement>("aside [data-open] [data-mark]");
    const pin = id && document.querySelector<HTMLElement>(`[data-pin="${CSS.escape(id)}"]`);
    const map = mark && mark.closest<HTMLElement>("[data-map]");
    const from = mark && mark.getBoundingClientRect();
    const to = pin && pin.getBoundingClientRect();
    const room = map && map.getBoundingClientRect();
    // A pin on something scrolled out of the recording is outside it, and so out of view.
    const shown = pin && pin.closest<HTMLElement>("[data-frame]")?.getBoundingClientRect();
    const inside = (box: DOMRect, at: number[]) => at[0]! >= box.left && at[0]! <= box.right && at[1]! >= box.top && at[1]! <= box.bottom;
    if (hidden || !from || !to || !room || !shown || !to.width || from.top < room.top || from.bottom > room.bottom) return line.setAttribute("d", "");
    const start = [from.left - 1, from.top + from.height / 2];
    const end = [to.right + 1, to.top + to.height / 2];
    if (!inside(shown, [to.left + to.width / 2, end[1]!])) return line.setAttribute("d", "");
    const reach = Math.max(40, (start[0]! - end[0]!) * 0.5);
    line.setAttribute("d", `M${start[0]},${start[1]} C${start[0]! - reach},${start[1]} ${end[0]! + reach},${end[1]} ${end[0]},${end[1]}`);
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
    <svg className="pointer-events-none fixed inset-0 z-20 size-full phone:hidden" aria-hidden>
      <path ref={path} fill="none" stroke={colour} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
