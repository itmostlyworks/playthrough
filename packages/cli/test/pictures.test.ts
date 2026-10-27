// What only the pictures show: the same moment in two rounds, read and pictured in Chromium, where the reading finds
// nothing. Each promise is two small pages.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { Reading } from "@mostlyworks/vantage-page";
import { picturesAt } from "../src/pictures.ts";
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

async function moment(html: string, scrolled = 0): Promise<{ reading: Reading; picture: Buffer }> {
  await page.setContent(`<style>body { font: 16px sans-serif; margin: 24px }</style>${html}`);
  if (scrolled) await page.evaluate((y) => scrollTo(0, y), scrolled);
  return { reading: { step: "Open the invoices", at: 1, picture: "", ...(await readPage(page)) }, picture: await page.screenshot({ animations: "disabled", caret: "hide" }) };
}
async function said(then: string, now: string, scrolled = 0): Promise<string[]> {
  const [a, b] = [await moment(then), await moment(now, scrolled)];
  return (await picturesAt(comparing, a.reading, b.reading, { then: a.picture, now: b.picture })).map((change) => change.words);
}

describe("What only the pictures show", { timeout: 60_000 }, () => {
  test("the same pictures show nothing", async () => {
    const page = `<h1>Invoices</h1><p>INV-1043</p>`;
    assert.deepEqual(await said(page, page), []);
  });

  test("something with no words that looks different is a change, named by what's near it", async () => {
    const chart = (colour: string) => `<h2>Spending</h2><div style="width: 200px; height: 40px; background: ${colour}"></div>`;
    assert.deepEqual(await said(chart("#4a8"), chart("#a48")), ["Something near the Spending heading looks different"]);
  });

  test("a ring drawn just outside a control is that control's, not something near it (person-filter's Person menu)", async () => {
    const menu = (ring: string) => `<p>Ana's expenses</p><button role="combobox" aria-label="Person" style="width: 160px; height: 40px; outline: ${ring}; outline-offset: 2px">Ana</button>`;
    assert.deepEqual(await said(menu("none"), menu("2px solid #333")), ["Person menu looks different"]);
  });

  test("what the reading found isn't told again", async () => {
    assert.deepEqual(await said(`<button>Export</button>`, `<button>Export CSV</button>`), []);
  });

  test("a nudge of a pixel follows from what else changed there, and with nothing else changed it's a change", async () => {
    const page = (nudge: number, more: string) => `<p style="margin-left: ${nudge}px">INV-1043</p>${more}`;
    assert.deepEqual(await said(page(0, ""), page(1, "<button>Export</button>")), []);
    assert.deepEqual(await said(page(0, ""), page(1, "")), ["“INV-1043” looks different"]);
  });

  test("the same picture moved further is moved, by how much", async () => {
    const icon = (left: number) => `<h2>Status</h2><div style="position: absolute; left: ${left}px; top: 80px; width: 24px; height: 24px; background: #c33"></div>`;
    assert.deepEqual(await said(icon(100), icon(110)), ["Something near the Status heading moved right, 10px"]);
  });

  test("under a heading of a table the page marks as one, what looks different is that column", async () => {
    // A typeface isn't part of how the reading sees a thing's look, and in a table laid out at fixed sizes, nothing moves.
    const table = (font: string) =>
      `<table style="table-layout: fixed; width: 600px">${`<tr><th>Customer</th><th>Amount</th></tr>`}${["Alder Dental", "Harbor & Finch", "Juniper Health"].map((name) => `<tr style="height: 32px"><td style="font-family: ${font}">${name}</td><td>$920.00</td></tr>`).join("")}</table>`;
    assert.deepEqual(await said(table("sans-serif"), table("serif")), ["Customer column looks different"]);
  });

  test("a slight change in pale colours is seen, and patches on one thing are one change to it (the example's badges, square)", async () => {
    const table = (corners: number) =>
      `<table style="background: #fafaf9"><tr><th>Invoice</th><th>Status</th></tr>${["INV-1043", "INV-1044", "INV-1045"].map((name) => `<tr><td>${name}</td><td><span style="background: #e8f3ec; padding: 1px 8px; border-radius: ${corners}px">Paid</span></td></tr>`).join("")}</table>`;
    assert.deepEqual(await said(table(999), table(0)), ["Status column looks different"]);
  });

  test("a page scrolled to another place isn't compared by its pictures: the reading speaks for it", async () => {
    const page = `<h1>Invoices</h1><p style="margin-top: 1500px">INV-1043</p>`;
    assert.deepEqual(await said(page, page, 600), []);
  });
});
