// What every flow imports in place of "@playwright/test". While `playthrough record` runs, it records each flow the way a person
// would watch it: rrweb in every page, the pointer gliding to what it acts on, and a beat after each action so its result can
// be seen. Each step ends once the page is at rest, and the page it left is read there, with a picture of it: what the
// comparison compares. Run as plain tests, it does nothing. Each recording and its readings go to the reporter, which makes
// them a flow (reporter.ts). Taken over, a flow runs in Playthrough itself instead (following.ts), on the same pace and steps.

import { test as base, expect as playwrightExpect, type APIRequestContext, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from "@playwright/test";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Glimpse, Reading } from "@playthrough/page";
import { keepAssets, type Assets } from "./assets.ts";
import type { Did } from "@playthrough/review";
import { ALONGSIDE, BEAT, REACHES_OUTSIDE, WALKED, type Action, type Handed, type Run, type To, type Walk, type Walked } from "./flows.ts";
import { readPage, unhovered } from "./read.ts";
import { repo } from "./repo.ts";
import { ACTIONS, ASSETS, firstLine, GLIMPSES, HANDS, HOLD, PERSON, PICTURE, READINGS, RECORDING, seconds, type Failed, type Hand } from "./reporter.ts";
import { watchRest } from "./rest.ts";
import { firstOf, make, personIn, setupIn, type Made, type Setup } from "./setup.ts";

// The screens besides the laptop every flow is on unless it says otherwise: a phone, tapped, and a tablet. A flow takes
// one with test.use, and so does someone it's handed to.
export type Screen = Pick<BrowserContextOptions, "viewport" | "isMobile" | "hasTouch" | "timezoneId" | "colorScheme">;
export const phone: Screen = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
export const tablet: Screen = { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true };
const LAPTOP = { width: 1280, height: 800 };

