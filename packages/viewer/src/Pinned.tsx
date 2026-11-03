// What's at a situation's moment, on its recording, as the frame drew it: each note on its thing, outlined, its pin
// just outside the top right corner like a badge, or on its spot, and what changed outlined in the recording's own ink,
// a diamond for its pin; where nothing's found, at the picture's corner. The open one's card sits beside it, where it
// covers neither the thing nor its pin: to its right, its left, over it or under it, the first with room in the
// picture. While it plays they fade, and come back once it stops.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Placed } from "./Player.tsx";
import type { Rect } from "./replay.ts";
import { pinLook } from "./Stage.tsx";

// How far a pin sits out from its outline's corner, and a card from what it's on, as in the frame.
const OUT = 14;
const GAP = 28;
const EDGE = 12;

// A pin, on the things it's for: a note's, numbered in its colour; or a change's diamond.
export type Pin = { id: string; on: string[]; ink: string } & ({ number: number; fill: string } | { diamond: true });

type Props = { pins: Pin[]; placed: Placed; open?: string; faded: boolean; onOpen: (id?: string) => void; children?: ReactNode };

export function Pinned({ pins, placed, open, faded, onOpen, children }: Props) {
  const room = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const picture = room.current!;
    const watching = new ResizeObserver(() => setSize({ width: picture.clientWidth, height: picture.clientHeight }));
    watching.observe(picture);
    return () => watching.disconnect();
  }, []);
  const corner: Rect = { left: EDGE + 9, top: EDGE + 9, width: 0, height: 0 };
  // A pin is on the first of its things that's found.
  const spotOf = (pin: Pin): Rect => pin.on.map((id) => placed[id]).find(Boolean) ?? corner;
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
  const opened = pins.find((pin) => pin.id === open);
  useLayoutEffect(() => {
    const [box, picture] = [card.current, room.current];
    if (!box || !picture || !opened) return;
    const place = () => {
      const [width, height, w, h] = [picture.clientWidth, picture.clientHeight, box.offsetWidth, box.offsetHeight];
      const spot = spotOf(opened);
      // The card keeps clear of the things and the pin; on a spot, of the pin.
      const pin = pinOf(spot);
      const things = opened.on.map((id) => placed[id]).filter((rect): rect is Rect => !!rect && (rect.width > 0 || rect.height > 0));
      const thing = things.length ? around(things) : pin;
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
    <div ref={room} className={`pointer-events-none absolute inset-0 transition-opacity duration-250 ease-calm ${faded ? "opacity-0 [&_*]:pointer-events-none!" : ""}`}>
      {pins.map((pin) => {
        const spot = spotOf(pin);
        if (!inView(spot)) return null;
        const at = pinOf(spot);
        const chosen = pin.id === open;
        return (
          <div key={pin.id} style={{ "--c": pin.ink } as CSSProperties}>
            {pin.on.map((id) => {
              const thing = placed[id];
              return (
                thing &&
                (thing.width > 0 || thing.height > 0) && (
                  <div
                    key={id}
                    className={`absolute rounded-[4px] outline-offset-4 outline-solid ${chosen ? "outline-[1.5px] outline-(--c)" : "outline-1 outline-[color-mix(in_srgb,var(--c)_50%,transparent)]"}`}
                    style={{ left: thing.left, top: thing.top, width: thing.width, height: thing.height }}
                  />
                )
              );
            })}
            <button
              aria-label={"number" in pin ? `Note ${pin.number}` : "What changed here"}
              aria-expanded={chosen}
              className={
                "number" in pin
                  ? `absolute ${pinLook} ${pin.fill}`
                  : "pointer-events-auto absolute grid size-[18px] cursor-pointer place-items-center transition duration-150 ease-calm hover:scale-112"
              }
              style={{ left: at.left, top: at.top }}
              onClick={() => onOpen(chosen ? undefined : pin.id)}
            >
              {"number" in pin ? pin.number : <i className="size-2.5 rotate-45 bg-(--c) shadow-[0_0_0_2px_#fff]" />}
            </button>
          </div>
        );
      })}
      {opened && children && (
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

// The part of the picture several things take up together.
const around = (rects: Rect[]): Rect => {
  const [left, top] = [Math.min(...rects.map((rect) => rect.left)), Math.min(...rects.map((rect) => rect.top))];
  return { left, top, width: Math.max(...rects.map((rect) => rect.left + rect.width)) - left, height: Math.max(...rects.map((rect) => rect.top + rect.height)) - top };
};
