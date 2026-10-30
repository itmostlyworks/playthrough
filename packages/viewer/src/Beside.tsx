// What's open sits beside its spot on the recording, where it covers neither the thing it's on nor that thing in the
// round beside it, nor, where it can, what changed: to its right, its left, over it or under it, the first with room. A
// note by its pin, the one you're writing by what it's on, or by where you clicked, a change by its outline. A flow's
// question sits over its last frame. In the app, a note sits by its pin there (pinned). Where nothing marks the spot, it
// stays where it opened; where its thing is still to be drawn, it waits for it, unseen, and once it's stood beside it, it
// stays there while it's gone. It's placed as it opens, and as the recordings' layout changes (Compare on or off, the
// window resized), when it's gone until they've settled and comes back where it goes in the new one, rather than
// showing somewhere on the way; otherwise it keeps where it stood from its pin, going along as the view moves, however
// what it's on grows and shrinks with the page. Playing, it fades with everything drawn over the recording. Dragged, it stays where
// you put it. Opened by you, it closes with its ×, or as you do something else (onAway): a click anywhere else, here or
// in the app. Moving a recording's view around isn't a click.

import { useEffect, useLayoutEffect, useRef, type PointerEvent as Press, type ReactNode } from "react";

// Clicked in the app, the spot is told from there, as its frame keeps the click to itself.
const clicked = { x: innerWidth / 2, y: innerHeight / 2 };
export const clickedAt = (x: number, y: number) => Object.assign(clicked, { x, y });

type Spot = { x: number; y: number };
type Side = "right" | "left" | "under" | "over";
// Over before under: what comes of something on a page tends to show under it.
const SIDES: Side[] = ["right", "left", "over", "under"];
const EDGE = 16;
const GAP = 28;
// A press that moves this far is a drag, not a click.
const DRAG = 4;
// Opened from the timeline, playing comes up to the moment before what it's on is drawn: the card waits this long for it.
const WAIT = 1500;
// The recordings have settled once they've held still this long.
const SETTLED = 120;

