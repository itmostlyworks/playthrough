// What of a moment's recording is shown: the thing the agent tagged happening, and nothing of the way there, which stays
// kept underneath for stepping in and running it again. One rule, for the agent marking a moment and for the page
// showing one kept before moments had a start.

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

// A moment kept before moments had a start (no `from`), shown from where the same rule starts it, in seconds of its
// recording; one with a start, from there. Its recording knows what each action was (`click link “Settings”`), not
// where it went: a link followed is taken to go somewhere, and nothing else to. Where the rule can't tell, it shows the
// button that brought you, and all of a long one.
export function shownFrom(scene: Scene): number {
  if (scene.from !== undefined) return scene.from;
  const step = scene.steps.at(-1);
  const began = step?.began ?? [];
  const ended = step?.actions ?? [];
  // Nothing done at all, it's a still where its end holds.
  if (!began.length) return Math.max(0, scene.length - HELD);
  if (began.length !== ended.length) return 0;
  const { at } = startOf(began.map(({ action }) => doneIn(action)));
  // Nothing done on the page it ends on: a still, from where its end holds, settled, and after the last thing done.
  if (at >= began.length) return Math.min(scene.length, Math.max(ended.at(-1)! + 0.1, scene.length - HELD));
  // A little before the first thing shown, for the pointer to come to it, and never back into the thing before.
  return Math.max(at ? ended[at - 1]! : 0, began[at]!.at - LEAD, 0);
}
const LEAD = 1;
// How long a recording's end holds, as recorded (reporter.ts's HOLD).
const HELD = 1.5;

// An action as a recording names it (`click link “Settings”`, `type textbox “Card prefix”`, `press Enter`), as done.
function doneIn(action: string): Done {
  const [does = "", ...rest] = action.split(" ");
  const role = (does === "press" ? rest.slice(1) : rest)[0];
  return { does, ...(role && !role.startsWith("“") && { role }), went: does === "click" && role === "link" };
}
