// What the agent's browser promises: what's done there is kept so that, written as a moment's way, it plays again from a
// fresh start. Each page is a small one, served in Chromium as the app, done in once as the agent would and once again by
// the way written from it.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { NOTING } from "../src/as.ts";
import { aboutOn, openOn } from "../src/moments.ts";
import { scrollPart, wayFile, wayIn, type Done } from "../src/way.ts";

let browser: Browser;
before(async () => void (browser = await chromium.launch({ args: ["--enable-blink-features=ComputedAccessibilityInfo"] })));
after(() => browser.close());

// The page at http://app.test/, done in by `act` with what's done kept, then opened fresh and gone through again by the way
// written from what was kept: what `check` reads there.
async function keptAndPlayed<T>(body: string, act: (page: Page) => Promise<void>, check: (page: Page) => Promise<T>): Promise<{ did: Done[]; again: T }> {
  const served = async (page: Page) => page.route("http://app.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html>${body}` }));
  const did: Done[] = [];
  const agent = await browser.newPage();
  await served(agent);
  await agent.exposeBinding("__playthroughDid", (_source, done: Done) => void did.push(done));
  await agent.addInitScript({ content: NOTING });
  await agent.goto("http://app.test/");
  await act(agent);
  await agent.close();
  const fresh = await browser.newPage();
  fresh.setDefaultTimeout(2000);
  await served(fresh);
  const way = wayIn(wayFile({ words: "Here", person: "Maja", did, setup: {} }));
  await new Function("page", "baseURL", "test", `return (async () => {\n${way}\n})();`)(fresh, "http://app.test", { scrollPart });
  const again = await check(fresh);
  await fresh.close();
  return { did, again };
}

test("a button or words are kept by their words as written, not as the page's style cases them, so they're found again", { timeout: 30_000 }, async () => {
  const { did, again } = await keptAndPlayed(
    `<button style="text-transform: uppercase" onclick="said.append('folded ')">My boards</button>
    <button style="text-transform: lowercase" onclick="said.append('saved ')">Save Draft</button>
    <span style="text-transform: capitalize" onclick="said.append('opened')">the launch post</span>
    <p id="said"></p>`,
    async (page) => {
      await page.getByRole("button", { name: "My boards" }).click();
      await page.getByRole("button", { name: "Save Draft" }).click();
      await page.getByText("the launch post").click();
    },
    (page) => page.locator("#said").textContent(),
  );
  assert.deepEqual(did.filter((one) => one.does === "click").map(({ name, text }) => name ?? text), ["My boards", "Save Draft", "the launch post"]);
  assert.equal(again, "folded saved opened");
});

test("words typed into a rich-text editor are kept on the editor as it was before them, empty or not, typed in one go or two, so they're typed there again", { timeout: 30_000 }, async () => {
  const { did, again } = await keptAndPlayed(
    `<div id="comment" contenteditable="true"><p data-placeholder="Add comment..."><br></p></div>
    <div id="description" contenteditable="true"><p>Looks good</p></div>
    <button>Elsewhere</button>`,
    async (page) => {
      await page.locator("#comment").click();
      await page.keyboard.type("half");
      await page.getByRole("button", { name: "Elsewhere" }).click();
      await page.locator("#comment").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" written");
      await page.locator("#description").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" to me");
    },
    (page) => page.evaluate(() => [comment.innerText, description.innerText]),
  );
  assert.ok(did.every((one) => one.text === undefined), "never by what's typed in it");
  assert.equal(did.find((one) => one.does === "fill")?.what, "Add comment...", "said by what it asks for");
  assert.deepEqual(again, ["half written", "Looks good to me"]);
});

test("a click is on what was pressed, or the nearest words of their own, never a part of the page holding others' words, as stepping in keeps it too", { timeout: 30_000 }, async () => {
  const { did } = await keptAndPlayed(
    `<div id="board"><div><button>Visibility</button> <button>New list</button></div><div id="space" style="height: 100px"><span>Write the <b>launch</b> post</span></div></div>`,
    async (page) => {
      await page.locator("#space").click({ position: { x: 600, y: 80 } });
      await page.getByText("Write the").click();
    },
    async () => {},
  );
  assert.deepEqual(did.filter((one) => one.does === "click").map(({ what }) => what), ["", "Write the launch post"]);
});