// Everything it needs comes with the run (flows.ts), so it never has to find anything for itself.
const run: Run | undefined = process.env.PLAYTHROUGH_RUN ? JSON.parse(process.env.PLAYTHROUGH_RUN) : undefined;

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
  emit: (event) => window.__playthrough?.(event),
  // every input, not just the last: with "last", rrweb only hears a field change when it loses focus,
  // so words typed into a search box that kept focus never reached the recording
  sampling: { mousemove: 20, scroll: 16, input: "all" },
  maskAllInputs: false,
  inlineStylesheet: true,
});`;

// Playwright acts instantly, and a recording made at that speed can't be watched.
const FRAME = 16; // a move each frame while gliding or scrolling
const REST = 140; // the pointer rests on its target before acting
const KEY = 60; // words are typed a key at a time, this far apart
const TYPED = 1500; // and a long text no slower than this, all told
const SAVING = 100; // taking over, how soon an action that saves or goes to another page shows it
const HANDING = 1200; // handed on, the page left holds this long, and the new hand rests this long before acting

let pointer: { page: Page; x: number; y: number; handed?: boolean } | undefined;

// The flow underway: the page it's on now, what waits for that page to rest, what was read at the end of each step so
// far, with its picture, and when each action was done; the step it's in, and how many of that step's actions are done;
// whoever it's been handed to, and the assets each page loaded; and walking a fork again, once the fork's steps have
// begun, how far they got.
type Underway = { page: Page; events: { timestamp: number }[]; rest: () => Promise<void>; depth: number; readings: Omit<Reading, "picture">[]; glimpses: Glimpse[]; pictures: Buffer[]; actions: number[]; step?: string; inStep: number; hands: Hand[]; assets: (() => Promise<Assets>)[]; walked?: Walked };
let underway: Underway | undefined;

// What every flow starts from (setup.ts), loaded once a run.
let appSetup: Promise<Setup> | undefined;
const setupOf = () => (appSetup ??= setupIn(repo(run?.root).setup));

// Every round runs on the day the review started, at the time of day it's recorded, with the page's random numbers from
// the same seed, so what the page works out from the day reads the same each time. The app's server keeps the real time,
// which nothing here sets, and on the real time of day what it stamps reads as it would: a card the setup made was made
// “less than a minute ago”, in every round that day. On a later day, the server's times are that many days ahead. The
// clock runs on from there, as a person's does: page.clock.setFixedTime would stop it, and whatever the page times by it.
const DAY = 24 * 60 * 60 * 1000;
export const onReviewDay = (started: string, now = Date.now()) => new Date(now - (Math.floor(now / DAY) - Math.floor(Date.parse(started) / DAY)) * DAY);
const seeded = `(() => {
  let seed = 20251026;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

// Someone else carries the flow on, on a page of their own in the same world, on their screen.
export type HandTo = (person: string, screen?: Screen) => Promise<Page>;

const recorded = base.extend<{ person: string | undefined; rest: () => Promise<void>; setup: Record<string, any>; handTo: HandTo; recorder: void }>({
  // In one language and time zone wherever it's recorded.
  locale: "en-US",
  timezoneId: "UTC",
  // Who the flow is done as: one of the app's people (setup.ts), named by its file with test.use, or else the first.
  person: [async ({}, use) => use(firstOf(await setupOf())), { option: true }],
  // What waits for the page to come to rest, watching it from before setup sets its clock (rest.ts).
  rest: async ({ page }, use) => use(run ? await watchRest(page) : async () => {}),
  setup: async ({ page, request, baseURL, person, rest: _ }, use, testInfo) => {
    // Recording flows added later on Before, the others aren't run, nor is anything made for them. Walking a fork again,
    // only the flow it's off.
    if (run?.only && !run.only.includes(testInfo.title)) testInfo.skip();
    if (run?.walk && testInfo.title !== run.walk.flow) testInfo.skip();
    const app = await setupOf();
    if (person) personIn(app, person);
    if (run) await readied(page, run);
    const made = await make(app, repo(run?.root).borrowed, { page, request, baseURL: baseURL!, person });
    if (person) await app.signIn?.({ page, person, setup: made.setup });
    await use(made.setup);
    await made.giveBack();
  },
  // Handed on, someone else is signed in by the app's setup on a page of their own, and recorded, the flow carries on
  // there: its own page says no more.
  handTo: async ({ browser, baseURL, setup }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (person, screen = {}) => {
      const app = await setupOf();
      personIn(app, person);
      const { page, context } = await pageFor(browser, baseURL!, screen);
      opened.push(context);
      const flow = underway;
      const rest = run && flow && (await watchRest(page));
      if (run && flow) await readied(page, run);
      await app.signIn?.({ page, person, setup });
      if (run && flow && rest) await carryOn(flow, page, rest, person, run);
      return page;
    });
    for (const context of opened) await context.close();
  },
  recorder: [
    // Once what the flow starts from is made, so making it isn't in the recording; and kept until the pages it was
    // handed to are done with, as it ends on the last of them.
    async ({ page, setup, rest, person, handTo: _ }, use, testInfo) => {
      if (!run) return use();
      testInfo.setTimeout(testInfo.timeout * 3);
      const flow: Underway = { page, events: [], rest, depth: 0, readings: [], glimpses: [], pictures: [], actions: [], inStep: 0, hands: [], assets: [] };
      // Only the page the flow is on is recorded: handed on, it carries on on the other's.
      await page.exposeFunction("__playthrough", (event: { timestamp: number }) => void (flow.page === page && flow.events.push(event)));
      flow.assets.push(keepAssets(page, run.folder));
      pace(page);
      pointer = { page, x: 640, y: 640 };
      underway = flow;
      const { events, readings, glimpses, pictures, actions } = flow;
      await page.mouse.move(pointer.x, pointer.y);
      try {
        await use();
      } finally {
        pointer = undefined;
        underway = undefined;
      }
      // It ends on the page it's on: its own, or the last one it was handed to.
      const last = flow.page;
      const assets = async () => Object.assign({}, ...(await Promise.all(flow.assets.map((kept) => kept()))));
      // A fork walked again is kept as far as its steps got, with when each was done; one whose flow never got to where
      // it was taken over leaves nothing.
      if (run.walk) {
        if (!flow.walked) return;
        await last.waitForTimeout(HOLD);
        await last.evaluate(() => (window as any).rrwebRecord.record.addCustomEvent("end", {}));
        await last.waitForTimeout(100);
        return writeFileSync(join(run.folder, WALKED), JSON.stringify({ ...flow.walked, events, readings, assets: await assets() }));
      }
      const ended = testInfo.status === testInfo.expectedStatus;
      if (!ended && !run.before) return;
      if (ended) {
        await last.waitForTimeout(HOLD);
        // Nothing changes while the end holds, so a last event makes the recording long enough to include it.
        await last.evaluate(() => (window as any).rrwebRecord.record.addCustomEvent("end", {}));
        await last.waitForTimeout(100);
      }
      await testInfo.attach(RECORDING, { body: JSON.stringify(events), contentType: "application/json" });
      await testInfo.attach(READINGS, { body: JSON.stringify(readings), contentType: "application/json" });
      await testInfo.attach(GLIMPSES, { body: JSON.stringify(glimpses), contentType: "application/json" });
      await testInfo.attach(ASSETS, { body: JSON.stringify(await assets()), contentType: "application/json" });
      await testInfo.attach(ACTIONS, { body: JSON.stringify(actions), contentType: "application/json" });
      // Who it's done as: who its file names, or else who the app's setup says.
      const who = person ?? (typeof setup.person === "string" ? setup.person.trim() : undefined);
      if (who) await testInfo.attach(PERSON, { body: who, contentType: "text/plain" });
      if (flow.hands.length) await testInfo.attach(HANDS, { body: JSON.stringify(flow.hands), contentType: "application/json" });
      for (const picture of pictures) await testInfo.attach(PICTURE, { body: picture, contentType: "image/png" });
    },
    { auto: true },
  ],
});

// A page recorded, readied before anything loads in it: rrweb first, to take the page's own clock before it's set, then
// the review's day and the seeded random numbers.
async function readied(page: Page, run: Run) {
  await page.addInitScript({ content: recorder(run.recorder) });
  await page.clock.setSystemTime(onReviewDay(run.started));
  await page.addInitScript({ content: seeded });
}

// A window of its own, in one language and time zone as every flow is, on the laptop unless it's on another screen.
export async function pageFor(browser: Browser, baseURL: string, screen: Screen) {
  const context = await browser.newContext({ baseURL, locale: "en-US", timezoneId: "UTC", viewport: LAPTOP, ...screen });
  return { context, page: await context.newPage() };
}

// The flow, handed on: from here, its page is the one it was handed to, read at each step's end and paced as its own was,
// and the recording carries on there. A page signing in already loaded is taken whole now, as it was before the
// recording heard it; otherwise the recording carries on with the first page it loads.
async function carryOn(flow: Underway, page: Page, rest: () => Promise<void>, person: string, run: Run) {
  // So you see what the one handing it on left it at, before the frame becomes the other's.
  await flow.page.waitForTimeout(HANDING);
  await page.exposeFunction("__playthrough", (event: { timestamp: number }) => void (flow.page === page && flow.events.push(event)));
  flow.assets.push(keepAssets(page, run.folder));
  flow.hands.push({ at: Date.now(), person });
  Object.assign(flow, { page, rest });
  const size = page.viewportSize() ?? LAPTOP;
  pointer = { page, x: size.width / 2, y: size.height * 0.8, handed: true };
  if (page.url() !== "about:blank") await page.evaluate(() => (window as any).rrwebRecord?.record.takeFullSnapshot());
}

// Taken over, a flow runs in Playthrough (following.ts), unrecorded, on the recordings' clock, which the person carries on
// with. It's told how far the playhead has gone, and told again each time it moves; once the playhead rests where the
// flow is, to hand its page over; and to stop, once it's no longer wanted.
export type Orders = { to: To; stopped?: boolean; moved?: () => void };
// A flow, as its file gives it to test(): with the page, what Playwright gives every test besides, and the setup.
export type Body = (given: { page: Page; context: BrowserContext; request: APIRequestContext; baseURL: string; setup: Record<string, any>; handTo: HandTo }) => Promise<unknown>;

// Loaded in Playthrough, each flow is kept by its name instead of run. A file at a time, as test() can't tell whose it is.
// With what it does outside the app, if its file says so (REACHES_OUTSIDE): an email sent, a card charged, a paid API
// called. Such a flow is run only when it's taken over, never ahead of the playhead, where every pause would do it again.
// And everything its file says with test.use: the window it's recorded in, like a phone's screen and touch, and who it's
// done as.
export type Kept = { body: Body; outside?: string; use: BrowserContextOptions & { person?: string } };
let collecting: Map<string, Kept> | undefined;
// The file being loaded, and each describe() in it around the flows being kept now: what it says with test.use, and
// what its annotation says the flows in it do outside the app.
let around: { use: Kept["use"]; outside?: string }[] = [];
let loading = Promise.resolve();
export function flowsIn(file: string, written: number): Promise<Map<string, Kept>> {
  const flows = new Map<string, Kept>();
  const loaded = loading.then(async () => {
    [collecting, around] = [flows, [{ use: {} }]];
    try {
      await import(`${pathToFileURL(file).href}?${written}`);
    } finally {
      [collecting, around] = [undefined, []];
    }
    return flows;
  });
  loading = loaded.then(() => {}, () => {});
  return loaded;
}

// The flow being taken over, how deep in its steps it is, as only its own steps are places to take it over, and the
// step it's in, with how many of its actions are done.
// What's only in the page's memory, like a search typed or a form opened, wouldn't survive loading it in the person's
// browser. So it's handed over as it was before the actions that only changed what's on it (`from`), however many steps
// back, and they're done again there. One that wrote something, or went to another address, isn't, nor anything before
// it: a fresh load of the page has those already. `address` is where the last of them left the page.
// The steps it has finished say how far it has got, against how far the playhead has. Several run at once, one for each
// review open, each in its own window, and each knows its own by what it was called from. And how long it has worked,
// not counting waiting for the playhead, which it says as it gets to each place to take it over: on the same app, the
// same each time to within a few percent. While it waits, it can be told to go on (`moved`).
type Taking = { page: Page; depth: number; rest: () => Promise<void>; step?: string; actions: number; from?: Handed; again: Action[]; address?: string; wrote: boolean; passed: string[]; orders: Orders; handed?: Handed; began: number; waited: number; arrived?: Arrived };
export type Arrived = (step: string | undefined, actions: number | undefined, worked: number) => void;
const taking = new AsyncLocalStorage<Taking>();

// What's kept to do again holds while the page is still where the last of it left it, and nothing has been saved since.
const holds = (flow: Taking) => !flow.wrote && flow.page.url() === flow.address;

// The playhead went back before it, it's been handed over, or it's no longer wanted: the flow goes no further.
class Stopped extends Error {}

export async function runAlongside(
  page: Page,
  { request, baseURL, started, setup: appSetup, borrowed, arrived, person }: { request: APIRequestContext; baseURL: string; started: string; setup: Setup; borrowed: string; arrived?: Arrived; person?: string },
  body: Body,
  orders: Orders,
): Promise<{ handed?: Handed; stopped?: Pick<Failed, "at" | "why">; made?: Made }> {
  // Each page the run goes on, readied as the flow's was when it was recorded, and what it writes noted.
  const readied = async (page: Page) => {
    const rest = await watchRest(page);
    await page.clock.setSystemTime(onReviewDay(started));
    await page.addInitScript({ content: seeded });
    page.on("request", (request) => void (["GET", "HEAD", "OPTIONS"].includes(request.method()) || (flow.wrote = true)));
    return rest;
  };
  const flow: Taking = { page, depth: 0, rest: async () => {}, actions: 0, again: [], wrote: false, passed: [], orders, began: Date.now(), waited: 0, arrived };
  flow.rest = await readied(page);
  pace(page);
  // Handed on, the run carries on on the other's page, as the recording does: where the playhead rests there, it's that
  // page that's handed over.
  const opened: BrowserContext[] = [];
  return taking.run(flow, async () => {
    let made: Made | undefined;
    const handTo: HandTo = async (person, screen = {}) => {
      personIn(appSetup, person);
      const next = await pageFor(page.context().browser()!, baseURL, screen);
      opened.push(next.context);
      const rest = await readied(next.page);
      await appSetup.signIn?.({ page: next.page, person, setup: made?.setup ?? {} });
      Object.assign(flow, { page: next.page, rest, from: undefined, again: [] });
      return next.page;
    };
    try {
      // Who the flow is done as, as when it was recorded: who its file names, or else the first the app names.
      const who = person ?? firstOf(appSetup);
      if (who) personIn(appSetup, who);
      made = await make(appSetup, borrowed, { page, request, baseURL, person: who });
      if (who) await appSetup.signIn?.({ page, person: who, setup: made.setup });
      await body({ page, context: page.context(), request, baseURL, setup: made.setup, handTo });
      await reached(flow);
      return { handed: flow.handed, made };
    } catch (error) {
      if (error instanceof Stopped || orders.stopped) return { handed: flow.handed, made };
      return { stopped: { at: flow.step, why: firstLine(String((error as Error)?.message ?? error)) }, made };
    } finally {
      for (const context of opened) await context.close().catch(() => {});
    }
  });
}

// After an action, at a step's end, or at the flow's end (no step): it goes on once the playhead has passed, waits while
// the playhead is there, and hands over once it rests there. Nothing here can be undone, so if the playhead went back
// before it, it stops.
async function reached(flow: Taking, step?: string, actions?: number) {
  flow.arrived?.(step, actions, Date.now() - flow.began - flow.waited);
  for (;;) {
    const { to, stopped } = flow.orders;
    if (stopped) throw new Stopped();
    const where = against(flow.passed, step, actions, to);
    if (where === "on") return;
    if (where === "here" && to.rests) await handOver(flow, to.did);
    if (where === "past" || to.rests) {
      if (step) throw new Stopped();
      return;
    }
    const since = Date.now();
    await new Promise<void>((moved) => (flow.orders.moved = moved));
    flow.orders.moved = undefined;
    flow.waited += Date.now() - since;
  }
}

function against(passed: string[], step: string | undefined, actions: number | undefined, to: To): "on" | "here" | "past" {
  if (!step) return to.step ? "past" : "here";
  if (!to.step) return "on";
  if (passed.includes(to.step)) return "past";
  if (to.step !== step) return "on";
  if (actions === undefined) return to.actions === undefined ? "here" : "past";
  return to.actions === undefined || to.actions > actions ? "on" : to.actions === actions ? "here" : "past";
}

// The page as it is once it's at rest, as each step's is read, for the person to carry on from (take-over.ts).
// Straight after its last action, it was still on its way to the next page.
async function kept(page: Page, rest: () => Promise<void>): Promise<Handed> {
  await rest();
  const kept = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    scroll: { x: scrollX, y: scrollY },
    clock: Date.now(),
    browser: { dark: matchMedia("(prefers-color-scheme: dark)").matches, still: matchMedia("(prefers-reduced-motion: reduce)").matches, languages: [...navigator.languages] },
  }));
  return { url: page.url(), cookies: await page.context().cookies(), ...kept, clock: kept.clock - Date.now() };
}

