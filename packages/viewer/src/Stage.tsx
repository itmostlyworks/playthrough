// The recordings: the round you're watching, or side by side with the round it's compared with, each at the playhead's
// moment in its own recording of the flow. Each takes its flow's recorded shape, as large as fits and never larger than
// it was recorded; at actual size it's a window onto the page that follows the pointer, or stays where you move it.
// Nothing Vantage draws covers what's recorded except the marks on it, and H hides those.
//
// Every round once shown keeps its frame and its replays, in the same place in the page, so going back to a flow or a
// round shows it at once: a recording moved elsewhere in the page would have to be built again.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { Flow, Point, Review, Round } from "@vantage/review";
import { recording } from "./api.ts";
import { CARD, clamp, ease, inStep, MORPH, titleCard } from "./moments.ts";
import { useNow, type Playhead } from "./playhead.ts";
import { recorded, Replay, type Rect } from "./replay.ts";
import { ahead, around, between, centreOf, fitted, GLIDE, moved, type Held, type Size, type View } from "./view.ts";

export type Pin = { id: string; number: number; at: number; until?: number; point: Point; fill: string };
// What changed at the moment you're stopped on, outlined where it is on the page: firmly once you've chosen it.
export type Outline = { id: string; nodes: number[]; chosen: boolean };
export type Shown = { fit: number; k: number };
// Held while H is down, kept after H twice.
export type Bare = "held" | "kept";

// The line over each recording: its round's name, side by side; watching one, it keeps its room.
const CAPTION = 26;
// A pin shows from its moment, or through its stretch, for long enough to be seen when playing past it.
const SHOWN_FOR = 1.5;

type Props = {
  review: Review;
  playhead: Playhead;
  round: Round;
  earlier?: Round;
  // After the earlier side's name, why it's that round.
  why?: string;
  // Watching one round, the round Compare goes back to waits unseen over it, and shows while Compare is held.
  then?: Round;
  peeking: boolean;
  zoomed: boolean;
  bare?: Bare;
  onShown: (shown: Shown) => void;
  onBareOff: () => void;
  pins: Pin[];
  placing?: Point;
  onPlace?: (point: Point) => void;
  onPin: (id: string) => void;
  outline?: Outline;
  onOutline: (id: string) => void;
  // The way back to every flow at once, on the latest round with more than one.
  onAllFlows?: () => void;
};

type Painted = View & Size & { page: Size };

