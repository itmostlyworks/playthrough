// A step of a recording played over and over, small, in its part of the page, with the hand that does it: what a still
// can't say, where they clicked and what the page did. Two side by side keep time: each starts its step when the other
// does, and the quicker waits on its last frame. At rest it's that last frame.

import { useEffect, useRef, useState } from "react";
import { recording } from "./api.ts";
import { Replay } from "./replay.ts";
import type { Frame } from "./Picture.tsx";

// A step longer than this is played faster, so a loop never drags; one shorter, slower, so a few keys typed in a moment
// can be seen.
const LONGEST = 4.5;
const SHORTEST = 1.4;
// How long the end holds before it goes round again.
export const HOLD = 0.9;

// How long a step takes to play, at the speed it's played at.
export const playedFor = (from: number, until: number) => Math.min(Math.max(until - from, SHORTEST), LONGEST);

type Props = {
  review: string;
  round: number;
  recording: string;
  from: number;
  until: number;
  frame?: Frame;
  // When the loops started, on the page's clock, and how long one goes round, the same for both; none at rest.
  started?: number;
  cycle: number;
};

export function Loop(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const [replay, setReplay] = useState<Replay>();
  useEffect(() => {
    let current = true;
    let made: Replay | undefined;
    recording(props.review, props.round, props.recording).then((events) => {
      if (!current || !box.current) return;
      made = new Replay(events, box.current);
      setReplay(made);
    });
    return () => void ((current = false), made?.destroy());
  }, [props.review, props.round, props.recording]);

  const { from, until, frame, started, cycle } = props;
  useEffect(() => {
    if (!replay || !box.current) return;
    const shape = replay.shapeAt(until);
    const part = frame ?? { x: 0, y: 0, width: 1, height: 1 };
    const k = box.current.clientWidth / (part.width * shape.width);
    const [left, top] = [part.x * shape.width, part.y * shape.height];
    replay.host.style.transform = `translate(${-left * k}px, ${-top * k}px) scale(${k})`;
    const speed = (until - from) / playedFor(from, until);
    const draw = (at: number) => {
      const pointer = replay.pointerAt(at);
      const hand = cursor.current!;
      hand.style.opacity = pointer ? "1" : "0";
      if (!pointer) return;
      const [x, y] = [(pointer[0] - left) * k, (pointer[1] - top) * k];
      hand.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
      const click = replay.clicks.find((click) => at >= click && at < click + 0.5 / speed);
      const u = click === undefined ? 1 : ((at - click) * speed) / 0.5;
      Object.assign(ring.current!.style, { opacity: String(1 - u), transform: `translate(${x}px, ${y}px) scale(${0.4 + u * 1.1})` });
    };
    if (started === undefined) {
      const end = until - 0.05;
      replay.show(end, false, 1);
      replay.rest();
      draw(end);
      return;
    }
    let frameId = 0;
    const tick = () => {
      const going = ((performance.now() - started) / 1000) % cycle;
      const at = from + Math.min(going * speed, until - from - 0.05);
      replay.show(at, true, speed);
      draw(at);
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [replay, from, until, frame, started, cycle]);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <span ref={ring} className="pointer-events-none absolute top-0 left-0 z-1 -mt-3 -ml-3 size-6 rounded-full border-2 border-[#ecb248] opacity-0" />
      <div ref={cursor} className="pointer-events-none absolute top-0 left-0 z-1 size-5 opacity-0 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))]">
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden>
          <path d="M3 2l13 7.5-5.6 1.3L7.6 16z" fill="#FFFFFF" stroke="#1E2330" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}


