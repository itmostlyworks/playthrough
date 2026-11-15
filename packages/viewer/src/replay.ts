// One moment's recording, replayed by rrweb in a page of its own and moved to the moment the playhead says: forward a
// little at a time, or rebuilt from its first frame to go back. The page's own motion plays as it plays, holds where
// you pause, and is already over where you jump to. Its pointer and clicks are read from the recording's own
// events, for Playthrough to draw over it.

import { answerAs, pathTo, type Answered } from "@playthrough/page";
import { EventType, IncrementalSource, MouseInteractions, Replayer, type eventWithTime } from "rrweb";
import { changesOf, isStep, FRAME } from "./stepping.ts";

export type Events = eventWithTime[];
export type Rect = { left: number; top: number; width: number; height: number };
export type Scrolled = { x: number; y: number; parts: { path: string; x: number; y: number }[] };

// The screen a recording is on from a moment: a moment handed to someone else carries on on their screen, a phone's
// tapped, with no pointer between taps, so none is drawn.
export type Shape = { from: number; width: number; height: number; touch: boolean };

// What a recording shows besides its page.
export type Recorded = {
  // Its screens in order, the first from its start.
  shapes: Shape[];
  // When each page it shows first appears.
  loads: number[];
  // Where the pointer was, as [seconds, x, y], and when it clicked.
  pointer: [number, number, number][];
  // When the hand was out of the app: in a recording you made by taking a moment over, going to Playthrough's own controls.
  away: [number, number][];
  clicks: number[];
  // What was clicked or typed into, as [seconds, node].
  acted: [number, number][];
  // What was typed into, as [seconds, node].
  typed: [number, number][];
  // What was clicked, and where the pointer was then, as [seconds, node, x, y].
  aimed: [number, number, number, number][];
  // Where the page, or a part of it, was scrolled to, as [seconds, node, x, y].
  scrolls: [number, number, number, number][];
  // The browser's own dialogs, which aren't in the page.
  dialogs: Dialog[];
  // A dropdown's list of options, the browser's too, open until its choice was made.
  choices: Choice[];
  // Where the text cursor was, as [seconds, x, y, height, letters], from when it moved; a height of 0 when nothing was
  // typed into, and in a field, after how many of its letters. Kept by Playthrough while recording, as rrweb keeps none:
  // in an earlier recording there's none, and before 5 Nov, no letters.
  carets: [number, number, number, number, number?][];
  // The keys pressed that do something, as Escape or Enter, never letters typed, and the field each went to, if one did;
  // kept by Playthrough while recording, from 13 Nov.
  keys: Pressed[];
  // Whether the browser it was recorded in was dark, and asked for no motion; light and moving, in a recording that
  // doesn't say, as Playwright's browser is.
  browser: Answered;
};

// A dialog the browser showed, an alert, a confirm or a prompt, from when it showed until it was answered: what it
// says, under where it came from, what a prompt held, and how it was answered.
export type Dialog = { from: number; until: number; type: string; host: string; message: string; value?: string; yes?: boolean };

// A dropdown's list, from when it opened until its choice was made: where its top left was and how wide, in the page's
// pixels, its options and how tall each is, and the one chosen before.
export type Pressed = { at: number; key: string; field?: { x: number; y: number; width: number; height: number } };

export type Choice = { from: number; until: number; x: number; y: number; width: number; options: string[]; row: number; was: number };

