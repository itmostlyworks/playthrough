// The recordings: the round you're watching, or side by side with the round it's compared with, each at the playhead's
// moment in its own recording of the flow. Each takes its flow's recorded shape, as large as fits and never larger than
// it was recorded; at actual size it's a window onto the page that follows the pointer, or stays where you move it.
// Nothing Vantage draws covers what's recorded except the marks on it, and H hides those. Paused, what a click would note
// is outlined, and Alt and the wheel widen it to what holds it.
//
// Every round once shown keeps its frame and its replays, in the same place in the page, so going back to a flow or a
// round shows it at once: a recording moved elsewhere in the page would have to be built again.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { elementOf, type Thing } from "@mostlyworks/vantage-page";
import { inStep, type Box, type Flow, type Place, type Point, type Review, type Round } from "@mostlyworks/vantage-review";
import { recording } from "./api.ts";
import { CARD, clamp, ease, MORPH, titleCard } from "./moments.ts";
import { onPhone } from "./phone.ts";
import { useNow, type Forked, type Playhead } from "./playhead.ts";
import { recorded, Replay } from "./replay.ts";
import type { Live } from "./live.ts";
import { roundName } from "./Rounds.tsx";
import { holdersOf, pickAt, type Read } from "./things.ts";
import { ahead, around, between, centreOf, fitted, GLIDE, moved, type Held, type Size, type View } from "./view.ts";

