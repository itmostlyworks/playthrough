// A situation's recording at a moment, and played on from it, with the hand that does it: what a still can't say, where
// they clicked and what the page did. Waiting, for a page to load or an app to answer, is cut short as it plays, so
// nothing is spent watching nothing happen. Another round's recording follows the clock of the one that plays, at the
// matching moment, so the two stay in step. At rest, what's noted there is found on the page, and noting, what a click
// would note is outlined.

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { elementOf, type Glimpse } from "@playthrough/page";
import type { Element, Point } from "@playthrough/review";
import { recording } from "./api.ts";
import { Replay, type Events, type Rect, type Scrolled } from "./replay.ts";
import type { Frame } from "./Picture.tsx";
import { pickAt } from "./things.ts";

// Nothing happening for longer than this is waiting, and is played as this long.
const WAIT = 0.4;

// The moment a situation is at as it plays: what plays it sets it each frame, and what follows it is told.
export class Clock {
  #at: number;
  #told = new Set<(at: number) => void>();
  constructor(at: number) {
    this.#at = at;
  }
  get at() {
    return this.#at;
  }
  set(at: number) {
    this.#at = at;
    for (const tell of this.#told) tell(at);
  }
  follow(tell: (at: number) => void) {
    this.#told.add(tell);
    return () => void this.#told.delete(tell);
  }
}

// A stretch of a recording with its waiting cut short: how long it is then, and the recording's own moment at a moment
// of it.
type Cut = { length: number; real: (at: number) => number };
function cut(events: Events, from: number, until: number): Cut {
  const start = events[0]?.timestamp ?? 0;
  const moments = [from, ...events.filter((event) => event.type === 3).map((event) => (event.timestamp - start) / 1000).filter((at) => at > from && at < until), until];
  const spans = moments.slice(1).map((to, i) => ({ from: moments[i]!, real: to - moments[i]!, shown: Math.min(to - moments[i]!, WAIT) }));
  return {
    length: spans.reduce((sum, span) => sum + span.shown, 0),
    real(at) {
      for (const span of spans) {
        if (at <= span.shown) return span.from + (span.shown ? (at / span.shown) * span.real : 0);
        at -= span.shown;
      }
      return until;
    },
  };
}

type Props = {
  review: string;
  round: number;
  recording: string;
  // The moment it rests at, and plays on from to `until`, setting the clock as it goes and saying where it stopped.
  at: number;
  playing?: { until: number };
  clock?: Clock;
  onStop?: (at: number) => void;
  // Another round's, it follows the clock while the one it's beside plays, at the matching moment.
  following?: { clock: Clock; at: (at: number) => number };
  frame?: Frame;
  // The notes on what's at this moment: at rest, where each one's thing is on the page, in the player's own pixels.
  marks?: Mark[];
  onMarks?: (placed: Placed) => void;
  // Noting, at rest: what a click would note is outlined, and a click notes it, or else the spot, by what was read there.
  things?: Glimpse[];
  onPlace?: (on: { element: Element } | { point: Point }) => void;
  // Where its page and each part of it that scrolls on its own is scrolled, as it rests: the app taken over there is too.
  scrolled?: RefObject<(() => Scrolled) | undefined>;
};

// A thing marked, by its node in this recording, else by its name, as one made in the app names it; or its spot, or
// its part of the screen.
export type Mark = { id: string; node?: number; name?: string; point?: { x: number; y: number }; box?: { x: number; y: number; width: number; height: number } };
export type Placed = Record<string, Rect | undefined>;

export function Player(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const [replay, setReplay] = useState<{ replay: Replay; events: Events }>();
  // Drawn to its width, and again as that changes: Compare on or off, the window resized.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const watching = new ResizeObserver(() => setWidth(box.current?.clientWidth ?? 0));
    watching.observe(box.current!);
    return () => watching.disconnect();
  }, []);
  const told = useRef(props.onMarks);
  told.current = props.onMarks;
  const stopped = useRef(props.onStop);
  stopped.current = props.onStop;
  // Where the page is shown from, at the moment drawn last.
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
  if (props.scrolled) props.scrolled.current = replay && (() => replay.replay.scrolled());

  const { at, playing, clock, following, frame, marks } = props;
  const marked = marks?.map((mark) => mark.id).join(" ");
  useEffect(() => {
    if (!replay || !box.current?.clientWidth) return;
    const replayed = replay.replay;
    const draw = (moment: number, moving: boolean) => {
      const shape = replayed.shapeAt(moment);
      const part = frame ?? { x: 0, y: 0, width: 1, height: 1 };
      const [left, top, k] = [part.x * shape.width, part.y * shape.height, box.current!.clientWidth / (part.width * shape.width)];
      view.current = { left, top, k };
      replayed.show(moment, moving, 1);
      replayed.host.style.transform = `translate(${-left * k}px, ${-top * k}px) scale(${k})`;
      replayed.placeCaret(caret.current!, moment, left, top, k);
      const pointer = replayed.pointerAt(moment);
      const hand = cursor.current!;
      hand.style.opacity = pointer ? "1" : "0";
      if (!pointer) return;
      const [x, y] = [(pointer[0] - left) * k, (pointer[1] - top) * k];
      hand.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
      // A click rings out over half a second of the recording.
      const click = replayed.clicks.find((click) => moment >= click && moment - click < 0.5);
      const u = click === undefined ? 1 : (moment - click) / 0.5;
      Object.assign(ring.current!.style, { opacity: String(1 - u), transform: `translate(${x}px, ${y}px) scale(${0.4 + u * 1.1})` });
    };
    if (following) {
      draw(following.at(following.clock.at), true);
      return following.clock.follow((moment) => draw(following.at(moment), true));
    }
    if (playing) {
      const stretch = cut(replay.events, at, playing.until);
      const since = performance.now();
      let frameId = 0;
      const tick = () => {
        const going = (performance.now() - since) / 1000;
        const moment = Math.min(stretch.real(going), playing.until);
        draw(moment, true);
        clock?.set(moment);
        if (going >= stretch.length) return stopped.current?.(playing.until);
        frameId = requestAnimationFrame(tick);
      };
      tick();
      return () => cancelAnimationFrame(frameId);
    }
    draw(at, false);
    replayed.rest();
    // What's noted here, where it is on the page as it rests.
    const shape = replayed.shapeAt(at);
    const { left, top, k } = view.current!;
    const found = (mark: Mark): Rect | undefined =>
      (mark.node !== undefined ? replayed.markOf(mark.node) : undefined) ??
      (mark.name ? replayed.named(mark.name) : undefined) ??
      (mark.box && { left: mark.box.x * shape.width, top: mark.box.y * shape.height, width: mark.box.width * shape.width, height: mark.box.height * shape.height }) ??
      (mark.point && { left: mark.point.x * shape.width, top: mark.point.y * shape.height, width: 0, height: 0 });
    told.current?.(
      Object.fromEntries(
        (marks ?? []).map((mark) => {
          const thing = found(mark);
          return [mark.id, thing && { left: (thing.left - left) * k, top: (thing.top - top) * k, width: thing.width * k, height: thing.height * k }];
        }),
      ),
    );
  }, [replay, at, playing?.until, following, frame, marked, width]);

  // What's under the pointer on the page at rest, in its own pixels, and what a click there would note.
  const [hover, setHover] = useState<Rect>();
  const aiming = !!props.onPlace && !playing && !!replay;
  if (!aiming && hover) setHover(undefined);
  const under = (event: { clientX: number; clientY: number }) => {
    const [shown, seen] = [box.current?.getBoundingClientRect(), view.current];
    if (!replay || !shown || !seen) return undefined;
    const [x, y] = [(event.clientX - shown.left) / seen.k + seen.left, (event.clientY - shown.top) / seen.k + seen.top];
    const pick = props.things && pickAt(replay.replay.outwards(x, y), props.things, at);
    return { x, y, pick, seen };
  };
  const aim = (event: MouseEvent) => {
    const here = aiming ? under(event) : undefined;
    const thing = here?.pick?.node !== undefined ? replay!.replay.boxOf(here.pick.node) : undefined;
    const { left, top, k } = here?.seen ?? { left: 0, top: 0, k: 1 };
    setHover(thing && { left: (thing.left - left) * k, top: (thing.top - top) * k, width: thing.width * k, height: thing.height * k });
  };
  const place = (event: MouseEvent) => {
    if (!aiming) return;
    event.stopPropagation();
    const here = under(event);
    if (!here) return;
    setHover(undefined);
    const shape = replay!.replay.shapeAt(at);
    props.onPlace!(here.pick ? { element: elementOf(here.pick, here.pick.name) } : { point: { x: here.x / shape.width, y: here.y / shape.height } });
  };

  return (
    <div ref={box} className={`absolute inset-0 overflow-hidden ${aiming ? (hover ? "cursor-pointer" : "cursor-crosshair") : ""}`} onPointerMove={aim} onPointerLeave={() => setHover(undefined)} onClick={place}>
      {hover && <div className="pointer-events-none absolute z-1 rounded-[4px] outline-1 outline-offset-4 outline-[rgba(217,162,58,0.75)] outline-solid" style={hover} />}
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
