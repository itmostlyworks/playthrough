// What's kept in an older shape, brought to this one once, as the change is first read by this Playthrough: each file
// as it would have been kept had it been made now, by the rule that read it before, so everything shows as it did.
// Each piece comes back unchanged when it's already in this shape, so bringing a change along twice, or again after it
// stopped half-way, changes nothing more.
//
// Format 2: every moment kept with where it starts, and every moment's way doing its way there before its step; Done
// kept as said; and nothing kept that nothing reads: an older round's accounts, a send's verdicts.

import type { Round, Scene, Send } from "./model.ts";
import { startOf, type Done } from "./shown.ts";

export const FORMAT = 2;

// A moment kept before moments had a start is given the one it was shown from: where the rule starts it in what was
// recorded. One an older `again` gave 0, by its step starting the recording, is given it too.
// A round, its moments each given where it starts, and the accounts older rounds kept of their changes left behind.
export function roundNow({ accounts: _, ...round }: Round & { accounts?: unknown }): Round {
  return { ...round, scenes: round.scenes.map(sceneNow) };
}

export function sceneNow(scene: Older): Scene {
  const step = scene.steps[0];
  const wronglyAtZero = scene.from === 0 && step?.at === 0 && !!step.actions?.length;
  if (scene.from !== undefined && !wronglyAtZero) return scene as Scene;
  return { ...scene, from: Math.round(startedBy(scene) * 1000) / 1000 };
}
type Older = Omit<Scene, "from"> & { from?: number };

// Where the rule for a moment's start (shown.ts's startOf) starts one recorded with everything in its step. Its
// recording knows what each action was (`click link “Settings”`), not where it went: a link followed is taken to go
// somewhere, and nothing else to. Where the rule can't tell, it shows the button that brought you, and all of a long one.
function startedBy(scene: Older): number {
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

// A moment's way kept before moments had a start does everything in its step. Brought along, what was done before where
// it's shown from goes before the step, as the way there, so running it again starts the moment where its step does,
// as it does for every moment marked since. Its things done are read as its recording counted them; where the two
// don't agree, the file is left as it is.
export function wayNow(file: string, scene: Scene): string {
  const lines = file.split("\n");
  const opens = lines.findIndex((line) => line.startsWith("test("));
  const step = lines.findIndex((line) => line.includes("await test.step("));
  if (opens < 0 || step !== opens + 1) return file;
  const ends = lines.findIndex((line, i) => i > step && line === "  });");
  if (ends < 0) return file;
  const body = lines.slice(step + 1, ends);
  const acting = body.flatMap((line, i) => (/^\s*await page\.(?!waitForURL\(|goto\(|evaluate\(|waitForFunction\()/.test(line) ? [i] : []));
  const actions = scene.steps.flatMap((one) => one.actions ?? []);
  if (acting.length !== actions.length) return file;
  const before = actions.filter((at) => at <= scene.from).length;
  if (!before) return file;
  // Up to the first thing it shows; for a still, everything done, and the page it led to, up to what's checked.
  const checked = body.findIndex((line, i) => i > acting.at(-1)! && line.includes("expect("));
  const cut = before < acting.length ? acting[before]! : checked < 0 ? body.length : checked;
  const way = body.slice(0, cut).map((line) => line.replace(/^ {2}/, ""));
  return [...lines.slice(0, step), ...way, lines[step]!, ...body.slice(cut), ...lines.slice(ends)].join("\n");
}

// A send that said Done said every moment of its round looks good, by name, and nothing more; now it says Done.
type OlderSend = Send & { looksGood?: string[]; verdicts?: unknown; takenBack?: unknown };
export function sendNow({ looksGood, verdicts: _, takenBack: __, ...send }: OlderSend, scenes: Scene[]): Send {
  const saidDone = !!looksGood?.length && !send.notes.length && !send.replies?.length && scenes.every((scene) => looksGood.includes(scene.name));
  return { ...send, ...(saidDone && { done: true as const }) };
}