declare const comment: HTMLElement, description: HTMLElement;

test("a dialog left open where a moment is kept is found, by its name or else its heading, and one closed isn't", { timeout: 30_000 }, async () => {
  const page = await browser.newPage();
  await page.addInitScript({ content: NOTING });
  let body = "";
  await page.route("http://app.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html>${body}` }));
  const openOnPage = async (html: string) => ((body = html), await page.goto("http://app.test/"), openOn(page));
  // As Headless UI draws Kan's: a dialog with no size of its own, holding a panel drawn fixed, with a heading.
  assert.deepEqual(await openOnPage(`<div role="dialog" aria-modal="true"><div style="position: fixed; inset: 0"><h2 style="text-transform: uppercase">New board</h2></div></div>`), { name: "New board" });
  assert.deepEqual(await openOnPage(`<div role="alertdialog" aria-label="Delete board?">Sure?</div>`), { name: "Delete board?" });
  assert.deepEqual(await openOnPage(`<dialog open>Saved</dialog>`), { name: "" }, "one with nothing to call it by is still open");
  assert.equal(await openOnPage(`<dialog><h2>New board</h2></dialog><h1>Website launch</h1>`), undefined);
  await page.close();
});

test("what a moment is about can be named by the words a field holds, as Kan's list names are fields: that field, of those alike", { timeout: 30_000 }, async () => {
  const page = await browser.newPage();
  await page.addInitScript({ content: NOTING });
  await page.route("http://app.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<!doctype html><input aria-label="List name" value="To do"><input aria-label="List name" value="Doing"><h2>Done soon</h2>` }),
  );
  await page.goto("http://app.test/");
  assert.deepEqual((await aboutOn(page, "Each list shows its count", "doing")).about, { role: "textbox", name: "List name", nth: 1, value: "Doing", disabled: false });
  assert.equal((await aboutOn(page, "Each list shows its count", "Done soon")).about?.role, "heading", "what's called that comes first");
  assert.equal((await aboutOn(page, "Each list shows its count", "Done")).about?.role, "heading", "and what's called something like it");
  await page.close();
});

test("what a moment is about is past an edge of the browser only when none of it shows there: a list longer than the browser is in view", { timeout: 30_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript({ content: NOTING });
  await page.route("http://app.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><h1>Board</h1><div style="overflow-x: auto"><div style="display: flex; width: max-content"><button style="width: 1400px">To do</button><button style="width: 700px">Review</button></div></div>
        <ul role="list" aria-label="Every card" style="height: 3000px"><li>One</li></ul>`,
    }),
  );
  await page.goto("http://app.test/");
  assert.equal((await aboutOn(page, "The new list", "Review")).past, "right");
  assert.equal((await aboutOn(page, "The first list", "To do")).past, undefined);
  await page.evaluate(() => window.scrollTo(0, 1500));
  assert.equal((await aboutOn(page, "Every card shows", "Every card")).past, undefined, "taller than the browser, some of it shows");
  assert.equal((await aboutOn(page, "The board", "Board")).past, "top");
  await page.close();
});

// A page with a Results panel that scrolls by itself, its rows long past its bottom, and a list with no name that does too.
const PANELS = `<h1>Runs</h1>
  <section aria-label="Results" style="height: 200px; overflow: auto"><div style="height: 3000px"></div><h2>Compare curve</h2></section>
  <ul style="height: 100px; overflow: auto">${"<li>Run</li>".repeat(40)}</ul>
  <button>Refresh</button>`;

test("each part of the page that scrolls by itself is kept where it was scrolled, by its name or else its place, and put back there from a fresh start", { timeout: 30_000 }, async () => {
  const { did, again } = await keptAndPlayed(
    PANELS,
    async (page) => {
      await page.locator("section").evaluate((part) => part.scrollTo(0, 2800));
      await page.locator("ul").evaluate((part) => part.scrollTo(0, 400));
      await page.getByRole("button", { name: "Refresh" }).click();
    },
    (page) => page.evaluate(() => [document.querySelector("section")!.scrollTop, document.querySelector("ul")!.scrollTop]),
  );
  assert.deepEqual(did.at(-1)?.scrolled?.parts, [
    { on: "body:nth-of-type(1) > section:nth-of-type(1)", role: "region", name: "Results", x: 0, y: 2800 },
    { on: "body:nth-of-type(1) > ul:nth-of-type(1)", x: 0, y: 400 },
  ]);
  assert.deepEqual(again, [2800, 400]);
});

test("what a moment is about is scrolled out of sight inside a part of the page that scrolls by itself only when none of it shows there, and that part is named", { timeout: 30_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript({ content: NOTING });
  await page.route("http://app.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html>${PANELS}` }));
  await page.goto("http://app.test/");
  const hidden = await aboutOn(page, "The curve", "Compare curve");
  assert.deepEqual([hidden.outOfSight, hidden.partsAround], [0, ["Results"]]);
  await page.getByRole("heading", { name: "Compare curve" }).scrollIntoViewIfNeeded();
  assert.equal((await aboutOn(page, "The curve", "Compare curve")).outOfSight, undefined);
  await page.locator("section div").evaluate((tall) => tall.setAttribute("aria-label", "Every run"));
  await page.locator("section div").evaluate((tall) => tall.setAttribute("role", "list"));
  assert.equal((await aboutOn(page, "Every run", "Every run")).outOfSight, undefined, "bigger than its part, some of it shows");
  await page.close();
});