// What Vantage draws on a round's recording, each on its thing, by its node in that round's recording, or on a spot or
// a part of the screen: a note's pin and the outline of what it's on, in its colour; a change's diamond and outline in
// the recording's own dark ink; the note being written. Without a pin, it's what's chosen on a side where it has none,
// outlined so both sides point at the same thing.
export type Mark = {
  id: string;
  kind: "note" | "change" | "writing";
  on: { node: number } | { point: Point } | { box: Box };
  pin?: { number: number; fill: string } | "diamond";
  // A note's colour, and a change's made for it; on a change's diamond, the colour of the note grown out of it.
  ink?: string;
  dot?: string;
  chosen: boolean;
  // A note shows from its moment, or through its stretch; a change only while you're stopped on it.
  shows?: { at: number; until?: number };
};
export type Placed = { element: NonNullable<Place["element"]> } | { point: Point };
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
  // After each side's round, what it is, where its name alone doesn't say: on a fork walked again, what you did, and
  // your steps done again.
  about?: { earlier: string; now: string };
  // Watching one round, the round Compare or How it was goes back to waits unseen over it, and shows while either is
  // held.
  then?: Round;
  peeking: boolean;
  zoomed: boolean;
  bare?: Bare;
  onShown: (shown: Shown) => void;
  onBareOff: () => void;
  // By round.
  marks: Map<number, Mark[]>;
  // The spot of the note being written, its pin dropped there; while writing, nothing else is outlined to note.
  placing?: Point;
  writing: boolean;
  onPlace?: (on: Placed) => void;
  onMark: (id: string) => void;
  // What each round's pages were read as, to name what a click would note.
  read: Read;
  // The notes whose things aren't on the page now, on the round you're watching.
  onGone: (ids: string[]) => void;
  // The way back to every flow at once, on the latest round with more than one.
  onAllFlows?: () => void;
  // Taken over, the app itself at that moment, in the round's frame exactly where its recording is.
  live?: Live;
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
  // What a click would note, by its node, and how far Alt and the wheel have widened it, at this moment.
  const [hover, setHover] = useState<number>();
  const widen = useRef<{ here: string; pick: Thing }>(undefined);
  const pointer = useRef<{ clientX: number; clientY: number }>(undefined);
  // When each note's thing was last on the page, and which were gone as last told.
  const seen = useRef(new Map<string, number>());
  const told = useRef("");
  // At actual size, the chosen thing shows whole, at the size it first showed at.
  const focus = useRef<{ id: string; k?: number }>(undefined);
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

  // On a phone the recordings take the height they need at the screen's width, up to a little over half the screen, and
  // the controls and the column follow under them with no room between. Side by side at actual size, they fill it.
  const onPhoneNeeds = (width: number, flow: Flow | undefined, at: number): number => {
    const { round, earlier, zoomed } = latest.current;
    const most = Math.max(160, Math.round(innerHeight * 0.58));
    if (!flow || (earlier && zoomed)) return most;
    const shapes = (earlier ? [earlier, round] : [round]).map((shown) => {
      const its = shown.flows.find((other) => other.name === flow.name);
      return shown === round || !its ? shapeAt(round, flow, at) : sizeOf(shown, its);
    });
    const tallest = (room: Size) => CAPTION + Math.max(...shapes.map((shape) => fit(room, shape).height));
    if (!earlier) return tallest({ width, height: most - CAPTION });
    if (width > 700) return tallest({ width: (width - 20) / 2, height: most - CAPTION });
    return 2 * tallest({ width, height: (most - 12) / 2 - CAPTION }) + 12;
  };

  const paint = () => {
    const { playhead, round, earlier, zoomed, peeking } = latest.current;
    const then = earlier ? undefined : latest.current.then;
    const room = stage.current;
    if (!room) return;
    const { moment, playing, speed, stopped } = playhead.now;
    const flow = round.flows.find((flow) => flow.name === moment.flow);
    const width = room.clientWidth;
    const height = onPhone() ? onPhoneNeeds(width, flow, moment.at) : room.clientHeight;
    room.style.height = onPhone() ? `${height}px` : "";
    // Side by side, or one above the other where that shows each recording larger.
    const shape = flow ? sizeOf(round, flow) : { width: 1280, height: 800 };
    const area = (room: Size) => {
      const shown = fit({ width: room.width, height: room.height - CAPTION }, shape);
      return shown.width * shown.height;
    };
    const across = !earlier || area({ width: (width - 20) / 2, height }) >= area({ width, height: (height - 12) / 2 });
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
      // Laid over the recording, the earlier round is drawn exactly where it is, and fades in only while it's held. Laid
      // there from beside it, it's unseen at once rather than fading out over the recording.
      const over = number === then?.number;
      const arriving = over && !frame.hasAttribute("data-over");
      frame.toggleAttribute("data-over", over);
      frame.style.transition = arriving ? "none" : "";
      frame.style.opacity = over && !peeking ? "0" : "";
      if (arriving) void frame.offsetWidth;
      frame.style.transition = "";
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
      const clicks = its && its !== flow && { from: replayOf(round, flow)?.clicks ?? [], to: replayOf(shown, its)?.clicks ?? [] };
      const at = !its || its === flow ? moment.at : inStep(moment.at, flow, its, clicks || undefined);
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
        part.name.textContent = `Not in ${roundName(shown.number)}`;
        part.line.hidden = true;
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
        const chosen = hold || !replay ? undefined : focusOn(replay, box);
        view = around(box, page, hold?.centre ?? chosen?.centre ?? (replay ? ahead(replay, at, its.length) : [page.width / 2, 0]), hold?.k ?? chosen?.k ?? 1);
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
      Object.assign(part.marks.style, { transform: shift, width: `${page.width * view.k}px`, height: `${page.height * view.k}px` });
      const app = frame.querySelector<HTMLElement>("[data-live] iframe");
      if (app) Object.assign(app.style, liveAt(view, page));
      place(part.marks, replay, page, view, box, at, playing, shown === round);
      // A fork is called by the flow it leaves, as everywhere you see it.
      part.name.textContent = (its as Forked).fork ?? its.name;
      // Under it, on the round you're watching, what the agent says the flow starts from or the choice it shows.
      const line = shown === round ? (its.line ?? "") : "";
      const [by, words] = part.line.children as unknown as [HTMLElement, HTMLElement];
      part.line.hidden = !line;
      if (words.textContent !== line) [by.textContent, words.textContent] = [shown.by, line];
      part.card.style.opacity = card ? "1" : "0";
      part.card.style.setProperty("--k", (card?.soft ?? 0).toFixed(3));
      part.card.style.setProperty("--n", (card?.name ?? 0).toFixed(3));
      part.app.style.filter = card && card.soft > 0.002 ? `blur(${(card.soft * 6).toFixed(2)}px)` : "";

      // The pointer belongs to the flow: it stays out of the title, and appears as the frame comes into focus.
      const pointer = replay && !replay.touch ? replay.pointerAt(at) : undefined;
      const drawn: [number, number] | undefined = pointer && [(pointer[0] - view.x) * view.k, (pointer[1] - view.y) * view.k];
      // Taken over, the pointer is yours, and follows your hand in the app rather than the recording.
      const yours = shown === round && open.current;
      if (!yours) part.cursor.style.opacity = drawn ? String(1 - (card?.soft ?? 0)) : "0";
      if (drawn && !yours) part.cursor.style.transform = `translate(${drawn[0] - 3}px,${drawn[1] - 2}px)`;
      // Whose hand it is: the person the flow acts as, from the app's setup.
      const tag = part.cursor.querySelector<HTMLElement>("[data-tag]")!;
      if (!yours && !taking.current) {
        tag.querySelector("[data-words]")!.textContent = its.person ?? "";
        tag.hidden = !its.person;
        delete tag.dataset.mine;
      }
      const click = replay && drawn && !card ? replay.clicks.find((click) => at >= click && at < click + 0.5) : undefined;
      if (click !== undefined && drawn) {
        const u = (at - click) / 0.5;
        Object.assign(part.ring.style, { opacity: String(1 - u), transform: `translate(${drawn[0]}px,${drawn[1]}px) scale(${0.4 + u * 1.1})` });
      } else part.ring.style.opacity = "0";
    }
    wasPlaying.current = playing;
    if (gliding && !playing) requestAnimationFrame(paint);
  };

  // Each mark goes where its thing is on the page now, and shows while its moment is and it's on the recorded screen,
  // covering only the part of it that is; a change, only while you're stopped. Outlines are for still frames: playing,
  // they fade, and only the pins go along with the recording. On the round you're watching, a note
  // whose thing has been off the page for a moment of the recording is gone: playing past a page redrawing, it doesn't
  // flicker. Moved out of the screen's view, it's still there.
  const place = (layer: HTMLElement, replay: Replay | undefined, page: Size, view: View, frame: Size, at: number, playing: boolean, watched: boolean) => {
    const gone: string[] = [];
    for (const mark of layer.querySelectorAll<HTMLElement>("[data-mark-id]")) {
      const { node, from, until, paused, markId } = mark.dataset;
      const spot = mark.dataset.box?.split(" ").map(Number);
      const box = node !== undefined ? replay?.boxOf(Number(node)) : spot && { left: spot[0]! * page.width, top: spot[1]! * page.height, width: spot[2]! * page.width, height: spot[3]! * page.height };
      const left = Math.max(0, box?.left ?? 0);
      const top = Math.max(0, box?.top ?? 0);
      const right = Math.min(page.width, (box?.left ?? 0) + (box?.width ?? 0));
      const bottom = Math.min(page.height, (box?.top ?? 0) + (box?.height ?? 0));
      const shown = (node === undefined && !spot) || (right - left >= 1 && bottom - top >= 1);
      const now = from === undefined || (at >= Number(from) - 0.05 && at <= Number(until ?? from) + SHOWN_FOR);
      mark.hidden = !shown || !now || (paused !== undefined && playing);
      mark.toggleAttribute("data-playing", playing);
      if (watched && node !== undefined && mark.dataset.kind === "note") {
        if (box) seen.current.set(markId!, at);
        else if (!playing || Math.abs(at - (seen.current.get(markId!) ?? -Infinity)) > 0.3) gone.push(markId!);
      }
      if (!box || mark.hidden) continue;
      Object.assign(mark.style, { left: share(left / page.width), top: share(top / page.height), width: share((right - left) / page.width), height: share((bottom - top) / page.height) });
      const pin = mark.querySelector<HTMLElement>("[data-pin]");
      if (pin) pinAt(pin, { left, top, right, bottom }, view, frame);
    }
    if (!watched) return;
    const key = gone.sort().join(" ");
    if (key !== told.current) {
      told.current = key;
      latest.current.onGone(gone);
    }
  };

  // A pin sits just outside its outline's top right corner like a badge, the line from the column coming to it short and
  // never crossing what it's on; at its bottom right where the top is out of view, and pulled in where the right is.
  const pinAt = (pin: HTMLElement, box: { left: number; top: number; right: number; bottom: number }, view: View, frame: Size) => {
    const out = 14;
    const right = Math.min(out, frame.width - (box.right - view.x) * view.k - 11);
    const above = (box.top - view.y) * view.k - out >= 11;
    Object.assign(pin.style, { left: `calc(100% + ${right - 9}px)`, top: above ? `${-out - 9}px` : `calc(100% + ${out - 9}px)` });
  };

  // At actual size, the chosen note or change on the round you're watching shows whole, at 100% where it fits, else
  // zoomed out just enough, at the size it first showed at, so stepping through it holds the zoom.
  const focusOn = (replay: Replay, frame: Size): { centre: [number, number]; k: number } | undefined => {
    const chosen = (latest.current.marks.get(latest.current.round.number) ?? []).filter((mark) => mark.chosen && mark.kind !== "writing" && "node" in mark.on);
    const boxes = chosen.flatMap((mark) => replay.boxOf((mark.on as { node: number }).node) ?? []);
    if (!boxes.length) return undefined;
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const width = Math.max(...boxes.map((box) => box.left + box.width)) - left;
    const height = Math.max(...boxes.map((box) => box.top + box.height)) - top;
    const kept = focus.current?.id === chosen[0]!.id ? focus.current : (focus.current = { id: chosen[0]!.id });
    kept.k ??= Math.min(1, frame.width / (width + 48), frame.height / (height + 48));
    return { centre: [left + width / 2, top + height / 2], k: kept.k };
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

  // Choosing another note or change lets go of where you moved the view, and glides to it.
  const chosen = (props.marks.get(round.number) ?? []).find((mark) => mark.chosen && mark.kind !== "writing")?.id;
  const wasChosen = useRef(chosen);
  if (wasChosen.current !== chosen) {
    wasChosen.current = chosen;
    held.current = undefined;
    if (zoomed && !matchMedia("(prefers-reduced-motion: reduce)").matches) glide.current = { started: performance.now(), from: new Map(painted.current) };
  }

  // Going side by side, the frame splits: the recording moves into its half, and the earlier round grows out of where it
  // was; going back, it grows into the whole again. The words over them come in softly; the earlier round laid over the
  // recording, unseen until it's held, stays unseen.
  const side = !!earlier;
  const wasSide = useRef(side);
  const beforeSplit = useRef<Map<number, DOMRect>>(undefined);
  if (wasSide.current !== side && !beforeSplit.current)
    beforeSplit.current = new Map([...frames.current].filter(([, frame]) => !frame.hidden).map(([number, frame]) => [number, frame.getBoundingClientRect()]));
  useLayoutEffect(() => {
    if (wasSide.current === side) return;
    wasSide.current = side;
    const before = beforeSplit.current ?? new Map<number, DOMRect>();
    beforeSplit.current = undefined;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const element of stage.current?.querySelectorAll<HTMLElement>(":scope > :not([hidden], [data-over])") ?? []) {
      const number = element.dataset.frame === undefined ? undefined : Number(element.dataset.frame);
      const from = number === undefined ? undefined : (before.get(number) ?? before.get(round.number));
      const to = element.getBoundingClientRect();
      if (from && to.width && to.height && !still) {
        const move = `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})`;
        element.animate([{ transformOrigin: "0 0", transform: move }, { transformOrigin: "0 0", transform: "none" }], { duration: GLIDE, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)" });
      } else if (getComputedStyle(element).opacity !== "0") element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
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
  // Paused, with Alt (Option) held, the wheel widens what a click would note instead, a notch a step; a trackpad's small
  // steps add up to a notch.
  const notches = useRef(0);
  useEffect(() => {
    const room = stage.current;
    const wheel = (event: WheelEvent) => {
      if (event.altKey && aimingAt(event.target)) {
        event.preventDefault();
        notches.current += event.deltaY;
        if (Math.abs(notches.current) < 40 && Math.abs(event.deltaY) < 40) return;
        widenBy(event, -Math.sign(notches.current));
        notches.current = 0;
        return setHover(pickFor(event)?.node);
      }
      const number = zoomedFrame(event.target);
      if (number === undefined) return;
      event.preventDefault();
      moveView(number, (centre, k) => [centre[0] + event.deltaX / k, centre[1] + event.deltaY / k]);
    };
    // Letting go of Alt after widening doesn't take the browser to its menu.
    const alt = (event: KeyboardEvent) => void (event.key === "Alt" && widen.current && event.preventDefault());
    room?.addEventListener("wheel", wheel, { passive: false });
    addEventListener("keyup", alt);
    return () => {
      room?.removeEventListener("wheel", wheel);
      removeEventListener("keyup", alt);
    };
  }, []);

  // A point on the screen, on the recorded page, in its pixels.
  const onPage = (event: { clientX: number; clientY: number }, number: number): [number, number] | undefined => {
    const frame = frames.current.get(number);
    const view = painted.current.get(number);
    if (!frame || !view) return undefined;
    const box = frame.getBoundingClientRect();
    return [clamp((event.clientX - box.left) / view.k + view.x, 0, view.page.width), clamp((event.clientY - box.top) / view.k + view.y, 0, view.page.height)];
  };
  // And as a share of it.
  const pointAt = (event: { clientX: number; clientY: number }, number: number): Point | undefined => {
    const at = onPage(event, number);
    const page = painted.current.get(number)?.page;
    return at && page && { x: at[0] / page.width, y: at[1] / page.height };
  };

  // What's under the pointer on the round you're watching, paused on its recording: the replay there, what's under the
  // point and holds it, and what that was read as.
  const under = (event: { clientX: number; clientY: number }) => {
    const { round, playhead, read } = latest.current;
    const { moment } = playhead.now;
    const flow = round.flows.find((flow) => flow.name === moment.flow);
    const replay = flow && replays.current.get(key(round, flow));
    const things = flow && read(round.number, flow.name);
    const at = onPage(event, round.number);
    if (!(replay instanceof Replay) || !things || !at || moment.at < 0) return undefined;
    return { replay, things, at: moment.at, outwards: replay.outwards(at[0], at[1]), here: `${round.number}/${moment.flow}/${moment.at}` };
  };
  // What a click there would note: what it's widened to while the pointer stays inside that, else what's under it.
  const pickFor = (event: { clientX: number; clientY: number }): Thing | undefined => {
    const here = under(event);
    if (!here) return undefined;
    const wide = widen.current;
    if (wide && wide.here === here.here && here.outwards.includes(wide.pick.node!)) return wide.pick;
    widen.current = undefined;
    return pickAt(here.outwards, here.things, here.at);
  };
  // Up widens it to what holds it, down narrows it back towards what's under the pointer.
  const widenBy = (event: { clientX: number; clientY: number }, step: number) => {
    const here = under(event);
    const pick = here && pickAt(here.outwards, here.things, here.at);
    if (!here || !pick) return;
    const holders = holdersOf(here.outwards, here.things, here.at, pick, (node) => here.replay.boxOf(node), here.replay);
    const wide = widen.current;
    const from = wide && wide.here === here.here ? holders.indexOf(wide.pick) + 1 : 0;
    const to = clamp(from + step, 0, holders.length);
    widen.current = to ? { here: here.here, pick: holders[to - 1]! } : undefined;
  };
  const aimingAt = (target: EventTarget | null) => {
    const frame = target instanceof Element ? target.closest<HTMLElement>("[data-frame]") : null;
    const { playhead, onPlace, writing, round } = latest.current;
    return !!frame && Number(frame.dataset.frame) === round.number && !frame.hasAttribute("data-absent") && !playhead.now.playing && !!onPlace && !writing && !(target as Element).closest("[data-pin]");
  };
  // The portal into the app opens from where you last pointed, held within the frame: on the recording, or from the
  // frame's edge nearest Take over; it closes on where the pointer was in the app, or the same way.
  const pointed = useRef<{ x: number; y: number }>(undefined);
  useEffect(() => {
    const aimed = (event: globalThis.PointerEvent) => {
      pointed.current = { x: event.clientX, y: event.clientY };
      // In the app, outside the part it has opened so far, the hand still follows yours.
      const box = open.current && frames.current.get(latest.current.round.number)?.getBoundingClientRect();
      if (!box) return;
      const at = { x: event.clientX - box.left, y: event.clientY - box.top };
      handTo(at, at.x >= 0 && at.y >= 0 && at.x <= box.width && at.y <= box.height, false);
    };
    addEventListener("pointermove", aimed, true);
    addEventListener("pointerdown", aimed, true);
    return () => {
      removeEventListener("pointermove", aimed, true);
      removeEventListener("pointerdown", aimed, true);
    };
  }, []);
  const inPortal = !!props.live?.shown && !!props.live.settled && !!props.live.address;
  const open = useRef(false);
  // Where your hand is in the app, in the frame, while you're in it.
  const yourHand = useRef<{ x: number; y: number }>(undefined);
  useLayoutEffect(() => {
    const frame = frames.current.get(round.number);
    const app = frame?.querySelector<HTMLElement>("[data-live]");
    const sheen = frame?.querySelector<HTMLElement>("[data-sheen]");
    const ring = frame?.querySelector<HTMLElement>("[data-portal]");
    const edge = frame?.querySelector<HTMLElement>("[data-edge]");
    const hand = frame?.querySelector<HTMLElement>("[data-cursor]");
    const tag = hand?.querySelector<HTMLElement>("[data-tag]");
    const words = tag?.querySelector<HTMLElement>("[data-words]");
    if (!frame || !app || !sheen || !ring || !edge || !hand || !tag || !words || inPortal === open.current) return;
    handing.current.forEach(clearTimeout);
    handing.current = [];
    // Waited for, the edge is already glowing, and the opening carries on from there.
    const glowing = { opacity: getComputedStyle(edge).opacity, boxShadow: getComputedStyle(edge).boxShadow };
    const waited = taking.current;
    for (const part of [app, sheen, ring, edge, hand, tag, words]) part.getAnimations().forEach((animation) => animation.cancel());
    const box = frame.getBoundingClientRect();
    const view = painted.current.get(round.number);
    const person = props.playhead.flow.person;
    const tip = (point: { x: number; y: number }) => `translate(${(point.x - 3).toFixed(1)}px,${(point.y - 2).toFixed(1)}px)`;
    const tipOf = (element: HTMLElement) => {
      const drawn = element.getBoundingClientRect();
      return { x: drawn.left - box.left + 3, y: drawn.top - box.top + 2 };
    };
    // Your pointer, if it's on the frame; the agent's, where the recording draws it.
    const yours = pointed.current && { x: pointed.current.x - box.left, y: pointed.current.y - box.top };
    const mine = yours && yours.x >= 0 && yours.y >= 0 && yours.x <= box.width && yours.y <= box.height ? yours : undefined;
    const left = props.live?.at && view ? { x: (props.live.at.x - view.x) * view.k, y: (props.live.at.y - view.y) * view.k } : undefined;
    const theirs = inPortal && hand.style.opacity !== "0" ? tipOf(hand) : undefined;
    const at = (inPortal ? (mine ?? theirs) : (yourHand.current ?? left ?? mine)) ?? { x: box.width / 2, y: box.height / 2 };
    const reach = Math.max(...[[0, 0], [box.width, 0], [0, box.height], [box.width, box.height]].map(([x, y]) => Math.hypot(x! - at.x, y! - at.y)));
    const circle = (r: number) => `circle(${r.toFixed(1)}px at ${at.x.toFixed(1)}px ${at.y.toFixed(1)}px)`;
    Object.assign(ring.style, { left: `${at.x - reach}px`, top: `${at.y - reach}px`, width: `${reach * 2}px`, height: `${reach * 2}px` });
    sheen.style.setProperty("--x", `${at.x}px`);
    sheen.style.setProperty("--y", `${at.y}px`);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    open.current = inPortal;
    // Once the recording's pointer has come to yours, the pointer is your own, with no drawn one trailing it: only your
    // name goes with it.
    const real = (mine: boolean) => {
      frame.style.cursor = mine ? "default" : "";
      hand.toggleAttribute("data-yours", mine);
      app.querySelector("iframe")?.contentWindow?.postMessage({ vantage: "yours", yours: mine }, "*");
    };

    if (inPortal) {
      Object.assign(app.style, { opacity: "1", pointerEvents: "auto" });
      app.querySelector("iframe")?.focus();
      edge.style.opacity = "1";
      // The recording's pointer becomes yours: above the app, where your hand is, its name changing hands with it.
      yourHand.current = at;
      Object.assign(hand.style, { transform: tip(at), opacity: "1", zIndex: "11" });
      tag.hidden = false;
      if (still) return void (real(true), say(tag, words, "You", true, false));
      if (!waited) say(tag, words, person ?? "You are in control", !person, false);
      // It goes from where the recording had it to your hand, and the portal opens from where they meet.
      const handing = theirs && mine && Math.hypot(mine.x - theirs.x, mine.y - theirs.y) > 4 ? HANDING : 0;
      // Moved along with your hand as it comes, so it keeps up when you move.
      if (handing) hand.animate([{ translate: `${theirs!.x - at.x}px ${theirs!.y - at.y}px` }, { translate: "0px 0px" }], { duration: handing, easing: PORTAL });
      else if (!theirs) hand.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      handingOver(() => real(true), handing);
      const handed = handing + (person || waited ? 240 : 0);
      if (person || waited) handingOver(() => say(tag, words, "You are in control"), handed);
      handingOver(() => say(tag, words, "You"), handed + 1700);
      const after = { delay: handing, easing: PORTAL, fill: "backwards" as const };
      app.animate([{ clipPath: circle(0) }, { clipPath: circle(reach) }], { ...after, duration: OPENING });
      sheen.animate([{ opacity: 1 }, { opacity: 0 }], { ...after, duration: OPENING + 240 });
      ring.animate([{ transform: "scale(0)", opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.85, offset: 0.7 }, { transform: "scale(1)", opacity: 0 }], { ...after, duration: OPENING });
      edge.animate([glowing, { ...glowing, offset: 0.5 }, { opacity: 1, boxShadow: "inset 0 0 0 2px rgba(236,178,72,0.95), inset 0 0 40px rgba(255,214,150,0.45)", offset: 0.75 }, { opacity: 1 }], { ...after, duration: OPENING + 500 });
      return;
    }

    edge.style.opacity = "0";
    real(false);
    shape(hand, false);
    const inApp = hand.style.opacity !== "0" && !!yourHand.current;
    yourHand.current = undefined;
    // Your hand stays where it was, on the recording at once, as it shows there paused: the closing app lets the
    // pointer through, and the browser, which hid its own in the app, is told where it is without waiting for a move.
    app.style.pointerEvents = "none";
    const client = { clientX: box.left + at.x, clientY: box.top + at.y };
    if (inApp) document.elementFromPoint(client.clientX, client.clientY)?.dispatchEvent(new PointerEvent("pointermove", { ...client, bubbles: true }));
    // The recording has the pointer again: it goes back from your hand to where the recording has it, its name back to
    // the person the flow acts as.
    paint();
    const hide = () => void (app.style.opacity = "0");
    // Over the closing app until it's home, then under the marks again, as the recording's.
    const home = () => void (hand.style.zIndex = "");
    if (still) return void (hide(), home());
    const back = hand.style.transform;
    hand.animate([{ transform: tip(at), opacity: 1 }, { transform: tip(at), opacity: 1, offset: 0.3 }, { transform: back, opacity: Number(hand.style.opacity || 1) }], { duration: CLOSING + HANDING, easing: PORTAL }).finished.then(home, () => {});
    if (person) {
      words.textContent = "You";
      tag.dataset.mine = "";
      say(tag, words, person, false);
    }
    const closing = { duration: CLOSING, easing: "cubic-bezier(0.55, 0, 0.7, 0.2)" };
    edge.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in" });
    ring.animate([{ transform: "scale(1)", opacity: 0 }, { opacity: 0.9, offset: 0.65 }, { transform: "scale(0)", opacity: 0 }], closing);
    sheen.animate([{ opacity: 0 }, { opacity: 0.8 }], closing);
    app.animate([{ clipPath: circle(reach) }, { clipPath: circle(0) }], closing).finished.then(hide, () => {});
  }, [inPortal]);
  // Asked for before it's ready, the frame says so where it will open: its edge glows, breathing, and the recording's
  // pointer says it's being taken over, until the portal opens or it's called off.
  const waiting = !!props.live?.shown && !inPortal;
  const taking = useRef(false);
  useLayoutEffect(() => {
    const edge = frames.current.get(round.number)?.querySelector<HTMLElement>("[data-edge]");
    const tag = frames.current.get(round.number)?.querySelector<HTMLElement>("[data-cursor] [data-tag]");
    const words = tag?.querySelector<HTMLElement>("[data-words]");
    if (!edge || !tag || !words || waiting === taking.current) return;
    taking.current = waiting;
    const person = props.playhead.flow.person;
    if (waiting) {
      tag.hidden = false;
      say(tag, words, "Taking over…", false);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void (edge.style.opacity = "1");
      edge.animate([{ opacity: 0.25 }, { opacity: 1, boxShadow: BREATH }], { duration: 1000, easing: "ease-in-out", direction: "alternate", iterations: Infinity });
      return;
    }
    if (inPortal) return;
    edge.getAnimations().forEach((animation) => animation.cancel());
    edge.style.opacity = "0";
    say(tag, words, person ?? "", false);
    tag.hidden = !person;
  }, [waiting]);
  // Made ready unseen, the app may put its text cursor where the recording had it, which would take the keyboard: it
  // stays with the review until you're in the app, and goes into it as you are.
  useEffect(() => {
    const kept = () =>
      setTimeout(() => {
        const app = document.activeElement;
        if (app instanceof HTMLIFrameElement && app.closest("[data-live]") && !open.current) app.blur();
      });
    addEventListener("blur", kept);
    return () => removeEventListener("blur", kept);
  }, []);
  // Your hand, drawn where it is in the frame, over the app or over the part of it not yet opened.
  const handTo = (at: { x: number; y: number }, inside: boolean, text: boolean) => {
    const hand = frames.current.get(latest.current.round.number)?.querySelector<HTMLElement>("[data-cursor]");
    if (!hand) return;
    yourHand.current = at;
    Object.assign(hand.style, { transform: `translate(${(at.x - 3).toFixed(1)}px,${(at.y - 2).toFixed(1)}px)`, opacity: inside ? "1" : "0" });
    shape(hand, text);
  };
  const handing = useRef<number[]>([]);
  const handingOver = (then: () => void, after: number) => void handing.current.push(window.setTimeout(then, after));
  // In the app, your name goes where your pointer is, and leaves the frame with it. Until the recording's pointer has come
  // to yours, it's drawn here too, the app's own hidden, and over words you can type into it's the text cursor.
  useEffect(() => {
    const told = ({ data }: MessageEvent) => {
      if (data?.vantage !== "pointer" || !open.current) return;
      const view = painted.current.get(latest.current.round.number);
      if (view) handTo({ x: (data.x - view.x) * view.k, y: (data.y - view.y) * view.k }, data.inside, !!data.text);
    };
    addEventListener("message", told);
    return () => removeEventListener("message", told);
  }, []);

  const aimAt = (event: PointerEvent<HTMLDivElement>, number: number) => {
    pointer.current = event;
    const aiming = number === round.number && aimingAt(event.target) && !dragged.current;
    const pick = aiming ? pickFor(event) : undefined;
    setHover(pick?.node);
    setAim(aiming && !pick ? pointAt(event, number) : undefined);
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

  // A click pauses and plays, as a video's does; noting, it notes what it would note, or else the spot itself.
  const click = (event: MouseEvent<HTMLDivElement>, number: number) => {
    if (dragged.current || number !== round.number) return;
    if (props.playhead.now.playing) return props.playhead.pause();
    if (!props.onPlace) return void (!props.writing && props.playhead.play());
    const pick = pickFor(event);
    widen.current = undefined;
    setHover(undefined);
    if (pick) return props.onPlace?.({ element: elementOf(pick, pick.name) });
    const point = pointAt(event, number);
    if (point) props.onPlace?.({ point });
  };

  const aiming = !playing && !!props.onPlace && !props.writing;
  // Played or paused by hand, the recording says so where you're looking: what just happened, in its middle, growing a
  // little as it fades, as a video's does. Not when it stops by itself.
  const sign = useRef<HTMLDivElement>(null);
  const touched = useRef(0);
  useEffect(() => {
    const now = () => void (touched.current = performance.now());
    addEventListener("pointerdown", now, true);
    addEventListener("keydown", now, true);
    return () => {
      removeEventListener("pointerdown", now, true);
      removeEventListener("keydown", now, true);
    };
  }, []);
  const signedPlaying = useRef(playing);
  useEffect(() => {
    if (signedPlaying.current === playing) return;
    signedPlaying.current = playing;
    const shown = sign.current;
    const frame = frames.current.get(round.number)?.getBoundingClientRect();
    const box = stage.current?.getBoundingClientRect();
    if (!shown || !frame || !box || performance.now() - touched.current > 300) return;
    shown.querySelector<SVGElement>("[data-play]")!.style.display = playing ? "" : "none";
    shown.querySelector<SVGElement>("[data-pause]")!.style.display = playing ? "none" : "";
    Object.assign(shown.style, { left: `${frame.left - box.left + frame.width / 2}px`, top: `${frame.top - box.top + frame.height / 2}px` });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    shown.getAnimations().forEach((animation) => animation.cancel());
    shown.animate(
      [
        { opacity: 0.95, transform: `translate(-50%,-50%) scale(${still ? 1 : 0.85})` },
        { opacity: 0.95, transform: "translate(-50%,-50%) scale(1)", offset: 0.3 },
        { opacity: 0, transform: `translate(-50%,-50%) scale(${still ? 1 : 1.25})` },
      ],
      { duration: 480, easing: "ease-out" },
    );
  }, [playing]);
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
      <div ref={sign} aria-hidden className="pointer-events-none absolute z-20 grid size-16 place-items-center rounded-full bg-[rgba(30,34,44,0.62)] text-white opacity-0">
        <svg data-play viewBox="0 0 24 24" className="ml-1 size-7" fill="currentColor">
          <path d="M7 4.5l13 7.5-13 7.5z" />
        </svg>
        <svg data-pause viewBox="0 0 24 24" className="size-7" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      </div>
      {visited.map((number) => (
        <div
          key={number}
          ref={(element) => void (element ? frames.current.set(number, element) : frames.current.delete(number))}
          data-frame={number}
          data-watched={number === round.number || undefined}
          className={`absolute touch-none overflow-hidden rounded-lg bg-paper shadow-frame transition-opacity duration-160 ease-calm data-flying:invisible data-over:pointer-events-none data-over:z-10 ${number === round.number && aiming ? (hover === undefined ? "cursor-none" : "cursor-pointer") : ""}`}
          onPointerDown={(event) => press(event, number)}
          onPointerMove={(event) => aimAt(event, number)}
          onPointerLeave={() => {
            setAim(undefined);
            setHover(undefined);
          }}
          onClick={(event) => click(event, number)}
        >
          {/* Taken over, the app opens like a portal from where you last pointed, and the ring of its opening settles into
              the frame's edge while you're in it. It's shown, and hidden, by the portal itself (useLayoutEffect below):
              see-through rather than hidden, as browsers stop drawing a hidden frame from another address, and the app
              there would never settle. */}
          {number === round.number && props.live?.address && (
            <div data-live className="pointer-events-none absolute inset-0 z-9 overflow-hidden opacity-0">
              <div data-sheen className="pointer-events-none absolute inset-0 z-1 opacity-0 [background:radial-gradient(circle_at_var(--x)_var(--y),rgba(255,232,190,0.15),rgba(255,214,150,0.5))]" />
              <iframe
                key={props.live.address}
                src={props.live.address}
                title="The app, taken over"
                className="absolute top-0 left-0 origin-top-left border-0 bg-paper"
                style={painted.current.get(number) && liveAt(painted.current.get(number)!, painted.current.get(number)!.page)}
              />
            </div>
          )}
          {number === round.number && (
            <>
              <div data-portal className="pointer-events-none absolute top-0 left-0 z-10 rounded-full opacity-0 [border:2.5px_solid_rgba(236,178,72,0.95)] [box-shadow:0_0_40px_14px_rgba(226,170,70,0.38),inset_0_0_36px_10px_rgba(255,214,150,0.4)]" />
              <div data-edge className="pointer-events-none absolute inset-0 z-10 rounded-lg opacity-0 [box-shadow:inset_0_0_0_1.5px_rgba(217,162,58,0.75),inset_0_0_22px_rgba(217,162,58,0.16)]" />
            </>
          )}
          <div data-app className="absolute inset-0 overflow-hidden">
            <div data-stack className="absolute inset-0" />
            <div data-marks className={`absolute top-0 left-0 z-3 ${hideable} group-data-bare/stage:[&_*]:pointer-events-none`}>
              {(props.marks.get(number) ?? []).map((mark, i) => (
                <Drawn key={`${mark.id}:${i}`} mark={mark} onMark={props.onMark} />
              ))}
              {number === round.number && aiming && hover !== undefined && (
                <div data-mark-id="hover" data-node={hover} hidden className="pointer-events-none absolute rounded-[4px] outline-1 outline-offset-4 outline-[rgba(217,162,58,0.55)] outline-solid" />
              )}
              {number === round.number && <Spots placing={props.placing} aim={aiming ? aim : undefined} />}
            </div>
          </div>
          <div
            data-ring
            className={`pointer-events-none absolute top-0 left-0 z-7 -mt-[17px] -ml-[17px] size-[34px] rounded-full border-[1.5px] border-[rgba(40,44,54,0.5)] bg-[rgba(40,44,54,0.06)] opacity-0 ${hideable}`}
          />
          <div
            data-cursor
            className="pointer-events-none absolute top-0 left-0 z-8 size-5 opacity-0 transition-[filter] duration-180 ease-calm will-change-transform [&[data-yours]>svg]:invisible [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))] group-data-bare/stage:[filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))_opacity(0)]"
          >
            <svg data-arrow viewBox="0 0 20 20" width="20" height="20" aria-hidden>
              <path d="M3 2l13 7.5-5.6 1.3L7.6 16z" fill="#FFFFFF" stroke="#1E2330" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            {/* Over words you can type into, in the app, the pointer is the text cursor, its middle where the arrow's tip is. */}
            <svg data-beam viewBox="0 0 20 20" style={{ display: "none" }} width="20" height="20" className="absolute -top-2 -left-[7px]" aria-hidden>
              <path d="M7 3.5h6M10 3.5v13M7 16.5h6" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" />
              <path d="M7 3.5h6M10 3.5v13M7 16.5h6" fill="none" stroke="#1E2330" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span data-tag hidden className={`${TAG} transition-[background-color,color] duration-300 ease-calm data-mine:bg-[#EDB654] data-mine:text-[#3B2A07]`}>
              <span data-words />
            </span>
          </div>
          {/* Between flows, the flow's name over its own first frame, softened under a veil in the recorded app's background,
              in the app's ink and face: it belongs to the recording, so it looks the same in both themes. The agent's line
              about the flow is under it, under the agent's name, in Vantage's face: those are the agent's words. */}
          <div
            data-card
            className="pointer-events-none absolute inset-0 z-9 grid place-items-center rounded-lg bg-[rgba(247,247,245,calc(var(--k,0)*.45))] p-4 text-center font-recorded text-[20px] leading-[1.2] font-medium tracking-[-0.01em] text-[#222222] opacity-0 in-data-absent:bg-surface in-data-absent:font-ui in-data-absent:text-[13px] in-data-absent:leading-normal in-data-absent:font-normal in-data-absent:tracking-normal in-data-absent:text-faint"
          >
            <span className="grid max-w-[min(30rem,100%)] justify-items-center gap-4 opacity-[var(--n,0)]">
              <span data-name />
              <span data-line hidden className="grid gap-1 font-ui text-[15px] leading-[1.45] font-normal tracking-normal text-[#3b3e46]">
                <span className="text-xs leading-4 text-[#8a8e97]" />
                <span className="line-clamp-4" />
              </span>
            </span>
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
            {props.about && (
              <span className="truncate">
                <span className="mr-1.5 -ml-0.5">·</span>
                {shown === earlier ? props.about.earlier : props.about.now}
              </span>
            )}
            {shown === round && props.bare === "kept" && bareOff("-mt-px ml-auto flex-none self-start")}
          </div>
        ))}
      {/* The line over the frame says what you're looking at, in its middle, clear of All flows at its start: the round
          you're watching, or the round Compare shows over it. Marks hidden, kept, sits there in its place. */}
      {!earlier && props.bare !== "kept" && (
        <div
          ref={(element) => void (element ? captions.current.set(round.number, element) : captions.current.delete(round.number))}
          className={`pointer-events-none absolute top-0 left-0 flex h-[26px] items-baseline justify-center px-0.5 pt-0.5 pb-1.5 text-xs transition-opacity duration-160 ease-calm ${then && props.peeking ? "opacity-0" : "opacity-100"}`}
        >
          <b className="flex-none font-medium text-soft">{roundName(round.number)}</b>
        </div>
      )}
      {then && (
        <div className={`pointer-events-none absolute top-0 left-0 flex h-[26px] items-baseline justify-center gap-2 px-0.5 pt-0.5 pb-1.5 text-xs text-faint transition-opacity duration-160 ease-calm ${props.peeking ? "opacity-100" : "opacity-0"}`} ref={(element) => void (element ? captions.current.set(then.number, element) : captions.current.delete(then.number))}>
          <b className="flex-none font-medium text-soft">{roundName(then.number)}</b>
          {props.about && (
            <span className="truncate">
              <span className="mr-1.5 -ml-0.5">·</span>
              {props.about.earlier}
            </span>
          )}
        </div>
      )}
      {!earlier && toAll && (
        <div ref={allFlows} className="absolute top-0 z-20 flex h-[26px] items-baseline px-0.5 pt-0.5 pb-1.5 text-xs">
          {toAll}
        </div>
      )}
      {!earlier && props.bare === "kept" && !(then && props.peeking) && bareOff("absolute -top-px left-1/2 -translate-x-1/2")}
    </div>
  );
}

// What H fades: everything Vantage draws on the recording.
const hideable = "transition-[filter] duration-180 ease-calm group-data-bare/stage:[filter:opacity(0)]";

// A mark on its thing: an outline around it, never on it, clear of everything it draws, with its pin just outside the
// corner like a badge; on a spot, its pin right there.
function Drawn({ mark, onMark }: { mark: Mark; onMark: (id: string) => void }) {
  const { on, pin, chosen } = mark;
  const shows = mark.shows && { "data-from": mark.shows.at, "data-until": mark.shows.until };
  const choose = (event: MouseEvent) => {
    event.stopPropagation();
    onMark(mark.id);
  };
  const badge =
    pin === "diamond" ? (
      <button data-pin={mark.id} aria-label="What changed here" className={`absolute grid size-[18px] place-items-center ${pressable}`} onClick={choose}>
        <i className="size-[9px] rotate-45 bg-[#2b2e35] shadow-pin" />
        {mark.dot && <b className="absolute top-px left-[11px] size-1.5 rounded-full shadow-[0_0_0_1.5px_#fff]" style={{ background: mark.dot }} />}
      </button>
    ) : (
      pin && (
        <button data-pin={mark.id} className={`absolute ${pinLook} ${pin.fill}`} onClick={choose}>
          {pin.number}
        </button>
      )
    );
  if ("point" in on)
    return (
      <div data-mark-id={mark.id} data-kind={mark.kind} {...shows} className="absolute size-0" style={{ left: share(on.point.x), top: share(on.point.y) }}>
        {pin && pin !== "diamond" && (
          <button data-pin={mark.id} className={`${pinLook} ${pin.fill} absolute -top-[9px] -left-[9px]`} onClick={choose}>
            {pin.number}
          </button>
        )}
      </div>
    );
  const look =
    mark.kind === "writing"
      ? "outline-[1.5px] outline-dashed outline-amber"
      : mark.kind === "change"
        ? mark.ink
          ? "outline-1 outline-(--c) outline-solid"
          : chosen
          ? "outline-[1.5px] outline-[#2b2e35] outline-solid"
          : "outline-1 outline-[rgba(43,46,53,0.4)] outline-solid"
        : chosen
          ? "outline-[1.5px] outline-(--c) outline-solid"
          : "outline-1 outline-[color-mix(in_srgb,var(--c)_50%,transparent)] outline-solid";
  return (
    <div
      data-mark-id={mark.id}
      data-kind={mark.kind}
      data-paused={mark.kind === "change" ? "" : undefined}
      data-node={"node" in on ? on.node : undefined}
      data-box={"box" in on ? `${on.box.x} ${on.box.y} ${on.box.width} ${on.box.height}` : undefined}
      {...shows}
      hidden
      className={`pointer-events-none absolute rounded-[4px] outline-offset-4 transition-[outline-color] duration-250 ease-calm data-playing:outline-transparent ${look}`}
      style={mark.ink ? ({ "--c": mark.ink } as CSSProperties) : undefined}
    >
      {badge}
    </div>
  );
}

// The spot being written on, its pin dropped there; and paused, where a click on empty space would leave one.
function Spots({ placing, aim }: { placing?: Point; aim?: Point }) {
  return (
    <>
      {placing && <span className={`${pinFace} absolute -translate-x-1/2 -translate-y-1/2 animate-drop bg-amber`} style={{ left: share(placing.x), top: share(placing.y) }} />}
      {aim && (
        <span
          className="pointer-events-none absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-amber/70"
          style={{ left: share(aim.x), top: share(aim.y) }}
        />
      )}
    </>
  );
}

// A pin on an outline sits at its corner, where each paint puts it.
const pressable = "pointer-events-auto cursor-pointer opacity-90 transition duration-150 ease-calm hover:scale-112 hover:opacity-100";
const pinFace = "size-[18px] rounded-full text-[10px] leading-[18px] font-semibold text-white shadow-pin";
const pinLook = `${pinFace} ${pressable}`;
const share = (part: number) => `${(part * 100).toFixed(3)}%`;

const fit = (room: Size, shape: Size): Size => {
  const width = Math.floor(Math.max(0, Math.min(room.width, (room.height * shape.width) / shape.height, shape.width)));
  return { width, height: Math.floor((width * shape.height) / shape.width) };
};

// The pointer's shape: the arrow, or the text cursor over words you can type into.
function shape(hand: HTMLElement, text: boolean) {
  hand.querySelector<SVGElement>("[data-arrow]")!.style.display = text ? "none" : "";
  hand.querySelector<SVGElement>("[data-beam]")!.style.display = text ? "" : "none";
}

// A name changes in place: its pill grows or shrinks to the new words as they come in, warm once they're yours.
function say(tag: HTMLElement, words: HTMLElement, said: string, mine = true, gently = true) {
  const from = tag.getBoundingClientRect().width;
  words.textContent = said;
  if (mine) tag.dataset.mine = "";
  else delete tag.dataset.mine;
  if (!gently || !from) return;
  const to = tag.getBoundingClientRect().width;
  tag.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 380, easing: PORTAL });
  words.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { delay: 90, duration: 280, easing: PORTAL, fill: "backwards" });
}

