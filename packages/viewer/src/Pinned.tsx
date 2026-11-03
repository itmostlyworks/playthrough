// A step's notes on its recording, as the frame draws them: each on its thing, outlined, its pin just outside the top
// right corner like a badge, or on its spot; where nothing's found, at the picture's corner. The open one's card sits
// beside it, where it covers neither the thing nor its pin: to its right, its left, over it or under it, the first with
// room in the picture. They're the step's at rest, at its end: while it plays they fade, and come back once it stops.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fill, ink, type Shown } from "./notes.ts";
import type { Placed } from "./Loop.tsx";
import type { Rect } from "./replay.ts";
import { pinLook } from "./Stage.tsx";

// How far a pin sits out from its outline's corner, and a card from what it's on, as in the frame.
const OUT = 14;
const GAP = 28;
const EDGE = 12;

// The note being written is pinned as the rest are, in the colour of what's yours and not yet saved.
type Props = { notes: Shown[]; writing?: { id: string; number: number }; placed: Placed; open?: string; faded: boolean; onOpen: (id?: string) => void; children?: ReactNode };

export function Pinned({ notes, writing, placed, open, faded, onOpen, children }: Props) {
  const room = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const picture = room.current!;
    const watching = new ResizeObserver(() => setSize({ width: picture.clientWidth, height: picture.clientHeight }));
    watching.observe(picture);
    return () => watching.disconnect();
  }, []);
  const spotOf = (id: string): Rect => placed[id] ?? { left: EDGE + 9, top: EDGE + 9, width: 0, height: 0 };
  // On a thing, its pin is just outside the top right corner; at the bottom right where the top is out of view, and
  // pulled in where the right or the bottom is, so it's never cut off. On a spot, it's the spot.
  const pinOf = (spot: Rect): Rect => {
    if (!spot.width && !spot.height) return { left: spot.left - 9, top: spot.top - 9, width: 18, height: 18 };
    const [right, bottom] = [spot.left + spot.width, spot.top + spot.height];
    const across = Math.min(OUT, size.width - right - 11);
    const top = spot.top - OUT >= 11 ? spot.top - OUT - 9 : bottom + Math.min(OUT, size.height - bottom - 11) - 9;
    return { left: right + across - 9, top, width: 18, height: 18 };
  };
  const inView = (spot: Rect) => spot.left < size.width && spot.top < size.height && spot.left + spot.width > 0 && spot.top + spot.height > 0;
  useLayoutEffect(() => {
    const [box, picture] = [card.current, room.current];
    if (!box || !picture || !open) return;
    const place = () => {
      const [width, height, w, h] = [picture.clientWidth, picture.clientHeight, box.offsetWidth, box.offsetHeight];
      const spot = spotOf(open);
      // The card keeps clear of the thing and its pin; on a spot, of the pin.
      const pin = pinOf(spot);
      const thing = spot.width || spot.height ? spot : pin;
      const level = clamp(thing.top - 24, EDGE, height - h - EDGE);
      // Over it or under it, the card ends at the pin's right.
      const across = clamp(pin.left + pin.width - w, EDGE, width - w - EDGE);
      const places = [
        { x: thing.left + thing.width + GAP, y: level },
        { x: thing.left - GAP - w, y: level },
        { x: across, y: pin.top - 16 - h },
        { x: across, y: thing.top + thing.height + 20 },
      ];
      const covers = ({ x, y }: { x: number; y: number }, { left, top, width, height }: Rect) => x < left + width && x + w > left && y < top + height && y + h > top;
      const fits = ({ x, y }: { x: number; y: number }) => x >= EDGE && x + w <= width - EDGE && y >= EDGE && y + h <= height - EDGE;
      const { x, y } = places.find((at) => fits(at) && !covers(at, thing) && !covers(at, pin)) ?? { x: clamp(places[0]!.x, EDGE, width - w - EDGE), y: level };
      box.style.translate = `${x}px ${y}px`;
    };
    place();
    // What it says changing its length, as Not quite does, it's placed again.
    const watching = new ResizeObserver(place);
    watching.observe(box);
    watching.observe(picture);
    return () => watching.disconnect();
  });
  return (
    <div ref={room} className={`pointer-events-none absolute inset-0 transition-opacity duration-250 ease-calm ${faded ? "opacity-0" : ""}`}>
      {[...notes.map((note) => ({ id: note.id, number: note.number, ink: ink(note), fill: fill(note) })), ...(writing ? [{ ...writing, ink: "var(--amber)", fill: "bg-amber" }] : [])].map((note) => {
        const spot = spotOf(note.id);
        if (!inView(spot)) return null;
        const pin = pinOf(spot);
        return (
          <div key={note.id} style={{ "--c": note.ink } as CSSProperties}>
            {(spot.width > 0 || spot.height > 0) && (
              <div
                className={`absolute rounded-[4px] outline-offset-4 outline-solid ${note.id === open ? "outline-[1.5px] outline-(--c)" : "outline-1 outline-[color-mix(in_srgb,var(--c)_50%,transparent)]"}`}
                style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height }}
              />
            )}
            <button
              aria-label={`Note ${note.number}`}
              aria-expanded={note.id === open}
              className={`absolute ${pinLook} ${note.fill}`}
              style={{ left: pin.left, top: pin.top }}
              onClick={() => onOpen(note.id === open ? undefined : note.id)}
            >
              {note.number}
            </button>
          </div>
        );
      })}
      {open && children && (
        <aside ref={card} className="pointer-events-auto absolute top-0 left-0 z-1 w-[330px] animate-arrive rounded-xl bg-ground py-1.5 shadow-float">
          <div data-open className="grid grid-cols-[minmax(0,1fr)]">
            {children}
          </div>
          <button
            aria-label="Close"
            className="absolute top-[11px] right-2 grid size-5 place-items-center rounded-full text-faint transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg"
            onClick={() => onOpen(undefined)}
          >
            <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </aside>
      )}
    </div>
  );
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