export function Stage(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const stage = useRef<HTMLDivElement>(null);
  const frames = useRef(new Map<number, HTMLDivElement>());
  const captions = useRef(new Map<number, HTMLDivElement>());
  const allFlows = useRef<HTMLDivElement>(null);
  const replays = useRef(new Map<string, Replay | "loading">());
  const sizes = useRef(new Map<string, Size>());
  const held = useRef<Held>(undefined);
  const painted = useRef(new Map<number, Painted>());
  const glide = useRef<{ started: number; from: Map<number, Painted> }>(undefined);
  const shown = useRef<Shown>(undefined);
  const wasPlaying = useRef(false);
  const [visited, setVisited] = useState<number[]>([]);
  const [aim, setAim] = useState<Point>();
  // Where the outlined things are, as shares of the page, measured on the page as it's shown.
  const [outlined, setOutlined] = useState<Rect[]>([]);
  const outlinedKey = useRef("");
  const playing = useNow(props.playhead, (now) => now.playing);
  const { review, round, earlier, zoomed } = props;
  const then = earlier ? undefined : props.then;

  const onScreen = earlier ? [earlier, round] : then ? [then, round] : [round];
  if (onScreen.some((shown) => !visited.includes(shown.number))) setVisited([...new Set([...visited, ...onScreen.map((shown) => shown.number)])].sort((a, b) => a - b));

  const key = (round: Round, flow: Flow) => `${round.number}/${flow.name}`;
  const sizeOf = (round: Round, flow: Flow): Size => {
    const replay = replays.current.get(key(round, flow));
    return replay instanceof Replay ? replay : (sizes.current.get(key(round, flow)) ?? { width: 1280, height: 800 });
  };

  // A replay is built the first time its flow shows.
  const replayOf = (round: Round, flow: Flow): Replay | undefined => {
    const kept = replays.current.get(key(round, flow));
    if (kept) return kept instanceof Replay ? kept : undefined;
    replays.current.set(key(round, flow), "loading");
    recording(latest.current.review.id, round.number, flow.recording).then((events) => {
      replays.current.set(key(round, flow), new Replay(events, parts(frames.current.get(round.number)!).stack));
      paint();
    });
    return undefined;
  };

  // A flow recorded in another shape takes its own as its title card comes up.
  const shapeAt = (round: Round, flow: Flow, at: number): Size => {
    const own = sizeOf(round, flow);
    const before = round.flows[round.flows.indexOf(flow) - 1];
    const u = ease(clamp((at + CARD) / MORPH));
    if (!before || u >= 1) return own;
    const was = sizeOf(round, before);
    return { width: was.width + (own.width - was.width) * u, height: was.height + (own.height - was.height) * u };
  };

  const paint = () => {
    const { playhead, round, earlier, zoomed, peeking } = latest.current;
    const then = earlier ? undefined : latest.current.then;
    const room = stage.current;
    if (!room) return;
    const { moment, playing, speed, stopped } = playhead.now;
    const flow = round.flows.find((flow) => flow.name === moment.flow);
    const width = room.clientWidth;
    const height = room.clientHeight;
    const across = width > 700;
    const half = across ? (width - 20) / 2 : width;
    const tall = across ? height : (height - 12) / 2;
    const panes = new Map(
      earlier
        ? [
            [earlier.number, { left: 0, top: 0, width: half, height: tall }],
            [round.number, { left: across ? half + 20 : 0, top: across ? 0 : tall + 12, width: half, height: tall }],
          ]
        : [[round.number, { left: 0, top: 0, width, height }]],
    );
    if (then) panes.set(then.number, panes.get(round.number)!);
    for (const [number, frame] of frames.current) {
      frame.hidden = !panes.has(number);
      // Laid over the recording, the earlier round is drawn exactly where it is, and fades in only while it's held.
      frame.toggleAttribute("data-over", number === then?.number);
      frame.style.opacity = number === then?.number && !peeking ? "0" : "";
    }
    // Watching one round, "All flows" keeps one place whatever the flow's shape: over the left edge of the round's
    // widest recording.
    const own = panes.get(round.number)!;
    const widest = Math.max(...round.flows.map((flow) => fit({ width: own.width, height: own.height - CAPTION }, sizeOf(round, flow)).width));
    if (allFlows.current) allFlows.current.style.left = `${Math.round(own.left + (own.width - widest) / 2)}px`;
    if (!flow) return;

    const gliding = glide.current && performance.now() - glide.current.started < GLIDE ? glide.current : undefined;
    let lead: { view: View; box: Size } | undefined;
    // The round you're watching first: side by side, or held over it, the other shows the same part of the page as it.
    for (const shown of earlier ? [round, earlier] : then ? [round, then] : [round]) {
      const frame = frames.current.get(shown.number);
      const pane = panes.get(shown.number)!;
      if (!frame) continue;
      const its = shown === round ? flow : shown.flows.find((other) => other.name === flow.name);
      const at = !its || its === flow ? moment.at : inStep(moment.at, flow, its);
      const shape = its ? shapeAt(shown, its, at) : shapeAt(round, flow, moment.at);
      const room = { width: pane.width, height: pane.height - CAPTION };
      const box = zoomed && earlier ? { width: Math.floor(Math.min(room.width, shape.width)), height: Math.floor(Math.min(room.height, shape.height)) } : fit(room, shape);
      const left = Math.round(pane.left + (pane.width - box.width) / 2);
      Object.assign(frame.style, { left: `${left}px`, top: `${pane.top + CAPTION}px`, width: `${box.width}px`, height: `${box.height}px` });
      const caption = captions.current.get(shown.number);
      if (caption) Object.assign(caption.style, { left: `${left}px`, top: `${pane.top}px`, width: `${box.width}px` });

      const part = parts(frame);
      const replay = its && replayOf(shown, its);
      for (const host of part.stack.children) (host as HTMLElement).hidden = host !== replay?.host;
      frame.toggleAttribute("data-absent", !its);
      // A round that never recorded this flow says so plainly, rather than freezing on something unrelated.
      if (!its) {
        part.name.textContent = "Not recorded then";
        part.card.style.opacity = "1";
        part.card.style.setProperty("--n", "1");
        part.app.style.filter = "";
        part.cursor.style.opacity = part.ring.style.opacity = "0";
        continue;
      }

      const page = sizeOf(shown, its);
      // Until its recording is here, the flow's name stands on its own.
      const card = replay ? titleCard(at) : { soft: 1, name: 1 };
      let view: View;
      if (!zoomed || fitted(box, page).fit >= 0.995) view = fitted(box, page);
      else if (lead) view = around(box, page, centreOf(lead.view, lead.box), lead.view.k);
      else {
        const hold = held.current?.flow === flow.name ? held.current : undefined;
        view = around(box, page, hold?.centre ?? (replay ? ahead(replay, at, its.length) : [page.width / 2, 0]), hold?.k ?? 1);
      }
      if (shown === round) {
        lead = { view, box };
        report({ fit: view.fit, k: view.k });
      }
      const from = gliding?.from.get(shown.number);
      if (gliding && from && from.width === box.width && from.height === box.height) view = between(from, view, (performance.now() - gliding.started) / GLIDE, box);
      painted.current.set(shown.number, { ...view, ...box, page });

      const shift = `translate(${(-view.x * view.k).toFixed(2)}px,${(-view.y * view.k).toFixed(2)}px)`;
      if (replay) {
        replay.host.style.transform = `${shift} scale(${view.k.toFixed(5)})`;
        replay.show(at, playing, speed);
        if (stopped && wasPlaying.current) replay.rest();
      }
      if (shown === round) outline(replay && !playing ? replay : undefined, page);
      Object.assign(part.marks.style, { transform: shift, width: `${page.width * view.k}px`, height: `${page.height * view.k}px` });
      part.name.textContent = its.name;
      part.card.style.opacity = card ? "1" : "0";
      part.card.style.setProperty("--k", (card?.soft ?? 0).toFixed(3));
      part.card.style.setProperty("--n", (card?.name ?? 0).toFixed(3));
      part.app.style.filter = card && card.soft > 0.002 ? `blur(${(card.soft * 6).toFixed(2)}px)` : "";

      // The pointer belongs to the flow: it stays out of the title, and appears as the frame comes into focus.
      const pointer = replay && !replay.touch ? replay.pointerAt(at) : undefined;
      const drawn: [number, number] | undefined = pointer && [(pointer[0] - view.x) * view.k, (pointer[1] - view.y) * view.k];
      part.cursor.style.opacity = drawn ? String(1 - (card?.soft ?? 0)) : "0";
      if (drawn) part.cursor.style.transform = `translate(${drawn[0] - 3}px,${drawn[1] - 2}px)`;
      const click = replay && drawn && !card ? replay.clicks.find((click) => at >= click && at < click + 0.5) : undefined;
      if (click !== undefined && drawn) {
        const u = (at - click) / 0.5;
        Object.assign(part.ring.style, { opacity: String(1 - u), transform: `translate(${drawn[0]}px,${drawn[1]}px) scale(${0.4 + u * 1.1})` });
      } else part.ring.style.opacity = "0";
    }
    wasPlaying.current = playing;
    if (gliding && !playing) requestAnimationFrame(paint);
  };

  // Playing, nothing is outlined; stopped, what changed there is, wherever it is on the page now.
  const outline = (replay: Replay | undefined, page: Size) => {
    const nodes = (replay && latest.current.outline?.nodes) || [];
    const boxes = nodes.flatMap((node) => {
      const box = replay!.boxOf(node);
      return box ? [{ left: box.left / page.width, top: box.top / page.height, width: box.width / page.width, height: box.height / page.height }] : [];
    });
    const key = JSON.stringify(boxes);
    if (key === outlinedKey.current) return;
    outlinedKey.current = key;
    setOutlined(boxes);
  };

  // What the size control says: how large the recording you're watching shows, and where it's going while it glides.
  const report = (next: Shown) => {
    if (shown.current?.fit === next.fit && shown.current.k === next.k) return;
    shown.current = next;
    latest.current.onShown(next);
  };

  useLayoutEffect(paint);
  useEffect(() => props.playhead.subscribe(paint), [props.playhead]);
  useEffect(() => {
    const observer = new ResizeObserver(() => paint());
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => replays.current.forEach((replay) => replay instanceof Replay && replay.destroy()), []);

  // The shapes of the flows on screen are known before they play, so nothing changes shape when they do.
  useEffect(() => {
    for (const shown of onScreen)
      for (const flow of shown.flows)
        if (!sizes.current.has(key(shown, flow))) {
          sizes.current.set(key(shown, flow), { width: 1280, height: 800 });
          recording(review.id, shown.number, flow.recording).then((events) => {
            const { width, height } = recorded(events);
            sizes.current.set(key(shown, flow), { width, height });
            paint();
          });
        }
  });

  // Changing the size lets go of where you moved the view, and glides there.
  const wasZoomed = useRef(zoomed);
  if (wasZoomed.current !== zoomed) {
    wasZoomed.current = zoomed;
    held.current = undefined;
    glide.current = matchMedia("(prefers-reduced-motion: reduce)").matches ? undefined : { started: performance.now(), from: new Map(painted.current) };
  }

  // Choosing another view, what's on screen comes in softly.
  const side = !!earlier;
  const wasSide = useRef(side);
  useLayoutEffect(() => {
    if (wasSide.current === side) return;
    wasSide.current = side;
    for (const element of stage.current?.querySelectorAll(":scope > :not([hidden])") ?? [])
      element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  }, [side]);

  // At actual size, the wheel and a drag move the view around the page.
  const zoomedFrame = (target: EventTarget | null): number | undefined => {
    const frame = target instanceof Element ? target.closest<HTMLElement>("[data-frame]") : null;
    const number = frame && !frame.hasAttribute("data-absent") ? Number(frame.dataset.frame) : undefined;
    const view = number === undefined ? undefined : painted.current.get(number);
    return latest.current.zoomed && view && view.k > view.fit + 0.001 ? number : undefined;
  };
  const moveView = (number: number, to: (centre: [number, number], k: number) => [number, number]) => {
    const view = painted.current.get(number);
    if (!view) return;
    const centre = held.current?.centre ?? centreOf(view, view);
    glide.current = undefined;
    held.current = { centre: moved(to(centre, view.k), view, view.page, view.k), k: view.k, flow: latest.current.playhead.now.moment.flow };
    if (!latest.current.playhead.now.playing) paint();
  };
  useEffect(() => {
    const room = stage.current;
    const wheel = (event: WheelEvent) => {
      const number = zoomedFrame(event.target);
      if (number === undefined) return;
      event.preventDefault();
      moveView(number, (centre, k) => [centre[0] + event.deltaX / k, centre[1] + event.deltaY / k]);
    };
    room?.addEventListener("wheel", wheel, { passive: false });
    return () => room?.removeEventListener("wheel", wheel);
  }, []);

  // A point on the screen as a share of the recorded page.
  const pointAt = (event: { clientX: number; clientY: number }, number: number): Point | undefined => {
    const frame = frames.current.get(number);
    const view = painted.current.get(number);
    if (!frame || !view) return undefined;
    const box = frame.getBoundingClientRect();
    return { x: clamp(((event.clientX - box.left) / view.k + view.x) / view.page.width), y: clamp(((event.clientY - box.top) / view.k + view.y) / view.page.height) };
  };

  // A press on the page is a click until it moves 4px; from then on, zoomed in, it drags the page along like a map.
  const dragged = useRef(false);
  const press = (event: PointerEvent<HTMLDivElement>, number: number) => {
    dragged.current = false;
    if (event.button !== 0 || (event.target as Element).closest("[data-pin]") || zoomedFrame(event.target) === undefined) return;
    const start = { x: event.clientX, y: event.clientY };
    const view = painted.current.get(number)!;
    const centre = held.current?.centre ?? centreOf(view, view);
    const element = event.currentTarget;
    const id = event.pointerId;
    const move = (moving: globalThis.PointerEvent) => {
      if (moving.pointerId !== id || (!dragged.current && Math.hypot(moving.clientX - start.x, moving.clientY - start.y) < 4)) return;
      if (!dragged.current) element.setPointerCapture(id);
      dragged.current = true;
      moveView(number, () => [centre[0] - (moving.clientX - start.x) / view.k, centre[1] - (moving.clientY - start.y) / view.k]);
    };
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  const click = (event: MouseEvent<HTMLDivElement>, number: number) => {
    if (dragged.current || number !== round.number) return;
    if (props.playhead.now.playing) return props.playhead.pause();
    const point = pointAt(event, number);
    if (point) props.onPlace?.(point);
  };

  const aiming = !playing && !!props.onPlace && !props.placing;
  // First on the line over the recording, where the grid's own heading was.
  const toAll = props.onAllFlows && (
    <button
      className="-my-0.5 mr-1 -ml-1 inline-flex flex-none items-baseline gap-0.5 rounded-md py-0.5 pr-2 pl-0.5 text-xs leading-4 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg"
      onClick={props.onAllFlows}
    >
      <svg viewBox="0 0 12 12" className="size-3.5 self-center" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7.5 3L4.5 6l3 3" />
      </svg>
      All flows
    </button>
  );
  const roundName = (number: number) => (number === 0 ? "Before" : `Round ${number}`);
  // Kept hidden, the marks say so on the line over the recording: centred watching one round, and side by side at the
  // end of the watched side's line, clear of both rounds' names.
  const bareOff = (where: string) => (
    <button
      className={`z-20 inline-flex items-center gap-1.5 rounded-md py-0.5 pr-1 pl-2 text-xs leading-4 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg ${where}`}
      onClick={props.onBareOff}
    >
      Marks hidden
      <kbd className="rounded-[3px] px-1 font-ui text-[11px] text-soft shadow-[0_0_0_1px_var(--line)]">H</kbd>
    </button>
  );

  return (
    <div ref={stage} className="group/stage relative min-h-0 select-none" data-bare={props.bare ? "" : undefined}>
      {visited.map((number) => (
        <div
          key={number}
          ref={(element) => void (element ? frames.current.set(number, element) : frames.current.delete(number))}
          data-frame={number}
          className={`absolute overflow-hidden rounded-lg bg-paper shadow-frame transition-opacity duration-160 ease-calm data-over:pointer-events-none data-over:z-10 ${number === round.number && aiming ? "cursor-none" : ""}`}
          onPointerDown={(event) => press(event, number)}
          onPointerMove={(event) => setAim(number === round.number && aiming && !dragged.current ? pointAt(event, number) : undefined)}
          onPointerLeave={() => setAim(undefined)}
          onClick={(event) => click(event, number)}
        >
          <div data-app className="absolute inset-0 overflow-hidden">
            <div data-stack className="absolute inset-0" />
            <div data-marks className={`absolute top-0 left-0 z-3 ${hideable} group-data-bare/stage:[&_*]:pointer-events-none`}>
              {number === round.number && <Outlines boxes={outlined} outline={props.outline} onPin={props.onOutline} />}
              {number === round.number && <Marks playhead={props.playhead} pins={props.pins} placing={props.placing} aim={aiming ? aim : undefined} onPin={props.onPin} />}
            </div>
          </div>
          <div
            data-ring
            className={`pointer-events-none absolute top-0 left-0 z-7 -mt-[17px] -ml-[17px] size-[34px] rounded-full border-[1.5px] border-[rgba(40,44,54,0.5)] bg-[rgba(40,44,54,0.06)] opacity-0 ${hideable}`}
          />
          <div
            data-cursor
            className="pointer-events-none absolute top-0 left-0 z-8 size-5 opacity-0 transition-[filter] duration-180 ease-calm will-change-transform [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))] group-data-bare/stage:[filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))_opacity(0)]"
          >
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden>
              <path d="M3 2l13 7.5-5.6 1.3L7.6 16z" fill="#FFFFFF" stroke="#1E2330" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
          {/* Between flows, the flow's name over its own first frame, softened under a veil in the recorded app's background,
              in the app's ink and face: it belongs to the recording, so it looks the same in both themes. */}
          <div
            data-card
            className="pointer-events-none absolute inset-0 z-9 grid place-items-center rounded-lg bg-[rgba(247,247,245,calc(var(--k,0)*.45))] p-4 text-center font-recorded text-[20px] leading-[1.2] font-medium tracking-[-0.01em] text-[#222222] opacity-0 in-data-absent:bg-surface in-data-absent:font-ui in-data-absent:text-[13px] in-data-absent:leading-normal in-data-absent:font-normal in-data-absent:tracking-normal in-data-absent:text-faint"
          >
            <span data-name className="opacity-[var(--n,0)]" />
          </div>
        </div>
      ))}
      {earlier &&
        [earlier, round].map((shown) => (
          <div
            key={shown.number}
            ref={(element) => void (element ? captions.current.set(shown.number, element) : captions.current.delete(shown.number))}
            className="absolute flex h-[26px] items-baseline gap-2 px-0.5 pt-0.5 pb-1.5 text-xs text-faint"
          >
            {shown === earlier && toAll}
            <b className="flex-none font-medium text-soft">{roundName(shown.number)}</b>
            {shown === earlier && props.why && <span className="truncate">{props.why}</span>}
            {shown === round && props.bare === "kept" && bareOff("-mt-px ml-auto flex-none self-start")}
          </div>
        ))}
      {then && (
        <div className={`pointer-events-none absolute top-0 left-0 flex h-[26px] items-baseline gap-2 px-0.5 pt-0.5 pb-1.5 text-xs text-faint transition-opacity duration-160 ease-calm ${props.peeking ? "opacity-100" : "opacity-0"}`} ref={(element) => void (element ? captions.current.set(then.number, element) : captions.current.delete(then.number))}>
          <b className="flex-none font-medium text-soft">{roundName(then.number)}</b>
          {props.why && <span className="truncate">{props.why}</span>}
        </div>
      )}
      {!earlier && toAll && (
        <div ref={allFlows} className="absolute top-0 z-20 flex h-[26px] items-baseline px-0.5 pt-0.5 pb-1.5 text-xs">
          {toAll}
        </div>
      )}
      {!earlier && props.bare === "kept" && bareOff("absolute -top-px left-1/2 -translate-x-1/2")}
    </div>
  );
}

// What H fades: everything Vantage draws on the recording.
const hideable = "transition-[filter] duration-180 ease-calm group-data-bare/stage:[filter:opacity(0)]";

function Marks({ playhead, pins, placing, aim, onPin }: { playhead: Playhead; pins: Pin[]; placing?: Point; aim?: Point; onPin: (id: string) => void }) {
  const showing = useNow(playhead, ({ moment }) => pins.filter((pin) => moment.at >= pin.at - 0.05 && moment.at <= (pin.until ?? pin.at) + SHOWN_FOR).map((pin) => pin.id).join(" "));
  const pin = "absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full text-[10px] leading-[18px] font-semibold text-white shadow-pin";
  return (
    <>
      {pins
        .filter((shown) => showing.split(" ").includes(shown.id))
        .map((shown) => (
          <button
            key={shown.id}
            data-pin={shown.id}
            className={`${pin} ${shown.fill} cursor-pointer opacity-90 transition duration-150 ease-calm hover:scale-112 hover:opacity-100`}
            style={{ left: `${shown.point.x * 100}%`, top: `${shown.point.y * 100}%` }}
            onClick={(event) => {
              event.stopPropagation();
              onPin(shown.id);
            }}
          >
            {shown.number}
          </button>
        ))}
      {placing && <span className={`${pin} animate-drop bg-amber`} style={{ left: `${placing.x * 100}%`, top: `${placing.y * 100}%` }} />}
      {aim && (
        <span
          className="pointer-events-none absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-amber/70"
          style={{ left: `${aim.x * 100}%`, top: `${aim.y * 100}%` }}
        />
      )}
    </>
  );
}

// Each thing that changed, outlined in the change's ink, the recording's own dark grey, never a note's colour; the
// first carries the change's pin, its diamond, where a note has its number.
function Outlines({ boxes, outline, onPin }: { boxes: Rect[]; outline?: Outline; onPin: (id: string) => void }) {
  if (!outline) return null;
  const percent = (share: number) => `${(share * 100).toFixed(3)}%`;
  return boxes.map((box, i) => (
    <div
      key={i}
      className={`pointer-events-none absolute rounded-[4px] outline-offset-4 ${outline.chosen ? "outline-[1.5px] outline-[#2b2e35] outline-solid" : "outline-1 outline-[rgba(43,46,53,0.4)] outline-solid"}`}
      style={{ left: percent(box.left), top: percent(box.top), width: percent(box.width), height: percent(box.height) }}
    >
      {i === 0 && (
        <button
          data-pin={outline.id}
          aria-label="What changed here"
          className="pointer-events-auto absolute -top-[9px] -right-[9px] grid size-[18px] cursor-pointer place-items-center opacity-90 transition duration-150 ease-calm hover:scale-112 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onPin(outline.id);
          }}
        >
          <i className="size-[9px] rotate-45 bg-[#2b2e35] shadow-pin" />
        </button>
      )}
    </div>
  ));
}

const fit = (room: Size, shape: Size): Size => {
  const width = Math.floor(Math.max(0, Math.min(room.width, (room.height * shape.width) / shape.height, shape.width)));
  return { width, height: Math.floor((width * shape.height) / shape.width) };
};

type Parts = { app: HTMLElement; stack: HTMLElement; marks: HTMLElement; ring: HTMLElement; cursor: HTMLElement; card: HTMLElement; name: HTMLElement };
const known = new WeakMap<HTMLElement, Parts>();
function parts(frame: HTMLElement): Parts {
  if (!known.has(frame)) {
    const part = (name: string) => frame.querySelector<HTMLElement>(`[data-${name}]`)!;
    known.set(frame, { app: part("app"), stack: part("stack"), marks: part("marks"), ring: part("ring"), cursor: part("cursor"), card: part("card"), name: part("name") });
  }
  return known.get(frame)!;
}
