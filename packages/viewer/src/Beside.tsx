// What's open sits beside its spot on the recording, on whichever side has room: a note by its pin, the one you're
// writing by what it's on, or by where you clicked, a change by its outline. A flow's question sits over its last frame.
// In the app, a note sits by its pin there (pinned). Where nothing marks the spot, it stays where it opened. Opened by
// you, it closes as you do something else (onAway): a click anywhere else, here or in the app.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

// Clicked in the app, the spot is told from there, as its frame keeps the click to itself.
const clicked = { x: innerWidth / 2, y: innerHeight / 2 };
export const clickedAt = (x: number, y: number) => Object.assign(clicked, { x, y });

type Spot = { x: number; y: number };

export function Beside({ id, over, pinned, onAway, children }: { id?: string; over?: boolean; pinned?: () => Spot | undefined; onAway?: () => void; children?: ReactNode }) {
  const card = useRef<HTMLElement>(null);
  const opened = useRef<{ id?: string; at: Spot }>(undefined);
  const away = useRef(onAway);
  away.current = onAway;
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (card.current?.contains(event.target as Node)) return;
      clickedAt(event.clientX, event.clientY);
      if (card.current) away.current?.();
    };
    // The app keeps its clicks to itself, and says so.
    const inApp = ({ data }: MessageEvent) => data?.vantage === "down" && card.current && away.current?.();
    addEventListener("pointerdown", down, true);
    addEventListener("message", inApp);
    return () => {
      removeEventListener("pointerdown", down, true);
      removeEventListener("message", inApp);
    };
  }, []);
  // The spot moves as the view glides and the card grows, so it's placed again every frame while it's open.
  useLayoutEffect(() => {
    if (!children) return void (opened.current = undefined);
    const place = () => {
      const box = card.current;
      if (!box) return;
      // A flow's question sits over its last frame, clear of the bar.
      const frame = over && document.querySelector<HTMLElement>("[data-frame]")?.getBoundingClientRect();
      if (frame) {
        box.style.transform = `translate(${(frame.left + frame.width / 2 - box.offsetWidth / 2).toFixed(1)}px,${(frame.bottom - box.offsetHeight - 44).toFixed(1)}px)`;
        return;
      }
      const pin = !id ? null : document.querySelector<HTMLElement>(`[data-frame] [data-pin="${CSS.escape(id)}"], [data-frame] [data-mark-id="${CSS.escape(id)}"]`);
      const drawn = pin?.getBoundingClientRect();
      const first = opened.current && opened.current.id === id ? opened.current : (opened.current = { id, at: { ...clicked } });
      const at = pinned?.() ?? first.at;
      const spot = drawn?.width || drawn?.height ? drawn : new DOMRect(at.x, at.y, 0, 0);
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
      <div data-map className="grid grid-cols-[minmax(0,1fr)] [--ahead:color-mix(in_srgb,var(--faint)_45%,var(--ground))] [--rail:var(--soft)]">
        {children}
      </div>
    </aside>
  );
}
