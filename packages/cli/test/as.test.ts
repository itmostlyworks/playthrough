// What the agent's browser promises: what's done there is kept so that, written as a moment's way, it plays again from a
// fresh start. Each page is a small one, served in Chromium as the app, done in once as the agent would and once again by
// the way written from it.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { NOTING } from "../src/as.ts";
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
