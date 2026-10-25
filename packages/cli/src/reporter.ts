// Turns each recorded test into a flow: its name, where each step starts in the recording, and how long it is, with what
// was read at the end of each step; and names each one that failed and the step it failed at. It runs inside Playwright,
// so it only writes them down, in the folder the run gave it.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import type { Flow } from "@vantage/review";
import type { Reading } from "./read.ts";

export const RECORDING = "vantage recording";
export const READINGS = "vantage readings";
export const PICTURE = "vantage picture";
export const HOLD = 1500; // the end of a flow holds, so its last state can be seen

// A flow's readings go beside the round's recordings, under the same name, each picture in a folder of its own.
export const readingsOf = (flow: Flow) => `readings/${flow.recording}`;
const picturesOf = (flow: Flow) => `readings/${flow.recording.replace(/\.json$/, "")}`;

export type Failed = { flow: string; at?: string };
export type Recorded = { flow: Flow; files: string[] };
type Event = { timestamp: number; [field: string]: unknown };

export default class Flows implements Reporter {
  #folder: string;
  #before: boolean;
  #taken: string[];
  #ran: { file: string; line: number; recorded?: Recorded; failed?: Failed }[] = [];

  constructor({ folder, before, taken }: { folder: string; before: boolean; taken: string[] }) {
    this.#folder = folder;
    this.#before = before;
    this.#taken = taken;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === "skipped") return;
    const where = { file: test.location.file, line: test.location.line };
    const recording = result.attachments.find((attachment) => attachment.name === RECORDING)?.body;
    const read = {
      readings: JSON.parse(result.attachments.find((attachment) => attachment.name === READINGS)?.body?.toString() ?? "[]"),
      pictures: result.attachments.filter((attachment) => attachment.name === PICTURE).map((attachment) => attachment.body!),
    };
    const steps = result.steps.filter((step) => step.category === "test.step");
    if (result.status === "passed") return void (recording && this.#ran.push({ ...where, recorded: this.#flow(test.title, recording, read, steps) }));

    // It stopped at the step it couldn't do, or after the last one when it failed between them. On Before, it's kept as
    // far as that: what the app as it was could do.
    const stop = steps.at(-1);
    const kept = stop?.error ? steps.slice(0, -1) : steps;
    const failed = { flow: test.title, ...(stop?.error && { at: stop.title }) };
    if (!this.#before || !recording || !stop || !kept.length) return void this.#ran.push({ ...where, failed });
    const until = stop.startTime.getTime() + (stop.error ? 0 : stop.duration);
    this.#ran.push({ ...where, failed, recorded: this.#flow(test.title, recording, read, kept, until) });
  }

  // A flow cut short ends where it stopped, held as long as any flow's end, with the same last event (rrweb's custom
  // events are type 5). The step it stopped at left nothing to read.
  #flow(name: string, recording: Buffer, read: { readings: Omit<Reading, "picture">[]; pictures: Buffer[] }, steps: TestStep[], until?: number): Recorded {
    let events: Event[] = JSON.parse(recording.toString());
    if (until !== undefined) events = [...events.filter((event) => event.timestamp < until), { type: 5, data: { tag: "end", payload: {} }, timestamp: until + HOLD }];
    const start = events[0]!.timestamp;
    const length = seconds(events.at(-1)!.timestamp - start);
    // A step's start and the recording's events are both read from this machine's clock.
    const flow: Flow = { name, length, steps: steps.map((step) => ({ title: step.title, at: Math.min(length, seconds(step.startTime.getTime() - start)) })), recording: this.#fileFor(name) };
    const readings: Reading[] = read.readings.map((reading, i) => ({ ...reading, picture: `${picturesOf(flow)}/${i + 1}.png` }));

    const files = [flow.recording, readingsOf(flow), ...readings.map((reading) => reading.picture)];
    mkdirSync(join(this.#folder, picturesOf(flow)), { recursive: true });
    writeFileSync(join(this.#folder, flow.recording), JSON.stringify(events));
    writeFileSync(join(this.#folder, readingsOf(flow)), JSON.stringify(readings));
    read.pictures.forEach((picture, i) => writeFileSync(join(this.#folder, readings[i]!.picture), picture));
    return { flow, files };
  }

  onEnd() {
    const ran = this.#ran.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    writeFileSync(join(this.#folder, "flows.json"), JSON.stringify({ recorded: ran.flatMap((run) => run.recorded ?? []), failed: ran.flatMap((run) => run.failed ?? []) }));
  }

  printsToStdio() {
    return false;
  }

  // Named after the flow, so the files read as what they are.
  #fileFor(name: string): string {
    const base = name.toLowerCase().normalize("NFKD").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "flow";
    const taken = new Set([...this.#taken, ...this.#ran.map((run) => run.recorded?.flow.recording)]);
    for (let n = 1; ; n++) {
      const file = n === 1 ? `${base}.json` : `${base}-${n}.json`;
      if (!taken.has(file)) return file;
    }
  }
}

export const seconds = (ms: number) => Math.round(Math.max(0, ms)) / 1000;
