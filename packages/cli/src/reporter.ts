// Turns each recorded test into a flow: its name, where each step starts in the recording, and how long it is, and names
// each one that failed. It runs inside Playwright, so it only writes them down, in the folder the run gave it.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import type { Flow } from "@vantage/review";

export const RECORDING = "vantage recording";

export default class Flows implements Reporter {
  #folder: string;
  #ran: { file: string; line: number; flow?: Flow; failed?: string }[] = [];

  constructor({ folder }: { folder: string }) {
    this.#folder = folder;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const at = { file: test.location.file, line: test.location.line };
    if (["failed", "timedOut", "interrupted"].includes(result.status)) return void this.#ran.push({ ...at, failed: test.title });
    const recording = result.attachments.find((attachment) => attachment.name === RECORDING)?.body;
    if (!recording || result.status !== "passed") return;
    const events: { timestamp: number }[] = JSON.parse(recording.toString());
    const start = events[0]?.timestamp ?? result.startTime.getTime();
    const length = seconds((events.at(-1)?.timestamp ?? start) - start);
    // A step's start and the recording's events are both read from this machine's clock.
    const steps = result.steps
      .filter((step) => step.category === "test.step")
      .map((step) => ({ title: step.title, at: Math.min(length, seconds(step.startTime.getTime() - start)) }));

    const file = this.#fileFor(test.title);
    writeFileSync(join(this.#folder, file), recording);
    this.#ran.push({ ...at, flow: { name: test.title, length, steps, recording: file } });
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
