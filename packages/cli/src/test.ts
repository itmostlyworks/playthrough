// What every flow imports in place of "@playwright/test". While `vantage record` runs, it records each flow the way a person
// would watch it: rrweb in every page, the pointer gliding to what it acts on, and a beat after each action so its result can
// be seen. Run as plain tests, it does nothing. Each recording goes to the reporter, which makes it a flow (reporter.ts).

import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Run } from "./flows.ts";
import { RECORDING } from "./reporter.ts";

export { expect };

// Everything it needs comes with the run (record.ts), so it never has to find anything for itself.
const run: Run | undefined = process.env.VANTAGE_RUN ? JSON.parse(process.env.VANTAGE_RUN) : undefined;

// The page's own clock and timers are taken before a flow can fake them: under page.clock.setFixedTime, rrweb's throttle
// let one pointer move through, timed by the gap between the fixed time and the real one.
const recorder = (rrweb: string) => `;((Date, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame) => {
${readFileSync(rrweb, "utf8")}
})(Date, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame);
if (window.top === window) window.rrwebRecord.record({
  emit: (event) => window.__vantage(event),
  // every input, not just the last: with "last", rrweb only hears a field change when it loses focus,
  // so words typed into a search box that kept focus never reached the recording
  sampling: { mousemove: 20, scroll: 16, input: "all" },
  maskAllInputs: false,
  inlineStylesheet: true,
});`;

// Playwright acts instantly, and a recording made at that speed can't be watched.
const FRAME = 16; // a move each frame while gliding or scrolling
const REST = 140; // the pointer rests on its target before acting
const BEAT = 650; // after each action, so its result can be seen
const HOLD = 1500; // the end of a flow holds, so its last state can be seen

let pointer: { page: Page; x: number; y: number } | undefined;

export const test = base.extend<{ recorder: void }>({
  recorder: [
    async ({ page }, use, testInfo) => {
      if (!run) return use();
      testInfo.setTimeout(testInfo.timeout * 3);
      const events: unknown[] = [];
      await page.exposeFunction("__vantage", (event: unknown) => void events.push(event));
      await page.addInitScript({ content: recorder(run.recorder) });
      pace(page);
      pointer = { page, x: 640, y: 640 };
      await page.mouse.move(pointer.x, pointer.y);
      try {
        await use();
      } finally {
        pointer = undefined;
      }
      if (testInfo.status !== testInfo.expectedStatus) return;
      await page.waitForTimeout(HOLD);
      // Nothing changes while the end holds, so a last event makes the recording long enough to include it.
      await page.evaluate(() => (window as any).rrwebRecord.record.addCustomEvent("end", {}));
      await page.waitForTimeout(100);
      await testInfo.attach(RECORDING, { body: JSON.stringify(events), contentType: "application/json" });
    },
    { auto: true },
  ],
});

// Every action on an element glides there first and pauses after. Patched once in each worker, for every locator.
const actions = ["click", "dblclick", "check", "uncheck", "setChecked", "hover", "tap", "fill", "selectOption", "press"] as const;
const paced = new WeakSet<object>();

function pace(page: Page) {
  const prototype = Object.getPrototypeOf(page.locator("html"));
  if (paced.has(prototype)) return;
  paced.add(prototype);
  for (const action of actions) {
    const original = prototype[action];
    prototype[action] = async function (this: Locator, ...args: unknown[]) {
      if (pointer) await approach(this, pointer);
      const result = await original.apply(this, args);
      if (pointer) await pointer.page.waitForTimeout(BEAT);
      return result;
    };
  }
}

// A target out of view is scrolled to first, smoothly, the way a person scrolls. Left to Playwright, the page jumped there
// at the moment of the click, and the pointer glided towards a spot below the window first.
async function approach(target: Locator, at: { page: Page; x: number; y: number }) {
  const scroll = await target
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= innerHeight) return undefined;
      const most = document.documentElement.scrollHeight - innerHeight;
      return { from: scrollY, to: Math.max(0, Math.min(most, scrollY + box.top + box.height / 2 - innerHeight / 2)) };
    }, undefined, { timeout: 5000 })
    .catch(() => "missing" as const);
  if (scroll === "missing") return; // the action itself waits for it, and says why it can't
  if (scroll && Math.abs(scroll.to - scroll.from) >= 1) {
    const moves = Math.max(10, Math.min(36, Math.round(Math.abs(scroll.to - scroll.from) / 25)));
    for (let i = 1; i <= moves; i++) {
      await at.page.evaluate((y) => scrollTo(0, y), scroll.from + (scroll.to - scroll.from) * ease(i / moves));
      await at.page.waitForTimeout(FRAME);
    }
    await at.page.waitForTimeout(REST);
  }

  const box = await target.boundingBox({ timeout: 5000 }).catch(() => null);
  if (!box) return;
  const from = { x: at.x, y: at.y };
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const moves = Math.max(6, Math.min(30, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 22)));
  for (let i = 1; i <= moves; i++) {
    const k = ease(i / moves);
    await at.page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    await at.page.waitForTimeout(FRAME);
  }
  Object.assign(at, to);
  await at.page.waitForTimeout(REST);
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