test("a part of the page that scrolls by itself is put back once it's drawn far enough, and where it can't be, it says so: not there, or not that far", { timeout: 30_000 }, async () => {
  const page = await browser.newPage();
  await page.route("http://app.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      // As a list that draws its rows only as they come into view: more, each time it's scrolled near its end.
      body: `<!doctype html><div role="list" aria-label="Runs" style="height: 200px; overflow: auto"><div style="height: 400px"></div></div>
        <div role="list" aria-label="Short" style="height: 200px; overflow: auto"><div style="height: 400px"></div></div>
        <script>
          const runs = document.querySelector("[aria-label=Runs]");
          runs.addEventListener("scroll", () => runs.scrollTop + 200 > runs.scrollHeight - 50 && runs.scrollHeight < 3000 && runs.append(Object.assign(document.createElement("div"), { style: "height: 400px" })));
        </script>`,
    }),
  );
  await page.goto("http://app.test/");
  await scrollPart(page.getByRole("list", { name: "Runs", exact: true }), [0, 2400]);
  assert.equal(await page.getByRole("list", { name: "Runs" }).evaluate((part) => part.scrollTop), 2400);
  await assert.rejects(scrollPart(page.getByRole("list", { name: "Short", exact: true }), [0, 900]), { message: "list “Short” could be scrolled only 200px down, not the 900px where you had it" });
  await assert.rejects(scrollPart(page.getByRole("region", { name: "Results", exact: true }), [0, 900]), { message: "no region “Results” was there to scroll where you had it" });
  await page.close();
});

test("a drag is kept to be said, never done again: a press the page carries off, and not selecting words, a slider or a press that wobbled", { timeout: 30_000 }, async () => {
  const { did, again } = await keptAndPlayed(
    `<button id="card" onclick="said.append('opened ')">Card A</button>
    <p id="words">Some words worth selecting with the pointer</p>
    <input type="range" aria-label="Volume" value="20">
    <p id="said"></p>
    <script>
      // As a drag-and-drop library does: once carried a few pixels, the moves are the page's.
      let start;
      card.addEventListener("pointerdown", (e) => (start = { x: e.clientX, y: e.clientY }));
      document.addEventListener("pointermove", (e) => start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4 && e.preventDefault());
      document.addEventListener("pointerup", () => (start = undefined));
    </script>`,
    async (page) => {
      const press = async (selector: string, by: { x: number; y: number }) => {
        const box = (await page.locator(selector).boundingBox())!;
        await page.mouse.move(box.x + 5, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 5 + by.x, box.y + box.height / 2 + by.y, { steps: 8 });
        await page.mouse.up();
      };
      await press("#words", { x: 200, y: 0 });
      await press("input", { x: 100, y: 0 });
      await press("#card", { x: 3, y: 2 });
      await press("#card", { x: 300, y: 40 });
    },
    (page) => page.locator("#said").textContent(),
  );
  assert.deepEqual(did.filter((one) => one.does === "drag").map(({ what }) => what), ["Card A"]);
  assert.ok(did.some((one) => one.does === "click" && one.what === "Card A"));
  assert.equal(again, "opened ", "the wobbled press is a click, done again; the drag isn't");
});
