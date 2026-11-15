// What the agent's browser promises: what's done there is kept so that, written as a moment's way, it plays again from a
// fresh start. Each page is a small one, served in Chromium as the app, done in once as the agent would and once again by
// the way written from it.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { NOTING } from "../src/as.ts";
import { openOn } from "../src/moments.ts";
import { wayFile, wayIn, type Done } from "../src/way.ts";

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
  await new Function("page", "baseURL", `return (async () => {\n${way}\n})();`)(fresh, "http://app.test");
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
