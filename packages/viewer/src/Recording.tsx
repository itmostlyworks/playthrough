// The recording, as large as fits and never larger than it was recorded, with the notes on it pinned where they are.
// While it's paused, a click drops a pin there and starts a note on that moment; while it plays, a click pauses it.

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Point } from "@vantage/review";
import { Player, usePlaying, useTime, type Events } from "./player.ts";

export type Pin = { id: string; number: number; at: number; until?: number; point: Point; fill: string };

const CAPTION = 24;

// A pin shows from its moment, or through its stretch, for long enough to be seen when playing past it.
const SHOWN_FOR = 1.5;

const pin = "absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full text-[10px] leading-[18px] font-semibold text-white shadow-pin";

export function Recording(props: {
  caption: string;
  player: Player | undefined;
  host: (element: HTMLDivElement | null) => void;
  pins: Pin[];
  placing?: Point;
  onPlace: (point: Point) => void;
  onPin: (id: string) => void;
}) {
  const { player, pins, placing } = props;
  const time = useTime(player);
  const playing = usePlaying(player);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  const [aim, setAim] = useState<Point>();

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setRoom({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const recorded = { width: player?.width ?? 1280, height: player?.height ?? 800 };
  const width = Math.floor(Math.min(room.width, ((room.height - CAPTION) * recorded.width) / recorded.height, recorded.width));
  const height = Math.round((width * recorded.height) / recorded.width);

  const pointAt = (event: MouseEvent<HTMLDivElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
  };

  return (
    <div ref={stage} className="flex min-h-0 flex-col items-center select-none">
      <div className="truncate px-0.5 text-xs leading-6 text-faint" style={{ width, height: CAPTION }}>
        {props.caption}
      </div>
      <div className="relative flex-none overflow-hidden rounded-lg bg-paper shadow-frame" style={{ width, height }}>
        <div
          ref={props.host}
          className="absolute top-0 left-0 origin-top-left [&_iframe]:pointer-events-none [&_iframe]:block [&_iframe]:border-0"
          style={{ width: recorded.width, height: recorded.height, transform: `scale(${width / recorded.width})` }}
        />
        <div
          className={`absolute inset-0 z-10 ${playing ? "" : "cursor-none"}`}
          onPointerMove={(event) => !playing && setAim(pointAt(event))}
          onPointerLeave={() => setAim(undefined)}
          onClick={(event) => (playing ? player?.pause() : props.onPlace(pointAt(event)))}
        >
          {pins
            .filter((shown) => time >= shown.at - 0.05 && time <= (shown.until ?? shown.at) + SHOWN_FOR)
            .map((shown) => (
              <button
                key={shown.id}
                className={`${pin} ${shown.fill} cursor-pointer opacity-90 transition duration-150 ease-calm hover:scale-112 hover:opacity-100`}
                style={{ left: `${shown.point.x * 100}%`, top: `${shown.point.y * 100}%` }}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onPin(shown.id);
                }}
              >
                {shown.number}
              </button>
            ))}
          {placing && <span className={`${pin} animate-drop bg-amber`} style={{ left: `${placing.x * 100}%`, top: `${placing.y * 100}%` }} />}
          {aim && !placing && !playing && (
            <span
              className="pointer-events-none absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-amber/70"
              style={{ left: `${aim.x * 100}%`, top: `${aim.y * 100}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// The flow's recording, played in the element given for it. A new recording replaces the last only once it's here,
// so switching flows never shows an empty frame.
export function usePlayer(host: HTMLDivElement | null, events: Events | undefined, length: number, startAt = 0): Player | undefined {
  const [player, setPlayer] = useState<Player>();
  useEffect(() => {
    if (!host || !events) return;
    const next = new Player(events, host, length);
    if (startAt) next.seek(startAt);
    setPlayer(next);
    return () => next.destroy();
  }, [host, events, length]); // where it starts matters only as it opens
  return player;
}

const clamp = (share: number) => Math.max(0, Math.min(1, share));
