// Turns each recorded test into a flow: its name, where each step starts in the recording, and how long it is, and names
// each one that failed and the step it failed at. It runs inside Playwright, so it only writes them down, in the folder
// the run gave it.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import type { Flow } from "@vantage/review";

export const RECORDING = "vantage recording";
export const HOLD = 1500; // the end of a flow holds, so its last state can be seen

export type Failed = { flow: string; at?: string };
type Event = { timestamp: number; [field: string]: unknown };

export default class Flows implements Reporter {
  #folder: string;
  #before: boolean;
  #ran: { file: string; line: number; flow?: Flow; failed?: Failed }[] = [];

  constructor({ folder, before }: { folder: string; before: boolean }) {
    this.#folder = folder;
    this.#before = before;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === "skipped") return;
    const where = { file: test.location.file, line: test.location.line };
    const recording = result.attachments.find((attachment) => attachment.name === RECORDING)?.body;
    const steps = result.steps.filter((step) => step.category === "test.step");
    if (result.status === "passed") return void (recording && this.#ran.push({ ...where, flow: this.#flow(test.title, recording, steps) }));

    // It stopped at the step it couldn't do, or after the last one when it failed between them. On Before, it's kept as
    // far as that: what the app as it was could do.
    const stop = steps.at(-1);
    const kept = stop?.error ? steps.slice(0, -1) : steps;
    const failed = { flow: test.title, ...(stop?.error && { at: stop.title }) };
    if (!this.#before || !recording || !stop || !kept.length) return void this.#ran.push({ ...where, failed });
    const until = stop.startTime.getTime() + (stop.error ? 0 : stop.duration);
    this.#ran.push({ ...where, failed, flow: this.#flow(test.title, recording, kept, until) });
  }

  // A flow cut short ends where it stopped, held as long as any flow's end, with the same last event (rrweb's custom
  // events are type 5).
  #flow(name: string, recording: Buffer, steps: TestStep[], until?: number): Flow {
    let events: Event[] = JSON.parse(recording.toString());
    if (until !== undefined) events = [...events.filter((event) => event.timestamp < until), { type: 5, data: { tag: "end", payload: {} }, timestamp: until + HOLD }];
    const start = events[0]!.timestamp;
    const length = seconds(events.at(-1)!.timestamp - start);
    const file = this.#fileFor(name);
    writeFileSync(join(this.#folder, file), JSON.stringify(events));
    // A step's start and the recording's events are both read from this machine's clock.
    return { name, length, steps: steps.map((step) => ({ title: step.title, at: Math.min(length, seconds(step.startTime.getTime() - start)) })), recording: file };
  }

  onEnd() {
    const ran = this.#ran.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    writeFileSync(join(this.#folder, "flows.json"), JSON.stringify({ recorded: ran.flatMap((run) => run.flow ?? []), failed: ran.flatMap((run) => run.failed ?? []) }));
  }

  printsToStdio() {
    return false;
  }

  // Named after the flow, so the files read as what they are.
  #fileFor(name: string): string {
    const base = name.toLowerCase().normalize("NFKD").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "flow";
    const taken = new Set(this.#ran.map((run) => run.flow?.recording));
    for (let n = 1; ; n++) {
      const file = n === 1 ? `${base}.json` : `${base}-${n}.json`;
      if (!taken.has(file)) return file;
    }
  }
}

const seconds = (ms: number) => Math.round(Math.max(0, ms)) / 1000;