// The name on a pointer, just below and right of its tip.
const TAG = "absolute top-[17px] left-[13px] overflow-hidden rounded-full bg-[#2B2E35] px-[7px] font-ui text-[11px] leading-[17px] whitespace-nowrap text-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]";

// Opening into the app takes a breath, after the agent's pointer has come to yours; leaving it is quicker, as stepping
// out is.
const HANDING = 420;
// The edge at the top of a breath, while it waits: deeper than while you're in the app, to be seen over any page.
const BREATH = "inset 0 0 0 3px rgba(236,170,50,1), inset 0 0 70px 6px rgba(226,160,50,0.55)";
const OPENING = 1050;
const CLOSING = 560;
const PORTAL = "cubic-bezier(0.22, 0.8, 0.24, 1)";

// The app is the page the recording was made of, at its size, moved and scaled as the recording is.
const liveAt = (view: View, page: Size) => ({
  width: `${page.width}px`,
  height: `${page.height}px`,
  transform: `translate(${(-view.x * view.k).toFixed(2)}px,${(-view.y * view.k).toFixed(2)}px) scale(${view.k.toFixed(5)})`,
});

type Parts = { app: HTMLElement; stack: HTMLElement; marks: HTMLElement; ring: HTMLElement; cursor: HTMLElement; card: HTMLElement; name: HTMLElement; line: HTMLElement };
const known = new WeakMap<HTMLElement, Parts>();
function parts(frame: HTMLElement): Parts {
  if (!known.has(frame)) {
    const part = (name: string) => frame.querySelector<HTMLElement>(`[data-${name}]`)!;
    known.set(frame, { app: part("app"), stack: part("stack"), marks: part("marks"), ring: part("ring"), cursor: part("cursor"), card: part("card"), name: part("name"), line: part("line") });
  }
  return known.get(frame)!;
}
