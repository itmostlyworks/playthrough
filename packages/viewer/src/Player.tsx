// A moment's recording at a time in it, and played on from it, with the hand that does it: what a still can't say, where
// they clicked and what the page did. Waiting, for a page to load or an app to answer, is cut short as it plays, so
// nothing is spent watching nothing happen. Another hand-back's recording follows the clock of the one that plays, at the
// matching moment, so the two stay in step. At rest, what's noted there is found on the page, and noting, what a click
// would note is outlined.

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { elementOf, type Glimpse } from "@playthrough/page";
import type { Element, Moment, Point } from "@playthrough/change";
import { recording } from "./api.ts";
import { Replay, type Choice, type Events, type Pressed, type Rect, type Scrolled } from "./replay.ts";
import type { Crop } from "./Picture.tsx";
import { stepFrom } from "./stepping.ts";
import { pickAt } from "./things.ts";
import { around as aroundCentre, centreOf, following as followingPointer, holding, type Together } from "./view.ts";

// Nothing happening for longer than this is waiting, and is played as this long.
const WAIT = 0.7;

// The time a moment is at as it plays: what plays it sets it each frame, and what follows it is told.
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

// A moment's recording with its waiting cut short, as it plays: how long it is then, the recording's own time at a
// time of it, and back. Play's line runs on it, so it fills at one speed as it plays and goes where it's pressed at the
// same speed, leaping no wait. Where the moment starts is where a wait is cut at, so what's shown starts there.
// And where its page has first drawn itself: a recording starts as the page loads, blank until the app has put itself
// on it, which it has once what it adds pauses for a beat.
export type Cut = { length: number; real: (at: number) => number; cut: (real: number) => number; drawn: number };
function cutOf(events: Events, length: number, starts: number[]): Cut {
  const start = events[0]?.timestamp ?? 0;
  const happened = events.filter((event) => event.type === 3).map((event) => (event.timestamp - start) / 1000);
  const added = events
    .filter((event) => event.type === 3 && (event.data as { source: number; adds?: unknown[] }).source === 0 && (event.data as { adds?: unknown[] }).adds?.length)
    .map((event) => (event.timestamp - start) / 1000);
  const drawn = Math.min(added.find((at, i) => (added[i + 1] ?? Infinity) - at > 0.3) ?? 0, starts[1] ?? length);
  const cuts = [...new Set([0, ...starts, ...happened.filter((at) => at > 0 && at < length), length])].sort((a, b) => a - b);
  const spans = cuts.slice(1).map((to, i) => ({ from: cuts[i]!, real: to - cuts[i]!, shown: Math.min(to - cuts[i]!, WAIT) }));
  return {
    drawn,
    length: spans.reduce((sum, span) => sum + span.shown, 0),
    real(at) {
      for (const span of spans) {
        if (at <= span.shown) return span.from + (span.shown ? (at / span.shown) * span.real : 0);
        at -= span.shown;
      }
      return length;
    },
    cut(real) {
      let at = 0;
      for (const span of spans) {
        if (real <= span.from + span.real) return at + (span.real ? ((real - span.from) / span.real) * span.shown : 0);
        at += span.shown;
      }
      return at;
    },
  };
}

export function useCut(change: string, handBack: number, moment: Moment): Cut | undefined {
  const [kept, setKept] = useState<Cut>();
  useEffect(() => {
    let current = true;
    // Another recording's isn't this one's while it comes.
    setKept(undefined);
    recording(change, handBack, moment.recording).then((events) => current && setKept(cutOf(events, moment.length, [moment.from])));
    return () => void (current = false);
  }, [change, handBack, moment.recording]);
  return kept;
}

// How long the view takes to glide from one part of the page to another: Compare on or off, or a step that's elsewhere.
const GLIDE = 0.45;
// Where on the page the view is, how much of the page it shows across, and how much that's grown to fit the picture.
type View = { left: number; top: number; across: number; k: number };

// The time of the frame being drawn, as the page's own transitions keep it.
const frameTime = () => Number(document.timeline.currentTime ?? performance.now());

