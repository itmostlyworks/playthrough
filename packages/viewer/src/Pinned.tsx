// What's at a scene's moment, on its recording, as the frame drew it: each note on its thing, outlined, its pin
// just outside the top right corner like a badge, or on its spot, and what changed outlined in the recording's own ink,
// a diamond for its pin; where nothing's found, at the picture's corner. What's said about them is in the scene's
// list, never over the recording. While it plays they fade, and come back once it stops.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Placed } from "./Player.tsx";
import type { Rect } from "./replay.ts";
import { pinLook } from "./Stage.tsx";

// How far a pin sits out from its outline's corner, as in the frame.
const OUT = 14;

// A pin, on the things it's for: a note's, numbered in its colour; or a change's diamond.
export type Pin = { id: string; on: string[]; ink: string } & ({ number: number; fill: string } | { diamond: true });

type Props = { pins: Pin[]; placed: Placed; open?: string; faded: boolean; onOpen: (id?: string) => void };

export function Pinned({ pins, placed, open, faded, onOpen }: Props) {
  const room = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const picture = room.current!;
    const watching = new ResizeObserver(() => setSize({ width: picture.clientWidth, height: picture.clientHeight }));
    watching.observe(picture);
    return () => watching.disconnect();
  }, []);
  // A pin is on the first of its things that's found. With none on this frame, as a note made in the app on what the
  // recording never shows, there's no pin: in a corner it covered the app, and what's said is in the way beside it.
  const spotOf = (pin: Pin): Rect | undefined => pin.on.map((id) => placed[id]).find(Boolean);
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
  // Pins on the same thing, as a note and a change on it are, sit side by side, the later to the left.
  const at = new Map<string, Rect>();
  for (const pin of pins) {
    const spot = spotOf(pin);
    if (!spot) continue;
    const here = pinOf(spot);
    while ([...at.values()].some((other) => Math.abs(other.left - here.left) < 18 && Math.abs(other.top - here.top) < 18)) here.left -= 22;
    at.set(pin.id, here);
  }
  return (
    <div ref={room} className={`pointer-events-none absolute inset-0 transition-opacity duration-250 ease-calm ${faded ? "opacity-0 [&_*]:pointer-events-none!" : ""}`}>
      {pins.map((pin) => {
        const spot = spotOf(pin);
        if (!spot || !inView(spot)) return null;
        const { left, top } = at.get(pin.id)!;
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
              style={{ left, top }}
              onClick={() => onOpen(chosen ? undefined : pin.id)}
            >
              {"number" in pin ? pin.number : <i className="size-2.5 rotate-45 bg-(--c) shadow-[0_0_0_2px_#fff]" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