// The flow goes no further. Taken over where a person was on their fork, their steps are done here first, as a person
// does them, so what they saved is saved, and the page is handed over as they left it: done again in their browser, a
// date picked in a calendar never took.
async function handOver(flow: Taking, did?: Did[]) {
  const { page, rest, from, again } = flow;
  if (did?.length) {
    // Theirs, not the flow's: none of them is a place to take the flow over.
    await taking.exit(async () => {
      for (const one of did) {
        const done = await doAgain(page, one).then(() => true, () => false);
        if (!done) break;
        await rest();
      }
    });
    flow.handed = await kept(page, rest);
    return;
  }
  flow.handed = from && again.length && holds(flow) ? { ...from, again } : await kept(page, rest);
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
  const taken = taking.getStore();
  if (taken) {
    const own = !taken.depth;
    if (own) Object.assign(taken, { step: title, actions: 0 });
    taken.depth++;
    let done: unknown;
    try {
      done = await body(undefined);
    } finally {
      taken.depth--;
    }
    if (own) {
      await reached(taken, title);
      taken.passed.push(title);
    }
    return done;
  }
  const flow = underway;
  if (!flow || flow.depth) return playwrightStep(title, body, options);
  return playwrightStep(
    title,
    async (info) => {
      Object.assign(flow, { step: title, inStep: 0 });
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
      if (run?.walk?.step === title && run.walk.actions === undefined && !flow.walked) await walkOn(flow, run.walk);
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
// Loaded in Playthrough, which says so first (following.ts), test() keeps each flow by its name instead. It's settled once,
// as the file loads: wrapped, Playwright's test() would take the wrapper for where each test is written.
type Annotation = { type: string; description?: string };
const outsideIn = (details: unknown) => {
  const said = [(details as { annotation?: Annotation | Annotation[] } | undefined)?.annotation ?? []].flat().find((annotation) => annotation.type === REACHES_OUTSIDE);
  return said && (said.description?.trim() || "it reaches outside the app");
};
// As in Playwright, what a file or a describe() in it says with test.use holds for every flow in it, wherever it's said
// there, and so does what its annotation says the flows do outside the app; what's said nearer a flow goes over what's
// said further out.
const keeping: object = Object.assign(
  (title: string, ...rest: unknown[]) => {
    const scopes = [...around];
    collecting?.set(title, {
      body: rest.at(-1) as Body,
      outside: (rest.length > 1 ? outsideIn(rest[0]) : undefined) ?? scopes.findLast((scope) => scope.outside)?.outside,
      // Once the file has loaded, so what's said after the flow holds too.
      get use() {
        return Object.assign({}, ...scopes.map((scope) => scope.use));
      },
    });
  },
  {
    step,
    use: (options: Kept["use"]) => void Object.assign(around.at(-1)?.use ?? {}, options),
    describe: (...given: unknown[]) => {
      around.push({ use: {}, outside: given.length > 2 ? outsideIn(given[1]) : undefined });
      try {
        (given.at(-1) as () => void)();
      } finally {
        around.pop();
      }
    },
    extend: () => keeping,
  },
);
export const test = (globalThis as Record<symbol, unknown>)[ALONGSIDE] ? (keeping as unknown as typeof recorded) : withSteps(recorded);

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
      // Handed on, the new hand shows on its page and rests there a moment before it does anything.
      if (pointer?.handed) {
        pointer.handed = false;
        await pointer.page.mouse.move(pointer.x, pointer.y);
        await pointer.page.waitForTimeout(HANDING);
      }
      if (pointer) await approach(this, pointer);
      // Filled in on a recording, words are typed as a person types them, where they're typed: a date or a number is
      // set as it is, as typing it can come out otherwise.
      const [text, options] = args as [unknown, { timeout?: number } | undefined];
      const typed = pointer && action === "fill" && typeof text === "string" && text && (await typedInto(this)) ? text : undefined;
      const act = typed
        ? async () => {
            await original.call(this, "", options);
            await this.pressSequentially(typed, { ...options, delay: Math.min(KEY, TYPED / typed.length) });
          }
        : () => original.apply(this, args);
      const result = await acted(action, () => pathTo(this), act, args[0]);
      if (pointer) await pointer.page.waitForTimeout(BEAT);
      await glimpse();
      return result;
    };
  }
  // Typing and pressing keys are actions too, on whatever has the focus, on the page taken over.
  const keyboard = Object.getPrototypeOf(page.keyboard);
  const focused = async (page: Page) => {
    const on = page.locator(":focus").first();
    return (await on.count()) ? pathTo(on) : undefined;
  };
  for (const [action, does] of [["type", "type"], ["insertText", "type"], ["press", "press"]] as const) {
    const original = keyboard[action];
    keyboard[action] = async function (this: unknown, ...args: unknown[]) {
      return acted(does, focused, () => original.apply(this, args), args[0]);
    };
  }
}

