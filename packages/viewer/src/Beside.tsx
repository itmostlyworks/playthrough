// What's open sits beside its spot on the recording, where it covers neither the thing it's on nor that thing in the
// round beside it: to its right, its left, under it or over it, the first with room. A note by its pin, the one you're
// writing by what it's on, or by where you clicked, a change by its outline. A flow's question sits over its last frame.
// In the app, a note sits by its pin there (pinned). Where nothing marks the spot, it stays where it opened. Dragged, it
// stays where you put it. Opened by you, it closes with its ×, or as you do something else (onAway): a click anywhere
// else, here or in the app. Moving a recording's view around isn't a click.

import { useEffect, useLayoutEffect, useRef, type PointerEvent as Press, type ReactNode } from "react";

// Clicked in the app, the spot is told from there, as its frame keeps the click to itself.
const clicked = { x: innerWidth / 2, y: innerHeight / 2 };
export const clickedAt = (x: number, y: number) => Object.assign(clicked, { x, y });

type Spot = { x: number; y: number };
type Side = "right" | "left" | "under" | "over";
const SIDES: Side[] = ["right", "left", "under", "over"];
const EDGE = 16;
const GAP = 28;
// A press that moves this far is a drag, not a click.
const DRAG = 4;

export function Beside({ id, over, pinned, onAway, children }: { id?: string; over?: boolean; pinned?: () => Spot | undefined; onAway?: () => void; children?: ReactNode }) {
  const card = useRef<HTMLElement>(null);
  const opened = useRef<{ id?: string; at: Spot; side?: Side; put?: Spot }>(undefined);
  const away = useRef(onAway);
  away.current = onAway;
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (card.current?.contains(event.target as Node)) return;
      clickedAt(event.clientX, event.clientY);
      if (!card.current) return;
      // On a recording, it's a click only if it's let go where it was pressed: a drag there moves the view.
      if (!(event.target as Element).closest?.("[data-frame]")) return away.current?.();
      const up = (lifted: PointerEvent) => {
        removeEventListener("pointerup", up, true);
        if (Math.hypot(lifted.clientX - event.clientX, lifted.clientY - event.clientY) < DRAG) away.current?.();
      };
      addEventListener("pointerup", up, true);
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
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const to = (x: number, y: number) => void (box.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`);
      // A flow's question sits over its last frame, clear of the bar. Only the round you're watching is where it sits:
      // not one held over it or beside it, or one you've been to and left.
      const shown = "[data-frame][data-watched]";
      const frame = over && document.querySelector<HTMLElement>(shown)?.getBoundingClientRect();
      if (frame) return to(frame.left + frame.width / 2 - w / 2, frame.bottom - h - 44);
      const first = opened.current && opened.current.id === id ? opened.current : (opened.current = { id, at: { ...clicked } });
      if (first.put) return to(clamp(first.put.x, EDGE, innerWidth - w - EDGE), clamp(first.put.y, EDGE, innerHeight - h - EDGE));
      const outline = !id ? null : document.querySelector<HTMLElement>(`${shown} [data-pin="${CSS.escape(id)}"], ${shown} [data-mark-id="${CSS.escape(id)}"]`);
      const drawn = outline?.getBoundingClientRect();
      const at = pinned?.() ?? first.at;
      const spot = drawn?.width || drawn?.height ? drawn : new DOMRect(at.x, at.y, 0, 0);
      const pin = id ? document.querySelector<HTMLElement>(`${shown} [data-pin="${CSS.escape(id)}"]`)?.getBoundingClientRect() : undefined;
      const corner = pin?.width ? pin : spot;
      // Under it or over it, the card ends at the pin's right, so the line runs straight to the pin.
      const across = clamp(corner.right - w, EDGE, innerWidth - w - EDGE);
      const level = clamp(spot.top - 24, EDGE, innerHeight - h - EDGE);
      const places: Record<Side, Spot> = {
        right: { x: spot.right + GAP, y: level },
        left: { x: spot.left - GAP - w, y: level },
        under: { x: across, y: spot.bottom + 20 },
        over: { x: across, y: Math.min(spot.top, corner.top) - 16 - h },
      };
      // What it shouldn't cover: what it's on, in every round on screen.
      const things = id ? [...document.querySelectorAll<HTMLElement>(`[data-frame]:not([hidden], [data-over]) [data-mark-id="${CSS.escape(id)}"]`)].map((thing) => thing.getBoundingClientRect()).filter((thing) => thing.width) : [];
      const fits = ({ x, y }: Spot) => x >= EDGE && x + w <= innerWidth - EDGE && y >= EDGE && y + h <= innerHeight - EDGE;
      const clear = ({ x, y }: Spot) => !things.some((thing) => x < thing.right && x + w > thing.left && y < thing.bottom && y + h > thing.top);
      // It keeps its side while that still works, so it never hops as the card grows or the view glides.
      const good = (side: Side) => fits(places[side]) && clear(places[side]);
      const side = first.side && good(first.side) ? first.side : (SIDES.find(good) ?? SIDES.find((side) => fits(places[side])));
      first.side = side;
      if (side) return to(places[side].x, places[side].y);
      to(spot.right + GAP + w <= innerWidth - EDGE ? spot.right + GAP : Math.max(EDGE, spot.left - GAP - w), level);
    };
    place();
    let frame = requestAnimationFrame(function again() {
      place();
      frame = requestAnimationFrame(again);
    });
    return () => cancelAnimationFrame(frame);
  });
  // Pressed anywhere on it but what takes words, it can be dragged; moved, the press isn't a click.
  const drag = (event: Press<HTMLElement>) => {
    const box = card.current;
    if (event.button !== 0 || !box || !opened.current || (event.target as Element).closest("input, textarea, select, [contenteditable]")) return;
    const start = { x: event.clientX, y: event.clientY };
    const from = box.getBoundingClientRect();
    const kept = opened.current;
    let moved = false;
    const move = (moving: PointerEvent) => {
      if (!moved && Math.hypot(moving.clientX - start.x, moving.clientY - start.y) < DRAG) return;
      // Dragged, it moves rather than selecting its words.
      if (!moved) getSelection()?.removeAllRanges();
      document.documentElement.style.userSelect = "none";
      moved = true;
      kept.put = { x: from.left + moving.clientX - start.x, y: from.top + moving.clientY - start.y };
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      if (!moved) return;
      document.documentElement.style.userSelect = "";
      const swallow = (click: MouseEvent) => click.stopPropagation();
      addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener("click", swallow, { capture: true }));
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  if (!children) return null;
  return (
    <aside
      ref={card}
      onPointerDown={drag}
      className="fixed top-0 left-0 z-30 w-[330px] rounded-xl bg-ground py-1.5 shadow-[0_0_0_1px_rgba(20,24,34,0.08),0_10px_30px_rgba(20,24,34,0.16)]"
    >
      <div data-map className={`grid grid-cols-[minmax(0,1fr)] [--ahead:color-mix(in_srgb,var(--faint)_45%,var(--ground))] [--rail:var(--soft)] ${onAway ? "[&>*>:first-child]:pr-9" : ""}`}>
        {children}
      </div>
      {onAway && (
        <button
          aria-label="Close"
          className="absolute top-[11px] right-2 grid size-5 place-items-center rounded-full text-faint transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => away.current?.()}
        >
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      )}
    </aside>
  );
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
