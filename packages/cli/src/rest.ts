// A page at rest: nothing it asked for still on its way, and nothing on it changing, scrolling or moving for a moment.
// Each step ends there, so what's read after it is the page the step left. On Spliit's dev server, a fixed beat after
// the last action caught a search that hadn't answered yet and a page not yet scrolled back up, and both read as changes
// the work hadn't made. The moment is counted in the frames the page draws, on its own clock: a page too busy to draw
// isn't still, it's working. On Kan, on a loaded machine, the boards page drew its placeholders and worked for 400 ms
// before asking for the boards, and counted as stillness, that had the page read before it asked.

import type { Page, Request } from "@playwright/test";

const STILL = 300; // how long nothing may change
const LONGEST = 5000; // a page that never rests, a counter ticking ten times a second, is read as it is after this long

// What a page keeps open as long as it's open is never on its way.
const LASTING = /^(eventsource|websocket|media)$/;

// In every page, from its first moment, before anything fakes its clock: how long it has been still. Each frame adds the
// time since the last, but no more than a long task's 50 ms: past that, the page was working, not still. Something
// moving that will stop, a dialog sliding in, isn't still; something that moves for good, a spinner, is the page as it is.
function watch() {
  const now = performance.now.bind(performance);
  const nextFrame = requestAnimationFrame.bind(window);
  let still = 0;
  let last = now();
  const stir = () => void ((still = 0), (last = now()));
  new MutationObserver(stir).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener("scroll", stir, { capture: true, passive: true });
  const drawn = () => {
    const moving = document.getAnimations().some((animation) => animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime));
    if (moving) stir();
    else {
      still += Math.min(now() - last, 50);
      last = now();
    }
    (window as any).__playthroughStill = still;
    nextFrame(drawn);
  };
  nextFrame(drawn);
}

// Watches the page before it opens anything, and before its clock is set: a set clock draws the page's frames as timers,
// and after a busy stretch fires every one it missed at once. Gives back what waits for the page to come to rest.
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
      // Looked at first: a page busy when it's looked at answers once it's done, and may have asked for something by then.
      if ((await stillFor(page)) >= STILL && !asked.size) return;
      await page.waitForTimeout(50);
    }
  };
}

const stillFor = (page: Page): Promise<number> =>
  page.evaluate(() => (window as any).__playthroughStill ?? 0).catch(() => 0); // the page is on its way to another
