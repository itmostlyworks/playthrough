// What changed between two readings of the same moment, as a person would name it. Each promise is two small pages, as
// a step left them in two rounds, read in Chromium; most come from a case a real run met.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { Reading } from "@playthrough/page";
import { changesAt } from "../src/changes.ts";
import { readPage } from "../src/read.ts";

let browser: Browser;
let page: Page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(() => browser.close());

async function reading(html: string, scrolled = 0): Promise<Reading> {
  await page.setContent(`<style>body { font: 16px sans-serif; margin: 24px } .panel { border: 1px solid #ccc; padding: 8px }</style>${html}`);
  if (scrolled) await page.evaluate((y) => scrollTo(0, y), scrolled);
  return { step: "Open the invoices", at: 1, picture: "", ...(await readPage(page)) };
}
const changes = async (then: string, now: string) => changesAt(await reading(then), await reading(now));
const said = async (then: string, now: string) => (await changes(then, now)).map((change) => change.words);

const rows = (names: string[], cell = (name: string) => `<td>${name}</td>`) => `<table>${names.map((name) => `<tr>${cell(name)}</tr>`).join("")}</table>`;
const dialog = (inside: string) => `<h1>Invoices</h1><div role="dialog" aria-label="Export" class="panel">${inside}</div>`;

