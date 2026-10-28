// One flow's recording, replayed by rrweb in a page of its own and moved to the moment the playhead says: forward a
// little at a time, or rebuilt from its first frame to go back. The page's own motion follows the playback speed, holds
// where you pause, and is already over where you jump to. Its pointer and clicks are read from the recording's own
// events, for Vantage to draw over it.

import { EventType, IncrementalSource, MouseInteractions, Replayer, type eventWithTime } from "rrweb";

export type Events = eventWithTime[];
export type Rect = { left: number; top: number; width: number; height: number };

// What a recording shows besides its page.
export type Recorded = {
  width: number;
  height: number;
  // Where the pointer was, as [seconds, x, y], and when it clicked. A flow on a phone is tapped: there's no pointer
  // between taps, so none is drawn.
  pointer: [number, number, number][];
  clicks: number[];
  touch: boolean;
  // The moments its page changes: a click, something on the page changing, typing or a scroll.
  changes: number[];
  // What was clicked or typed into, as [seconds, node].
  acted: [number, number][];
};

export function recorded(events: Events): Recorded {
  const start = events[0]?.timestamp ?? 0;
  const seconds = (timestamp: number) => (timestamp - start) / 1000;
  const size = events.find((event) => event.type === EventType.Meta)?.data as { width?: number; height?: number } | undefined;
  const shown: Recorded = { width: size?.width ?? 1280, height: size?.height ?? 800, pointer: [], clicks: [], touch: false, changes: [], acted: [] };
  for (const event of events) {
    if (event.type !== EventType.IncrementalSnapshot) continue;
    const data = event.data;
    if (data.source === IncrementalSource.MouseMove) for (const position of data.positions) shown.pointer.push([seconds(event.timestamp + position.timeOffset), position.x, position.y]);
    else if (data.source === IncrementalSource.MouseInteraction && data.x !== undefined && data.y !== undefined) {
      shown.pointer.push([seconds(event.timestamp), data.x, data.y]);
      if (data.type === MouseInteractions.Click) shown.clicks.push(seconds(event.timestamp));
      if (data.type === MouseInteractions.TouchStart) shown.touch = true;
      if (data.type === MouseInteractions.Click) shown.acted.push([seconds(event.timestamp), data.id]);
    } else if (data.source === IncrementalSource.Input) shown.acted.push([seconds(event.timestamp), data.id]);
    const changes = [IncrementalSource.Mutation, IncrementalSource.Scroll, IncrementalSource.Input].includes(data.source);
    if (changes || (data.source === IncrementalSource.MouseInteraction && data.type === MouseInteractions.Click)) shown.changes.push(seconds(event.timestamp) + 0.01);
  }
  shown.pointer.sort((a, b) => a[0] - b[0]);
  return shown;
}

// When a person clicked and typed, as a recording keeps it: once for each word typed, not each letter.
export function acts(events: { timestamp: number }[]): number[] {
  const at: number[] = [];
  for (const event of events as eventWithTime[]) {
    if (event.type !== EventType.IncrementalSnapshot) continue;
    const click = event.data.source === IncrementalSource.MouseInteraction && event.data.type === MouseInteractions.Click;
    const typed = event.data.source === IncrementalSource.Input;
    if (click || (typed && !(at.length && event.timestamp - at.at(-1)! < 1500))) at.push(event.timestamp);
  }
  return at;
}

export class Replay {
  readonly host = document.createElement("div");
  readonly width: number;
  readonly height: number;
  readonly pointer: Recorded["pointer"];
  readonly clicks: number[];
  readonly touch: boolean;
  #replayer: Replayer;
  // The page is first drawn a few milliseconds in. Moved to before that, rrweb draws nothing and keeps whatever it
  // showed, so a flow's first frame would show its end.
  #drawn: number;
  #at = -1;
  #jumpedTo = -Infinity;
  #seen = new WeakSet<Animation>();
  // When each element's animations started, by name, in the recording's time. Played a little at a time, rrweb takes
  // what changed out of the page and puts it back, and anything put back starts its animation over: the who-owes-whom
  // box faded in again when the Person menu closed ("It still flashes"), and the open menu itself, as the pointer moved
  // over it. Started again, an animation goes on from where it had got to.
  #started = new WeakMap<Element, Map<string, number>>();

  // Built where it will show: rrweb builds its page only in one that's already in the document.
  constructor(events: Events, into: HTMLElement) {
    const start = events[0]?.timestamp ?? 0;
    for (const event of events) {
      // rrweb drops a removal from the event itself when it can't find the node in the middle of a jump, and the next
      // rebuild then kept the old words beside the new ("Download CSVDownload PDF"). The recording's removals stay as they were.
      if (event.type !== EventType.IncrementalSnapshot || event.data.source !== IncrementalSource.Mutation) continue;
      const removes = event.data.removes;
      Object.defineProperty(event.data, "removes", { get: () => removes, set() {}, enumerable: true, configurable: true });
    }
    ({ width: this.width, height: this.height, pointer: this.pointer, clicks: this.clicks, touch: this.touch } = recorded(events));
    this.#drawn = Math.max(0, (events.find((event) => event.type === EventType.FullSnapshot)?.timestamp ?? start) - start + 1);
    this.host.className = "absolute top-0 left-0 origin-top-left [&_.replayer-mouse]:hidden [&_iframe]:pointer-events-none [&_iframe]:block [&_iframe]:border-0";
    Object.assign(this.host.style, { width: `${this.width}px`, height: `${this.height}px` });
    into.append(this.host);
    this.#replayer = new Replayer(events, { root: this.host, mouseTail: false, triggerFocus: false, pauseAnimation: false, showWarning: false });
    this.#replayer.pause(this.#drawn);
  }

