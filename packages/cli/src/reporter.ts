// Turns each recorded test into a moment: its name, where each step starts in the recording, and how long it is, with what
// was read at the end of each step; and names each one that failed and the step it failed at. It runs inside Playwright,
// so it writes them down, in the folder the run gave it, and says how each went as it ends, in a line of its own, where
// Playwright's list printed a stack.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestError, TestResult, TestStep } from "@playwright/test/reporter";
import type { Glimpse, Reading } from "@playthrough/page";
import { quote, type Moment, type Changes } from "@playthrough/change";
import { assetsOf, type Assets } from "./assets.ts";

export const RECORDING = "playthrough recording";
export const READINGS = "playthrough readings";
export const GLIMPSES = "playthrough glimpses";
export const PICTURE = "playthrough picture";
// A frame of a moment's, pictured by its name: "first", "a-beat-later", "after-1"…, "held".
export const PICTURED = "playthrough frame";
export const ASSETS = "playthrough assets";
export const PERSON = "playthrough person";
export const ACTIONS = "playthrough actions";
export const HOLD = 1500; // the end of a moment holds, so its last state can be seen

// A moment's readings go beside the hand-back's recordings, under the same name, each picture in a folder of its own.
export const readingsOf = (moment: Moment) => `readings/${moment.recording}`;
// As kept: none for a moment recorded before Playthrough read each step.
export async function readingsOn(changes: Changes, change: string, handBack: number, moment: Moment): Promise<Reading[]> {
  const bytes = await changes.file(change, handBack, readingsOf(moment));
  return bytes ? JSON.parse(Buffer.from(bytes).toString()) : [];
}
const picturesOf = (moment: Moment) => `readings/${moment.recording.replace(/\.json$/, "")}`;
// A moment's frames, beside its step's pictures: the page as its step began, at rest ("first"); the same a beat later, with
// nothing done ("a-beat-later"); after each thing it does ("after-1"…); and once its end has held ("held").
export const frameOf = (moment: Moment, name: string) => `${picturesOf(moment)}/${name}.png`;
// And what was glimpsed after each action, beside them.
export const glimpsesOf = (moment: Moment) => `${picturesOf(moment)}.glimpses.json`;