// An action is done, and when, and kept to be done again in the person's browser if it only changed what's on the page;
// the flow is handed over once it's done as many as the recording had.
async function acted(does: string, target: (page: Page) => Promise<string | undefined>, act: () => Promise<unknown>, given: unknown) {
  const taken = taking.getStore();
  const keeping = taken?.depth ? taken : undefined;
  let on: string | undefined, address: string | undefined;
  if (keeping) {
    if (!holds(keeping)) Object.assign(keeping, { from: undefined, again: [] });
    keeping.from ??= await kept(keeping.page, keeping.rest);
    keeping.wrote = false;
    [on, address] = [await target(keeping.page), keeping.page.url()];
  }
  const result = await act();
  underway?.actions.push(Date.now());
  // Walking a fork again, it leaves the flow where the person did, after as many of the step's actions.
  const walk = run?.walk;
  if (walk && underway?.depth && !underway.walked && walk.step === underway.step && walk.actions === ++underway.inStep) {
    await underway.page.waitForTimeout(BEAT);
    await walkOn(underway, walk);
  }
  if (keeping) {
    // Done again where the person takes over, it needn't wait for the page to be still here: only to see whether it
    // saved something or went to another page, which shows at once. The next action's page is waited for as it's taken.
    await keeping.page.waitForTimeout(SAVING);
    const plain = typeof given === "string" || typeof given === "boolean" || (Array.isArray(given) && given.every((one) => typeof one === "string"));
    if (on && !keeping.wrote && keeping.page.url() === address) Object.assign(keeping, { address }).again.push({ does, on, ...(plain && { with: given }) });
    else Object.assign(keeping, { from: undefined, again: [] });
  }
  if (keeping) await reached(keeping, keeping.step, ++keeping.actions);
  return result;
}