// The page's own curve, --ease-calm, cubic-bezier(0.2, 0.8, 0.2, 1): the view glides on it, as the picture narrows and
// widens around it for Compare, so the two move in step.
function calm(t: number): number {
  const along = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  let [low, high] = [0, 1];
  for (let i = 0; i < 20; i++) {
    const s = (low + high) / 2;
    if (along(s, 0.2, 0.2) < t) low = s;
    else high = s;
  }
  return along((low + high) / 2, 0.8, 1);
}

type Props = {
  change: string;
  handBack: number;
  recording: string;
  // The moment it rests at, and plays on from to `until`, setting the clock as it goes and saying where it stopped.
  at: number;
  playing?: { until: number };
  cut?: Cut;
  clock?: Clock;
  onStop?: (at: number) => void;
  // Another hand-back's, it follows the clock while the one it's beside plays, at the matching moment.
  following?: { clock: Clock; at: (at: number) => number };
  crop?: Crop;
  // At actual size, a window onto the page that follows the pointer, beside another onto the same part of it: the one
  // that leads says where, as the older page's Compare does. Holding something, at rest, it's in view whole, the view
  // gliding there: both sides are told, so both glide.
  actualSize?: { together: Together; leads: boolean; holds?: Mark };
  // The notes on what's at this moment: at rest, where each one's thing is on the page, in the player's own pixels;
  // nothing while it's on its way there, so nothing is placed where its thing was on the way.
  marks?: Mark[];
  onMarks?: (placed: Placed | undefined) => void;
  // Noting, at rest: what a click would note is outlined, and a click notes it, or else the spot, by what was read there.
  things?: Glimpse[];
  onPlace?: (on: { element: Element } | { point: Point }) => void;
  // Where its page and each part of it that scrolls on its own is scrolled, as it rests: the app stepped into there is too.
  scrolled?: RefObject<(() => Scrolled) | undefined>;
  // Whether its pointer is drawn: not on a note's own frame, nor while the app's pointer stands in for it. And where it
  // draws it, in its own pixels, if it does: where the app's comes from.
  hand?: boolean;
  drawn?: RefObject<(() => { x: number; y: number } | undefined) | undefined>;
  // Where a frame on (1) or back (-1) from a time rests, within what's shown from `from` to `end`; nothing past either.
  frameFrom?: RefObject<((at: number, by: 1 | -1, from: number, end: number) => number | undefined) | undefined>;
};

// A thing marked, by its node in this recording, else by its name, as one made in the app names it; or its spot, or
// its part of the screen.
export type Mark = { id: string; node?: number; name?: string; point?: { x: number; y: number }; box?: { x: number; y: number; width: number; height: number } };
// Where each mark's thing is, once that's known; one it looked for and didn't find, undefined.
export type Placed = Record<string, Rect | undefined>;