// Taken over, a card about the recording rests with what drives it (resting, while the app is on its way or shown): it
// answers nothing, goes once you're in the app, where it would cover what you're doing, and is there as it was when
// you're back.
export function Beside({ id, over, still, resting, pinned, onAway, children }: { id?: string; over?: boolean; still?: boolean; resting?: "waiting" | "shown"; pinned?: () => Spot | undefined; onAway?: () => void; children?: ReactNode }) {
  const card = useRef<HTMLElement>(null);
  const opened = useRef<{ id?: string; at: Spot; since: number; side?: Side; put?: Spot; was?: Spot; last?: Spot; fromPin?: Spot; layout?: string; seen?: { layout: string; since: number }; gone?: boolean }>(undefined);
  // While you point at it, it holds still: what you point at inside it may be drawn somewhere else, and it's not to
  // move from under you.
  const pointing = useRef(false);
  const away = useRef(onAway);
  away.current = resting ? undefined : onAway;
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (card.current?.contains(event.target as Node)) return;
      clickedAt(event.clientX, event.clientY);
      if (!card.current) return;
      // A mark or a pin opens what it's for when it's let go: closing first, on the press, the card and what was under
      // it went and came back each time you pressed what was already open.
      if ((event.target as Element).closest?.("[data-mark], [data-pin]")) return;
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
  // Its pin, or what it's on where it has none, can move with the view any frame, and the recordings' layout change, so
  // it's followed every frame while it's open.
  useLayoutEffect(() => {
    if (!children) return void (opened.current = undefined);
    const place = () => {
      const box = card.current;
      if (!box) return;
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const first = opened.current && opened.current.id === id ? opened.current : (opened.current = { id, at: { ...clicked }, since: performance.now() });
      const recordings = [...document.querySelectorAll("[data-frame]:not([hidden], [data-over])")].map((frame) => {
        const { left, top, width, height } = frame.getBoundingClientRect();
        return [left, top, width, height].map(Math.round).join(",");
      });
      // What it's placed in: the window, and where the recordings are in it.
      const layout = `${innerWidth}x${innerHeight} ${recordings.join(" ")}`;
      const placed = first.layout === layout;
      // Placed already, it's gone while the recordings move, and placed again once they've settled.
      if (first.seen?.layout !== layout) first.seen = { layout, since: performance.now() };
      const moving = performance.now() - first.seen.since < SETTLED;
      const to = (x: number, y: number) => {
        if (pointing.current && first.last && !first.put && placed) [x, y] = [first.last.x, first.last.y];
        first.last = { x, y };
        box.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
        if (!first.gone) return;
        first.gone = false;
        box.style.visibility = "";
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
      };
      // A flow's question sits over its last frame, clear of the bar. Only the round you're watching is where it sits:
      // not one held over it or beside it, or one you've been to and left.
      const shown = "[data-frame][data-watched]";
      const frame = over && document.querySelector<HTMLElement>(shown)?.getBoundingClientRect();
      if (frame) return to(frame.left + frame.width / 2 - w / 2, frame.bottom - h - 44);
      if (first.put) return to(clamp(first.put.x, EDGE, innerWidth - w - EDGE), clamp(first.put.y, EDGE, innerHeight - h - EDGE));
      // Its outline where that's drawn, else its pin: a note on something seen only partway through a step, in a dialog
      // gone by the step's end, has a pin and no outline.
      const sized = (thing: Element | null) => {
        const box = thing?.getBoundingClientRect();
        return box && (box.width || box.height) ? box : undefined;
      };
      const marked = !id ? null : document.querySelector<HTMLElement>(`${shown} [data-mark-id="${CSS.escape(id)}"]`);
      const itsPin = !id ? null : document.querySelector<HTMLElement>(`${shown} [data-pin="${CSS.escape(id)}"]`);
      const outline = marked ?? itsPin;
      const drawn = sized(marked) ?? sized(itsPin);
      const found = !!drawn;
      const fromApp = pinned?.();
      // What it's on is on this round but not drawn yet, or not any more: the card waits unseen for it, or stays where it
      // last stood beside it, rather than standing where it was opened from.
      const waiting = !found && !fromApp && !!outline && !first.was && performance.now() - first.since < WAIT;
      if (!waiting && first.layout && !placed && moving) first.gone = true;
      box.style.visibility = waiting || first.gone ? "hidden" : "";
      if (waiting || (first.gone && moving)) return;
      if (!found && !fromApp && first.was) return to(first.was.x, first.was.y);
      const at = fromApp ?? first.at;
      const spot = found ? drawn! : new DOMRect(at.x, at.y, 0, 0);
      const pin = id ? document.querySelector<HTMLElement>(`${shown} [data-pin="${CSS.escape(id)}"]`)?.getBoundingClientRect() : undefined;
      const corner = pin?.width ? pin : spot;
      const fits = ({ x, y }: Spot) => x >= EDGE && x + w <= innerWidth - EDGE && y >= EDGE && y + h <= innerHeight - EDGE;
      // In the layout it was placed in, it keeps where it stood from its pin.
      const kept = first.fromPin && { x: corner.left + first.fromPin.x, y: corner.top + first.fromPin.y };
      if (moving && first.last) return to(clamp(first.last.x, EDGE, innerWidth - w - EDGE), clamp(first.last.y, EDGE, innerHeight - h - EDGE));
      if (kept && placed && fits(kept)) {
        if (found) first.was = kept;
        return to(kept.x, kept.y);
      }
      // Under it or over it, the card ends at the pin's right, so the line runs straight to the pin.
      const across = clamp(corner.right - w, EDGE, innerWidth - w - EDGE);
      const level = clamp(spot.top - 24, EDGE, innerHeight - h - EDGE);
      const places: Record<Side, Spot> = {
        right: { x: spot.right + GAP, y: level },
        left: { x: spot.left - GAP - w, y: level },
        under: { x: across, y: spot.bottom + 20 },
        over: { x: across, y: Math.min(spot.top, corner.top) - 16 - h },
      };
      // What it shouldn't cover: what it's on, in every round on screen, and where it can, what changed.
      const drawnAs = (marks: string) => [...document.querySelectorAll<HTMLElement>(`[data-frame]:not([hidden], [data-over]) ${marks}`)].map((thing) => thing.getBoundingClientRect()).filter((thing) => thing.width);
      const its = id ? drawnAs(`[data-mark-id="${CSS.escape(id)}"]`) : [];
      const clearOf = (things: DOMRect[]) => (side: Side) => {
        const { x, y } = places[side];
        return fits(places[side]) && !things.some((thing) => x < thing.right && x + w > thing.left && y < thing.bottom && y + h > thing.top);
      };
      // Side by side, it stays on its own round where it can, never across the divide over the other.
      const others = [...document.querySelectorAll<HTMLElement>("[data-frame]:not([hidden], [data-over], [data-watched])")].map((other) => other.getBoundingClientRect());
      // It goes back to the side it opened on where that works, so Compare on and off again leaves it where it was.
      const sides = first.side ? [first.side, ...SIDES] : SIDES;
      const side =
        sides.find(clearOf([...its, ...others, ...drawnAs(`[data-kind="change"]`)])) ?? sides.find(clearOf([...its, ...others])) ?? sides.find(clearOf(its)) ?? sides.find(clearOf([]));
      if (found || fromApp) first.side ??= side;
      if (side && found) first.was = places[side];
      if (side && (found || fromApp)) Object.assign(first, { layout, fromPin: { x: places[side].x - corner.left, y: places[side].y - corner.top } });
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
      inert={!!resting}
      onPointerDown={drag}
      onPointerEnter={() => (pointing.current = true)}
      onPointerLeave={() => (pointing.current = false)}
      className={`fixed top-0 left-0 z-30 w-[330px] rounded-xl bg-ground py-1.5 shadow-[0_0_0_1px_rgba(20,24,34,0.08),0_10px_30px_rgba(20,24,34,0.16)] transition-opacity duration-250 ease-calm ${still || resting === "shown" ? "pointer-events-none opacity-0" : ""}`}
    >
      <div data-card className={`grid grid-cols-[minmax(0,1fr)] ${onAway ? "[&>*>button:first-child]:pr-9" : ""}`}>
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
