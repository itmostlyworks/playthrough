// Where you are in the round you're watching, and whether it's playing. It keeps its own time, and only what shows the
// time listens to it, so nothing else on the page redraws while it plays. Flows play like chapters: each stops at its
// end, and play there goes on into the next. Every recording on screen is moved to the moment it says.

import { useSyncExternalStore } from "react";
import type { Flow } from "@vantage/review";
import { CARD, clamp, type Moment } from "./moments.ts";

export type Speed = 1 | 0.5 | 0.25;
export type Stop = { flow: string; at: number; reached: () => void };
// `stopped` says it stopped by itself on its way past something, rather than being paused.
export type Now = { moment: Moment; playing: boolean; speed: Speed; stopped: boolean };

export class Playhead {
  flows: Flow[];
  now: Now;
  #scrubbing = false;
  #last = 0;
  #frame = 0;
  #stops: Stop[] = [];
  // Where a moment you asked to see ends, and playing stops by itself.
  #until?: number;
  #listeners = new Set<() => void>();

  constructor(flows: Flow[], moment: Moment) {
    this.flows = flows;
    this.now = { moment, playing: false, speed: 1, stopped: false };
  }

  get flow(): Flow {
    return this.flows.find((flow) => flow.name === this.now.moment.flow) ?? this.flows[0]!;
  }

  play() {
    if (this.now.playing || !this.flows.length) return;
    const flow = this.flow;
    // At a flow's end, play goes on into the next one, from its title; at the last one's end, from the start.
    if (this.now.moment.at >= flow.length - 0.06) {
      const next = this.flows[this.flows.indexOf(flow) + 1] ?? this.flows[0]!;
      this.#set({ moment: { flow: next.name, at: -CARD } });
    }
    this.#last = performance.now();
    this.#set({ playing: true });
    this.#frame = requestAnimationFrame(this.#tick);
  }

  pause() {
    this.#until = undefined;
    if (!this.now.playing) return;
    cancelAnimationFrame(this.#frame);
    this.#set({ playing: false });
  }

  toggle() {
    if (this.now.playing) this.pause();
    else this.play();
  }

  // Seeking while playing keeps playing.
  seek(at: number) {
    this.#until = undefined;
    this.#set({ moment: { flow: this.flow.name, at: clamp(at, -CARD, this.flow.length) } });
  }

  go(moment: Moment) {
    this.#until = undefined;
    const flow = this.flows.find((flow) => flow.name === moment.flow);
    if (flow) this.#set({ moment: { flow: flow.name, at: clamp(moment.at, -CARD, flow.length) } });
  }

  // Another round's flows, at the moment that matches where you were.
  watch(flows: Flow[], moment: Moment) {
    this.pause();
    this.flows = flows;
    this.go(moment);
  }

  // A moment of a flow played on its own: from where it starts to where it ends, then stopped there.
  run(from: Moment, until: number) {
    this.pause();
    this.go(from);
    this.#until = until;
    this.play();
  }

  slower() {
    this.#set({ speed: this.now.speed === 1 ? 0.5 : this.now.speed === 0.5 ? 0.25 : 1 });
  }

  // While you drag along the timeline the picture holds under the pointer, and plays on from where you let go.
  scrub(scrubbing: boolean) {
    this.#scrubbing = scrubbing;
    this.#last = performance.now();
  }

  // Where playing stops by itself on its way past. Playing on from one goes on.
  stopAt(stops: Stop[]) {
    this.#stops = stops;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };

  destroy() {
    cancelAnimationFrame(this.#frame);
    this.#listeners.clear();
  }

  #tick = (now: number) => {
    // Never backwards: a frame's time can be from just before play was pressed.
    const passed = clamp((now - this.#last) / 1000, 0, 0.1);
    this.#last = Math.max(this.#last, now);
    this.#frame = requestAnimationFrame(this.#tick);
    if (this.#scrubbing) return;
    const flow = this.flow;
    const was = this.now.moment.at;
    const at = Math.min(flow.length, was + passed * this.now.speed);
    const stop = this.#stops.find((stop) => stop.flow === flow.name && stop.at > was && stop.at <= at);
    if (stop) {
      cancelAnimationFrame(this.#frame);
      this.#until = undefined;
      this.#set({ moment: { flow: flow.name, at: stop.at }, playing: false, stopped: true });
      return stop.reached();
    }
    if (this.#until !== undefined && at >= this.#until) {
      cancelAnimationFrame(this.#frame);
      const until = this.#until;
      this.#until = undefined;
      return this.#set({ moment: { flow: flow.name, at: until }, playing: false, stopped: true });
    }
    if (at >= flow.length) cancelAnimationFrame(this.#frame);
    this.#set({ moment: { flow: flow.name, at }, playing: at < flow.length });
  };

  #set(change: Partial<Now>) {
    this.now = { ...this.now, stopped: false, ...change };
    for (const listener of this.#listeners) listener();
  }
}

const still = () => () => {};
const nowhere: Now = { moment: { flow: "", at: 0 }, playing: false, speed: 1, stopped: false };

// What a part of the page shows of the playhead, redrawn only when what it picks changes.
export function useNow<T = Now>(playhead: Playhead | undefined, pick: (now: Now) => T = (now) => now as T): T {
  return useSyncExternalStore(playhead?.subscribe ?? still, () => pick(playhead?.now ?? nowhere));
}