// The person's steps done again where they took the flow over, recorded as the flow is, the pointer gliding to each: as
// far as they get, and then the flow goes no further. After each, the page is read, and what their notes are on is
// looked for, with a picture of it for the agent.
async function walkOn(flow: Underway, walk: Walk) {
  await flow.rest();
  const since = () => seconds(Date.now() - (flow.events[0]?.timestamp ?? Date.now()));
  const walked: Walked = (flow.walked = { from: since(), done: [], found: [] });
  const look = async () => {
    for (const [i, { after, css }] of walk.look.entries()) {
      if (after !== walked.done.length) continue;
      walked.found[i] = css
        ? await flow.page.evaluate((css) => {
            const on = document.querySelector(css);
            const node = on ? (window as any).rrwebRecord.record.mirror.getId(on) : -1;
            return node > 0 ? node : null;
          }, css).catch(() => null)
        : null;
      writeFileSync(join(run!.folder, `look-${i}.png`), await flow.page.screenshot({ animations: "disabled", caret: "hide" }));
    }
  };
  await look();
  for (const did of walk.did) {
    try {
      await doAgain(flow.page, did);
    } catch {
      walked.stopped = did.what || did.on;
      break;
    }
    await flow.rest();
    walked.done.push(since());
    await unhovered(flow.page, async () => {
      const { screen, things } = await readPage(flow.page);
      flow.readings.push({ step: "In the app", at: since(), screen, things });
    });
    await look();
  }
  base.info().skip(true, "Walked as far as the person's steps go");
}

