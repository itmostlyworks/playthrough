// What Vantage reads of a page once it's at rest: the moment it waits for, and what it takes in there. Each page is small
// and made for its promise, in Chromium.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { readPage, type Thing } from "../src/read.ts";
import { watchRest } from "../src/rest.ts";

let browser: Browser;
before(async () => void (browser = await chromium.launch()));
after(() => browser.close());

// A page served from nowhere, its answers as slow as asked.
async function open(html: string, answers: Record<string, { after: number; body: string }> = {}): Promise<{ page: Page; rest: () => Promise<void> }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route("http://page.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const answer = answers[path];
    if (answer) await new Promise((resolve) => setTimeout(resolve, answer.after));
    await route.fulfill({ contentType: path === "/" ? "text/html; charset=utf-8" : "text/plain", body: path === "/" ? html : (answer?.body ?? "") });
  });
  const rest = await watchRest(page);
  await page.goto("http://page.test/");
  return { page, rest };
}

const find = (things: Thing[], role: string, name: string) => {
  const found = things.find((thing) => thing.role === role && thing.name === name);
  assert.ok(found, `no ${role} called “${name}” in ${things.map((thing) => `${thing.role} “${thing.name}”`).join(", ")}`);
  return found;
};

describe("A step ends once the page is at rest", { timeout: 30_000 }, () => {
  test("it waits for what the page asked for, and for the page to be still", async () => {
    const { page, rest } = await open(`<ul id="list"></ul><script>
      fetch("/invoices").then((answer) => answer.text()).then((words) => { list.innerHTML = "<li>" + words + "</li>"; });
    </script>`, { "/invoices": { after: 800, body: "INV-1043" } });
    await rest();
    find((await readPage(page)).things, "text", "INV-1043");
  });

  test("something sliding in has stopped before the page is read", async () => {
    const { page, rest } = await open(`<style>@keyframes in { from { transform: translateY(300px) } }</style>
      <div id="dialog" role="dialog" aria-label="Export" style="animation: in 1.2s"><button>Download</button></div>`);
    await rest();
    const dialog = find((await readPage(page)).things, "dialog", "Export");
    assert.equal(dialog.box.y, 8);
  });

  test("a page that never rests is read as it is, after a few seconds", async () => {
    const { page, rest } = await open(`<p id="count">0</p><script>setInterval(() => count.textContent = Number(count.textContent) + 1, 100);</script>`);
    const started = Date.now();
    await rest();
    const waited = Date.now() - started;
    assert.ok(waited >= 4900 && waited < 6000, `it waited ${waited}ms`);
    await page.close();
  });
});

describe("Reading a page", () => {
  test("a control is read by its role and name, words by what they say, and a panel by its own label or its first words", async () => {
    const { page } = await open(`
      <button>Export</button>
      <a href="/paid">Paid invoices</a>
      <label>Customer <input></label>
      <button aria-label="Actions for INV-1065">⋯</button>
      <p>12 invoices overdue</p>
      <section aria-label="Who owes whom"><p>Ana owes Ben</p></section>
      <div style="background: #fee; padding: 8px"><p>Payment failed</p></div>`);
    const { things } = await readPage(page);
    find(things, "button", "Export");
    find(things, "link", "Paid invoices");
    find(things, "textbox", "Customer");
    assert.equal(find(things, "button", "Actions for INV-1065").words, "⋯");
    find(things, "text", "12 invoices overdue");
    assert.equal(find(things, "box", "Who owes whom").labelled, true);
    assert.equal(find(things, "box", "Payment failed").wordsInside, "Payment failed");
  });

  test("words set apart inside words are part of them, and what's laid out apart reads apart", async () => {
    const { page } = await open(`
      <p>Total for <b>Q3</b> $27,785.00</p>
      <a href="/hsbc"><span style="display: block">HSBC</span><span style="display: block">7,810.00</span></a>`);
    const { things } = await readPage(page);
    find(things, "text", "Total for Q3 $27,785.00");
    find(things, "link", "HSBC 7,810.00");
  });

  test("each thing knows what holds it: the nearest dialog, table, menu, message or panel, not a button it's part of", async () => {
    const { page } = await open(`
      <div role="dialog" aria-label="Export"><p>3 invoices</p><button><span>Download</span></button></div>
      <div role="status"><p>Exported</p></div>`);
    const { things } = await readPage(page);
    const dialog = things.indexOf(find(things, "dialog", "Export"));
    const button = things.indexOf(find(things, "button", "Download"));
    const words = find(things, "text", "Download");
    assert.equal(find(things, "text", "3 invoices").holder, dialog);
    assert.deepEqual([words.holder, words.parent], [dialog, button]);
    assert.equal(find(things, "text", "Exported").holder, things.indexOf(find(things, "status", "")));
  });

  test("under a heading of a table the page marks as one, a thing is in that column; something laid out like a table isn't one", async () => {
    const { page } = await open(`
      <table><tr><th>Customer</th><th>Amount</th></tr><tr><td>Juniper Health</td><td>$1,475.00</td></tr></table>
      <div style="display: grid; grid-template-columns: 1fr 1fr"><b>Customer</b><b>Amount</b><span>Kettle Works</span><span>$3,650.00</span></div>`);
    const { things } = await readPage(page);
    assert.equal(find(things, "text", "$1,475.00").column, "Amount");
    assert.equal(find(things, "text", "$3,650.00").column, undefined);
  });

  test("what isn't shown isn't read, and what's below the fold is, where it is on the page", async () => {
    const { page } = await open(`
      <p style="display: none">Hidden</p><p style="visibility: hidden">Invisible</p><p style="opacity: 0">Faded</p>
      <p style="margin-top: 2000px">Far down</p>`);
    await page.evaluate(() => scrollTo(0, 1000));
    const { things } = await readPage(page);
    assert.deepEqual(things.map((thing) => thing.name), ["Far down"]);
    assert.deepEqual([things[0]!.box.y > 0, things[0]!.page.y > 2000], [true, true]);
  });
});