function recorded(events: Events): Recorded {
  const start = events[0]?.timestamp ?? 0;
  const seconds = (timestamp: number) => (timestamp - start) / 1000;
  const shown: Recorded = { shapes: [], loads: [], pointer: [], away: [], clicks: [], acted: [], typed: [], aimed: [], scrolls: [], dialogs: [], choices: [], carets: [], keys: [], browser: { dark: false, still: false } };
  let said = false;
  let host = "";
  for (const event of events) {
    if (event.type === EventType.Custom) {
      const { tag, payload } = event.data as { tag: string; payload: { type: string; message: string; value?: string; yes?: boolean } };
      if (tag === "caret") {
        const caret = payload as unknown as { x?: number; y?: number; height?: number; letters?: number };
        shown.carets.push([seconds(event.timestamp), caret.x ?? 0, caret.y ?? 0, caret.height ?? 0, caret.letters]);
      }
      if (tag === "key") shown.keys.push({ at: seconds(event.timestamp), ...(payload as unknown as Omit<Pressed, "at">) });
      if (tag === "dialog") shown.dialogs.push({ from: seconds(event.timestamp), until: Infinity, host, ...payload });
      // Opened and chosen from, it was pressed each time, as a click is.
      if (tag === "choice") {
        const { from: was, ...list } = payload as unknown as Omit<Choice, "until" | "was"> & { from: number };
        shown.choices.push({ ...list, was, from: seconds(event.timestamp), until: Infinity });
        shown.clicks.push(seconds(event.timestamp));
      }
      const choosing = shown.choices.at(-1);
      if (tag === "chose" && choosing?.until === Infinity) {
        choosing.until = seconds(event.timestamp);
        shown.clicks.push(choosing.until);
      }
      if (tag === "browser" && !said) [shown.browser, said] = [{ dark: !!(payload as unknown as Answered).dark, still: !!(payload as unknown as Answered).still }, true];
      const open = shown.dialogs.at(-1);
      if (tag === "dialog answered" && open?.until === Infinity) Object.assign(open, { until: seconds(event.timestamp), yes: payload.yes, ...(payload.value !== undefined && { value: payload.value }) });
    }
    // A page loading says its size; one of another size is someone else's screen.
    if (event.type === EventType.Meta) {
      shown.loads.push(seconds(event.timestamp));
      host = URL.parse(event.data.href)?.host ?? host;
      const { width, height } = event.data;
      const last = shown.shapes.at(-1);
      if (!last || last.width !== width || last.height !== height) shown.shapes.push({ from: last ? seconds(event.timestamp) : 0, width, height, touch: false });
    }
    if (event.type !== EventType.IncrementalSnapshot) continue;
    const data = event.data;
    if (data.source === IncrementalSource.MouseMove) for (const position of data.positions) shown.pointer.push([seconds(event.timestamp + position.timeOffset), position.x, position.y]);
    else if (data.source === IncrementalSource.MouseInteraction && data.x !== undefined && data.y !== undefined) {
      shown.pointer.push([seconds(event.timestamp), data.x, data.y]);
      if (data.type === MouseInteractions.Click) shown.clicks.push(seconds(event.timestamp));
      const shape = shown.shapes.at(-1);
      if (data.type === MouseInteractions.TouchStart && shape) shape.touch = true;
      if (data.type === MouseInteractions.Click) (shown.acted.push([seconds(event.timestamp), data.id]), shown.aimed.push([seconds(event.timestamp), data.id, data.x, data.y]));
    } else if (data.source === IncrementalSource.Input) (shown.acted.push([seconds(event.timestamp), data.id]), shown.typed.push([seconds(event.timestamp), data.id]));
    else if (data.source === IncrementalSource.Scroll) shown.scrolls.push([seconds(event.timestamp), data.id, data.x, data.y]);
  }
  if (!shown.shapes.length) shown.shapes.push({ from: 0, width: 1280, height: 800, touch: false });
  shown.pointer.sort((a, b) => a[0] - b[0]);
  shown.away = awayFrom(shown);
  return shown;
}

// The screen it's on at a moment.
const shapeOf = (shapes: Shape[], at: number): Shape => shapes.findLast((shape) => shape.from <= at) ?? shapes[0]!;

// The hand leaves the app at its edge, or where the pointer is gone a while and comes back by an edge. It's away from
// where it rushed or wandered to that edge, to where it's come in from it again, so neither the dash out nor the dash
// back is drawn.
const EDGE = 2;
const NEAR = 24;
const GONE = 0.4;
const RUSH = 1500;
function awayFrom({ pointer, shapes }: Recorded): [number, number][] {
  // How far from the edge of the screen it's on then.
  const off = (i: number) => {
    const [at, x, y] = pointer[i]!;
    const { width, height } = shapeOf(shapes, at);
    return Math.min(x, y, width - 1 - x, height - 1 - y);
  };
  const fast = (i: number) => {
    const [a, b] = [pointer[i]!, pointer[i + 1]!];
    return Math.hypot(b[1] - a[1], b[2] - a[2]) / Math.max(0.016, b[0] - a[0]) > RUSH;
  };
  const near = (i: number) => off(i) <= NEAR;
  const spans: [number, number][] = [];
  for (let i = 0; i < pointer.length; i++) {
    const out = off(i) <= EDGE;
    const gone = i + 1 < pointer.length && pointer[i + 1]![0] - pointer[i]![0] > GONE && near(i + 1);
    if (!out && !gone) continue;
    let from = i;
    while (from > 0 && (fast(from - 1) || near(from - 1))) from--;
    let to = gone ? i + 1 : i;
    while (to + 1 < pointer.length && (fast(to) || near(to + 1))) to++;
    const span: [number, number] = [pointer[from]![0], pointer[to]![0]];
    const last = spans.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else spans.push(span);
    i = Math.max(i, to);
  }
  return spans;
}

