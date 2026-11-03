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
// How long a step's end holds before the next step goes on from it.
export const ON = 0.3;

// How long the view takes to glide from one step's part of the page to another's.
const GLIDE = 0.45;

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

// Where the view is, as a step plays: on its part of the page while the hand is in it, and where the hand goes beyond
// it, along only as far as keeps it in, with room round it. It moves a little ahead, so what's clicked is in view as
// it's clicked, and eases there and back. Its place a moment in, as played, in the page's own pixels.
const ROOM = 0.1;
const AHEAD = 0.3;
function following(replay: Replay, stretch: Cut, part: Frame, shape: { width: number; height: number }, played: number, speed: number) {
  const [width, height] = [part.width * shape.width, part.height * shape.height];
  const home = [part.x * shape.width, part.y * shape.height] as const;
  const room = Math.min(width, height) * ROOM;
  const along = (at: number, from: number, length: number, page: number) => {
    const place = at < from + room ? at - room : at > from + length - room ? at + room - length : from;
    return Math.min(Math.max(place, 0), Math.max(page - length, 0)) - from;
  };
  const rate = 30;
  const moves = Array.from({ length: Math.ceil(played * rate) + 1 }, (_, i) => {
    const pointer = replay.pointerAt(stretch.real(Math.min(i / rate, played) * speed));
    return pointer ? [along(pointer[0], home[0], width, shape.width), along(pointer[1], home[1], height, shape.height)] : [0, 0];
  });
  // Each moment goes as far as the furthest it needs to a moment either side, so it's there before the hand and
  // stays a little after, and that is averaged over the same moment, so it eases there and back the whole way.
  const near = (path: number[][], i: number) => path.slice(Math.max(0, i - AHEAD * rate), i + AHEAD * rate + 1);
  const furthest = moves.map((_, i) => [0, 1].map((axis) => Math.max(0, ...near(moves, i).map((move) => move[axis]!)) + Math.min(0, ...near(moves, i).map((move) => move[axis]!))));
  const eased = furthest.map((_, i) => [0, 1].map((axis) => near(furthest, i).reduce((sum, move) => sum + move[axis]!, 0) / near(furthest, i).length));
  // Between two of its moments, the view is between them too, so it moves on every frame the screen draws.
  return (going: number): [number, number] => {
    const at = Math.min(Math.max(going * rate, 0), eased.length - 1);
    const [a, b] = [eased[Math.floor(at)]!, eased[Math.ceil(at)]!];
    const u = at - Math.floor(at);
    return [home[0] + a[0]! + (b[0]! - a[0]!) * u, home[1] + a[1]! + (b[1]! - a[1]!) * u];
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
  // A note pointed at on the page: the loop holds on its moment, its thing outlined, or its spot pinned, in its colour.
  mark?: Mark;
};

export type Mark = { at: number; node?: number; name?: string; point?: { x: number; y: number }; ink: string; number: number };

export function Loop(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const outline = useRef<HTMLSpanElement>(null);
  const pin = useRef<HTMLSpanElement>(null);
  const [replay, setReplay] = useState<{ replay: Replay; events: Events }>();
  // Where the view was last drawn, so a step chosen as it plays is glided to rather than cut to.
  const view = useRef<{ left: number; top: number; k: number }>(undefined);
  useEffect(() => {
    let current = true;
    let made: Replay | undefined;
    recording(props.review, props.round, props.recording).then((events) => {
      if (!current || !box.current) return;
      made = new Replay(events, box.current);
      // Moved on every frame, the page is drawn once, as it is, and only shifted.
      made.host.style.willChange = "transform";
      setReplay({ replay: made, events });
    });
    return () => void ((current = false), made?.destroy());
  }, [props.review, props.round, props.recording]);

  const { from, until, frame, started, cycle, onLength, mark } = props;
  const stretch = replay && cut(replay.events, from, until);
  const played = stretch && playedFor(stretch.length);
  useEffect(() => void (played && onLength(played)), [played]);
  useEffect(() => {
    if (!replay || !stretch || !played || !box.current) return;
    const replayed = replay.replay;
    const shape = replayed.shapeAt(until);
    const part = frame ?? { x: 0, y: 0, width: 1, height: 1 };
    const fit = box.current.clientWidth / (part.width * shape.width);
    const speed = stretch.length / played;
    const follow = following(replayed, stretch, part, shape, played, speed);
    const [was, since] = [started === undefined || mark ? undefined : view.current, performance.now()];
    const draw = (at: number, going = played) => {
      let [left, top] = follow(going);
      let k = fit;
      const glided = was ? 1 - (1 - Math.min(1, (performance.now() - since) / GLIDE)) ** 3 : 1;
      if (was && glided < 1) [left, top, k] = [was.left + (left - was.left) * glided, was.top + (top - was.top) * glided, was.k + (k - was.k) * glided];
      view.current = { left, top, k };
      replayed.host.style.transform = `translate(${-left * k}px, ${-top * k}px) scale(${k})`;
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
    // Held on a note, what it's on is where it was then: outlined, its pin at the outline's corner, or on its spot.
    const [edge, dot] = [outline.current!, pin.current!];
    edge.style.opacity = dot.style.opacity = "0";
    if (mark) {
      const at = Math.min(Math.max(mark.at, from), until - 0.05);
      replayed.show(at, false, 1);
      replayed.rest();
      draw(at, stretch.cut(at) / speed);
      const { left, top, k } = view.current!;
      const box = mark.node === undefined ? undefined : replayed.markOf(mark.node, mark.name);
      const spot = box ? [box.left, box.top] : mark.point && [mark.point.x * shape.width, mark.point.y * shape.height];
      if (box) Object.assign(edge.style, { opacity: "1", borderColor: mark.ink, transform: `translate(${(box.left - left) * k - 3}px,${(box.top - top) * k - 3}px)`, width: `${box.width * k + 6}px`, height: `${box.height * k + 6}px` });
      if (spot) Object.assign(dot.style, { opacity: "1", background: mark.ink, transform: `translate(${(spot[0]! - left) * k - 9}px,${(spot[1]! - top) * k - 9}px)` });
      dot.textContent = String(mark.number);
      return;
    }
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
      draw(at, Math.min(going, played));
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [replay, from, until, frame, started, cycle, played, mark?.at, mark?.node, mark?.point, mark?.number]);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <span ref={outline} className="pointer-events-none absolute top-0 left-0 z-1 rounded-[5px] border-[1.5px] opacity-0" />
      <span ref={pin} className="pointer-events-none absolute top-0 left-0 z-2 grid size-[18px] place-content-center rounded-full text-[10.5px] leading-none font-semibold text-white opacity-0" />
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


