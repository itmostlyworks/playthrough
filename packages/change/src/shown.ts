// What of a moment's recording is shown: the thing the agent tagged happening, and nothing of the way there, which stays
// kept underneath for stepping in and running it again. The rule is the agent's, as it marks a moment; what's kept is
// where it starts in its recording (`from`), which everything that shows it reads.

import type { Scene } from "./model.ts";

// One thing done on the way to a moment, as the rule reads it: what it was (click, type, fill, press, selectOption; goto
// for a page loaded), the role of what it was done on, and whether it took you to another page: an address gone to
// directly does, and a page loaded that something done before it led to doesn't, as that thing did.
export type Done = { does: string; role?: string; went?: boolean };

// Where a moment starts, as the place in what was done of the first thing it shows (as many as were done: a still); and
// where that can't be told, why: it would show more than one thing happening, or a button brought you here and nothing
// was done since, so it's either pressing the button or what it brought.
export type Start = { at: number; unclear?: "long" | "brought" };

// A moment is one thing happening: past this many things done, it's more than one.
export const MOST_SHOWN = 4;

// What does something where it is, rather than going somewhere: a button that lands on a new page stays in the moment.
const DOING = new Set(["button", "menuitem", "menuitemcheckbox", "menuitemradio", "checkbox", "radio", "switch", "option", "combobox", "textbox", "searchbox", "spinbutton", "slider"]);
const doing = (done: Done) => (done.does === "goto" ? false : done.does === "click" ? !!done.role && DOING.has(done.role) : true);

// It starts where you arrived on the page it ends on, or where the moment before it ended, if that was later. A link
// followed or an address gone to is the way there; a button that took you there is the moment's own.
// A page loaded that something done before it led to (a link followed, a form sent) is that thing's going (its `went`),
// and isn't arriving of its own.
export function startOf(done: Done[], since = 0): Start {
  const arrival = done.findLastIndex((one) => one.went);
  const brought = arrival >= 0 && doing(done[arrival]!);
  const at = Math.max(arrival < 0 ? 0 : brought ? arrival : arrival + 1, since);
  const shown = (from: number) => done.slice(from).filter((one) => one.does !== "goto").length;
  if (brought && at === arrival && shown(arrival + 1) === 0) return { at, unclear: "brought" };
  return { at, ...(shown(at) > MOST_SHOWN && { unclear: "long" }) };
}

// A moment where nothing is done from where it's shown is a still: its picture, with nothing to play.
export const isStill = (scene: Scene) => !scene.steps.some((step) => (step.actions ?? []).some((action) => action >= scene.from));
