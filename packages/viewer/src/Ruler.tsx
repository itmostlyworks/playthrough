// Under the recording: play, the time, and the flow end to end, with a tick where each step starts and a dot for each
// note. Nothing here changes width as it plays.

import { useRef, type PointerEvent } from "react";
import { time, type Flow } from "@vantage/review";
import { usePlaying, useTime, type Player } from "./player.ts";

export type Dot = { id: string; at: number; until?: number; fill: string };

export function Ruler({ player, flow, dots, onDot }: { player: Player | undefined; flow: Flow; dots: Dot[]; onDot: (id: string) => void }) {
  const now = useTime(player);
  const playing = usePlaying(player);
  const line = useRef<HTMLDivElement>(null);
  const share = (seconds: number) => `${(Math.min(seconds, flow.length) / flow.length) * 100}%`;

  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    const box = line.current?.getBoundingClientRect();
    if (box && player) player.seek(((event.clientX - box.left) / box.width) * flow.length);
  };

  return (
    <div className="flex items-center gap-3 pt-4.5">
      <button
        className="grid size-7 flex-none place-items-center rounded-full fill-current text-fg transition-colors duration-150 ease-calm hover:bg-hover"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => player?.toggle()}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          {playing ? (
            <>
              <rect x="2" y="1.5" width="2.6" height="9" rx="1" />
              <rect x="7.4" y="1.5" width="2.6" height="9" rx="1" />
            </>
          ) : (
            <path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l6.6-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5Z" />
          )}
        </svg>
      </button>
      <span className="w-9 text-soft tabular-nums">{time(now)}</span>
      <div
        ref={line}
        className="relative h-9 min-w-30 flex-1 cursor-pointer touch-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          scrub(event);
        }}
        onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && scrub(event)}
      >
        <div className="absolute inset-x-0 top-[17px] h-0.5 rounded-full bg-line">
          <div className="absolute top-0 left-0 h-0.5 rounded-full bg-faint" style={{ width: share(now) }} />
        </div>
        {flow.steps.slice(1).map((step) => (
          <span key={step.title} className="absolute top-[15px] -ml-px h-1.5 w-0.5 rounded-full bg-faint" style={{ left: share(step.at) }} title={step.title} />
        ))}
        {dots.map((dot) => (
          <button
            key={dot.id}
            className={`absolute top-[15px] -ml-[3px] h-1.5 min-w-1.5 rounded-full ring-2 ring-ground before:absolute before:-inset-2 before:content-[''] ${dot.fill}`}
            style={{ left: share(dot.at), ...(dot.until !== undefined && { width: `calc(${share(dot.until)} - ${share(dot.at)})` }) }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDot(dot.id)}
          />
        ))}
        <div className="absolute top-[9px] bottom-[9px] z-10 -ml-px w-0.5 rounded-full bg-fg" style={{ left: share(now) }} />
      </div>
      <span className="w-9 text-right text-faint tabular-nums">{time(flow.length)}</span>
    </div>
  );
}