describe("What changed at a moment", () => {
  test("nothing changed is no change", async () => {
    const page = `<h1>Invoices</h1><button>Export</button>`;
    assert.deepEqual(await said(page, page), []);
  });

  test("something new is one change, everything in it part of it; and so is something gone", async () => {
    const then = `<h1>Invoices</h1>`;
    const now = dialog(`<p>12 invoices from Q3 2026</p><button>Download CSV</button><button>Cancel</button>`);
    assert.deepEqual(await said(then, now), ["Export dialog is new"]);
    assert.deepEqual(await said(now, then), ["Export dialog is gone"]);
  });

  test("words that took something beside them in a row of their own are the same words, and what's beside them is new (group-totals' “Earlier this month”)", async () => {
    const row = `background: #fff; padding: 4px 24px; width: 600px`;
    const then = `<p>Lunch</p><div style="${row}">Earlier this month</div>`;
    const now = `<p>Lunch</p><div style="${row}; display: flex; justify-content: space-between"><span>Earlier this month</span><span>$1,300.00</span></div>`;
    assert.deepEqual(await said(then, now), ["“$1,300.00” is new"]);
  });

  test("words whose data changed are reworded, with what's marked in them", async () => {
    assert.deepEqual(await said(`<p>Total <b>$56,145.00</b></p>`, `<p>Total for <b>2026</b> <b>$56,145.00</b></p>`), ["“Total $56,145.00” now says “Total for 2026 $56,145.00”"]);
  });

  test("a control that looks different says what about it", async () => {
    assert.deepEqual(await said(`<button>Overdue</button>`, `<button style="background: #fde; font-weight: bold">Overdue</button>`), ["Overdue button looks different: background, bolder text"]);
  });

  test("alike things changed alike are one change, counted, or named together when their names differ", async () => {
    const invoices = ["INV-1043", "INV-1050", "INV-1057", "INV-1061", "INV-1065", "INV-1070"];
    const restyled = await said(
      rows(invoices, (name) => `<td>${name}</td><td><button>Delete</button></td>`),
      rows(invoices, (name) => `<td>${name}</td><td><button style="border: 2px solid red">Delete</button></td>`),
    );
    assert.deepEqual(restyled, ["Delete button looks different: border, in 6 places"]);
    const added = await said(
      rows(invoices.slice(0, 3)),
      rows(invoices.slice(0, 3), (name) => `<td>${name}</td><td><button aria-label="Actions for ${name}">⋯</button></td>`),
    );
    assert.deepEqual(added, ["Actions for INV-1043, INV-1050 and INV-1057 are new"]);
  });

  test("two things that traded places have swapped (the planted swap in the Export dialog)", async () => {
    assert.deepEqual(await said(dialog(`<button>Download CSV</button><button>Cancel</button>`), dialog(`<button>Cancel</button><button>Download CSV</button>`)), [
      "Cancel button and Download CSV button have swapped places",
    ]);
  });

  test("a button or link that shows only an icon is called by its label (Spliit's Create expense and Export, swapped)", async () => {
    const header = (first: string, second: string) => `<div class="panel" style="display: flex; gap: 8px"><h1>Expenses</h1>${first}${second}</div>`;
    const icon = `<svg width="16" height="16"><path d="M8 2v12M2 8h12" stroke="black" /></svg>`;
    const create = `<a href="#" title="Create expense">${icon}</a>`;
    const exportThem = `<button title="Export">${icon}</button>`;
    assert.deepEqual(await said(header(exportThem, create), header(create, exportThem)), ["Create expense and Export have swapped places"]);
  });

  test("two rows of a list that traded places have swapped, called by their words (the todo app's rows, in a new order)", async () => {
    const row = (name: string) => `<li><label><input type="checkbox"> ${name}</label> <button aria-label="Delete ${name}">×</button></li>`;
    const list = (names: string[]) => `<h1>Todos</h1><ul>${names.map(row).join("")}</ul>`;
    assert.deepEqual(await said(list(["Buy milk", "Walk the dog", "Call Sam"]), list(["Walk the dog", "Buy milk", "Call Sam"])), ["“Walk the dog” and “Buy milk” have swapped places"]);
  });

  test("a control whose words changed, wider and moved for it, is that control reworded, not one gone and one new (the todo app's Clear completed)", async () => {
    const footer = (button: string) => `<footer style="display: flex; gap: 8px; width: 400px"><p style="flex: 1; margin: 0">4 left</p><button>${button}</button></footer>`;
    assert.deepEqual(await said(footer("Clear completed"), footer("Clear 2 completed")), ["Clear completed button now says “Clear 2 completed”"]);
    assert.deepEqual(await said(`<button>Save</button>`, `<button>Save changes</button>`), ["Save button now says “Save changes”"]);
  });

  test("words whose box is only narrower or wider, with nothing to show it, aren't a change: the same words look the same (“4 left”, beside a button that grew)", async () => {
    assert.deepEqual(await said(`<p style="width: 300px">4 left</p>`, `<p style="width: 200px">4 left</p>`), []);
    assert.deepEqual(await said(`<p style="width: 300px; background: #eee">4 left</p>`, `<p style="width: 200px; background: #eee">4 left</p>`), ["“4 left” is narrower"]);
  });

  test("a layout shift belongs to what caused it, above the things it moved", async () => {
    const page = (banner: string) => `<h1>Invoices</h1>${banner}<p>INV-1043</p><p>INV-1050</p><p>INV-1057</p>`;
    assert.deepEqual(await said(page(""), page(`<div class="panel"><p>Payment failed</p></div>`)), ["“Payment failed” area is new, and moved 3 things down"]);
  });

  test("something that moved past others, from above them to below, moved them, and keeps its own words (Spliit's who owes whom, below the expenses)", async () => {
    const owes = `<section aria-label="Who owes whom" class="panel"><p>You owe <b>Dev</b> $65.00</p><p>You owe <b>Ana</b> $90.00</p></section>`;
    const expenses = `<p>Paid by <b>Dev</b> for everyone</p><p>Paid by <b>Ana</b> for everyone</p><p>Groceries</p>`;
    assert.deepEqual(await said(`<h1>Expenses</h1>${owes}${expenses}`, `<h1>Expenses</h1>${expenses}${owes}`), ["“Who owes whom” area moved down, and moved 3 things up"]);
  });

  test("words reworded without taking more room push nothing, and what moved with a shift says only how it looks (Spliit, all at once)", async () => {
    const owes = `<section aria-label="Who owes whom" class="panel"><p>You owe <b>Dev</b> $65.00</p><p>You owe <b>Ana</b> $90.00</p></section>`;
    const expenses = (colour: string) =>
      ["Taxi to the station", "Dinner at the harbour", "Groceries"].map((title, i) => `<p>${title}</p><p style="font-weight: bold; color: ${colour}">${["$40.00", "$180.00", "$120.00"][i]}</p>`).join("");
    const then = `<h1>Expenses</h1><p>Here are the expenses that you created for your group.</p>${owes}${expenses("black")}`;
    const now = `<h1>Expenses</h1><p>Everything your group has spent, newest first.</p>${expenses("green")}${owes}`;
    assert.deepEqual(await said(then, now), [
      "“Here are the expenses that you created for your group.” now says “Everything your group has spent, newest first.”",
      "“$…” looks different: text colour, in 3 places",
      "“Who owes whom” area moved down, and moved 3 things up",
    ]);
  });

  test("a small new thing on a row moves its neighbour, which is named when it's the only one (the example's Export button)", async () => {
    const header = (more: string) =>
      `<header style="display: flex; justify-content: space-between"><h1>Invoices</h1><div role="group" aria-label="Show"><button>All</button><button>Paid</button></div>${more}</header>`;
    assert.deepEqual(await said(header(""), header("<button>Export</button>")), ["Export button is new, and moved the Show choice left"]);
  });

  test("what only moved with what holds it says only what else changed", async () => {
    const page = (banner: string, badge: string) => `<h1>Invoices</h1>${banner}${rows(["INV-1043", "INV-1045"], (name) => `<td>${name}</td><td><span style="${badge}">Overdue</span></td>`)}`;
    assert.deepEqual(await said(page("", "background: #fbf0e0"), page(`<div class="panel"><p>Payment failed</p></div>`, "background: #fde2e2")), [
      "“Payment failed” area is new, and moved the table down",
      "“Overdue” looks different: background, in 2 places",
    ]);
  });

  test("alike words changed alike, differing only by their data, are called by what they share (Spliit's amounts, made green)", async () => {
    const amounts = (colour: string) => ["$40.00", "$180.00", "$120.00"].map((amount) => `<p style="font-weight: bold; color: ${colour}">${amount}</p>`).join("");
    assert.deepEqual(await said(amounts("black"), amounts("green")), ["“$…” looks different: text colour, in 3 places"]);
  });

  test("what moves with what holds it isn't a change of its own", async () => {
    const panel = (left: number) => `<aside aria-label="Kettle Works" class="panel" style="position: absolute; left: ${left}px; top: 100px"><p>3 invoices</p><button>Remind</button></aside>`;
    assert.deepEqual(await said(panel(100), panel(300)), ["“Kettle Works” area moved right"]);
  });

  test("rows that moved up and down by many amounts are in a new order", async () => {
    assert.deepEqual(await said(rows(["Alder Dental", "Harbor & Finch", "Juniper Health", "Kettle Works"]), rows(["Kettle Works", "Juniper Health", "Harbor & Finch", "Alder Dental"])), [
      "Rows in the table are in a new order",
    ]);
  });

  test("past five changes inside one table or list, they're one change to it, counted and not listed", async () => {
    const changed = await said(
      `<div class="panel">${rows(["Alder Dental", "Harbor & Finch", "Juniper Health", "Kettle Works", "Moss Logistics", "Pale Harbour"])}</div>`,
      `<div class="panel">${rows(["Alder Dental", "Harbor & Finch", "Juniper Health", "Kettle Works", "Moss Logistics", "Pale Harbour"].map((name) => `${name} (paid)`))}</div>`,
    );
    assert.deepEqual(changed, ["Table: 6 things changed inside"]);
  });

  test("in a dialog or a panel, each change is told on its own, however many", async () => {
    const changed = await said(dialog(["Name", "Email", "Phone", "City", "Notes", "Team"].map((label) => `<p>${label}</p>`).join("")), dialog(["Name", "Email", "Phone", "City", "Notes", "Team"].map((label) => `<p>${label}:</p>`).join("")));
    assert.equal(changed.length, 6);
  });

  test("words gone where a control with their name is new are that control now", async () => {
    const table = (heading: string) => `<table><tr><th>${heading}</th></tr><tr><td>Overdue</td></tr></table>`;
    assert.deepEqual(await said(table("Status"), table("<button>Status</button>")), ["“Status” is a button now"]);
  });

  test("something only taller by what's new inside it follows from that, and so does what that pushed down (Spliit's Expenses card)", async () => {
    const card = (inside: string) => `<section aria-label="Expenses" class="panel"><p>Dinner</p>${inside}</section><p>Lunch</p><p>Taxi</p><p>Hotel</p>`;
    assert.deepEqual(await said(card(""), card(`<section aria-label="Who owes whom" class="panel"><p>Ana owes Ben</p></section>`)), ["“Who owes whom” area is new, and moved 3 things down"]);
  });

  test("things made narrower by something new beside them follow from it", async () => {
    const page = (filters: string) =>
      `<div style="display: flex">${filters}<main style="flex: 1"><h2 style="background: #eef">Invoices</h2><div class="panel"><p>INV-1043</p><p>INV-1050</p></div></main></div>`;
    assert.deepEqual(await said(page(""), page(`<aside aria-label="Filters" class="panel" style="width: 240px"><p>Overdue only</p></aside>`)), ["“Filters” area is new, and made 2 things narrower"]);
  });

  test("something now inside a panel it wasn't in has moved into it", async () => {
    const page = (inside: string, outside: string) => `<aside aria-label="Kettle Works" class="panel"><p>3 invoices</p>${inside}</aside>${outside}`;
    const bar = `<p>2 selected</p>`;
    assert.deepEqual(await said(page("", bar), page(bar, "")), ["“2 selected” moved into the “Kettle Works” area"]);
  });

  test("something new is new as a whole, never what was outside it moved in, and a line gone is one thing gone (Kan's comment)", async () => {
    const line = (inside: string) => `<p>${inside}</p>`;
    const comment = `<div class="panel"><span>M</span> <span>Maja</span> <span>·</span> <span>just now</span><p>Can we use the one from the studio shoot?</p></div>`;
    assert.deepEqual(await said(line(`<span>Maja</span> <span>updated the title</span> <span>·</span> <span>just now</span>`), comment), [
      "“Maja · just now Can we use the one from the studio shoot?” area is new",
      "“Maja updated the title · just now” is gone",
    ]);
  });

  test("a message the page announces is judged by whether the step showed it, not by whether it's still up when it's read (Kan's toast)", async () => {
    const page = (toast: string) => `<h1>Boards</h1>${toast}`;
    const toast = (live: string) => `<div ${live} class="panel" style="position: fixed; right: 16px; bottom: 16px"><p>Added to favorites</p></div>`;
    const announced = toast(`aria-live="assertive"`);
    const glimpse = async (html: string) => { const { picture: _, ...glimpse } = await reading(html); return glimpse; };
    const shownNow = { then: [], now: [await glimpse(page(announced))] };
    assert.deepEqual((changesAt(await reading(page(announced)), await reading(page("")), undefined, shownNow)).map((change) => change.words), []);
    assert.deepEqual((changesAt(await reading(page(announced)), await reading(page("")))).map((change) => change.words), ["“Added to favorites” message is gone"]);
    // A panel that isn't a message, like a dialog that now closes, is gone however briefly it was there.
    const panel = toast("");
    assert.deepEqual((changesAt(await reading(page(panel)), await reading(page("")), undefined, { then: [], now: [await glimpse(page(panel))] })).map((change) => change.words), ["“Added to favorites” area is gone"]);
  });

  test("a control that gained words inside it is the same control, and the words are what's new", async () => {
    const link = (more: string) => `<a href="/hsbc">HSBC <span>7,810.00</span>${more}</a>`;
    assert.deepEqual(await said(link(""), link(`<small style="display: block">Reconciled 1 month ago</small>`)), ["“Reconciled 1 month ago” is new"]);
  });

  test("a control holding other controls is what holds them, and what changed inside it is what's told", async () => {
    // Kan's list is one button you drag, called by its name, its count and every card's title, or with no cards, its count.
    const list = (count: string, cards = "") => `<div role="button" tabindex="0"><div><input aria-label="List name" value="Done"> ${count}</div>${cards}</div>`;
    const cards = `<button style="display: block">BS-4 Set up the domain</button><button style="display: block">BS-5 Choose the fonts</button>`;
    assert.deepEqual(await said(list("", cards), list(`<span>2</span>`, cards)), ["“2” is new"]);
    assert.deepEqual(await said(list(`<span>0 of 2</span>`), list(`<span>0/2</span>`)), ["“0 of 2” now says “0/2”"]);
  });

  test("a page scrolled further hasn't moved what's on it", async () => {
    const page = `<h1>Invoices</h1><p style="margin-top: 1500px">INV-1043</p>`;
    assert.deepEqual(changesAt(await reading(page), await reading(page, 600)).map((change) => change.words), []);
  });
});

describe("The same change", () => {
  test("is the same thing and what happened to it, whatever data it shows", async () => {
    const [quarter] = await changes(`<h1>Invoices</h1>`, dialog(`<p>12 invoices from Q3 2026</p>`));
    const [year] = await changes(`<h1>Invoices</h1>`, dialog(`<p>25 invoices from 2026</p>`));
    const [gone] = await changes(dialog(`<p>12 invoices from Q3 2026</p>`), `<h1>Invoices</h1>`);
    assert.equal(quarter?.id, year?.id);
    assert.notEqual(quarter?.id, gone?.id);
  });

  test("is on an element of the newer round, or where something gone was", async () => {
    const [added] = await changes(`<h1>Invoices</h1>`, `<h1>Invoices</h1><button>Export</button>`);
    assert.deepEqual(added?.element, { role: "button", name: "Export" });
    const [gone] = await changes(`<h1>Invoices</h1><button>Export</button>`, `<h1>Invoices</h1>`);
    assert.ok(gone?.box && gone.box.x > 0 && gone.box.width < 0.2, JSON.stringify(gone));
  });
});
