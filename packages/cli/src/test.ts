// What every flow imports in place of "@playwright/test". While `vantage record` runs, it records each flow the way a person
// would watch it: rrweb in every page, the pointer gliding to what it acts on, and a beat after each action so its result can
// be seen. Each step ends once the page is at rest, and the page it left is read there, with a picture of it: what the
// comparison compares. Run as plain tests, it does nothing. Each recording and its readings go to the reporter, which makes
// them a flow (reporter.ts).

import { test as base, expect as playwrightExpect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Reading } from "@mostlyworks/vantage-page";
import { keepAssets } from "./assets.ts";
import { HANDED, type Action, type Handed, type Run, type To } from "./flows.ts";
import { readPage, unhovered } from "./read.ts";
import { repo } from "./repo.ts";
import { ACTIONS, ASSETS, HOLD, PERSON, PICTURE, READINGS, RECORDING, seconds } from "./reporter.ts";
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

// The flow underway: what waits for its page to rest, what was read at the end of each step so far, with its picture,
// and when each action was done.
type Underway = { page: Page; events: { timestamp: number }[]; rest: () => Promise<void>; depth: number; readings: Omit<Reading, "picture">[]; pictures: Buffer[]; actions: number[] };
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
    // Waiting in the background, with its browser open, it's told which flow to take over, and where, once someone asks.
    if (run?.orders && !run.to!.flow) {
      testInfo.setTimeout(0);
      Object.assign(run.to!, await ordered(run.orders));
      testInfo.setTimeout(testInfo.project.timeout);
    }
    // Recording flows added later on Before, the others aren't run, nor is anything made for them.
    if (run?.only && !run.only.includes(testInfo.title)) testInfo.skip();
    // Taken over, only that flow runs, unrecorded, on the recordings' clock, which the person carries on with.
    if (run?.to && testInfo.title !== run.to.flow) testInfo.skip();
    if (run) {
      // rrweb goes in first, to take the page's own clock before it's set.
      if (!run.to) await page.addInitScript({ content: recorder(run.recorder) });
      await page.clock.setSystemTime(DAY(run.started));
      await page.addInitScript({ content: seeded });
    }
    if (run?.to) {
      const now: NonNullable<typeof taking> = { page, depth: 0, rest: await watchRest(page), actions: 0, again: [], wrote: false };
      taking = now;
      page.on("request", (request) => void (["GET", "HEAD", "OPTIONS"].includes(request.method()) || (now.wrote = true)));
      pace(page);
    }
    await use(((await makeSetup?.({ page, request, baseURL })) ?? {}) as Record<string, any>);
    if (taking && run?.to && !run.to.step && testInfo.status === testInfo.expectedStatus) await handOver(taking);
  },
  recorder: [
    // Once what the flow starts from is made, so making it isn't in the recording.
    async ({ page, setup }, use, testInfo) => {
      if (!run || run.to) return use();
      testInfo.setTimeout(testInfo.timeout * 3);
      const events: { timestamp: number }[] = [];
      await page.exposeFunction("__vantage", (event: { timestamp: number }) => void events.push(event));
      const assets = keepAssets(page, run.folder);
      const rest = await watchRest(page);
      pace(page);
      pointer = { page, x: 640, y: 640 };
      underway = { page, events, rest, depth: 0, readings: [], pictures: [], actions: [] };
      const { readings, pictures, actions } = underway;
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
      await testInfo.attach(ACTIONS, { body: JSON.stringify(actions), contentType: "application/json" });
      if (typeof setup.person === "string" && setup.person.trim()) await testInfo.attach(PERSON, { body: setup.person.trim(), contentType: "text/plain" });
      for (const picture of pictures) await testInfo.attach(PICTURE, { body: picture, contentType: "image/png" });
    },
    { auto: true },
  ],
});

// The flow being taken over, how deep in its steps it is, as only its own steps are places to take it over, and the
// step it's in, with how many of its actions are done.
// Taken over partway through a step, what's only in the page's memory, like an open form, wouldn't survive loading it in
// the person's browser. So it's handed over as it was before the actions that only changed what's on it (`from`), and
// they're done again there. One that wrote something, or went to another address, isn't: it starts again after it.
let taking: { page: Page; depth: number; rest: () => Promise<void>; step?: string; actions: number; from?: Handed; again: Action[]; wrote: boolean } | undefined;

async function ordered(orders: string): Promise<To> {
  while (!existsSync(orders)) await new Promise((done) => setTimeout(done, 20));
  return JSON.parse(readFileSync(orders, "utf8"));
}

// The page as it is once it's at rest, as each step's is read, for the person to carry on from (take-over.ts).
// Straight after its last action, it was still on its way to the next page.
async function kept(page: Page, rest: () => Promise<void>): Promise<Handed> {
  await rest();
  const kept = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, scroll: { x: scrollX, y: scrollY }, clock: Date.now() }));
  return { url: page.url(), cookies: await page.context().cookies(), ...kept, clock: kept.clock - Date.now() };
}

// The flow goes no further.
async function handOver({ page, rest, from, again }: NonNullable<typeof taking>) {
  const handed = from && again.length ? { ...from, again } : await kept(page, rest);
  writeFileSync(join(run!.folder, HANDED), JSON.stringify(handed));
}

