// What every flow imports in place of "@playwright/test". While `vantage record` runs, it records each flow the way a person
// would watch it: rrweb in every page, the pointer gliding to what it acts on, and a beat after each action so its result can
// be seen. Each step ends once the page is at rest, and the page it left is read there, with a picture of it: what the
// comparison compares. Run as plain tests, it does nothing. Each recording and its readings go to the reporter, which makes
// them a flow (reporter.ts).

import { test as base, expect as playwrightExpect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Reading } from "@vantage/page";
import { keepAssets } from "./assets.ts";
import type { Run } from "./flows.ts";
import { readPage, unhovered } from "./read.ts";
import { repo } from "./repo.ts";
import { ASSETS, HOLD, PICTURE, READINGS, RECORDING, seconds } from "./reporter.ts";
import { watchRest } from "./rest.ts";

// Everything it needs comes with the run (flows.ts), so it never has to find anything for itself.
const run: Run | undefined = process.env.VANTAGE_RUN ? JSON.parse(process.env.VANTAGE_RUN) : undefined;

// On Before, what a flow expects is the finished work, which the app as it is may not show. So each expectation waits a
// moment for it, as for a step's result, and the flow goes on either way: it stops only where the app as it is can't
// do something, and it's recorded as far as that.
export const expect = run?.before ? onlyWaits(playwrightExpect.configure({ timeout: 1000 })) : playwrightExpect;

function onlyWaits(expect: typeof playwrightExpect): typeof playwrightExpect {
  const checks = (matchers: object): any =>
    new Proxy(matchers, {
      get(target, name) {
        const check = Reflect.get(target, name);
        if (name === "not") return checks(check);
        if (typeof check !== "function") return check;
        return (...args: unknown[]) => {
          try {
            return Promise.resolve(check.apply(target, args)).catch(() => {});
          } catch {}
        };
      },
    });
  return new Proxy(expect, { apply: (target, self, args) => checks(Reflect.apply(target, self, args)) });
}

// The page's own clock and timers are taken before anything fakes them: under a set clock, rrweb's throttle let one
// pointer move through, timed by the gap between the set time and the real one.
const recorder = (rrweb: string) => `;((Date, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame) => {
${readFileSync(rrweb, "utf8")}
})(Date, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame);
if (window.top === window) window.rrwebRecord.record({
  // Nothing is kept until the flow itself starts, after whatever the app's setup did on the page.
  emit: (event) => window.__vantage?.(event),
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

let pointer: { page: Page; x: number; y: number } | undefined;

// The flow underway: what waits for its page to rest, and what was read at the end of each step so far, with its picture.
type Underway = { page: Page; events: { timestamp: number }[]; rest: () => Promise<void>; depth: number; readings: Omit<Reading, "picture">[]; pictures: Buffer[] };
let underway: Underway | undefined;

// What every flow of the app starts from, made by vantage/setup.ts before each flow, if the app has one: its default
// export is given the page and Playwright's request, and what it returns is each flow's “setup”.
const { setup: setupFile } = repo(run?.root);
type MakeSetup = (given: { page: Page; request: APIRequestContext; baseURL?: string }) => unknown;
// In an app whose package.json doesn't say it's a module, Playwright loads the file as CommonJS, its export one level down.
const setupModule: { default?: MakeSetup | { default?: MakeSetup } } | undefined = existsSync(setupFile) ? await import(pathToFileURL(setupFile).href) : undefined;
const makeSetup = typeof setupModule?.default === "function" ? setupModule.default : setupModule?.default?.default;

// Every round starts at the same moment, noon on the day the review started, with the page's random numbers from the same
// seed, so what the page works out from them reads the same each time. The clock runs on from there, as a person's does:
// page.clock.setFixedTime would stop it, and whatever the page times by it.
const DAY = (started: string) => new Date(`${started.slice(0, 10)}T12:00:00Z`);
const seeded = `(() => {
  let seed = 20251026;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

const recorded = base.extend<{ setup: Record<string, any>; recorder: void }>({
  // In one language and time zone wherever it's recorded.
  locale: "en-US",
  timezoneId: "UTC",
  setup: async ({ page, request, baseURL }, use, testInfo) => {
    // Recording flows added later on Before, the others aren't run, nor is anything made for them.
    if (run?.only && !run.only.includes(testInfo.title)) testInfo.skip();
    if (run) {
      // rrweb goes in first, to take the page's own clock before it's set.
      await page.addInitScript({ content: recorder(run.recorder) });
      await page.clock.setSystemTime(DAY(run.started));
      await page.addInitScript({ content: seeded });
    }
    await use(((await makeSetup?.({ page, request, baseURL })) ?? {}) as Record<string, any>);
  },
  recorder: [
    // Once what the flow starts from is made, so making it isn't in the recording.
    async ({ page, setup: _ }, use, testInfo) => {
      if (!run) return use();
      testInfo.setTimeout(testInfo.timeout * 3);
      const events: { timestamp: number }[] = [];
      await page.exposeFunction("__vantage", (event: { timestamp: number }) => void events.push(event));
      const assets = keepAssets(page, run.folder);
      const rest = await watchRest(page);
      pace(page);
      pointer = { page, x: 640, y: 640 };
      underway = { page, events, rest, depth: 0, readings: [], pictures: [] };
      const { readings, pictures } = underway;
      await page.mouse.move(pointer.x, pointer.y);
      try {
        await use();
      } finally {
        pointer = undefined;
        underway = undefined;
      }
      const ended = testInfo.status === testInfo.expectedStatus;
      if (!ended && !run.before) return;
      if (ended) {
        await page.waitForTimeout(HOLD);
        // Nothing changes while the end holds, so a last event makes the recording long enough to include it.
        await page.evaluate(() => (window as any).rrwebRecord.record.addCustomEvent("end", {}));
        await page.waitForTimeout(100);
      }
      await testInfo.attach(RECORDING, { body: JSON.stringify(events), contentType: "application/json" });
      await testInfo.attach(READINGS, { body: JSON.stringify(readings), contentType: "application/json" });
      await testInfo.attach(ASSETS, { body: JSON.stringify(await assets()), contentType: "application/json" });
      for (const picture of pictures) await testInfo.attach(PICTURE, { body: picture, contentType: "image/png" });
    },
    { auto: true },
  ],
});

// A flow's steps are the ones it takes itself, not steps inside them. Each ends once the page is at rest, and the page
// it left is read there, unless the step failed.
const playwrightStep = base.step;
const step = Object.assign(async (title: string, body: (info: unknown) => unknown, options?: object) => {
  const flow = underway;
  if (!flow || flow.depth) return playwrightStep(title, body, options);
  return playwrightStep(
    title,
    async (info) => {
      flow.depth++;
      let done: unknown;
      try {
        done = await body(info);
      } finally {
        flow.depth--;
      }
      await flow.rest();
      const at = seconds(Date.now() - (flow.events[0]?.timestamp ?? Date.now()));
      await unhovered(flow.page, async () => {
        const { screen, things } = await readPage(flow.page);
        flow.readings.push({ step: title, at, screen, things });
        flow.pictures.push(await flow.page.screenshot({ animations: "disabled", caret: "hide" }));
      });
      return done;
    },
    options,
  );
}, playwrightStep) as typeof base.step;

// A test built on this one with extend() keeps its steps, and so does anything built on that in turn: Playwright's own
// would record no readings.
function withSteps<T extends typeof recorded>(test: T): T {
  const extend = test.extend;
  return Object.assign(test, { step, extend: (...args: Parameters<typeof extend>) => withSteps(extend.apply(test, args)) });
}
export const test = withSteps(recorded);

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