export function Player(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pressed = useRef<HTMLElement>(null);
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
  const view = useRef<View>(undefined);
  const [glided, setGlided] = useState(0);
  // The page and moment it last came to rest at, where what's placed on it can be read.
  const settled = useRef<{ replay?: Replay; at?: number }>({});
  useEffect(() => {
    let current = true;
    let made: Replay | undefined;
    recording(props.change, props.handBack, props.recording).then((events) => {
      if (!current || !box.current) return;
      made = new Replay(events, box.current);
      // Moved on every frame, the page is drawn once, as it is, and only shifted.
      made.host.style.willChange = "transform";
      setReplay({ replay: made, events });
    });
    return () => void ((current = false), made?.destroy());
  }, [props.change, props.handBack, props.recording]);
  useEffect(() => void (props.scrolled && (props.scrolled.current = replay && (() => replay.replay.scrolled()))), [replay]);
  useEffect(() => {
    if (!props.frameFrom) return;
    const replayed = replay?.replay;
    props.frameFrom.current = replayed && ((at, by, from, end) => stepFrom(at, by, { from, end, changes: replayed.changes }, (change) => replayed.movingUntil(change)));
  }, [replay]);
  const handAt = useRef<{ x: number; y: number }>(undefined);
  useEffect(() => void (props.drawn && (props.drawn.current = () => handAt.current)), []);

  const { at, playing, cut, clock, following, crop, marks, actualSize } = props;
  // Each mark as it is, so one found later, as a note's spot read from where it was made, is placed again.
  const marked = JSON.stringify(marks);
  // Another part of the page to show, the view glides there from where it was, whatever else changes meanwhile: the
  // picture narrowing for Compare redraws it all the way. What glides is the part of the page shown, never how close it
  // is: that's the picture's width over it, so a picture still narrowing is never aimed past where it ends. It keeps the
  // browser's frame clock, as the narrowing does, from when the narrowing started, or else from the frame after it's set.
  const glide = useRef<{ crop?: Crop; holds?: string; from?: View; set: number; since?: number }>({ crop, set: 0 });
  useEffect(() => {
    if (!replay || !box.current?.clientWidth) return;
    const replayed = replay.replay;
    const length = ((replay.events.at(-1)?.timestamp ?? 0) - (replay.events[0]?.timestamp ?? 0)) / 1000;
    const holds = actualSize?.holds && !playing && !following ? JSON.stringify(actualSize.holds) : undefined;
    if (crop !== glide.current.crop || holds !== glide.current.holds) glide.current = { crop, holds, from: view.current, set: frameTime() };
    const thingOf = (mark: Mark): Rect | undefined => (mark.node !== undefined ? replayed.markOf(mark.node) : undefined) ?? (mark.name ? replayed.named(mark.name) : undefined);
    const gliding = () => !!glide.current.from && frameTime() - (glide.current.since ?? frameTime()) < GLIDE * 1000;
    const draw = (time: number, moving: boolean) => {
      // Gone, as Before is once Compare's let go, it's told nothing more.
      if (!box.current) return;
      const shape = replayed.shapeAt(time);
      const part = glide.current.crop;
      // On no part of it, it's the whole screen, as its picture is: a phone's, narrower than the picture, whole and in
      // the middle, rather than across the picture's width and cut off below its top.
      const whole = Math.max(shape.width, (shape.height * box.current.clientWidth) / box.current.clientHeight);
      let [left, top, across] = part ? [part.x * shape.width, part.y * shape.height, part.width * shape.width] : [(shape.width - whole) / 2, 0, whole];
      const { from } = glide.current;
      if (actualSize) {
        const room = { width: box.current.clientWidth, height: box.current.clientHeight };
        const { together, leads } = actualSize;
        let view = leads || !together.centre ? followingPointer(replayed, time, length, room, shape) : aroundCentre(room, shape, together.centre, together.k);
        // What's held is a thing, or a part of the page, as a thing with the words around it.
        const part = actualSize.holds?.box;
        const thing = leads && holds && actualSize.holds && (thingOf(actualSize.holds) ?? (part && { left: part.x * shape.width, top: part.y * shape.height, width: part.width * shape.width, height: part.height * shape.height }));
        if (thing) view = holding(view, room, shape, thing);
        if (leads) Object.assign(together, { centre: centreOf(view, room), k: view.k });
        [left, top, across] = [view.x, view.y, room.width / view.k];
      }
      if (from && gliding()) {
        const now = frameTime();
        // The picture narrowing or widening around it, it starts when that did, to the frame.
        const resizing = box.current.parentElement?.getAnimations().find((one) => one instanceof CSSTransition && one.transitionProperty === "width");
        if (glide.current.since === undefined) glide.current.since = resizing ? (resizing.startTime === null ? undefined : Number(resizing.startTime)) : now > glide.current.set ? now : undefined;
        const u = calm((now - (glide.current.since ?? now)) / (GLIDE * 1000));
        [left, top, across] = [from.left + (left - from.left) * u, from.top + (top - from.top) * u, from.across + (across - from.across) * u];
      }
      const k = box.current.clientWidth / across;
      view.current = { left, top, across, k };
      replayed.show(time, moving);
      replayed.host.style.transform = `translate(${-left * k}px, ${-top * k}px) scale(${k})`;
      replayed.placeCaret(caret.current!, time, left, top, k);
      const pointer = replayed.pointerAt(time);
      placeList(list.current!, replayed.choices.find((choice) => time >= choice.from && time < choice.until + SHUTS), pointer, left, top, k);
      placeKey(pressed.current!, moving ? replayed.keys.findLast((one) => time >= one.at && time - one.at < KEY_SHOWN) : undefined, time, pointer, shape, left, top, k);
      const hand = cursor.current!;
      handAt.current = pointer && { x: (pointer[0] - left) * k, y: (pointer[1] - top) * k };
      hand.style.opacity = pointer ? "1" : "0";
      if (!handAt.current) return;
      const { x, y } = handAt.current;
      hand.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
      // A click rings out over half a second of the recording.
      const click = replayed.clicks.find((click) => time >= click && time - click < 0.5);
      const u = click === undefined ? 1 : (time - click) / 0.5;
      Object.assign(ring.current!.style, { opacity: String(1 - u), transform: `translate(${x}px, ${y}px) scale(${0.4 + u * 1.1})` });
    };
    let frameId = 0;
    const stop = () => cancelAnimationFrame(frameId);
    if (following) {
      const tell = (time: number) => draw(following.at(time), true);
      const glided = () => (tell(following.clock.at), gliding() && (frameId = requestAnimationFrame(glided)));
      glided();
      const unfollow = following.clock.follow(tell);
      return () => (stop(), unfollow());
    }
    // Drawn again as it plays, Compare narrowing it, it plays on from where it's got to.
    if (playing && cut) {
      const [from, until, since] = [cut.cut(clock?.at ?? at), cut.cut(playing.until), performance.now()];
      const tick = () => {
        const going = from + (performance.now() - since) / 1000;
        const time = Math.min(cut.real(going), playing.until);
        draw(time, true);
        clock?.set(time);
        if (going >= until) return stopped.current?.(playing.until);
        frameId = requestAnimationFrame(tick);
      };
      tick();
      return stop;
    }
    if (playing) return;
    // Gliding, it rests once it's there.
    const glideOn = () => {
      const glided = () => (draw(at, false), (frameId = requestAnimationFrame(gliding() ? glided : rested)));
      const rested = () => ((glide.current.from = undefined), setGlided((done) => done + 1));
      glided();
      return stop;
    };
    if (gliding()) return glideOn();
    draw(at, false);
    replayed.rest();
    // Nothing is placed on it until it has come to rest there: an outline or a pin drawn sooner is drawn where its
    // thing was on its way, not where it is.
    if (settled.current.replay !== replayed || settled.current.at !== at) {
      told.current?.(undefined);
      let current = true;
      void replayed.settled().then(() => current && ((settled.current = { replay: replayed, at }), setGlided((done) => done + 1)));
      return () => void (current = false);
    }
    // What's noted here, where it is on the page as it rests.
    const shape = replayed.shapeAt(at);
    const { left, top, k } = view.current!;
    const spotOf = (mark: Mark): Rect | undefined =>
      (mark.box && { left: mark.box.x * shape.width, top: mark.box.y * shape.height, width: mark.box.width * shape.width, height: mark.box.height * shape.height }) ??
      (mark.point && { left: mark.point.x * shape.width, top: mark.point.y * shape.height, width: 0, height: 0 });
    told.current?.(
      Object.fromEntries(
        (marks ?? []).map((mark) => {
          // Off the screen, as a board's columns past a phone's edge are, it's not in the picture: the screen beside the
          // picture's edge no longer hides it.
          const thing = thingOf(mark);
          const onScreen = thing && thing.left < shape.width && thing.top < shape.height && thing.left + thing.width > 0 && thing.top + thing.height > 0;
          if (onScreen) return [mark.id, { left: (thing.left - left) * k, top: (thing.top - top) * k, width: thing.width * k, height: thing.height * k }];
          // On a spot, where its thing was, it's always in the picture: out of it, at the edge nearest to where it was.
          const spot = !thing && spotOf(mark);
          if (!spot) return [mark.id, undefined];
          const placed = { left: (spot.left - left) * k, top: (spot.top - top) * k, width: spot.width * k, height: spot.height * k };
          const [wide, high] = [box.current!.clientWidth, box.current!.clientHeight];
          const inFrame = placed.left >= 0 && placed.top >= 0 && placed.left + placed.width <= wide && placed.top + placed.height <= high;
          const edge = (at: number, size: number, all: number) => Math.min(Math.max(at + size / 2, EDGE), all - EDGE);
          return [mark.id, inFrame ? placed : { left: edge(placed.left, placed.width, wide), top: edge(placed.top, placed.height, high), width: 0, height: 0 }];
        }),
      ),
    );
  }, [replay, at, playing?.until, cut, following, crop, marked, width, glided, actualSize?.together, actualSize?.holds && JSON.stringify(actualSize.holds)]);

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
      {/* A dropdown's list, open as the browser drew it: not in the page, so drawn here, in Chrome's look in both themes. */}
      <div ref={list} hidden className="pointer-events-none absolute top-0 left-0 z-1 origin-top-left overflow-hidden rounded-[3px] border border-[#767676] bg-white py-[3px] font-ui text-[13px] text-[#1e2330] shadow-[0_2px_8px_rgba(0,0,0,0.25)]" />
      <span ref={ring} className="pointer-events-none absolute top-0 left-0 z-1 -mt-3 -ml-3 size-6 rounded-full border-[1.5px] border-[rgba(40,44,54,0.5)] bg-[rgba(40,44,54,0.06)] opacity-0" />
      <kbd ref={pressed} className="pointer-events-none absolute top-0 left-0 z-1 rounded-[4px] bg-white px-[5px] font-ui text-[11px] leading-[17px] whitespace-nowrap text-[#1E2330] opacity-0 shadow-[0_0_0_1px_rgba(30,35,48,0.22),0_1px_2px_rgba(0,0,0,0.12)]" />
      <div ref={cursor} data-hand style={props.hand === false ? { visibility: "hidden" } : undefined} className="pointer-events-none absolute top-0 left-0 z-1 size-5 opacity-0 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))]">
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden>
          <path d="M3 2l13 7.5-5.6 1.3L7.6 16z" fill="#FFFFFF" stroke="#1E2330" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

// How far inside the picture's edge a spot that's out of it is pinned: a pin's half and a little.
const EDGE = 14;

// A key pressed shows this long, in seconds of the recording, and fades over its last part.
const KEY_SHOWN = 0.9;
const KEY_FADES = 0.3;

// A key pressed, small and quiet, beside what it went to and never over it: right of the field it was pressed in, or
// under it where the screen ends first; else just below and right of the pointer, where a name tag would sit. Shown as
// the recording plays, never at rest.
function placeKey(element: HTMLElement, pressed: Pressed | undefined, time: number, pointer: [number, number] | undefined, shape: { width: number }, left: number, top: number, k: number) {
  const by = pressed?.field ?? (pointer && { x: pointer[0] + 10, y: pointer[1] + 16, width: 0, height: 0 });
  if (!pressed || !by) return void (element.style.opacity = "0");
  if (element.textContent !== pressed.key) element.textContent = pressed.key;
  const wide = element.offsetWidth / k;
  const [x, y] = !pressed.field ? [by.x, by.y] : by.x + by.width + 8 + wide <= shape.width ? [by.x + by.width + 8, by.y + by.height / 2 - 8.5 / k] : [by.x, by.y + by.height + 6];
  element.style.opacity = String(0.9 * Math.min(1, (KEY_SHOWN - (time - pressed.at)) / KEY_FADES));
  element.style.transform = `translate(${((x - left) * k).toFixed(1)}px, ${((y - top) * k).toFixed(1)}px)`;
}

// How long a dropdown's list stays after its choice is made, in seconds: the choice is seen lit as it closes.
const SHUTS = 0.12;

// A dropdown's list over the page shown k times its size from (left, top), its options as tall as the recording kept
// them, the one under the pointer lit, or before it's there, the one chosen before.
function placeList(element: HTMLElement, choice: Choice | undefined, pointer: [number, number] | undefined, left: number, top: number, k: number) {
  element.hidden = !choice;
  if (!choice) return;
  if (element.dataset.from !== String(choice.from)) {
    element.dataset.from = String(choice.from);
    element.replaceChildren(
      ...choice.options.map((option) => {
        const row = document.createElement("div");
        row.className = "truncate px-2 text-left data-lit:bg-[#1a73e8] data-lit:text-white";
        Object.assign(row.style, { height: `${choice.row}px`, lineHeight: `${choice.row}px` });
        row.textContent = option;
        return row;
      }),
    );
  }
  const under = pointer && pointer[1] >= choice.y + 4 ? Math.floor((pointer[1] - choice.y - 4) / choice.row) : -1;
  const lit = under >= 0 && under < choice.options.length ? under : choice.was;
  [...element.children].forEach((row, i) => row.toggleAttribute("data-lit", i === lit));
  Object.assign(element.style, { width: `${choice.width}px`, transform: `translate(${((choice.x - left) * k).toFixed(2)}px,${((choice.y - top) * k).toFixed(2)}px) scale(${k.toFixed(5)})` });
}