// How long a page shown at rest is given to come to rest, at most, in milliseconds.
const SETTLING = 1500;

// How long the page's motion is taken to run on after the change that set it going, at most, in seconds: shown at a
// step, what began longer ago is over.
const MOTION = 1;
// How long after a change its step is, in milliseconds: the frame after it.
const CHANGE_SHOWN = Math.ceil(FRAME * 1000);

export class Replay {
  readonly host = document.createElement("div");
  readonly shapes: Shape[];
  readonly loads: number[];
  readonly pointer: Recorded["pointer"];
  readonly away: Recorded["away"];
  readonly clicks: number[];
  readonly dialogs: Dialog[];
  readonly choices: Choice[];
  readonly carets: Recorded["carets"];
  readonly keys: Pressed[];
  readonly typed: Recorded["typed"];
  readonly aimed: Recorded["aimed"];
  // The instants its screen changed, in seconds: where stepping rests.
  readonly changes: number[];
  #replayer: Replayer;
  // The screen the page is shown on now, which rrweb changes with it as someone else's page loads.
  #shape: Shape;
  // The page is first drawn a few milliseconds in. Moved to before that, rrweb draws nothing and keeps whatever it
  // showed, so a moment's first frame would show its end.
  #drawn: number;
  #at = -1;
  #scrolls: Recorded["scrolls"];
  #jumpedTo = -Infinity;
  // Until when the page's motion is finished each frame after a jump; one loop at a time does it.
  #settlesUntil = 0;
  #settling = false;
  // The moment the page was last shown at rest, which showing it at rest again doesn't change.
  #rested = NaN;
  // Whether rrweb has changed the page since its animations were last looked at, and how it was playing then: the
  // page's motion only changes where the page does, or the way it plays.
  #changed = true;
  #playing = false;
  #seen = new WeakSet<Animation>();
  // When each element's animations started, by name, in the recording's time. Played a little at a time, rrweb takes
  // what changed out of the page and puts it back, and anything put back starts its animation over: the who-owes-whom
  // box faded in again when the Person menu closed ("It still flashes"), and the open menu itself, as the pointer moved
  // over it. Started again, an animation goes on from where it had got to.
  #started = new WeakMap<Element, Map<string, number>>();
  // Shown at a step: which, when what the page set moving began there, in the recording's milliseconds, and until when
  // it moves after each change, in seconds, once learned.
  #exactAt: number | undefined;
  #began = new WeakMap<Animation, number>();
  #until = new Map<number, number>();

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
    const shows = recorded(events);
    this.changes = changesOf(events);
    ({ shapes: this.shapes, loads: this.loads, pointer: this.pointer, away: this.away, clicks: this.clicks, dialogs: this.dialogs, choices: this.choices, carets: this.carets, keys: this.keys, typed: this.typed, aimed: this.aimed, scrolls: this.#scrolls } = shows);
    this.#drawn = Math.max(0, (events.find((event) => event.type === EventType.FullSnapshot)?.timestamp ?? start) - start + 1);
    this.host.className = "absolute top-0 left-0 origin-top-left [&_.replayer-mouse]:hidden [&_iframe]:pointer-events-none [&_iframe]:block [&_iframe]:border-0";
    this.#shape = this.shapes[0]!;
    Object.assign(this.host.style, { width: `${this.#shape.width}px`, height: `${this.#shape.height}px` });
    this.host.dataset.replay = "";
    into.append(this.host);
    // Jumping, rrweb builds the page in a copy of its own first, and the page's own scroll never reached it: played on
    // from a stop, the page sat at its first scroll for a moment, then jumped down. Built in place, it's where it was.
    // Recorded with no scrollbars, it's played with none, so none takes width its page didn't have. And it's scrolled
    // only where the recording says: the browser's own keeping of what's in view, as the page settles in its first
    // frame, moved Kan's settings pane a pixel off it on some loads and not others.
    this.#replayer = new Replayer(events, {
      root: this.host,
      mouseTail: false,
      triggerFocus: false,
      pauseAnimation: false,
      showWarning: false,
      useVirtualDom: false,
      insertStyleRules: [
        "* { scrollbar-width: none !important; }",
        "::-webkit-scrollbar { display: none !important; }",
        "* { overflow-anchor: none !important; }",
      ],
    });
    (this.#replayer as unknown as { cache: typeof styles }).cache = styles;
    this.#replayer.on("event-cast", () => (this.#changed = true));
    // Light or dark, still or moving, as it was recorded, as the app stepped into is: the page's own styles asked the
    // viewer's browser, and a site recorded light played dark in a dark viewer.
    const page = this.#replayer.iframe.contentWindow as (Window & typeof globalThis) | null;
    if (page) answerAs(page, shows.browser);
    this.#keepKeys();
    this.#replayer.pause(this.#drawn);
  }

