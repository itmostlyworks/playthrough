// Where you are in the round you're watching, and whether it's playing. It keeps its own time, and only what shows the
// time listens to it, so nothing else on the page redraws while it plays. Scenes play like chapters: each stops at its
// end, and play there goes on into the next. Every recording on screen is moved to the moment it says.

import { useSyncExternalStore } from "react";
import type { Scene } from "@playthrough/review";
import { CARD, clamp, type Moment } from "./moments.ts";

export type Speed = 1 | 0.5 | 0.25;
// A fork off a scene, where a person took it over and carried on by hand: played as a scene of its own, drawn as part of
// the scene it's off, and the moment it leaves it.
export type Forked = Scene & { fork?: string; leaves?: number };

// A fork is a detour: at its end, it comes back to where it left its scene, which plays on from there.
const backFrom = (scene: Scene): Moment | undefined => {
  const { fork, leaves } = scene as Forked;
  return fork === undefined || leaves === undefined ? undefined : { scene: fork, at: leaves };
};
// What waits there, by an id of its own: two can wait at one moment.
export type Stop = { id: string; scene: string; at: number; reached: () => void };
// `stopped` says it stopped by itself on its way past something, rather than being paused.
export type Now = { moment: Moment; playing: boolean; speed: Speed; stopped: boolean };

export class Playhead {
  scenes: Scene[];
  now: Now;
  #scrubbing = false;
  #last = 0;
  #frame = 0;
  #stops: Stop[] = [];
  // The stops already stopped at, at the moment it last stopped: playing on from there stops for each other one there.
  #stoppedFor?: { scene: string; at: number; ids: string[] };
  // Where a moment you asked to see ends, and playing stops by itself, or starts it over when it's on repeat.
  #until?: number;
  #again?: number;
  #listeners = new Set<() => void>();

  constructor(scenes: Scene[], moment: Moment) {
    this.scenes = scenes;
    this.now = { moment, playing: false, speed: 1, stopped: false };
  }

  get scene(): Scene {
    return this.scenes.find((scene) => scene.name === this.now.moment.scene) ?? this.scenes[0]!;
  }

  play() {
    if (this.now.playing || !this.scenes.length) return;
    const scene = this.scene;
    // At a scene's end, play goes on into the next one, from its title; at the last one's end, from the start. A fork
    // off a scene is gone to, never played into, and from its end, play goes back down into its scene.
    if (this.now.moment.at >= scene.length - 0.06) {
      const next = this.scenes.slice(this.scenes.indexOf(scene) + 1).find((scene) => !(scene as Forked).fork) ?? this.scenes[0]!;
      this.#set({ moment: backFrom(scene) ?? { scene: next.name, at: -CARD } });
    }
    this.#last = performance.now();
    this.#set({ playing: true });
    this.#frame = requestAnimationFrame(this.#tick);
  }

  pause() {
    this.#until = this.#again = undefined;
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
    this.#until = this.#again = undefined;
    this.#set({ moment: { scene: this.scene.name, at: clamp(at, -CARD, this.scene.length) } });
  }

  go(moment: Moment) {
    this.#until = this.#again = undefined;
    const scene = this.scenes.find((scene) => scene.name === moment.scene);
    if (scene) this.#set({ moment: { scene: scene.name, at: clamp(moment.at, -CARD, scene.length) } });
  }

  // Another round's scenes, at the moment that matches where you were.
  watch(scenes: Scene[], moment: Moment) {
    this.pause();
    this.scenes = scenes;
    this.go(moment);
  }

  // The same round's scenes again, as the review comes back changed, with a fork kept longer or a round arriving: where
  // you are, and whether it plays, stay as they are.
  keep(scenes: Scene[]) {
    this.scenes = scenes;
  }

  // A moment of a scene played on its own: from where it starts to where it ends, then stopped there.
  run(from: Moment, until: number) {
    this.pause();
    this.go(from);
    this.#until = until;
    this.play();
  }

  // The same, again and again, until it's paused or you go elsewhere.
  repeat(from: Moment, until: number) {
    this.run(from, until);
    this.#again = from.at;
  }

  slower() {
    this.#set({ speed: this.now.speed === 1 ? 0.5 : this.now.speed === 0.5 ? 0.25 : 1 });
  }

  // While you drag along the timeline the picture holds under the pointer, and plays on from where you let go.
  scrub(scrubbing: boolean) {
    this.#scrubbing = scrubbing;
    this.#last = performance.now();
  }

  // Where playing stops by itself on its way past. Playing on from one goes on, stopping first for each other one at
  // that moment, and a moment played on its own (a run) stops only at its end.
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
    const scene = this.scene;
    const was = this.now.moment.at;
    const at = Math.min(scene.length, was + passed * this.now.speed);
    const here = this.#stoppedFor?.scene === scene.name && this.#stoppedFor.at === was ? this.#stoppedFor.ids : undefined;
    const ahead = (stop: Stop) => stop.at > was || (!!here && stop.at === was && !here.includes(stop.id));
    const stop = this.#until === undefined && this.#stops.find((stop) => stop.scene === scene.name && ahead(stop) && stop.at <= at);
    if (stop) {
      cancelAnimationFrame(this.#frame);
      this.#until = undefined;
      this.#stoppedFor = { scene: scene.name, at: stop.at, ids: [...(stop.at === was ? (here ?? []) : []), stop.id] };
      this.#set({ moment: { scene: scene.name, at: stop.at }, playing: false, stopped: true });
      return stop.reached();
    }
    if (this.#until !== undefined && at >= this.#until) {
      if (this.#again !== undefined) return this.#set({ moment: { scene: scene.name, at: this.#again } });
      cancelAnimationFrame(this.#frame);
      const until = this.#until;
      this.#until = undefined;
      return this.#set({ moment: { scene: scene.name, at: until }, playing: false, stopped: true });
    }
    const back = at >= scene.length && this.#until === undefined ? backFrom(scene) : undefined;
    if (back) return this.#set({ moment: back });
    if (at >= scene.length) cancelAnimationFrame(this.#frame);
    this.#set({ moment: { scene: scene.name, at }, playing: at < scene.length });
  };

  #set(change: Partial<Now>) {
    this.now = { ...this.now, stopped: false, ...change };
    for (const listener of this.#listeners) listener();
  }
}

const still = () => () => {};
const nowhere: Now = { moment: { scene: "", at: 0 }, playing: false, speed: 1, stopped: false };

// What a part of the page shows of the playhead, redrawn only when what it picks changes.
export function useNow<T = Now>(playhead: Playhead | undefined, pick: (now: Now) => T = (now) => now as T): T {
  return useSyncExternalStore(playhead?.subscribe ?? still, () => pick(playhead?.now ?? nowhere));
}