  // The page at a moment of its recording, in seconds. Before its start, while the flow's name is up, its first frame.
  show(at: number, playing: boolean, speed: number) {
    const ms = Math.max(Math.round(Math.max(0, at) * 1000), this.#drawn);
    const moved = ms !== this.#at;
    if (moved) {
      const jumped = this.#at < 0 || ms < this.#at || ms - this.#at > 300;
      if (jumped) this.#started = new WeakMap();
      this.#replayer.pause(ms);
      this.#at = ms;
      if (jumped) this.#settle();
    }
    // A page rebuilt for a jump can start its transitions a frame late, and a dialog centred by its transform slid in
    // from the side: for its first 0.15s after a jump, its motion is over, playing too.
    const settling = ms - this.#jumpedTo < 150;
    for (const animation of this.#animations()) {
      try {
        if (settling) finish(animation);
        else if (this.#goesOn(animation)) {
          // carried on to where it had got to
        }
        else if (playing) {
          if (animation.playbackRate !== speed) animation.playbackRate = speed;
          if (animation.playState === "paused") animation.play();
        }
        // One that first shows while paused, or that the pause caught on its first frame, is shown at its end: a fade-in
        // held at its start kept a panel invisible until you played on.
        else if (moved || !this.#seen.has(animation) || Number(animation.currentTime) < 20) finish(animation);
        else if (animation.playState === "running") animation.pause();
      } catch {
        // the page took it away meanwhile
      }
      this.#seen.add(animation);
    }
  }

  // Stopping by itself, the page is shown at rest, as after a jump: the stop can come a few hundredths of a second
  // into a dialog opening, and pausing held it there.
  rest() {
    this.#settle();
    for (const animation of this.#animations()) finish(animation);
  }

  pointerAt(at: number): [number, number] | undefined {
    const pointer = this.pointer;
    if (!pointer.length || at < 0) return undefined;
    let low = 0;
    let high = pointer.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (pointer[middle]![0] <= at) low = middle;
      else high = middle - 1;
    }
    const [a, b] = [pointer[low]!, pointer[low + 1]];
    if (!b || at <= a[0] || b[0] - a[0] > 0.25) return [a[1], a[2]];
    const u = (at - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }

  // Where one of the page's elements is now, in the page's own pixels, by its node in the recording; nothing while it
  // isn't on the page.
  boxOf(node: number): Rect | undefined {
    const element = this.#replayer.getMirror().getNode(node) as Element | null;
    const box = element?.getBoundingClientRect?.();
    return box && (box.width || box.height) ? { left: box.left, top: box.top, width: box.width, height: box.height } : undefined;
  }

  // What's at a point of the page, in its own pixels, and everything holding it, by their nodes in the recording, from it
  // outwards.
  outwards(x: number, y: number): number[] {
    const page = this.#replayer.iframe.contentDocument;
    const mirror = this.#replayer.getMirror();
    const nodes: number[] = [];
    for (let element = page?.elementFromPoint(x, y) ?? null; element && element !== page?.body; element = element.parentElement) nodes.push(mirror.getId(element));
    return nodes;
  }

  destroy() {
    this.#replayer.destroy();
    this.host.remove();
  }

  // For 0.4s after a jump, each frame finishes the page's motion, while the recording is still within 0.15s of where it
  // jumped to: paused on the jump, nothing else would redraw it.
  #settle() {
    this.#jumpedTo = this.#at;
    const until = performance.now() + 400;
    const tick = () => {
      if (this.#at - this.#jumpedTo >= 150) return;
      for (const animation of this.#animations()) if (animation.playState !== "finished") finish(animation);
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // An animation new to the replay that its element started before, by the same name: the element was put back, and
  // the animation is carried on from where it had got to, or shown at its end.
  #goesOn(animation: Animation): boolean {
    if (this.#seen.has(animation) || !("animationName" in animation)) return false;
    const effect = animation.effect as KeyframeEffect | null;
    const element = effect?.target;
    if (!element || effect.getTiming().iterations === Infinity) return false;
    const name = String(animation.animationName);
    const started = this.#started.get(element) ?? new Map<string, number>();
    this.#started.set(element, started);
    const since = started.get(name);
    if (since === undefined) {
      started.set(name, this.#at);
      return false;
    }
    const end = Number(effect.getComputedTiming().endTime);
    if (this.#at - since >= end) finish(animation);
    else animation.currentTime = this.#at - since;
    return true;
  }

  #animations(): Animation[] {
    try {
      return this.#replayer.iframe.contentDocument?.getAnimations() ?? [];
    } catch {
      return [];
    }
  }
}

// One that never ends can't be finished, and plays on.
function finish(animation: Animation) {
  try {
    animation.finish();
  } catch {}
}