// Where an element is on its page, the same on a copy made the same way.
const pathTo = (target: Locator) =>
  target
    .evaluate((element) => {
      const path: string[] = [];
      for (let at: Element | null = element; at && at !== document.documentElement; at = at.parentElement) {
        let nth = 1;
        for (let before = at.previousElementSibling; before; before = before.previousElementSibling) if (before.tagName === at.tagName) nth++;
        path.unshift(`${at.tagName.toLowerCase()}:nth-of-type(${nth})`);
      }
      return ["html", ...path].join(" > ");
    }, undefined, { timeout: 5000 })
    .catch(() => undefined);

// A flow's steps are the ones it takes itself, not steps inside them. Each ends once the page is at rest, and the page
// it left is read there, unless the step failed.
const playwrightStep = base.step;
const step = Object.assign(async (title: string, body: (info: unknown) => unknown, options?: object) => {
  if (taking && run?.to) {
    const flow = taking;
    const own = !flow.depth;
    return playwrightStep(
      title,
      async (info) => {
        if (own) Object.assign(flow, { step: title, actions: 0 });
        flow.depth++;
        let done: unknown;
        try {
          done = await body(info);
        } finally {
          flow.depth--;
        }
        if (own && title === run.to!.step) {
          await handOver(flow);
          base.info().skip(true, "Taken over here");
        }
        return done;
      },
      options,
    );
  }
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

// Every action on an element glides there first and pauses after, and once it's done is a place to take the flow over.
// Patched once in each worker, for every locator.
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
      const result = await acted(action, () => pathTo(this), () => original.apply(this, args), args[0]);
      if (pointer) await pointer.page.waitForTimeout(BEAT);
      return result;
    };
  }
  // Typing and pressing keys are actions too, on whatever has the focus.
  const keyboard = Object.getPrototypeOf(page.keyboard);
  for (const [action, does] of [["type", "type"], ["insertText", "type"], ["press", "press"]] as const) {
    const original = keyboard[action];
    keyboard[action] = async function (this: unknown, ...args: unknown[]) {
      const focused = async () => {
        const on = page.locator(":focus").first();
        return (await on.count()) ? pathTo(on) : undefined;
      };
      return acted(does, focused, () => original.apply(this, args), args[0]);
    };
  }
}

// An action is done, and when, and taken over partway through the step it's in, kept to be done again in the person's
// browser if it only changed what's on the page; the flow is handed over once it's done as many as the recording had.
async function acted(does: string, target: () => Promise<string | undefined>, act: () => Promise<unknown>, given: unknown) {
  const handing = taking && run?.to?.actions && taking.step === run.to.step ? taking : undefined;
  let on: string | undefined, address: string | undefined;
  if (handing) {
    handing.from ??= await kept(handing.page, handing.rest);
    handing.wrote = false;
    [on, address] = [await target(), handing.page.url()];
  }
  const result = await act();
  underway?.actions.push(Date.now());
  if (handing) {
    await handing.rest();
    const plain = typeof given === "string" || typeof given === "boolean" || (Array.isArray(given) && given.every((one) => typeof one === "string"));
    if (on && !handing.wrote && handing.page.url() === address) handing.again.push({ does, on, ...(plain && { with: given }) });
    else Object.assign(handing, { from: undefined, again: [] });
    if (++handing.actions === run!.to!.actions) {
      await handOver(handing);
      base.info().skip(true, "Taken over here");
    }
  }
  return result;
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

  // A page still settling moves the target while the pointer is on its way, and Playwright then acts where it is now:
  // the pointer jumped there. So the pointer keeps its eye on the target, re-aiming as it goes, until both hold still.
  const centre = async () => {
    const box = await target.boundingBox({ timeout: 5000 }).catch(() => null);
    return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  let to = await centre();
  if (!to) return;
  for (let tries = 0; tries < 3 && to; tries++) {
    to = await glide(at, to, centre);
    await at.page.waitForTimeout(REST);
    const now = await centre();
    if (!now || Math.hypot(now.x - at.x, now.y - at.y) < 3) return;
    to = now;
  }
}

// The way a hand moves a pointer: longer the further it goes, speeding up and slowing down smoothly (minimum jerk), in a
// slight arc. A step at a time it was as fast across the screen as across a button: 2000px/s, and "fast and unnatural".
async function glide(at: { page: Page; x: number; y: number }, aim: { x: number; y: number }, centre: () => Promise<{ x: number; y: number } | null>) {
  const from = { x: at.x, y: at.y };
  let to = aim;
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  if (far < 1) return to;
  const takes = Math.min(800, 220 + 110 * Math.log2(1 + far / 24));
  const bow = Math.min(36, far * 0.08) * (from.x <= to.x ? 1 : -1);
  const began = Date.now();
  for (let frame = 0; ; frame++) {
    const t = Math.min(1, (Date.now() - began) / takes);
    const k = t ** 3 * (10 - 15 * t + 6 * t ** 2);
    const [dx, dy] = [to.x - from.x, to.y - from.y];
    const length = Math.hypot(dx, dy) || 1;
    const side = bow * Math.sin(Math.PI * k);
    await at.page.mouse.move(from.x + dx * k - (dy / length) * side, from.y + dy * k + (dx / length) * side);
    if (t === 1) break;
    // A look at the target now and then, so a move of the page bends the path rather than ending in a jump.
    if (frame % 6 === 5) to = (await centre()) ?? to;
    await at.page.waitForTimeout(FRAME);
  }
  Object.assign(at, to);
  return to;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