// One of a person's steps, done again as the flow does its own: on what's at its path, by the paced actions.
async function doAgain(page: Page, { does, on, with: given }: Did) {
  const target = page.locator(on).first();
  const quickly = { timeout: 3000 };
  if (does === "fill") await target.fill(String(given ?? ""), quickly);
  else if (does === "type") await target.pressSequentially(String(given ?? ""), quickly);
  else if (does === "press") await target.press(String(given ?? "Enter"), quickly);
  else if (does === "selectOption") await target.selectOption(given as string | string[], quickly);
  else if (does === "dblclick") await target.dblclick(quickly);
  else if (does === "hover") await target.hover(quickly);
  else if (does === "check" || does === "uncheck") await target[does](quickly);
  // A person's click went where they pointed, whatever was over it, as a click outside an open menu closes it.
  else await target.click({ timeout: 1000 }).catch(() => target.click({ ...quickly, force: true }));
}

// A target out of view is scrolled to first, smoothly, the way a person scrolls. Left to Playwright, the page jumped there
// at the moment of the click, and the pointer glided towards a spot below the window first.
// Recorded, the page is read just after each action as well, for what a note can be on: a menu or a dialog can come
// and go inside a step, gone by its end, where the page is read for the comparison. It takes a few hundredths of a
// second, after the beat; a page on its way to another address has nothing to read.
async function glimpse() {
  const flow = underway;
  if (!pointer || !flow || run?.walk) return;
  const at = seconds(Date.now() - (flow.events[0]?.timestamp ?? Date.now()));
  const read = await readPage(flow.page).catch(() => undefined);
  if (read) flow.glimpses.push({ step: flow.step ?? "", at, ...read });
}

// Somewhere a person types words: a text box, a text area, an editor.
const typedInto = (target: Locator) =>
  target
    .evaluate((on) => (on as HTMLElement).isContentEditable || on instanceof HTMLTextAreaElement || (on instanceof HTMLInputElement && ["text", "search", "email", "url", "tel", "password"].includes(on.type)))
    .catch(() => false);

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
