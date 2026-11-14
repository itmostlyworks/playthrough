// Turns each recorded test into a scene: its name, where each step starts in the recording, and how long it is, with what
// was read at the end of each step; and names each one that failed and the step it failed at. It runs inside Playwright,
// so it writes them down, in the folder the run gave it, and says how each went as it ends, in a line of its own, where
// Playwright's list printed a stack.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestError, TestResult, TestStep } from "@playwright/test/reporter";
import type { Glimpse, Reading } from "@playthrough/page";
import { quote, type Scene, type Changes } from "@playthrough/change";
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
export const HOLD = 1500; // the end of a scene holds, so its last state can be seen

// A scene's readings go beside the round's recordings, under the same name, each picture in a folder of its own.
export const readingsOf = (scene: Scene) => `readings/${scene.recording}`;
// As kept: none for a scene recorded before Playthrough read each step.
export async function readingsOn(changes: Changes, change: string, round: number, scene: Scene): Promise<Reading[]> {
  const bytes = await changes.file(change, round, readingsOf(scene));
  return bytes ? JSON.parse(Buffer.from(bytes).toString()) : [];
}
const picturesOf = (scene: Scene) => `readings/${scene.recording.replace(/\.json$/, "")}`;
// A moment's frames, beside its step's pictures: the page as its step began, at rest ("first"); the same a beat later, with
// nothing done ("a-beat-later"); after each thing it does ("after-1"…); and once its end has held ("held").
export const frameOf = (scene: Scene, name: string) => `${picturesOf(scene)}/${name}.png`;
// And what was glimpsed after each action, beside them.
export const glimpsesOf = (scene: Scene) => `${picturesOf(scene)}.glimpses.json`;

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
export type Failed = { scene: string; at?: string; why?: string; broken?: true };
// What Playwright says when the browser stops a scene, not the app: the page crashed or closed, or the app stopped answering.
const BROKEN = /Page crashed|Target crashed|Target page, context or browser has been closed|net::ERR_CONNECTION_REFUSED/;
export type Recorded = { scene: Scene; files: string[] };
// An action as it was done: what it was, as another recording of the scene knows the same action, and when it began and
// was done, by this machine's clock.
export type Acted = { action: string; began: number; at: number };
type Event = { timestamp: number; [field: string]: unknown };

export default class Scenes implements Reporter {
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
      if (person) made.scene.person = person;
      return made;
    };
    const went = (how: string) => console.log(`  ${quote(test.title)}: ${how}`);
    if (result.status === "passed") {
      if (!recording) return;
      const recorded = as(this.#scene(test.title, recording, read, steps));
      this.#ran.push({ ...where, recorded });
      return went(`to its end, ${Math.round(recorded.scene.length)}s`);
    }

    // It stopped at the step it couldn't do, or after the last one when it failed between them. Stopped by the browser, it
    // says nothing about the app.
    const stop = steps.at(-1);
    const said = (stop?.error ?? result.error)?.message ?? "";
    const broken = BROKEN.test(said);
    const why = firstLine(said);
    this.#ran.push({ ...where, failed: { scene: test.title, ...(stop?.error && { at: stop.title }), ...(why && { why }), ...(broken && { broken }) } });
    went(broken ? "the browser stopped it" : stop?.error ? `failed at ${quote(stop.title)}` : "failed before its first step");
  }

  // What stops the run itself, like a scene's file that doesn't load, as Playwright says it.
  onError(error: TestError) {
    console.log(`\n${error.message ?? error.value}`);
  }

  #scene(name: string, recording: Buffer, read: { readings: Omit<Reading, "picture">[]; glimpses: Glimpse[]; pictures: Buffer[]; frames: { name: string; body: Buffer }[]; assets: Assets; actions: Acted[] }, steps: TestStep[]): Recorded {
    const events: Event[] = JSON.parse(recording.toString());
    const start = events[0]!.timestamp;
    const length = seconds(events.at(-1)!.timestamp - start);
    // A step's start and the recording's events are both read from this machine's clock.
    // Each action is the step's it was done in.
    const actionsIn = (step: TestStep, next?: TestStep) => read.actions.filter((done) => done.at >= step.startTime.getTime() && done.at < (next?.startTime.getTime() ?? Infinity));
    const since = (moment: number) => Math.min(length, seconds(moment - start));
    const taken = steps.map((step, i) => {
      const actions = actionsIn(step, steps[i + 1]);
      const done = actions.length ? { actions: actions.map((one) => since(one.at)), began: actions.map((one) => ({ action: one.action, at: since(one.began) })) } : {};
      return { title: step.title, at: since(step.startTime.getTime()), ...done };
    });
    // A moment is shown from where its step starts: its file does its way there first.
    const scene: Scene = { name, length, steps: taken, recording: this.#fileFor(name), from: taken[0]?.at ?? 0 };
    const readings: Reading[] = read.readings.map((reading, i) => ({ ...reading, picture: `${picturesOf(scene)}/${i + 1}.png` }));

    // The assets are in the folder already, kept as the page loaded them.
    const glimpses = read.glimpses.filter((glimpse) => glimpse.at <= length);
    const files = [scene.recording, readingsOf(scene), glimpsesOf(scene), ...readings.map((reading) => reading.picture), ...read.frames.map((frame) => frameOf(scene, frame.name)), assetsOf(scene.recording), ...new Set(Object.values(read.assets))];
    for (const folder of [picturesOf(scene), "assets"]) mkdirSync(join(this.#folder, folder), { recursive: true });
    writeFileSync(join(this.#folder, scene.recording), JSON.stringify(events));
    writeFileSync(join(this.#folder, readingsOf(scene)), JSON.stringify(readings));
    writeFileSync(join(this.#folder, glimpsesOf(scene)), JSON.stringify(glimpses));
    writeFileSync(join(this.#folder, assetsOf(scene.recording)), JSON.stringify(read.assets));
    read.pictures.forEach((picture, i) => writeFileSync(join(this.#folder, readings[i]!.picture), picture));
    for (const frame of read.frames) writeFileSync(join(this.#folder, frameOf(scene, frame.name)), frame.body);
    return { scene, files };
  }

  onEnd() {
    const ran = this.#ran.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    writeFileSync(join(this.#folder, "scenes.json"), JSON.stringify({ recorded: ran.flatMap((run) => run.recorded ?? []), failed: ran.flatMap((run) => run.failed ?? []) }));
  }

  printsToStdio() {
    return true;
  }

  // Named after the scene, so the files read as what they are.
  #fileFor(name: string): string {
    const base = name.toLowerCase().normalize("NFKD").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scene";
    const taken = new Set(this.#ran.map((run) => run.recorded?.scene.recording));
    for (let n = 1; ; n++) {
      const file = n === 1 ? `${base}.json` : `${base}-${n}.json`;
      if (!taken.has(file)) return file;
    }
  }
}

export const seconds = (ms: number) => Math.round(Math.max(0, ms)) / 1000;
