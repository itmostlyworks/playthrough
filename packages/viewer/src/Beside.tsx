// What's open sits beside its spot on the recording, on whichever side has room: a note by its pin, the one you're
// writing by what it's on, or by where you clicked.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

export function Beside({ id, children }: { id?: string; children?: ReactNode }) {
  const card = useRef<HTMLElement>(null);
  const clicked = useRef({ x: innerWidth / 2, y: innerHeight / 2 });
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (!card.current?.contains(event.target as Node)) clicked.current = { x: event.clientX, y: event.clientY };
    };
    addEventListener("pointerdown", down, true);
    return () => removeEventListener("pointerdown", down, true);
  }, []);
  // The spot moves as the view glides and the card grows, so it's placed again every frame while it's open.
  useLayoutEffect(() => {
    if (!children) return;
    const place = () => {
      const box = card.current;
      if (!box) return;
      const pin = !id ? null : document.querySelector<HTMLElement>(`[data-frame] [data-pin="${CSS.escape(id)}"], [data-frame] [data-mark-id="${CSS.escape(id)}"]`);
      const drawn = pin?.getBoundingClientRect();
      const spot = drawn?.width || drawn?.height ? drawn : new DOMRect(clicked.current.x, clicked.current.y, 0, 0);
      const right = spot.right + 28;
      const left = right + box.offsetWidth <= innerWidth - 16 ? right : Math.max(16, spot.left - 28 - box.offsetWidth);
      const top = Math.min(Math.max(16, spot.top - 24), innerHeight - box.offsetHeight - 16);
      box.style.transform = `translate(${left.toFixed(1)}px,${top.toFixed(1)}px)`;
    };
    place();
    let frame = requestAnimationFrame(function again() {
      place();
      frame = requestAnimationFrame(again);
    });
    return () => cancelAnimationFrame(frame);
  });
  if (!children) return null;
  return (
    <aside ref={card} className="fixed top-0 left-0 z-30 w-[330px] rounded-xl bg-ground py-1.5 shadow-[0_0_0_1px_rgba(20,24,34,0.08),0_10px_30px_rgba(20,24,34,0.16)]">
      <div data-map className="grid grid-cols-[minmax(0,1fr)]">
        {children}
      </div>
    </aside>
  );
}
