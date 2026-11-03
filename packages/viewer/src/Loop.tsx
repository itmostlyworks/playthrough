// A step of a recording played over and over, small, in its part of the page, with the hand that does it: what a still
// can't say, where they clicked and what the page did. Waiting, for a page to load or an app to answer, is cut short,
// so two side by side, one app slower than the other, still show the same thing at the same time: each starts its step
// when the other does, and the quicker waits on its last frame. At rest it's that last frame.

import { useEffect, useRef, useState } from "react";
import { recording } from "./api.ts";
import { Replay, type Events } from "./replay.ts";
import type { Frame } from "./Picture.tsx";

// A step longer than this is played faster, so a loop never drags; one shorter, slower, so a few keys typed in a moment
// can be seen.
const LONGEST = 4.5;
const SHORTEST = 1.4;
// How long the end holds before it goes round again.
export const HOLD = 0.9;

// Nothing happening for longer than this is waiting, and is shown as this long.
const WAIT = 0.4;

// How long a step takes to play, at the speed it's played at, from how long it takes with its waiting cut short.
export const playedFor = (length: number) => Math.min(Math.max(length, SHORTEST), LONGEST);

// A stretch of a recording with its waiting cut short: how long it is then, and the recording's own moment at a moment
// of it, and back.
type Cut = { length: number; real: (at: number) => number; cut: (real: number) => number };
function cut(events: Events, from: number, until: number): Cut {
  const start = events[0]?.timestamp ?? 0;
  const moments = [from, ...events.filter((event) => event.type === 3).map((event) => (event.timestamp - start) / 1000).filter((at) => at > from && at < until), until];
  const spans = moments.slice(1).map((to, i) => ({ from: moments[i]!, real: to - moments[i]!, shown: Math.min(to - moments[i]!, WAIT) }));
  const length = spans.reduce((sum, span) => sum + span.shown, 0);
  return {
    length,
    real(at) {
      for (const span of spans) {
        if (at <= span.shown) return span.from + (span.shown ? (at / span.shown) * span.real : 0);
        at -= span.shown;
      }
      return until;
    },
    cut(real) {
      let at = 0;
      for (const span of spans) {
        if (real <= span.from + span.real) return at + (span.real ? ((real - span.from) / span.real) * span.shown : 0);
        at += span.shown;
      }
      return length;
    },
  };
}

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
  // How long its step plays, once it's known.
  onLength: (length: number) => void;
};

export function Loop(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const [replay, setReplay] = useState<{ replay: Replay; events: Events }>();
  useEffect(() => {
    let current = true;
    let made: Replay | undefined;
    recording(props.review, props.round, props.recording).then((events) => {
      if (!current || !box.current) return;
      made = new Replay(events, box.current);
      setReplay({ replay: made, events });
    });
    return () => void ((current = false), made?.destroy());
  }, [props.review, props.round, props.recording]);

  const { from, until, frame, started, cycle, onLength } = props;
  const stretch = replay && cut(replay.events, from, until);
  const played = stretch && playedFor(stretch.length);
  useEffect(() => void (played && onLength(played)), [played]);
  useEffect(() => {
    if (!replay || !stretch || !played || !box.current) return;
    const replayed = replay.replay;
    const shape = replayed.shapeAt(until);
    const part = frame ?? { x: 0, y: 0, width: 1, height: 1 };
    const k = box.current.clientWidth / (part.width * shape.width);
    const [left, top] = [part.x * shape.width, part.y * shape.height];
    replayed.host.style.transform = `translate(${-left * k}px, ${-top * k}px) scale(${k})`;
    const speed = stretch.length / played;
    const draw = (at: number) => {
      replayed.placeCaret(caret.current!, at, left, top, k);
      const pointer = replayed.pointerAt(at);
      const hand = cursor.current!;
      hand.style.opacity = pointer ? "1" : "0";
      if (!pointer) return;
      const [x, y] = [(pointer[0] - left) * k, (pointer[1] - top) * k];
      hand.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
      // A click rings out over half a second as it's played, however its waiting was cut.
      const click = replayed.clicks.find((click) => at >= click && (stretch.cut(at) - stretch.cut(click)) / speed < 0.5);
      const u = click === undefined ? 1 : (stretch.cut(at) - stretch.cut(click)) / speed / 0.5;
      Object.assign(ring.current!.style, { opacity: String(1 - u), transform: `translate(${x}px, ${y}px) scale(${0.4 + u * 1.1})` });
    };
    if (started === undefined) {
      const end = until - 0.05;
      replayed.show(end, false, 1);
      replayed.rest();
      draw(end);
      return;
    }
    let frameId = 0;
    const tick = () => {
      const going = ((performance.now() - started) / 1000) % cycle;
      const at = Math.min(stretch.real(going * speed), until - 0.05);
      replayed.show(at, true, speed);
      draw(at);
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [replay, from, until, frame, started, cycle, played]);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <span ref={caret} className="pointer-events-none absolute top-0 left-0 z-1 bg-[#1e2330] opacity-0" />
      <span ref={ring} className="pointer-events-none absolute top-0 left-0 z-1 -mt-3 -ml-3 size-6 rounded-full border-[1.5px] border-[rgba(40,44,54,0.5)] bg-[rgba(40,44,54,0.06)] opacity-0" />
      <div ref={cursor} className="pointer-events-none absolute top-0 left-0 z-1 size-5 opacity-0 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))]">
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden>
          <path d="M3 2l13 7.5-5.6 1.3L7.6 16z" fill="#FFFFFF" stroke="#1E2330" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}


