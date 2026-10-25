// A page at rest: nothing it asked for still on its way, and nothing on it changing, scrolling or moving for a moment.
// Each step ends there, so what's read after it is the page the step left. On Spliit's dev server, a fixed beat after
// the last action caught a search that hadn't answered yet and a page not yet scrolled back up, and both read as changes
// the work hadn't made.

import type { Page, Request } from "@playwright/test";

const STILL = 300; // how long nothing may change
const LONGEST = 5000; // a page that never rests, a counter ticking ten times a second, is read as it is after this long

// What a page keeps open as long as it's open is never on its way.
const LASTING = /^(eventsource|websocket|media)$/;

// In every page, from its first moment: when anything on it last changed or scrolled.
function watch() {
  const stir = () => ((window as any).__vantageStirred = performance.now());
  stir();
  new MutationObserver(stir).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener("scroll", stir, { capture: true, passive: true });
}

// Watches the page before it opens anything, and gives back what waits for it to come to rest.
export async function watchRest(page: Page): Promise<() => Promise<void>> {
  const asked = new Map<Request, number>();
  page.on("request", (request) => void (LASTING.test(request.resourceType()) || asked.set(request, Date.now())));
  page.on("requestfinished", (request) => void asked.delete(request));
  page.on("requestfailed", (request) => void asked.delete(request));
  await page.addInitScript(watch);

  return async function rest() {
    const until = Date.now() + LONGEST;
    while (Date.now() < until) {
      // One that's been on its way longer than a step waits, a long poll, doesn't hold the page up.
      for (const [request, since] of asked) if (Date.now() - since > LONGEST) asked.delete(request);
      if (!asked.size && (await stillFor(page)) >= STILL) return;
      await page.waitForTimeout(50);
    }
  };
}

// How long the page has been still. Something moving that will stop, a dialog sliding in, isn't still; something that
// moves for good, a spinner, is the page as it is.
function stillFor(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      const moving = document.getAnimations().some((animation) => animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime));
      return moving ? 0 : performance.now() - ((window as any).__vantageStirred ?? -Infinity);
    })
    .catch(() => 0); // the page is on its way to another
}
