// Turns each recorded test into a flow: its name, where each step starts in the recording, and how long it is, with what
// was read at the end of each step; and names each one that failed and the step it failed at. It runs inside Playwright,
// so it only writes them down, in the folder the run gave it.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import type { Reading } from "@mostlyworks/vantage-page";
import type { Flow, Reviews } from "@mostlyworks/vantage-review";
import { assetsOf, type Assets } from "./assets.ts";

export const RECORDING = "vantage recording";
export const READINGS = "vantage readings";
export const PICTURE = "vantage picture";
export const ASSETS = "vantage assets";
export const PERSON = "vantage person";
export const HOLD = 1500; // the end of a flow holds, so its last state can be seen

// A flow's readings go beside the round's recordings, under the same name, each picture in a folder of its own.
export const readingsOf = (flow: Flow) => `readings/${flow.recording}`;
// As kept: none for a flow recorded before Vantage read each step.
export async function readingsOn(reviews: Reviews, review: string, round: number, flow: Flow): Promise<Reading[]> {
  const bytes = await reviews.file(review, round, readingsOf(flow));
  return bytes ? JSON.parse(Buffer.from(bytes).toString()) : [];
}
const picturesOf = (flow: Flow) => `readings/${flow.recording.replace(/\.json$/, "")}`;

// Why, in Playwright's words: the first line of what it says.
export type Failed = { flow: string; at?: string; why?: string; broken?: true };
// What Playwright says when the browser stops a flow, not the app: the page crashed or closed, or the app stopped answering.
const BROKEN = /Page crashed|Target crashed|Target page, context or browser has been closed|net::ERR_CONNECTION_REFUSED/;
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
      assets: JSON.parse(result.attachments.find((attachment) => attachment.name === ASSETS)?.body?.toString() ?? "{}"),
    };
    const steps = result.steps.filter((step) => step.category === "test.step");
    const person = result.attachments.find((attachment) => attachment.name === PERSON)?.body?.toString();
    // Who it acts as, if the app's setup said.
    const as = (made: Recorded) => (person && (made.flow.person = person), made);
    if (result.status === "passed") return void (recording && this.#ran.push({ ...where, recorded: as(this.#flow(test.title, recording, read, steps)) }));

    // It stopped at the step it couldn't do, or after the last one when it failed between them. On Before, it's kept as
    // far as that: what the app as it was could do. Stopped by the browser, it says nothing about the app, so it failed.
    const stop = steps.at(-1);
    const kept = stop?.error ? steps.slice(0, -1) : steps;
    const said = (stop?.error ?? result.error)?.message ?? "";
    const broken = BROKEN.test(said);
    const why = said.replace(/\x1b\[[0-9;]*m/g, "").split("\n")[0]?.trim();
    const failed: Failed = { flow: test.title, ...(stop?.error && { at: stop.title }), ...(why && { why }), ...(broken && { broken }) };
    if (!this.#before || broken || !recording || !stop || !kept.length) return void this.#ran.push({ ...where, failed });
    const until = stop.startTime.getTime() + (stop.error ? 0 : stop.duration);
    const recorded = as(this.#flow(test.title, recording, read, kept, until));
    if (stop.error) recorded.flow.stopped = stop.title;
    this.#ran.push({ ...where, failed, recorded });
  }

  // A flow cut short ends where it stopped, held as long as any flow's end, with the same last event (rrweb's custom
  // events are type 5). The step it stopped at left nothing to read.
  #flow(name: string, recording: Buffer, read: { readings: Omit<Reading, "picture">[]; pictures: Buffer[]; assets: Assets }, steps: TestStep[], until?: number): Recorded {
    let events: Event[] = JSON.parse(recording.toString());
    if (until !== undefined) events = [...events.filter((event) => event.timestamp < until), { type: 5, data: { tag: "end", payload: {} }, timestamp: until + HOLD }];
    const start = events[0]!.timestamp;
    const length = seconds(events.at(-1)!.timestamp - start);
    // A step's start and the recording's events are both read from this machine's clock.
    const flow: Flow = { name, length, steps: steps.map((step) => ({ title: step.title, at: Math.min(length, seconds(step.startTime.getTime() - start)) })), recording: this.#fileFor(name) };
    const readings: Reading[] = read.readings.map((reading, i) => ({ ...reading, picture: `${picturesOf(flow)}/${i + 1}.png` }));

    // The assets are in the folder already, kept as the page loaded them.
    const files = [flow.recording, readingsOf(flow), ...readings.map((reading) => reading.picture), assetsOf(flow.recording), ...new Set(Object.values(read.assets))];
    for (const folder of [picturesOf(flow), "assets"]) mkdirSync(join(this.#folder, folder), { recursive: true });
    writeFileSync(join(this.#folder, flow.recording), JSON.stringify(events));
    writeFileSync(join(this.#folder, readingsOf(flow)), JSON.stringify(readings));
    writeFileSync(join(this.#folder, assetsOf(flow.recording)), JSON.stringify(read.assets));
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
