// What a moment's page is doing, as one value: which moment, where its recording rests, and the one thing happening on
// it. Every press is an action on it, carrying where the recording has got to, so whatever stops it playing stops it
// there; and one rule says what may be pressed, which the keys and the buttons alike ask.

import type { Note } from "@playthrough/change";
import type { Rect } from "./replay.ts";

// A note being written: the spot it was asked for at, and the thing there where the app said where it is, in the
// recording's pixels.
export type Writing = { note: Note; spot: { x: number; y: number }; box?: Rect };

export type Mode =
  // Still, at its end, or wherever it was paused.
  | { is: "resting" }
  | { is: "playing"; until: number }
  | { is: "a note open"; note: string }
  // Note pressed: pointing at what it's on.
  | { is: "pointing" }
  | { is: "writing"; writing: Writing }
  // Beside how it was when you last saw it, still or played together.
  | { is: "comparing"; playing?: { until: number } }
  // Step in pressed, the app on its way.
  | { is: "getting there"; since: number }
  // The app yours, pointing or writing there as on the recording.
  | { is: "the app yours"; since: number; pointing?: true; writing?: Writing };

// `starts` is where what's shown of the moment starts, `end` where it ends; `at` where it rests, and stepped in, where
// it was stepped into; `along`, compared, how far along both it rests.
export type Page = { scene: string; starts: number; end: number; at: number; along?: number; mode: Mode };

// A moment arrived at: at rest on its end, or with a note open.
export const arrived = (scene: string, starts: number, end: number, open?: string): Page => ({ scene, starts, end, at: end, mode: open ? { is: "a note open", note: open } : { is: "resting" } });

export type Action =
  | { type: "moment"; scene: string; starts: number; end: number; open?: string }
  | { type: "play" }
  // Played to where it was going, on its own.
  | { type: "played" }
  // At rest somewhere else: paused part-way, or a note on the moment as it is now opened, at its end.
  | { type: "rest"; at: number }
  | { type: "note" }
  | { type: "pointed"; writing: Writing }
  | { type: "written" }
  | { type: "open"; note: string }
  | { type: "close" }
  | { type: "compare" }
  | { type: "step in"; since: number }
  | { type: "yours" }
  // Back, or Escape; or, for one step in, the app couldn't be made ready.
  | { type: "back"; since?: number };

// Where the recording has got to as it's pressed, and how far along both, compared.
export type Now = { now: number; along: number };

const playing = (mode: Mode) => mode.is === "playing" || (mode.is === "comparing" && !!mode.playing);
const stepped = (mode: Mode) => mode.is === "getting there" || mode.is === "the app yours";

export function reduce(page: Page, action: Action & Now): Page {
  const { mode } = page;
  // Whatever stops it playing stops it where it has got to.
  const stopped: Page = playing(mode) ? { ...page, at: action.now, along: mode.is === "comparing" ? action.along : undefined } : page;
  const resting: Page = { ...stopped, mode: { is: "resting" } };
  switch (action.type) {
    case "moment":
      return arrived(action.scene, action.starts, action.end, action.open);
    case "play": {
      if (playing(mode)) return { ...stopped, mode: mode.is === "comparing" ? { is: "comparing" } : { is: "resting" } };
      // Played, it carries on from where it rests, or from where what's shown starts if it rests at its end or before.
      const from = page.at >= page.end - 0.02 || page.at < page.starts ? page.starts : page.at;
      const along = from === page.at ? page.along : undefined;
      const until = { until: page.end };
      return { ...page, at: from, along, mode: mode.is === "comparing" ? { is: "comparing", playing: until } : { is: "playing", ...until } };
    }
    case "played":
      if (mode.is === "playing") return { ...page, at: mode.until, mode: { is: "resting" } };
      if (mode.is === "comparing" && mode.playing) return { ...page, at: mode.playing.until, along: action.along, mode: { is: "comparing" } };
      return page;
    case "rest":
      return { ...(playing(mode) ? resting : page), at: action.at, along: undefined };
    case "note":
      if (mode.is === "the app yours") return { ...page, mode: { ...mode, pointing: mode.pointing ? undefined : true } };
      return { ...stopped, mode: mode.is === "pointing" ? { is: "resting" } : { is: "pointing" } };
    case "pointed":
      if (mode.is === "the app yours") return { ...page, mode: { is: "the app yours", since: mode.since, writing: action.writing } };
      return { ...page, mode: { is: "writing", writing: action.writing } };
    case "written":
      if (mode.is === "the app yours") return { ...page, mode: { is: "the app yours", since: mode.since } };
      return mode.is === "writing" ? resting : page;
    case "open":
      return { ...stopped, mode: mode.is === "a note open" && mode.note === action.note ? { is: "resting" } : { is: "a note open", note: action.note } };
    case "close":
      return mode.is === "a note open" ? resting : page;
    case "compare":
      return { ...stopped, mode: mode.is === "comparing" ? { is: "resting" } : { is: "comparing" } };
    case "step in":
      return { ...stopped, mode: { is: "getting there", since: action.since } };
    case "yours":
      return mode.is === "getting there" ? { ...page, mode: { is: "the app yours", since: mode.since } } : page;
    case "back":
      if (action.since !== undefined && !(mode.is === "getting there" && mode.since === action.since)) return page;
      // A note being written there is still being written, back on the recording.
      if (mode.is === "the app yours" && mode.writing) return { ...page, mode: { is: "writing", writing: mode.writing } };
      return stepped(mode) ? resting : page;
  }
}

// What's known of the moment beside the page: whether it's a still, whether its recording is ready to play, whether
// there's a look to compare with, whether the note open is on a frame of its own, somewhere the app can't be taken to.
export type Facts = { still: boolean; ready: boolean; compares: boolean; elsewhere: boolean };

// What may be pressed now. Stepping in, everything that drives the recording rests, and only the app, Note and Back
// answer; writing, nothing but the note.
export function can(page: Page, facts: Facts) {
  const { mode } = page;
  const writing = mode.is === "writing" || (mode.is === "the app yours" && !!mode.writing);
  const away = stepped(mode);
  return {
    play: !away && !writing && !facts.still && facts.ready,
    // Pressed again while it's getting there, Step in does nothing: Back and Escape stop it.
    stepIn: !away && !writing && !facts.elsewhere,
    back: mode.is === "getting there" || (mode.is === "the app yours" && !writing),
    note: !writing && mode.is !== "getting there" && mode.is !== "comparing" && mode.is !== "a note open",
    compare: facts.compares && !away && !writing,
    // On to another moment, or to another note on this one.
    move: !away && !writing,
  };
}

// The page's words for what it's doing, as the bar and the recording ask them.
export const isPlaying = playing;
export const isStepped = stepped;
