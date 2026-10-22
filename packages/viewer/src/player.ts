// One flow's recording, played back. It keeps its own time, and only what shows the time listens to it, so nothing else
// on the page redraws while it plays.

import { useSyncExternalStore } from "react";
import { EventType, Replayer, type eventWithTime } from "rrweb";

export type Events = eventWithTime[];

export class Player {
  length: number;
  width: number;
  height: number;
  #replayer: Replayer;
  #time = 0;
  #playing = false;
  #frame = 0;
  #listeners = new Set<() => void>();

  constructor(events: Events, host: HTMLElement, length: number) {
    const size = events.find((event) => event.type === EventType.Meta)?.data as { width?: number; height?: number } | undefined;
    this.width = size?.width ?? 1280;
    this.height = size?.height ?? 800;
    this.length = length;
    this.#replayer = new Replayer(events, { root: host, mouseTail: false, showWarning: false, triggerFocus: false });
    this.#replayer.on("finish", () => {
      this.#playing = false;
      this.#time = this.length;
      this.#changed();
    });
    this.#replayer.pause(0);
  }

  get time() {
    return this.#time;
  }

  get playing() {
    return this.#playing;
  }

  play() {
    if (this.#playing) return;
    if (this.#time >= this.length - 0.05) this.#time = 0;
    this.#playing = true;
    this.#replayer.play(this.#time * 1000);
    const tick = () => {
      if (!this.#playing) return;
      this.#time = Math.min(this.length, this.#replayer.getCurrentTime() / 1000);
      this.#changed();
      this.#frame = requestAnimationFrame(tick);
    };
    tick();
  }

  pause() {
    if (!this.#playing) return;
    this.#playing = false;
    cancelAnimationFrame(this.#frame);
    this.#replayer.pause();
    this.#time = Math.min(this.length, this.#replayer.getCurrentTime() / 1000);
    this.#changed();
  }

  toggle() {
    if (this.#playing) this.pause();
    else this.play();
  }

  seek(seconds: number) {
    this.#time = Math.max(0, Math.min(this.length, seconds));
    if (this.#playing) this.#replayer.play(this.#time * 1000);
    else this.#replayer.pause(this.#time * 1000);
    this.#changed();
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  destroy() {
    this.#playing = false;
    cancelAnimationFrame(this.#frame);
    this.#listeners.clear();
    this.#replayer.destroy();
  }

  #changed() {
    for (const listener of this.#listeners) listener();
  }
}

const still = () => () => {};

export function useTime(player: Player | undefined): number {
  return useSyncExternalStore(player?.subscribe ?? still, () => player?.time ?? 0);
}

export function usePlaying(player: Player | undefined): boolean {
  return useSyncExternalStore(player?.subscribe ?? still, () => player?.playing ?? false);
}