  // The page at a moment of its recording, in seconds. Before its start, while the moment's name is up, its first frame.
  // At rest on a step, as that very frame.
  show(at: number, playing: boolean) {
    const ms = Math.max(Math.round(Math.max(0, at) * 1000), this.#drawn);
    if (!playing && isStep(ms / 1000, this.changes)) return void (ms !== this.#exactAt && this.#showExactly(ms));
    this.#exactAt = undefined;
    const moved = ms !== this.#at;
    if (moved) {
      const jumped = this.#at < 0 || ms < this.#at || ms - this.#at > 300;
      if (jumped) this.#started = new WeakMap();
      this.#moveTo(ms);
      if (jumped) this.#settle();
    }
    // A page rebuilt for a jump can start its transitions a frame late, and a dialog centred by its transform slid in
    // from the side: for its first 0.15s after a jump, its motion is over, playing too.
    const settling = ms - this.#jumpedTo < 150;
    if (moved || playing) this.#rested = NaN;
    const looked = this.#changed || settling || playing !== this.#playing || (moved && !playing);
    [this.#changed, this.#playing] = [false, playing];
    if (!looked) return;
    for (const animation of this.#animations()) {
      try {
        if (settling) finish(animation);
        else if (this.#goesOn(animation)) {
          // carried on to where it had got to
        }
        else if (playing) {
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

  #moveTo(ms: number) {
    // rrweb takes what it last played to be as far as it has got, and a pointer's moves are kept together, timed from
    // the first: going back to just after that first, it took itself to be going on, rebuilt nothing, and the page
    // stayed where it was, a dialog closing shown closed a frame after it began to. Going back, it starts again.
    if (ms < this.#at) (this.#replayer as unknown as { service: { state: { context: { lastPlayedEvent: unknown } } } }).service.state.context.lastPlayedEvent = null;
    this.#replayer.pause(ms);
    this.#at = ms;
    this.#scrollBetween(ms / 1000);
    const shape = this.shapeAt(ms / 1000);
    const resized = shape !== this.#shape;
    if (resized) {
      this.#shape = shape;
      Object.assign(this.host.style, { width: `${shape.width}px`, height: `${shape.height}px` });
    }
    this.#fit(resized);
  }

  // The page as it was at a step, its motion where it had got to then, in the recording's own time: what the page set
  // moving is placed by when the change that set it going was. Going back, the page is rebuilt from its first frame all
  // at once, and what moved there would start over or never start, a fade shown at its end: so it's rebuilt to just
  // before the changes of the last second, and those are played onto it one at a time, each setting its motion going as
  // it did. On from a step, only what's new is played on.
  #showExactly(ms: number) {
    // Nothing is finished for it: what the page is doing at this frame is what's shown.
    [this.#settlesUntil, this.#jumpedTo] = [0, -Infinity];
    const along = this.#exactAt !== undefined && this.#exactAt <= ms;
    const changes = this.changes.map((change) => Math.round(change * 1000)).filter((change) => change <= ms);
    let walked = this.#exactAt ?? 0;
    if (!along) {
      const first = changes.find((change) => change > ms - MOTION * 1000);
      walked = Math.max(this.#drawn, first === undefined ? ms : first - CHANGE_SHOWN);
      this.#started = new WeakMap();
      this.#moveTo(walked);
      for (const animation of this.#animations()) this.#began.set(animation, -Infinity);
    }
    const began = (at: number) => {
      for (const animation of this.#animations()) if (!this.#began.has(animation)) this.#began.set(animation, at);
    };
    for (const change of changes) if (change > walked) (this.#moveTo(change), began(change - CHANGE_SHOWN));
    this.#moveTo(ms);
    began(ms);
    for (const animation of this.#animations()) {
      try {
        const since = ms - (this.#began.get(animation) ?? ms);
        const end = Number(animation.effect?.getComputedTiming().endTime);
        if (since === Infinity || since >= end) finish(animation);
        else {
          animation.pause();
          animation.currentTime = since;
        }
      } catch {}
      this.#seen.add(animation);
    }
    [this.#exactAt, this.#rested, this.#playing, this.#changed] = [ms, ms, false, false];
  }

  // Until when, in seconds, the page goes on moving after a change: what's moving as its frame is shown, until it's
  // as good as there. A dialog easing in spends its last third a hair from where it stops, and stepping back through
  // it from the end was a dozen presses that showed nothing. Learned by showing it there, once.
  movingUntil(change: number): number {
    const known = this.#until.get(change);
    if (known !== undefined) return known;
    const ms = Math.round(change * 1000);
    this.#showExactly(ms);
    let until = ms;
    for (const animation of this.#animations()) {
      const began = this.#began.get(animation) ?? -Infinity;
      if (began > -Infinity) until = Math.max(until, began + thereBy(animation));
    }
    this.#until.set(change, until / 1000);
    return until / 1000;
  }

  // Stopping by itself, the page is shown at rest, as after a jump: the stop can come a few hundredths of a second
  // into a dialog opening, and pausing held it there. At rest on a step, it's that frame, motion and all.
  rest() {
    if (this.#rested === this.#at || this.#exactAt === this.#at) return;
    this.#rested = this.#at;
    this.#settle();
    for (const animation of this.#animations()) finish(animation);
  }

  // Once it has come to rest where it's shown: what its jump set moving finished, its fonts and pictures in. Where its
  // things are is read only then, or an outline is drawn where its thing was on its way there.
  async settled(): Promise<void> {
    const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
    const until = performance.now() + SETTLING;
    await frame();
    while (this.#settling && performance.now() < until) await frame();
    const page = this.#replayer.iframe.contentDocument;
    const pictures = [...(page?.images ?? [])].filter((picture) => !picture.complete).map((picture) => new Promise((done) => (picture.addEventListener("load", done, { once: true }), picture.addEventListener("error", done, { once: true }))));
    await Promise.race([Promise.all([page?.fonts.ready, ...pictures]), new Promise((done) => setTimeout(done, Math.max(0, until - performance.now())))]);
    await frame();
    await frame();
  }

  shapeAt(at: number): Shape {
    return shapeOf(this.shapes, at);
  }

  // A scroll is kept every few hundredths of a second, and shown only at those, it stepped down the page at half the
  // screen's rate: between two close together, the page is where it was on its way from one to the other.
  #scrollBetween(at: number) {
    const after = this.#scrolls.findIndex(([when]) => when > at);
    const [a, b] = [this.#scrolls[after - 1], this.#scrolls[after]];
    if (after < 1 || !a || !b || a[1] !== b[1] || b[0] - a[0] > 0.25 || this.loads.some((load) => load > a[0] && load <= b[0])) return;
    const u = (at - a[0]) / (b[0] - a[0]);
    const to: ScrollToOptions = { left: a[2] + (b[2] - a[2]) * u, top: a[3] + (b[3] - a[3]) * u, behavior: "instant" };
    const node = this.#replayer.getMirror().getNode(a[1]);
    const page = this.#replayer.iframe.contentDocument;
    if (node === page || node?.nodeType === Node.DOCUMENT_NODE) this.#replayer.iframe.contentWindow?.scrollTo(to);
    else (node as Element | null)?.scrollTo?.(to);
  }

  // Where the pointer is at a moment, as it moved since `since` at the earliest: until it first moves after that, where
  // it first is.
  pointerAt(at: number, since = 0): [number, number] | undefined {
    const recorded = this.#recordedPointerAt(at, since);
    if (!recorded) return undefined;
    const [dx, dy] = this.#aimedAt(at);
    return [recorded[0] + dx, recorded[1] + dy];
  }

  // Recorded, the pointer goes to the middle of what it clicks; another browser can lay that out elsewhere, as Firefox put
  // Kan's header 42px right of Chromium. So it's moved by as far as what it clicks next, or clicked last, is from where it
  // was then, measured on whichever of what got the click and what holds it, up to the control, it was nearest the middle
  // of, going from one to the next between clicks; nothing where the browser lays it out as it was.
  #aimedAt(at: number): [number, number] {
    const off = (aimed?: Recorded["aimed"][number]): [number, number] | undefined => {
      const node = aimed && (this.#replayer.getMirror().getNode(aimed[1]) as Element | null);
      if (!aimed || !node?.getBoundingClientRect) return undefined;
      const control = node.closest("button, a, input, select, textarea, label, summary, [role]") ?? node;
      let nearest: [number, number] | undefined;
      for (let element: Element | null = node; element; element = element === control ? null : element.parentElement) {
        const box = element.getBoundingClientRect();
        if (!box.width && !box.height) continue;
        const off: [number, number] = [box.x + box.width / 2 - aimed[2], box.y + box.height / 2 - aimed[3]];
        if (!nearest || Math.hypot(...off) < Math.hypot(...nearest)) nearest = off;
      }
      return nearest && Math.hypot(...nearest) < 200 ? nearest : undefined;
    };
    // What's clicked is measured as the page is now, which is only where it was clicked close to the click: a card
    // clicked at the top of a list searched down to it sat lower before the search, and the pointer, pulled towards it
    // there, went down into the table and snapped back as the list changed. So each click's measure counts only near
    // it, fading out within AIMING of it either way.
    const next = this.aimed.findIndex(([when]) => when >= at);
    const [before, after] = next < 0 ? [this.aimed.at(-1), undefined] : [this.aimed[next - 1], this.aimed[next]];
    const near = (aimed: Recorded["aimed"][number] | undefined) => (aimed ? Math.max(0, 1 - Math.abs(at - aimed[0]) / AIMING) : 0);
    const [from, to] = [near(before) && off(before), near(after) && off(after)];
    const [a, b] = [from ? near(before) : 0, to ? near(after) : 0];
    const over = Math.max(1, a + b);
    return [((from ? from[0] * a : 0) + (to ? to[0] * b : 0)) / over, ((from ? from[1] * a : 0) + (to ? to[1] * b : 0)) / over];
  }

  #recordedPointerAt(at: number, since: number): [number, number] | undefined {
    const pointer = this.pointer;
    if (!pointer.length || at < 0 || this.away.some(([from, to]) => at >= from && at <= to)) return undefined;
    let low = 0;
    let high = pointer.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (pointer[middle]![0] <= at) low = middle;
      else high = middle - 1;
    }
    const [a, b] = [pointer[low]!, pointer[low + 1]];
    if (a[0] < since) return b && [b[1], b[2]];
    if (!b || at <= a[0] || b[0] - a[0] > 0.25) return [a[1], a[2]];
    const u = (at - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }

  // The page laid out again in the viewer's browser is told it's as wide as it was recorded, whatever the browser's zoom:
  // at some zooms its window came out a fraction narrower, under the app's own breakpoint at exactly that width, and the
  // app moved its search field to a row of its own.
  #fit(resized: boolean) {
    const frame = this.#replayer.iframe;
    const page = frame.contentWindow;
    const fits = () => !!page?.matchMedia(`(width >= ${this.#shape.width}px)`).matches;
    if (!page || (!resized && fits())) return;
    frame.style.width = "";
    for (let extra = 0.25; extra <= 4 && !fits(); extra += 0.25) frame.style.width = `${this.#shape.width + extra}px`;
  }

  // Typing into a field, the cursor is after as many of its words' letters as it was, as this browser lays them out,
  // which another browser can put elsewhere than where the recording measured it: Firefox laid Kan's header out 42px to
  // the right of Chromium. Recorded before the letters were kept, it's at their end, where typing mostly is.
  #onField(at: number): [number, number, number] | undefined {
    const caret = this.carets.findLast(([when]) => when <= at);
    const typed = this.typed.findLast(([when]) => when <= at);
    if (!caret?.[3] || !typed) return undefined;
    // Into this field since the cursor last came to one.
    const came = this.carets.findLast(([when, , , height], i) => when <= at && height && !this.carets[i - 1]?.[3])?.[0] ?? 0;
    if (typed[0] < came - 0.05) return undefined;
    // Of the replayed page's own window, so not one of this page's inputs: told by its name.
    const field = this.#replayer.getMirror().getNode(typed[1]) as HTMLInputElement | null;
    if (field?.nodeName !== "INPUT" || !field.ownerDocument.defaultView) return undefined;
    const look = field.ownerDocument.defaultView.getComputedStyle(field);
    const measure = field.ownerDocument.createElement("canvas").getContext("2d");
    if (!measure) return undefined;
    measure.font = `${look.fontStyle} ${look.fontWeight} ${look.fontSize} ${look.fontFamily}`;
    const box = field.getBoundingClientRect();
    const height = caret[3];
    const x = box.left + parseFloat(look.borderLeftWidth) + parseFloat(look.paddingLeft) + measure.measureText(field.value.slice(0, caret[4] ?? field.value.length)).width - field.scrollLeft;
    return [x, box.top + (box.height - height) / 2, height];
  }

  // Where the text cursor is at a moment, as x, y and height in the page's own pixels; nothing where nothing is typed into.
  caretAt(at: number): [number, number, number] | undefined {
    const caret = this.carets.findLast(([when]) => when <= at);
    return caret && caret[3] ? [caret[1], caret[2], caret[3]] : undefined;
  }

  // The text cursor drawn over a page shown k times its size from (left, top): as a browser draws it, one of the page's
  // pixels wide and as tall as the letters rather than the line, so it reads as the app's own and not as a mark of ours.
  placeCaret(element: HTMLElement, at: number, left: number, top: number, k: number) {
    const caret = this.#onField(at) ?? this.caretAt(at);
    element.style.opacity = caret ? "1" : "0";
    if (!caret) return;
    const [x, y, height] = caret;
    Object.assign(element.style, { width: `${Math.max(0.75, k)}px`, height: `${(height * 0.8 * k).toFixed(2)}px`, transform: `translate(${((x - left) * k).toFixed(2)}px,${((y + height * 0.1 - top) * k).toFixed(2)}px)` });
  }

  // How far the page is scrolled now, in its own pixels, and each part of it scrolled on its own, as Kan's card is, by
  // the path back to it.
  scrolled(): Scrolled {
    const page = this.#replayer.iframe.contentWindow;
    const parts = [...(page?.document.body?.querySelectorAll("*") ?? [])].filter((part) => part.scrollTop || part.scrollLeft);
    return { x: page?.scrollX ?? 0, y: page?.scrollY ?? 0, parts: parts.map((part) => ({ path: pathTo(part), x: part.scrollLeft, y: part.scrollTop })) };
  }

  // Where one of the page's elements is now, in the page's own pixels, by its node in the recording; nothing while it
  // isn't on the page.
  boxOf(node: number): Rect | undefined {
    const element = this.#replayer.getMirror().getNode(node) as Element | null;
    return rectOf(element?.getBoundingClientRect?.());
  }

  // Where to outline one of the page's elements: around what's seen of it. One that draws nothing of its own, no
  // background, border or shadow, is what's in it: a heading is its words, not the page's width it's laid out across,
  // which outlined the whole width and had Compare frame the whole page. With words, just those words in it, where
  // they're found.
  markOf(node: number, words?: string): Rect | undefined {
    const element = this.#replayer.getMirror().getNode(node) as Element | null;
    if (!element?.getBoundingClientRect) return undefined;
    const found = words ? wordsIn(element, words) : undefined;
    if (found) return rectOf(found.getBoundingClientRect());
    if (drawsItself(element)) return rectOf(element.getBoundingClientRect());
    const inside = element.ownerDocument.createRange();
    inside.selectNodeContents(element);
    return rectOf(inside.getBoundingClientRect()) ?? rectOf(element.getBoundingClientRect());
  }

  // Where a thing is on the page as shown now, by its name alone: the words it says, or what it's labelled, or waits for
  // as a placeholder. A note made in the app names its thing, but its nodes are the app's, not this recording's.
  named(name: string): Rect | undefined {
    const page = this.#replayer.iframe.contentDocument;
    const words = name.replace(/\s+/g, " ").trim();
    if (!page?.body || !words) return undefined;
    const said = (element: Element) =>
      ["aria-label", "placeholder", "data-placeholder", "title", "alt"].some((label) => element.getAttribute(label)?.replace(/\s+/g, " ").trim() === words) || element.textContent?.replace(/\s+/g, " ").trim() === words;
    // A name as long as the app cuts them is the start of its words, read where the app's lines broke: it's said by what
    // starts with it, spaces aside, where nothing says it whole.
    const bare = (text: string) => text.replace(/\s+/g, "");
    const begins = (element: Element) => bare(element.textContent ?? "").startsWith(bare(words));
    // Everything holding the words says them too: the thing is the smallest.
    const all = [...page.body.querySelectorAll("*")];
    const whole = all.filter(said);
    const found = (whole.length || words.length < CUT - 1 ? whole : all.filter(begins)).flatMap((element) => rectOf(element.getBoundingClientRect()) ?? []);
    return found.sort((a, b) => a.width * a.height - b.width * b.height)[0];
  }

  // What's at a point of the page, in its own pixels, and everything holding it, by their nodes in the recording, from it
  // outwards. What's drawn there, whether or not a click could reach it: behind an open menu, a page can make the rest of
  // itself inert, and Kan's board was then one block with no cards in it.
  outwards(x: number, y: number): number[] {
    const page = this.#replayer.iframe.contentDocument;
    const mirror = this.#replayer.getMirror();
    const inert = [...(page?.querySelectorAll("[inert]") ?? [])];
    for (const element of inert) element.removeAttribute("inert");
    const nodes: number[] = [];
    for (let element = page?.elementFromPoint(x, y) ?? null; element && element !== page?.body; element = element.parentElement) nodes.push(mirror.getId(element));
    for (const element of inert) element.setAttribute("inert", "");
    return nodes;
  }

  destroy() {
    this.#replayer.destroy();
    this.host.remove();
  }

  // A recording is never yours to type in: a dialog it opens as a modal would take focus into its page, and your keys
  // with it, so it opens with nothing in it to focus. Its page keeps what's defined on it each time it's rebuilt, never
  // what listens to it.
  #keepKeys() {
    const dialog = (this.#replayer.iframe.contentWindow as (Window & typeof globalThis) | null)?.HTMLDialogElement.prototype;
    if (!dialog) return;
    const showModal = dialog.showModal;
    dialog.showModal = function (this: HTMLDialogElement) {
      this.inert = true;
      showModal.call(this);
    };
  }

  // For 0.4s after a jump, each frame finishes the page's motion, while the recording is still within 0.15s of where it
  // jumped to: paused on the jump, nothing else would redraw it.
  #settle() {
    this.#jumpedTo = this.#at;
    this.#settlesUntil = performance.now() + 400;
    if (this.#settling) return;
    this.#settling = true;
    const tick = () => {
      if (this.#at - this.#jumpedTo >= 150 || performance.now() >= this.#settlesUntil) return void (this.#settling = false);
      for (const animation of this.#animations()) if (animation.playState !== "finished") finish(animation);
      requestAnimationFrame(tick);
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

// How many characters of its words a thing clicked in the app is named by, at most.
const CUT = 80;

// How near a click, in seconds, what it clicked is still where it was clicked: the hand's glide there and its rest.
const AIMING = 1.2;

// rrweb rewrites each of a page's stylesheets for it to show hovering, a few hundredths of a second for an app's, each
// time it builds a page; the recordings of one app carry the same ones, so they're rewritten once, for all of them.
const styles = { stylesWithHoverClass: new Map<string, string>() };

// How far into its motion, in milliseconds, an animation is as good as where it stops: its eased progress all but
// done. One that never ends never is.
const THERE = 0.97;
function thereBy(animation: Animation): number {
  const timing = animation.effect?.getComputedTiming();
  const end = Number(timing?.endTime);
  if (!timing || !Number.isFinite(end) || timing.iterations !== 1) return end;
  const was = animation.currentTime;
  const progress = (at: number) => ((animation.currentTime = at), animation.effect?.getComputedTiming().progress ?? 1);
  let [low, high] = [Number(timing.delay ?? 0), end];
  try {
    while (high - low > 1) {
      const middle = (low + high) / 2;
      if (progress(middle) >= THERE) high = middle;
      else low = middle;
    }
  } finally {
    animation.currentTime = was;
  }
  return high;
}

// One that never ends can't be finished, and plays on.
function finish(animation: Animation) {
  try {
    animation.finish();
  } catch {}
}

// Where words are in an element, as they read: across its text however the page split it, spaces as one, the first time
// they're there.
function wordsIn(element: Element, words: string): Range | undefined {
  const page = element.ownerDocument;
  const walker = page.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const at: [Text, number][] = [];
  let read = "";
  for (let text = walker.nextNode() as Text | null; text; text = walker.nextNode() as Text | null)
    for (let i = 0; i < text.data.length; i++) {
      const space = /\s/.test(text.data[i]!);
      if (space && (read.endsWith(" ") || !read)) continue;
      read += space ? " " : text.data[i];
      at.push([text, i]);
    }
  const start = read.indexOf(words.replace(/\s+/g, " ").trim());
  if (start < 0) return undefined;
  const [first, from] = at[start]!;
  const [last, to] = at[start + words.replace(/\s+/g, " ").trim().length - 1]!;
  const range = page.createRange();
  range.setStart(first, from);
  range.setEnd(last, to + 1);
  return range;
}

const rectOf = (box: DOMRect | undefined): Rect | undefined => (box && (box.width || box.height) ? { left: box.left, top: box.top, width: box.width, height: box.height } : undefined);

// Whether an element is seen as a shape of its own, as a card, a field or a button is, and not only by what's in it.
function drawsItself(element: Element): boolean {
  if (!element.firstChild || element.matches("img, svg, video, canvas, iframe, input, textarea, select, button")) return true;
  const look = getComputedStyle(element);
  const seen = (colour: string) => !/^(transparent|rgba\(.*,\s*0\))$/.test(colour);
  return seen(look.backgroundColor) || look.backgroundImage !== "none" || look.boxShadow !== "none" || ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(look.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && seen(look.getPropertyValue(`border-${side.toLowerCase()}-color`)));
}
