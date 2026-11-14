// A hand-back compared with one before it, moment by moment. Each page a moment's file reads is a small page, read and
// pictured in Chromium as a moment would leave it.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { Reading } from "@playthrough/page";
import type { Moment } from "@playthrough/change";
import { findingsByThemselves, compare, unsteadyIn, type Recorded } from "../src/compare.ts";
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

// A hand-back of moments, each a list of the pages its file reads, each by its name: the nth is read at n.9 seconds.
async function handBack(number: number, moments: Record<string, [title: string, page: string][]>): Promise<Recorded> {
  const pictures = new Map<string, Buffer>();
  const readings = new Map<string, Reading[]>();
  const kept: Moment[] = [];
  for (const [name, steps] of Object.entries(moments)) {
    const read: Reading[] = [];
    for (const [i, [title, html]] of steps.entries()) {
      await page.setContent(`<style>body { font: 16px sans-serif; margin: 24px }</style>${html}`);
      const picture = `${name}/${i}.png`;
      pictures.set(picture, await page.screenshot({ animations: "disabled", caret: "hide" }));
      read.push({ step: title, at: i + 0.9, picture, ...(await readPage(page)) });
    }
    readings.set(name, read);
    kept.push({ name, length: steps.length + 1, recording: `${name}.json`, from: 0, actions: [] });
  }
  return { number, moments: kept, readings: async (moment) => readings.get(moment.name)!, picture: async (name) => pictures.get(name)! };
}

const invoices = `<h1>Invoices</h1><button>Overdue</button>`;
const withExport = `${invoices}<button>Export</button>`;
const dialog = `${withExport}<div role="dialog" aria-label="Export"><button>Download</button></div>`;

describe("A hand-back compared with one before it", { timeout: 60_000 }, () => {
  test("a moment taken away is a finding; a moment the earlier hand-back didn't have isn't compared with it", async () => {
    const then = await handBack(1, { "See what's overdue": [["Open the invoices", invoices]], "Export them": [["Open the invoices", invoices]] });
    const now = await handBack(2, { "See what's overdue": [["Open the invoices", invoices]], "Export a year": [["Open the invoices", withExport]] });
    const { findings } = await compare(comparing, then, now);
    assert.deepEqual(
      findings.map((finding) => [finding.words, finding.seen]),
      [["“Export them” isn't a moment any more", [{ moment: "Export them" }]]],
    );
  });

  test("the same finding in several moments, or at several times, is one finding, seen in each moment where it first shows", async () => {
    const then = await handBack(1, { "See what's overdue": [["Open the invoices", invoices], ["Show the overdue ones", invoices]], "Export them": [["Open the invoices", invoices]] });
    const now = await handBack(2, { "See what's overdue": [["Open the invoices", invoices], ["Show the overdue ones", withExport]], "Export them": [["Open the invoices", withExport]] });
    const { handBack: number, since, findings } = await compare(comparing, then, now);
    assert.deepEqual([number, since], [2, 1]);
    assert.deepEqual(
      findings.map((finding) => [finding.words, finding.seen.map((seen) => [seen.moment, seen.at])]),
      [["Export button is new", [["See what's overdue", 1.9], ["Export them", 0.9]]]],
    );
  });

  test("a finding is seen where the recording first has it on the screen, not where the page first has it; one never on the screen keeps the first time it's there", async () => {
    const page = (end: string, lower: boolean) => `<h1>Playthrough</h1>${end}<div style="height: 1400px"></div><h2>Try it</h2>${lower ? "<p>Any moment downloads as a video.</p>" : ""}`;
    const read = (end: string, lower: boolean) => [
      ["Read what it is", `${page(end, lower)}<script>scrollTo(0, 0)</script>`],
      ["Read how to try it", `${page(end, lower)}<script>scrollTo(0, document.body.scrollHeight)</script>`],
    ] as [string, string][];
    const then = await handBack(1, { "Read the page": read("<p>Open source.</p>", false), "Glance at the top": read("<p>Open source.</p>", false).slice(0, 1) });
    const now = await handBack(2, { "Read the page": read("<p>Open source, on your machine.</p>", true), "Glance at the top": read("<p>Open source, on your machine.</p>", true).slice(0, 1) });
    const { findings } = await compare(comparing, then, now);
    assert.deepEqual(
      findings.map((finding) => [finding.words, finding.seen.map((seen) => [seen.moment, seen.at])]),
      [
        ["“Open source.” now says “Open source, on your machine.”", [["Read the page", 0.9], ["Glance at the top", 0.9]]],
        ["“Any moment downloads as a video.” is new", [["Read the page", 1.9], ["Glance at the top", 0.9]]],
      ],
    );
  });

  test("a finding only the pictures show, with nothing read there changed, says so: it's the person's to look at, and one Playthrough can name is the agent's to say why of", async () => {
    const shape = (colour: string) => `<div style="width: 300px; height: 120px; background: ${colour}"></div>`;
    const then = await handBack(1, { "Look at the chart": [["Open the chart", `${shape("#c33")}${invoices}`]] });
    const now = await handBack(2, { "Look at the chart": [["Open the chart", `${shape("#33c")}${withExport}`]] });
    const { findings } = await compare(comparing, then, now);
    assert.deepEqual(findings.map((finding) => [finding.words, !!finding.pictureOnly]).sort(), [["Export button is new", false], ["Something near the Invoices heading looks different", true]]);
  });

  test("what changes by itself is left out in every moment, but a part of a picture known only by where it is only in its own: elsewhere the same place is another thing (Kan's invite page)", async () => {
    const shape = (colour: string) => `<h1>Invoices</h1><div style="width: 300px; height: 120px; background: ${colour}"></div>`;
    const first = await handBack(1, { "Look at the chart": [["Open the chart", shape("#c33")]] });
    const byItself = await findingsByThemselves(first, await handBack(1, { "Look at the chart": [["Open the chart", shape("#3a3")]] }));
    const unsteady = byItself.flatMap((finding) => finding.pieces);
    assert.ok(unsteady.length && unsteady.every((piece) => piece.startsWith("here:")), "it's known only by where it is");
    const then = await handBack(1, { "Look at the chart": [["Open the chart", shape("#c33")]], "Print the chart": [["Open the chart", shape("#c33")]] });
    const now = await handBack(2, { "Look at the chart": [["Open the chart", shape("#33c")]], "Print the chart": [["Open the chart", shape("#33c")]] });
    const { findings } = await compare(comparing, then, now, unsteadyIn([{ ...then.moments[0]!, unsteady }, then.moments[1]!]));
    assert.deepEqual(findings.map((finding) => finding.seen.map((seen) => seen.moment)), [["Print the chart"]]);
  });
});
