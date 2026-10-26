// A round compared with one before it, flow by flow and step by step. Each step's page is a small page, read and
// pictured in Chromium as a step would leave it.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { Reading } from "@mostlyworks/vantage-page";
import type { Flow } from "@mostlyworks/vantage-review";
import { compare, type Recorded } from "../src/compare.ts";
import { readPage } from "../src/read.ts";

let browser: Browser;
let page: Page;
let comparing: Page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  comparing = await browser.newPage();
});
after(() => browser.close());

// A round of flows, each a list of steps and the page each one leaves. Step n starts at n seconds and is read just before
// the next.
async function round(number: number, flows: Record<string, [title: string, page: string][]>): Promise<Recorded> {
  const pictures = new Map<string, Buffer>();
  const readings = new Map<string, Reading[]>();
  const kept: Flow[] = [];
  for (const [name, steps] of Object.entries(flows)) {
    const read: Reading[] = [];
    for (const [i, [title, html]] of steps.entries()) {
      await page.setContent(`<style>body { font: 16px sans-serif; margin: 24px }</style>${html}`);
      const picture = `${name}/${i}.png`;
      pictures.set(picture, await page.screenshot({ animations: "disabled", caret: "hide" }));
      read.push({ step: title, at: i + 0.9, picture, ...(await readPage(page)) });
    }
    readings.set(name, read);
    kept.push({ name, length: steps.length + 1, steps: steps.map(([title], i) => ({ title, at: i })), recording: `${name}.json` });
  }
  return { number, flows: kept, readings: async (flow) => readings.get(flow.name)!, picture: async (name) => pictures.get(name)! };
}

const invoices = `<h1>Invoices</h1><button>Overdue</button>`;
const withExport = `${invoices}<button>Export</button>`;
const dialog = `${withExport}<div role="dialog" aria-label="Export"><button>Download</button></div>`;

describe("A round compared with one before it", { timeout: 60_000 }, () => {
  test("steps only the newer flow takes are New steps, one stretch to the next step both take", async () => {
    const then = await round(0, { "Export them": [["Open the invoices", invoices], ["Export", invoices]] });
    const now = await round(1, { "Export them": [["Open the invoices", invoices], ["Choose a format", invoices], ["Download", invoices], ["Export", invoices]] });
    const { changes } = await compare(comparing, then, now);
    assert.deepEqual(
      changes.map((change) => [change.words, change.seen]),
      [["New steps: “Choose a format” and “Download”", [{ flow: "Export them", at: 1, until: 3 }]]],
    );
  });

  test("a flow Before took only part of is compared as far as it went, and the rest is New steps", async () => {
    const then = await round(0, { "Export them": [["Open the invoices", invoices]] });
    const now = await round(1, { "Export them": [["Open the invoices", withExport], ["Export", dialog]] });
    const { changes } = await compare(comparing, then, now);
    assert.deepEqual(
      changes.map((change) => change.words),
      ["Export button is new", "New steps: “Export”"],
    );
    assert.deepEqual(changes[1]?.seen, [{ flow: "Export them", at: 1, until: 3 }]);
  });

  test("a step the flow doesn't take any more is gone, where it was", async () => {
    const then = await round(1, { "Export them": [["Open the invoices", invoices], ["Pick a quarter", invoices], ["Export", invoices]] });
    const now = await round(2, { "Export them": [["Open the invoices", invoices], ["Export", invoices]] });
    const { changes } = await compare(comparing, then, now);
    assert.deepEqual(
      changes.map((change) => [change.words, change.seen]),
      [["“Pick a quarter” isn't a step here any more", [{ flow: "Export them", at: 1 }]]],
    );
  });

  test("a flow taken away is a change; a flow the earlier round didn't have isn't compared with it", async () => {
    const then = await round(1, { "See what's overdue": [["Open the invoices", invoices]], "Export them": [["Open the invoices", invoices]] });
    const now = await round(2, { "See what's overdue": [["Open the invoices", invoices]], "Export a year": [["Open the invoices", withExport]] });
    const { changes } = await compare(comparing, then, now);
    assert.deepEqual(
      changes.map((change) => [change.words, change.seen]),
      [["“Export them” isn't a flow any more", [{ flow: "Export them" }]]],
    );
  });

  test("the same change in several flows, or at several steps, is one change, seen in each flow where it first shows", async () => {
    const then = await round(0, { "See what's overdue": [["Open the invoices", invoices], ["Show the overdue ones", invoices]], "Export them": [["Open the invoices", invoices]] });
    const now = await round(1, { "See what's overdue": [["Open the invoices", invoices], ["Show the overdue ones", withExport]], "Export them": [["Open the invoices", withExport]] });
    const { round: number, since, changes } = await compare(comparing, then, now);
    assert.deepEqual([number, since], [1, 0]);
    assert.deepEqual(
      changes.map((change) => [change.words, change.seen.map((seen) => [seen.flow, seen.at])]),
      [["Export button is new", [["See what's overdue", 1.9], ["Export them", 0.9]]]],
    );
  });
});