// Why, in Playwright's words: the first line of what it says, and for a wait that ran out, what it was waiting for, from
// the lines under it; as much of it as can be read, which an error's text an app sends back, stack and all, may not be.
export function firstLine(said: string) {
  const lines = said.replace(/\x1b\[[0-9;]*m/g, "").split("\n");
  let line = lines[0]?.trim().replace(/,$/, "") ?? "";
  const waited = /Timeout \d+ms exceeded/.test(line) && lines.map((under) => under.match(/^\s*- (waiting for .+)$/)?.[1]).find(Boolean);
  if (waited) line = `${line.replace(/\.$/, "")}, ${waited}`;
  // A locator that found more than one thing lists them under it: the first two, as Playwright would find each alone.
  const found = line.endsWith(":") ? lines.flatMap((under) => under.match(/^\s*\d+\) .* aka (.+)$/)?.[1] ?? []) : [];
  if (found.length) line = `${line} ${found.slice(0, 2).join(", ")}${found.length > 2 ? ", …" : ""}`;
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}
// Why a step stopped, in Playthrough's words, naming the thing as the moment does: a check that failed says what it
// looked for and what it found ("no link “My cards” was to be seen", "button “Save” was disabled, not enabled"); an
// action that waited in vain, what it was to be done to ("no button “Close” was there to click"). Anything else, as
// Playwright or the app said it, in its first line.
export function whyStopped(said: string): { why: string; checked?: true } {
  const lines = said.replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((line) => line.trim());
  const thing = thingIn(lines.find((line) => line.startsWith("Locator:"))?.slice("Locator:".length) ?? lines.find((line) => line.startsWith("- waiting for "))?.slice("- waiting for ".length));
  const [expected, received] = ["Expected:", "Received:"].map((label) => lines.find((line) => line.startsWith(label))?.slice(label.length).trim());
  const found = received ?? (lines.includes("Error: element(s) not found") ? "nothing" : undefined);
  const was = thing?.startsWith("words ") ? "were" : "was";
  if (thing && expected && found) return { why: found === "nothing" ? `no ${thing} ${was} to be seen` : `${thing} ${was} ${found}, not ${expected}`, checked: true };
  const action = lines[0]?.match(/^TimeoutError: locator\.(\w+): Timeout/)?.[1];
  const doing = action && DOING[action];
  if (thing && doing) return { why: lines.some((line) => line.startsWith("- locator resolved to")) ? `${thing} ${was} there, but couldn't be ${doing[1]}` : `no ${thing} ${was} there to ${doing[0]}` };
  return { why: firstLine(said) };
}
const DOING: Record<string, [string, string]> = {
  click: ["click", "clicked"],
  dblclick: ["double-click", "double-clicked"],
  tap: ["tap", "tapped"],
  hover: ["point at", "pointed at"],
  fill: ["fill in", "filled in"],
  pressSequentially: ["type in", "typed in"],
  press: ["press a key in", "pressed a key in"],
  selectOption: ["choose from", "chosen from"],
  check: ["check", "checked"],
  uncheck: ["uncheck", "unchecked"],
  setChecked: ["check", "checked"],
};
// A locator as a person would name the thing: getByRole('link', { name: 'My cards' }) is link “My cards”.
function thingIn(locator: string | undefined) {
  const found = locator?.trim().match(/^getBy(Role|Text)\((['"])((?:\\.|(?!\2).)*)\2(?:, \{ name: (['"])((?:\\.|(?!\4).)*)\4)?/);
  if (!found) return undefined;
  const plain = (text: string) => text.replace(/\\(.)/g, "$1");
  return found[1] === "Text" ? `words ${quote(plain(found[3]!))}` : found[5] !== undefined ? `${found[3]} ${quote(plain(found[5]))}` : found[3];
}

export type Failed = { moment: string; at?: string; why?: string; checked?: true; broken?: true };
// What Playwright says when the browser stops a moment, not the app: the page crashed or closed, or the app stopped answering.
const BROKEN = /Page crashed|Target crashed|Target page, context or browser has been closed|net::ERR_CONNECTION_REFUSED/;
export type Recorded = { moment: Moment; files: string[] };
// An action as it was done: what it was, as another recording of the moment knows the same action, and when it began and
// was done, by this machine's clock.
export type Acted = { action: string; began: number; at: number };
type Event = { timestamp: number; [field: string]: unknown };

export default class MomentReporter implements Reporter {
  #folder: string;
  #ran: { file: string; line: number; recorded?: Recorded; failed?: Failed }[] = [];

  constructor({ folder }: { folder: string }) {
    this.#folder = folder;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === "skipped") return;
    const where = { file: test.location.file, line: test.location.line };
    const recording = result.attachments.find((attachment) => attachment.name === RECORDING)?.body;
    const read = {
      readings: JSON.parse(result.attachments.find((attachment) => attachment.name === READINGS)?.body?.toString() ?? "[]"),
      glimpses: JSON.parse(result.attachments.find((attachment) => attachment.name === GLIMPSES)?.body?.toString() ?? "[]"),
      pictures: result.attachments.filter((attachment) => attachment.name === PICTURE).map((attachment) => attachment.body!),
      frames: result.attachments.filter((attachment) => attachment.name.startsWith(`${PICTURED} `)).map((attachment) => ({ name: attachment.name.slice(PICTURED.length + 1), body: attachment.body! })),
      assets: JSON.parse(result.attachments.find((attachment) => attachment.name === ASSETS)?.body?.toString() ?? "{}"),
      actions: JSON.parse(result.attachments.find((attachment) => attachment.name === ACTIONS)?.body?.toString() ?? "[]"),
    };
    const steps = result.steps.filter((step) => step.category === "test.step");
    const person = result.attachments.find((attachment) => attachment.name === PERSON)?.body?.toString();
    // Who it's done as, if its file or the app's setup said.
    const as = (made: Recorded) => {
      if (person) made.moment.person = person;
      return made;
    };
    const went = (how: string) => console.log(`  ${quote(test.title)}: ${how}`);
    if (result.status === "passed") {
      if (!recording) return;
      const recorded = as(this.#moment(test.title, recording, read, steps));
      this.#ran.push({ ...where, recorded });
      return went(`to its end, ${Math.round(recorded.moment.length)}s`);
    }

    // It stopped at the step it couldn't do, or after the last one when it failed between them. Stopped by the browser, it
    // says nothing about the app.
    const stop = steps.at(-1);
    const said = (stop?.error ?? result.error)?.message ?? "";
    const broken = BROKEN.test(said);
    const { why, checked } = whyStopped(said);
    this.#ran.push({ ...where, failed: { moment: test.title, ...(stop?.error && { at: stop.title }), ...(why && { why }), ...(checked && { checked }), ...(broken && { broken }) } });
    went(broken ? "the browser stopped it" : stop?.error ? `failed at ${quote(stop.title)}` : "failed before its first step");
  }

  // What stops the run itself, like a moment's file that doesn't load, as Playwright says it.
  onError(error: TestError) {
    console.log(`\n${error.message ?? error.value}`);
  }

  #moment(name: string, recording: Buffer, read: { readings: Omit<Reading, "picture">[]; glimpses: Glimpse[]; pictures: Buffer[]; frames: { name: string; body: Buffer }[]; assets: Assets; actions: Acted[] }, steps: TestStep[]): Recorded {
    const events: Event[] = JSON.parse(recording.toString());
    const start = events[0]!.timestamp;
    const length = seconds(events.at(-1)!.timestamp - start);
    // Where its step starts and what was done are both read from this machine's clock. What it did is what was done in
    // its step, its file's way there done before it; it's shown from where its step starts.
    const since = (time: number) => Math.min(length, seconds(time - start));
    const step = steps[0];
    const inStep = read.actions.filter((done) => step && done.at >= step.startTime.getTime());
    const actions = inStep.map((done) => ({ at: since(done.at), what: done.action, began: since(done.began) }));
    const moment: Moment = { name, length, recording: this.#fileFor(name), from: step ? since(step.startTime.getTime()) : 0, actions };
    const readings: Reading[] = read.readings.map((reading, i) => ({ ...reading, picture: `${picturesOf(moment)}/${i + 1}.png` }));

    // The assets are in the folder already, kept as the page loaded them.
    const glimpses = read.glimpses.filter((glimpse) => glimpse.at <= length);
    const files = [moment.recording, readingsOf(moment), glimpsesOf(moment), ...readings.map((reading) => reading.picture), ...read.frames.map((frame) => frameOf(moment, frame.name)), assetsOf(moment.recording), ...new Set(Object.values(read.assets))];
    for (const folder of [picturesOf(moment), "assets"]) mkdirSync(join(this.#folder, folder), { recursive: true });
    writeFileSync(join(this.#folder, moment.recording), JSON.stringify(events));
    writeFileSync(join(this.#folder, readingsOf(moment)), JSON.stringify(readings));
    writeFileSync(join(this.#folder, glimpsesOf(moment)), JSON.stringify(glimpses));
    writeFileSync(join(this.#folder, assetsOf(moment.recording)), JSON.stringify(read.assets));
    read.pictures.forEach((picture, i) => writeFileSync(join(this.#folder, readings[i]!.picture), picture));
    for (const frame of read.frames) writeFileSync(join(this.#folder, frameOf(moment, frame.name)), frame.body);
    return { moment, files };
  }

  onEnd() {
    const ran = this.#ran.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    writeFileSync(join(this.#folder, "moments.json"), JSON.stringify({ recorded: ran.flatMap((run) => run.recorded ?? []), failed: ran.flatMap((run) => run.failed ?? []) }));
  }

  printsToStdio() {
    return true;
  }

  // Named after the moment, so the files read as what they are.
  #fileFor(name: string): string {
    const base = name.toLowerCase().normalize("NFKD").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "moment";
    const taken = new Set(this.#ran.map((run) => run.recorded?.moment.recording));
    for (let n = 1; ; n++) {
      const file = n === 1 ? `${base}.json` : `${base}-${n}.json`;
      if (!taken.has(file)) return file;
    }
  }
}

export const seconds = (ms: number) => Math.round(Math.max(0, ms)) / 1000;
