// What every scene imports in place of "@playwright/test". While `playthrough record` runs, it records each scene the way a person
// would watch it: rrweb in every page, the pointer gliding to what it acts on, and a beat after each action so its result can
// be seen. Each step ends once the page is at rest, and the page it left is read there, with a picture of it: what the
// comparison compares. Run as plain tests, it does nothing. Each recording and its readings go to the reporter, which makes
// them a scene (reporter.ts). Taken over, a scene runs in Playthrough itself instead (following.ts), on the same pace and steps.

import { test as base, expect as playwrightExpect, type APIRequestContext, type Browser, type BrowserContext, type BrowserContextOptions, type Dialog, type Locator, type Page } from "@playwright/test";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import * as modules from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sameWords, type Glimpse, type Reading } from "@playthrough/page";
import { keepAssets, type Assets } from "./assets.ts";
import type { Did } from "@playthrough/review";
import { ALONGSIDE, BEAT, QUIET_DEV_CHROME, REACHES_OUTSIDE, FORK_RAN, type Action, type DoneOn, type Handed, type On, type Run, type ForkRan, type ForkRun, type To } from "./scenes.ts";
import { readPage, unhovered } from "./read.ts";
import { repo } from "./repo.ts";
import { ACTIONS, ASSETS, DONE_ON, firstLine, GLIMPSES, HANDS, HOLD, PERSON, PICTURED, PICTURE, READINGS, RECORDING, seconds, WROTE, type Failed, type Acted, type Hand } from "./reporter.ts";
import { SETTLED, stillFor, watchRest } from "./rest.ts";
import { changes, firstOf, make, personIn, setupIn, type Made, type Setup } from "./setup.ts";

// The screens besides the laptop every scene is on unless it says otherwise: a phone, tapped, and a tablet. A scene takes
// one with test.use, and so does someone it's handed to.
export type Screen = Pick<BrowserContextOptions, "viewport" | "isMobile" | "hasTouch" | "timezoneId" | "colorScheme">;
export const phone: Screen = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
export const tablet: Screen = { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true };
const LAPTOP = { width: 1280, height: 800 };
const CLIPBOARD = ["clipboard-read", "clipboard-write"];

// Everything it needs comes with the run (scenes.ts), so it never has to find anything for itself.
const run: Run | undefined = process.env.PLAYTHROUGH_RUN ? JSON.parse(process.env.PLAYTHROUGH_RUN) : undefined;

// On Before, a step is taken only if the app as it was did what the scene expects of it, its checks too: the scene stops
// at the first it doesn't, as at an action it can't do. Letting checks go by, a phone scene opening a page the app
// didn't have counted its first step as taken, and only the search after it read as new ("isn't the whole thing new?").
// A check waits a moment there, as for a step's result, rather than its usual few seconds for a page that will never
// show it.
export const expect = run?.before ? playwrightExpect.configure({ timeout: 1000 }) : playwrightExpect;

// The page's own clock and timers are taken before anything fakes them: under a set clock, rrweb's throttle let one
// pointer move through, timed by the gap between the set time and the real one.
const recorder = (rrweb: string) => `${QUIET_DEV_CHROME}
;((Date, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame) => {
${readFileSync(rrweb, "utf8")}
})(Date, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame);
// With each page taken whole, whether its browser was light or dark, still or moving, for it to be played back as it
// was: said once rrweb has the page, as said at its very start it went before anything was listening.
const said = () => window.rrwebRecord.record.addCustomEvent("browser", { dark: matchMedia("(prefers-color-scheme: dark)").matches, still: matchMedia("(prefers-reduced-motion: reduce)").matches });
if (window.top === window) {
  window.rrwebRecord.record({
    // Nothing is kept until the scene itself starts, after whatever the app's setup did on the page.
    emit: (event) => (window.__playthrough?.(event), event.type === 2 && setTimeout(said)),
    // every input, not just the last: with "last", rrweb only hears a field change when it loses focus,
    // so words typed into a search box that kept focus never reached the recording
    sampling: { mousemove: 20, scroll: 16, input: "all" },
    maskAllInputs: false,
    inlineStylesheet: true,
  });
  // Where the text cursor is, which rrweb doesn't keep: where words go is half of what typing shows. Said whenever it
  // moves, as where on the screen it is and how tall, in a field after how many of its letters, and that it's gone once
  // nothing is typed into.
  let saidCaret = "";
  const caretOf = () => {
    const field = document.activeElement;
    if (!field || !(field.isContentEditable || field.matches("input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], textarea"))) return undefined;
    if (field.isContentEditable) {
      const selection = getSelection();
      if (!selection || !selection.rangeCount || !selection.isCollapsed) return undefined;
      const range = selection.getRangeAt(0);
      // In words, where the range is. An editor can put it in an empty text node of its own, as Kan's did, where it has no
      // place on the screen: there, and before a line break, it's just after the last letter before it; with none, at
      // the start of the field.
      const box = range.startContainer.nodeType === 3 && range.startContainer.length ? range.getClientRects()[0] : undefined;
      if (box) return { x: box.left, y: box.top, height: box.height || 16 };
      const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
      let last;
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (range.comparePoint(text, 0) > 0) break;
        const end = text === range.startContainer ? range.startOffset : text.length;
        if (end > 0) last = [text, end];
      }
      if (last) {
        const letter = document.createRange();
        letter.setStart(last[0], last[1] - 1);
        letter.setEnd(last[0], last[1]);
        const after = letter.getBoundingClientRect();
        return { x: after.right, y: after.top, height: after.height || 16 };
      }
      const around = field.getBoundingClientRect();
      return { x: around.left, y: around.top, height: Math.min(around.height, 24) || 16 };
    }
    // In a field, measured: the field's own words up to where the cursor is, in its font, from where its words start.
    if (field.selectionStart !== field.selectionEnd || field.tagName === "TEXTAREA") return undefined;
    const look = getComputedStyle(field);
    const measure = (caretOf.canvas ??= document.createElement("canvas")).getContext("2d");
    measure.font = look.font;
    const box = field.getBoundingClientRect();
    const height = parseFloat(look.lineHeight) || parseFloat(look.fontSize) * 1.25;
    const x = box.left + parseFloat(look.borderLeftWidth) + parseFloat(look.paddingLeft) + measure.measureText(field.value.slice(0, field.selectionStart ?? 0)).width - field.scrollLeft;
    return { x, y: box.top + (box.height - height) / 2, height, letters: field.selectionStart ?? field.value.length };
  };
  const sayCaret = () => {
    const caret = caretOf();
    const now = caret ? [caret.x, caret.y, caret.height].map(Math.round).join(",") : "";
    if (now === saidCaret) return;
    saidCaret = now;
    try {
      window.rrwebRecord.record.addCustomEvent("caret", caret ? { x: Math.round(caret.x), y: Math.round(caret.y), height: Math.round(caret.height), letters: caret.letters } : {});
    } catch {}
  };
  for (const type of ["selectionchange", "input", "keyup", "focusin", "focusout", "scroll"]) document.addEventListener(type, () => requestAnimationFrame(sayCaret), true);
  // A key that does something, which rrweb doesn't keep either: Escape closing a panel looks like the × being pressed
  // without it. Never a letter typed, whose words appearing say it; said where the keyboard was, in the field it went
  // to, else by the pointer.
  const named = { Escape: "Esc", Enter: "Enter", Tab: "Tab", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  document.addEventListener("keydown", (event) => {
    if (!event.isTrusted || event.repeat) return;
    const held = [event.ctrlKey && "Ctrl", event.metaKey && "Cmd", event.altKey && "Alt"].filter(Boolean);
    const key = named[event.key] ?? (held.length && event.key.length === 1 ? event.key.toUpperCase() : undefined);
    if (!key) return;
    if (event.shiftKey && (held.length || key === "Tab" || key === "Enter")) held.push("Shift");
    const active = document.activeElement;
    const box = active && (active.isContentEditable || active.matches("input, textarea, select")) && active.getBoundingClientRect();
    const field = box && { x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) };
    try {
      window.rrwebRecord.record.addCustomEvent("key", { key: [...held, key].join(" "), ...(field && { field }) });
    } catch {}
  }, true);
}
// What a page's script animates with element.animate is in no element's markup, so rrweb never saw it move: a burst of
// confetti was its pieces sitting still where they started, then gone. Each is written into the page as well, as the CSS
// animation it is, which the replay plays as it does the page's own. Live, the script's animation is over it, and the
// two end together; one on an element with a CSS animation of its own is left alone, rather than replace that.
{
  const animate = Element.prototype.animate;
  let count = 0;
  const kebab = (property) => (property === "cssFloat" ? "float" : property.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()));
  const write = (element, animation) => {
    const effect = animation.effect;
    const timing = effect?.getTiming();
    if (!timing || !element.style || element.style.animation || getComputedStyle(element).animationName !== "none") return;
    const name = "playthrough-animate-" + ++count;
    const frames = effect.getKeyframes().map((frame) => {
      const said = Object.entries(frame).filter(([property]) => !["offset", "computedOffset", "easing", "composite"].includes(property));
      return (frame.computedOffset * 100) + "% { " + said.map(([property, value]) => kebab(property) + ": " + value + "; ").join("") + "animation-timing-function: " + frame.easing + "; }";
    });
    const style = document.createElement("style");
    style.textContent = "@keyframes " + name + " { " + frames.join(" ") + " }";
    document.head.append(style);
    const duration = typeof timing.duration === "number" ? timing.duration : 0;
    const iterations = timing.iterations === Infinity ? "infinite" : timing.iterations;
    element.style.animation = [name, duration + "ms", timing.easing, timing.delay + "ms", iterations, timing.direction, timing.fill === "auto" ? "none" : timing.fill].join(" ");
    // Ended, it's taken out, unless it holds its end; cancelled, always.
    const end = (held) => {
      if (held) return;
      if (element.style.animationName === name) element.style.animation = "";
      style.remove();
    };
    animation.addEventListener("finish", () => end(timing.fill === "forwards" || timing.fill === "both"));
    animation.addEventListener("remove", () => end(false));
    animation.addEventListener("cancel", () => end(false));
  };
  Element.prototype.animate = function (keyframes, options) {
    const animation = animate.call(this, keyframes, options);
    try {
      write(this, animation);
    } catch {}
    return animation;
  };
}`;

// Playwright acts instantly, and a recording made at that speed can't be watched.
const FRAME = 16; // a move each frame while gliding or scrolling
const REST = 140; // the pointer rests on its target before acting
const KEY = 60; // words are typed a key at a time, this far apart
const TYPED = 1500; // and a long text no slower than this, all told
const SAVING = 100; // taking over, how soon an action that saves or goes to another page shows it
const HANDING = 1200; // handed on, the page left holds this long, and the new hand rests this long before acting
const OPENED = 350; // a dropdown's list is seen open this long before the pointer goes to its choice
const OPTION = 22; // and each of its options is this tall, in the page's pixels, as the viewer draws it

let pointer: { page: Page; x: number; y: number; handed?: boolean } | undefined;

// The scene underway: the page it's on now, what waits for that page to rest, what was read at the end of each step so
// far, with its picture, and when each action was done; the step it's in, and how many of that step's actions are done;
// whoever it's been handed to, and the assets each page loaded; the first request it sent that changes what the app holds;
// the browser's own dialog shown during the action being done, until it's answered; what each action was done on, by
// its step; what Playwright gave the scene, for a fork to carry on with; and running a note's fork, once it has begun, how
// far it got.
type Underway = { page: Page; events: { timestamp: number }[]; rest: (still?: number) => Promise<void>; depth: number; readings: Omit<Reading, "picture">[]; glimpses: Glimpse[]; pictures: Buffer[]; frames: Map<string, Buffer>; actions: Acted[]; step?: string; inStep: number; hands: Hand[]; assets: (() => Promise<Assets>)[]; wrote?: string; dialog?: Promise<void>; doneOn: DoneOn; given?: Parameters<Body>[0]; forked?: ForkRan };
let underway: Underway | undefined;

// What every scene starts from (setup.ts), loaded once a run.
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

// Someone else carries the scene on, on a page of their own in the same world, on their screen.
export type HandTo = (person: string, screen?: Screen) => Promise<Page>;

const recorded = base.extend<{ person: string | undefined; rest: () => Promise<void>; setup: Record<string, any>; handTo: HandTo; recorder: void }>({
  // In one language and time zone wherever it's recorded, and opened as the app's setup says, under what the file says.
  locale: "en-US",
  timezoneId: "UTC",
  // The clipboard is the page's to write to, as a person's browser lets a click copy: headless, it's refused, and Copy never
  // says Copied.
  contextOptions: async ({ contextOptions }, use) => use({ permissions: CLIPBOARD, ...(await setupOf()).use, ...contextOptions }),
  // Who the scene is done as: one of the app's people (setup.ts), named by its file with test.use, or else the first.
  person: [async ({}, use) => use(firstOf(await setupOf())), { option: true }],
  // What waits for the page to come to rest, watching it from before setup sets its clock (rest.ts).
  rest: async ({ page }, use) => use(run ? await watchRest(page) : async () => {}),
  setup: async ({ page, request, baseURL, person, rest: _ }, use, testInfo) => {
    // Recording scenes added later on Before, the others aren't run, nor is anything made for them. Running a note's fork,
    // only the scene it's off.
    if (run?.only && !run.only.includes(testInfo.title)) testInfo.skip();
    if (run?.fork && testInfo.title !== run.fork.scene) testInfo.skip();
    const app = await setupOf();
    if (person) personIn(app, person);
    if (run) await readied(page, run);
    const made = await make(app, repo(run?.root).borrowed, { page, request, baseURL: baseURL!, person });
    if (person) await app.signIn?.({ page, person, setup: made.setup });
    await use(made.setup);
    await made.giveBack();
  },
  // Handed on, someone else is signed in by the app's setup on a page of their own, and recorded, the scene carries on
  // there: its own page says no more.
  handTo: async ({ browser, baseURL, setup }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (person, screen = {}) => {
      const app = await setupOf();
      personIn(app, person);
      const { page, context } = await pageFor(browser, baseURL!, screen, app.use);
      opened.push(context);
      const scene = underway;
      const rest = run && scene && (await watchRest(page));
      if (run && scene) await readied(page, run);
      await app.signIn?.({ page, person, setup });
      if (run && scene && rest) await carryOn(scene, page, rest, person, run);
      return page;
    });
    for (const context of opened) await context.close();
  },
  recorder: [
    // Once what the scene starts from is made, so making it isn't in the recording; and kept until the pages it was
    // handed to are done with, as it ends on the last of them.
    async ({ page, request, baseURL, setup, rest, person, handTo }, use, testInfo) => {
      if (!run) return use();
      testInfo.setTimeout(testInfo.timeout * 3);
      const given = { page, context: page.context(), request, baseURL: baseURL!, setup, handTo };
      const scene: Underway = { page, events: [], rest, depth: 0, readings: [], glimpses: [], pictures: [], frames: new Map(), actions: [], inStep: 0, hands: [], assets: [], doneOn: {}, given };
      // Only the page the scene is on is recorded: handed on, it carries on on the other's.
      await page.exposeFunction("__playthrough", (event: { timestamp: number }) => void (scene.page === page && scene.events.push(event)));
      scene.assets.push(keepAssets(page, run.folder));
      pace(page);
      dialogsOn(page, scene);
      pointer = { page, x: 640, y: 640 };
      underway = scene;
      const { events, readings, glimpses, pictures, actions } = scene;
      // A page setup left loaded, where the scene starts, is taken whole now, as rrweb took it before anything heard it;
      // otherwise the recording starts with the first page the scene loads. Taken then, it played blank until the next.
      if (page.url() !== "about:blank") await page.evaluate(() => (window as any).rrwebRecord?.record.takeFullSnapshot());
      await page.mouse.move(pointer.x, pointer.y);
      try {
        await use();
      } finally {
        pointer = undefined;
        underway = undefined;
      }
      // It ends on the page it's on: its own, or the last one it was handed to.
      const last = scene.page;
      const assets = async () => Object.assign({}, ...(await Promise.all(scene.assets.map((kept) => kept()))));
      // A note's fork is kept as far as it got, with a picture of where it ended; one whose scene never got to where it
      // was taken over leaves nothing.
      if (run.fork) {
        if (!scene.forked) return;
        await last.waitForTimeout(HOLD);
        await last.evaluate(() => (window as any).rrwebRecord.record.addCustomEvent("end", {}));
        await last.waitForTimeout(100);
        writeFileSync(join(run.folder, "end.png"), await last.screenshot({ animations: "disabled", caret: "hide" }));
        return writeFileSync(join(run.folder, FORK_RAN), JSON.stringify({ ...scene.forked, events, readings, glimpses, assets: await assets() }));
      }
      const ended = testInfo.status === testInfo.expectedStatus;
      if (!ended && !run.before) return;
      if (ended) {
        await last.waitForTimeout(HOLD);
        // Changed while its end held, by what was done arriving late (a debounced search, a delayed message), it wasn't at
        // rest: it ends once it is, read again there.
        if ((await stillFor(last)) < HOLD - 100 && scene.readings.length) {
          await scene.rest();
          const at = seconds(Date.now() - (scene.events[0]?.timestamp ?? Date.now()));
          await unhovered(last, async () => {
            const { screen, things, items } = await readPage(last);
            scene.readings.splice(-1, 1, { step: scene.readings.at(-1)!.step, at, screen, things, items });
            scene.pictures.splice(-1, 1, await last.screenshot({ animations: "disabled", caret: "hide" }));
          });
          await last.waitForTimeout(HOLD);
          // Changing still, it's ended anyway, and said so.
        }
        // A moment's end once it has held: what still changes there, it ended before.
        if (scene.frames.size) scene.frames.set("held", await unhovered(last, () => last.screenshot({ animations: "disabled", caret: "hide" })));
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
      if (scene.hands.length) await testInfo.attach(HANDS, { body: JSON.stringify(scene.hands), contentType: "application/json" });
      if (scene.wrote) await testInfo.attach(WROTE, { body: scene.wrote, contentType: "text/plain" });
      await testInfo.attach(DONE_ON, { body: JSON.stringify(scene.doneOn), contentType: "application/json" });
      for (const picture of pictures) await testInfo.attach(PICTURE, { body: picture, contentType: "image/png" });
      for (const [name, picture] of scene.frames) await testInfo.attach(`${PICTURED} ${name}`, { body: picture, contentType: "image/png" });
    },
    { auto: true },
  ],
});

// A page recorded, readied before anything loads in it: rrweb first, to take the page's own clock before it's set, then
// the review's day and the seeded random numbers. And from when the scene starts, what it sends the app, on any port of its
// host, that changes what it holds, as Before says what a run leaves in the app without a setup to give it back.
async function readied(page: Page, run: Run) {
  const host = new URL(run.app.url).hostname;
  page.on("request", (sent) => {
    const scene = underway;
    if (scene && !scene.wrote && changes(sent.method()) && new URL(sent.url()).hostname === host) scene.wrote = `${sent.method()} ${new URL(sent.url()).pathname}`;
  });
  await page.addInitScript({ content: recorder(run.recorder) });
  await page.clock.setSystemTime(onReviewDay(run.started));
  await page.addInitScript({ content: seeded });
}

// A window of its own, in one language and time zone as every scene is, on the laptop unless it's on another screen, and
// opened as the app's setup says.
export async function pageFor(browser: Browser, baseURL: string, screen: Screen, use?: BrowserContextOptions) {
  // Stepping in, the clipboard is the page's to write to, as it is in a recording.
  const context = await browser.newContext({ permissions: CLIPBOARD, ...use, baseURL, locale: "en-US", timezoneId: "UTC", viewport: LAPTOP, ...screen });
  return { context, page: await context.newPage() };
}

// The scene, handed on: from here, its page is the one it was handed to, read at each step's end and paced as its own was,
// and the recording carries on there. A page signing in already loaded is taken whole now, as it was before the
// recording heard it; otherwise the recording carries on with the first page it loads.
async function carryOn(scene: Underway, page: Page, rest: () => Promise<void>, person: string, run: Run) {
  // So you see what the one handing it on left it at, before the frame becomes the other's.
  await scene.page.waitForTimeout(HANDING);
  await page.exposeFunction("__playthrough", (event: { timestamp: number }) => void (scene.page === page && scene.events.push(event)));
  scene.assets.push(keepAssets(page, run.folder));
  dialogsOn(page, scene);
  scene.hands.push({ at: Date.now(), person });
  Object.assign(scene, { page, rest });
  const size = page.viewportSize() ?? LAPTOP;
  pointer = { page, x: size.width / 2, y: size.height * 0.8, handed: true };
  if (page.url() !== "about:blank") await page.evaluate(() => (window as any).rrwebRecord?.record.takeFullSnapshot());
}

// The browser's own dialogs, an alert, a confirm or a prompt, aren't in the page, so rrweb never sees them: each is kept
// in the recording as a moment of its own, with what it says, and held long enough to read before it's answered, as the
// scene answers it, or else as Playwright would, which is No. The viewer draws it there (replay.ts). One about leaving the
// page is answered as Playwright does, Yes, and not kept.
const holding = new WeakMap<Dialog, { scene: Underway; page: Page; read: Promise<void>; answered: () => void }>();
const answered = new WeakSet<object>();
function dialogsOn(page: Page, scene: Underway) {
  const listening = (to: object) => (to as { listenerCount: (event: string) => number }).listenerCount("dialog");
  page.on("dialog", (dialog) => {
    // The scene answers it if it listens for it, on its page or the page's window.
    const theirs = listening(page) > 1 || listening(page.context()) > 0;
    if (dialog.type() === "beforeunload") return void (theirs || dialog.accept().catch(() => {}));
    answers(dialog);
    const said = { type: dialog.type(), message: dialog.message(), ...(dialog.type() === "prompt" && { value: dialog.defaultValue() }) };
    if (scene.page === page) scene.events.push({ type: 5, data: { tag: "dialog", payload: said }, timestamp: Date.now() } as { timestamp: number });
    let answered = () => {};
    scene.dialog = new Promise((done) => (answered = done));
    holding.set(dialog, { scene, page, read: new Promise((read) => setTimeout(read, Math.min(4000, 1200 + 40 * dialog.message().length))), answered });
    if (!theirs) dialog.dismiss().catch(() => {});
  });
}
// Answered, once it's been read, as what was said: Yes or No, and what was typed into a prompt.
function answers(dialog: Dialog) {
  const prototype = Object.getPrototypeOf(dialog);
  if (answered.has(prototype)) return;
  answered.add(prototype);
  for (const [name, yes] of [["accept", true], ["dismiss", false]] as const) {
    const original = prototype[name];
    prototype[name] = async function (this: Dialog, value?: string) {
      const held = holding.get(this);
      holding.delete(this);
      if (held) {
        await held.read;
        const answer = { yes, ...(yes && this.type() === "prompt" && { value: value ?? "" }) };
        if (held.scene.page === held.page) held.scene.events.push({ type: 5, data: { tag: "dialog answered", payload: answer }, timestamp: Date.now() } as { timestamp: number });
      }
      try {
        return await original.call(this, value);
      } finally {
        held?.answered();
      }
    };
  }
}

// A scene can import a module of its own as Playwright finds it, without its ending (“../history”) or by its .js name, so
// the scenes that record can be taken over: Node, which loads them here, finds a module only by its whole name. And it's
// loaded again whenever the scenes are, as an agent changes it with them: Node keeps a module by its address, so it's
// asked for at the scenes' time (`?written`). Each is kept in `imported`, whose times say when the scenes were written too.
export const imported = new Set<string>();
let finding = false;
function findsAsPlaywright() {
  if (finding) return;
  finding = true;
  modules.registerHooks({
    resolve(specifier, context, next) {
      if (!/^\.\.?\//.test(specifier)) return next(specifier, context);
      const found = foundAsPlaywright(specifier, context, next);
      if (!found.url.startsWith("file:") || found.url.includes("/node_modules/")) return found;
      imported.add(fileURLToPath(found.url));
      const written = context.parentURL && URL.parse(context.parentURL)?.search;
      return written ? { ...found, url: found.url.split("?")[0] + written } : found;
    },
  });
}
function foundAsPlaywright(specifier: string, context: modules.ResolveHookContext, next: (specifier: string, context?: modules.ResolveHookContext) => modules.ResolveFnOutput) {
  try {
    return next(specifier, context);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ERR_MODULE_NOT_FOUND") throw error;
    const named = [...[".ts", ".tsx", ".js", "/index.ts", "/index.js"].map((ending) => specifier + ending), specifier.replace(/\.js$/, ".ts")];
    for (const name of named.filter((name) => name !== specifier))
      try {
        return next(name, context);
      } catch {}
    throw error;
  }
}

// Stepped into, a scene runs in Playthrough (following.ts), unrecorded, on the recordings' clock, which the person carries
// on with: told where to hand its page over, and to stop, once it's no longer wanted.
export type Orders = { to: To; stopped?: boolean };
// A scene, as its file gives it to test(): with the page, what Playwright gives every test besides, and the setup.
export type Body = (given: { page: Page; context: BrowserContext; request: APIRequestContext; baseURL: string; setup: Record<string, any>; handTo: HandTo }) => Promise<unknown>;

// Loaded in Playthrough, each scene is kept by its name instead of run. A file at a time, as test() can't tell whose it is.
// With what it does outside the app, if its file says so (REACHES_OUTSIDE): an email sent, a card charged, a paid API
// called. Such a scene is run only when it's taken over, never ahead of the playhead, where every pause would do it again.
// And everything its file says with test.use: the window it's recorded in, like a phone's screen and touch, and who it's
// done as.
// And the forks written in its file, for notes made in the app on it.
export type Kept = { body: Body; outside?: string; use: BrowserContextOptions & { person?: string }; forks: Forked[] };
let collecting: Map<string, Kept> | undefined;
let collectingForks: Forked[] = [];
// The file being loaded, and each describe() in it around the scenes being kept now: what it says with test.use, and
// what its annotation says the scenes in it do outside the app.
let around: { use: Kept["use"]; outside?: string }[] = [];
let loading = Promise.resolve();
export function scenesIn(file: string, written: number): Promise<Map<string, Kept>> {
  findsAsPlaywright();
  const scenes = new Map<string, Kept>();
  const loaded = loading.then(async () => {
    [collecting, around, collectingForks] = [scenes, [{ use: {} }], []];
    try {
      await import(`${pathToFileURL(file).href}?${written}`);
    } finally {
      [collecting, around] = [undefined, []];
    }
    return scenes;
  });
  loading = loaded.then(() => {}, () => {});
  return loaded;
}

// The scene being taken over, how deep in its steps it is, as only its own steps are places to take it over, and the
// step it's in, with how many of its actions are done.
// What's only in the page's memory, like a search typed or a form opened, wouldn't survive loading it in the person's
// browser. So it's handed over as it was before the actions that only changed what's on it (`from`), however many steps
// back or on the way to the first, and they're done again there. One that wrote something, or went to another address,
// isn't, nor anything before it: a fresh load of the page has those already. `address` is where the last of them left
// the page.
// The steps it has finished say how far it has got. Several run at once, one for each step in, each in its own window,
// and each knows its own by what it was called from.
type Taking = { page: Page; given?: Parameters<Body>[0]; forks: Forked[]; forking?: boolean; depth: number; rest: () => Promise<void>; step?: string; actions: number; from?: Handed; again: Action[]; address?: string; wrote: boolean; passed: string[]; orders: Orders; handed?: Handed };
const taking = new AsyncLocalStorage<Taking>();

// What's kept to do again holds while the page is still where the last of it left it, and nothing has been saved since.
const holds = (scene: Taking) => !scene.wrote && scene.page.url() === scene.address;

// It's been handed over, it's past where it's handed over, or it's no longer wanted: the scene goes no further.
class Stopped extends Error {}

export async function runAlongside(
  page: Page,
  { request, baseURL, started, setup: appSetup, borrowed, person }: { request: APIRequestContext; baseURL: string; started: string; setup: Setup; borrowed: string; person?: string },
  body: Body,
  orders: Orders,
  forks: Forked[] = [],
): Promise<{ handed?: Handed; stopped?: Pick<Failed, "at" | "why">; made?: Made; checked?: string }> {
  // Each page the run goes on, readied as the scene's was when it was recorded, and what it writes noted.
  const readied = async (page: Page) => {
    const rest = await watchRest(page);
    await page.clock.setSystemTime(onReviewDay(started));
    await page.addInitScript({ content: seeded });
    page.on("request", (request) => void (["GET", "HEAD", "OPTIONS"].includes(request.method()) || (scene.wrote = true)));
    return rest;
  };
  const scene: Taking = { page, forks, depth: 0, rest: async () => {}, actions: 0, again: [], wrote: false, passed: [], orders };
  scene.rest = await readied(page);
  pace(page);
  // Handed on, the run carries on on the other's page, as the recording does: where the playhead rests there, it's that
  // page that's handed over.
  const opened: BrowserContext[] = [];
  return taking.run(scene, async () => {
    let made: Made | undefined;
    const handTo: HandTo = async (person, screen = {}) => {
      personIn(appSetup, person);
      const next = await pageFor(page.context().browser()!, baseURL, screen, appSetup.use);
      opened.push(next.context);
      const rest = await readied(next.page);
      await appSetup.signIn?.({ page: next.page, person, setup: made?.setup ?? {} });
      Object.assign(scene, { page: next.page, rest, from: undefined, again: [] });
      return next.page;
    };
    try {
      // Who the scene is done as, as when it was recorded: who its file names, or else the first the app names.
      const who = person ?? firstOf(appSetup);
      if (who) personIn(appSetup, who);
      made = await make(appSetup, borrowed, { page, request, baseURL, person: who });
      if (who) await appSetup.signIn?.({ page, person: who, setup: made.setup });
      scene.given = { page, context: page.context(), request, baseURL, setup: made.setup, handTo };
      await body(scene.given);
      await reached(scene);
      return { handed: scene.handed, made };
    } catch (error) {
      if (error instanceof Stopped || orders.stopped) return { handed: scene.handed, made };
      const why = firstLine(String((error as Error)?.message ?? error));
      // Everything the moment does is done, and only a check of how it ended fails: that's the place a person steps in
      // to look at, so it's handed over as it is, with what didn't hold.
      const { to } = orders;
      if (isCheck(error) && scene.step && to.actions === undefined && (!to.step || to.step === scene.step)) {
        await handOver(scene, to);
        const on = String((error as { message?: string }).message).match(/^Locator: (.*)$/m)?.[1];
        return { handed: scene.handed, made, checked: `This moment's check of how it ends doesn't hold on the app as it is now: Playwright says “${why}”${on ? ` of ${on}` : ""}.` };
      }
      return { stopped: { at: scene.step, why }, made };
    } finally {
      for (const context of opened) await context.close().catch(() => {});
    }
  });
}

// After an action, at a step's end, or at the scene's end (no step): it goes on until it's where it's handed over, hands
// over there, and goes no further.
async function reached(scene: Taking, step?: string, actions?: number) {
  const { to, stopped } = scene.orders;
  if (stopped) throw new Stopped();
  const where = against(scene.passed, step, actions, to);
  if (where === "on") return;
  if (where === "here") await handOver(scene, to);
  if (step) throw new Stopped();
}

// A check's failure, as expect throws it, rather than an action's.
const isCheck = (error: unknown) => !!error && typeof error === "object" && "matcherResult" in error;

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
    browser: { dark: matchMedia("(prefers-color-scheme: dark)").matches, still: matchMedia("(prefers-reduced-motion: reduce)").matches, languages: [...navigator.languages], touch: navigator.maxTouchPoints > 0 },
  }));
  return { url: page.url(), cookies: await page.context().cookies(), ...kept, clock: kept.clock - Date.now() };
}

// The scene goes no further. Taken over on a note's fork, the fork the agent wrote for it is run first, on the app as it is
// now, and what the person did there is kept for what they do next to carry on from. With no fork for it, as on the round
// they made it, their steps are done here first, on the same app, as a person does them, so what
// they saved is saved, and the page is handed over as they left it: done again in their browser, a date picked in a
// calendar never took.
async function handOver(scene: Taking, { notes, did }: To) {
  const fork = notes && scene.forks.find((fork) => fork.notes.some((note) => notes.includes(note)));
  if (fork) {
    // Its steps are its own: none of them is a place to take the scene over. What they change only on the page is kept
    // to do again, as the scene's own actions are.
    scene.forking = true;
    await fork.body(scene.given!);
  } else if (did?.length) {
    const { page, rest } = scene;
    // Theirs, not the scene's: none of them is a place to take the scene over.
    await taking.exit(async () => {
      for (const one of did) {
        const done = await doAgain(page, one).then(() => true, () => false);
        if (!done) break;
        await rest();
      }
    });
    scene.handed = await kept(page, rest);
    return;
  }
  const { page, rest, from, again } = scene;
  scene.handed = from && again.length && holds(scene) ? { ...from, again } : await kept(page, rest);
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

// A scene's steps are the ones it takes itself, not steps inside them. Each ends once the page is at rest, and the page
// it left is read there, unless the step failed.
const playwrightStep = base.step;
const step = Object.assign(async (title: string, body: (info: unknown) => unknown, options?: object) => {
  const taken = taking.getStore();
  if (taken?.forking) return body(undefined);
  if (taken) {
    const own = !taken.depth;
    if (own) Object.assign(taken, { step: title, actions: 0 });
    // A moment's way there done, the person can take it over where it starts, before anything it shows is done.
    if (own) await reached(taken, title, 0);
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
  const scene = underway;
  if (!scene || scene.depth) return playwrightStep(title, body, options);
  // A step begins with the page at rest, so what was done before it, a moment's way there, has settled before what the
  // step shows; and the scene's first step is pictured and glimpsed there, as the moment's first frame, then holds a beat
  // before anything moves.
  await scene.rest(scene.readings.length ? undefined : SETTLED);
  return playwrightStep(
    title,
    async (info) => {
      // Pictured again a beat later, with nothing done: what differs moves by itself.
      if (!scene.readings.length && !scene.frames.size) {
        const at = seconds(Date.now() - (scene.events[0]?.timestamp ?? Date.now()));
        const picture = () => scene.page.screenshot({ animations: "disabled", caret: "hide" });
        await unhovered(scene.page, async () => {
          const { screen, things, items } = await readPage(scene.page);
          scene.glimpses.push({ step: title, at, screen, things, items });
          scene.frames.set("first", await picture());
        });
        if (pointer) await scene.page.waitForTimeout(BEAT);
        scene.frames.set("a-beat-later", await unhovered(scene.page, picture));
      }
      Object.assign(scene, { step: title, inStep: 0 });
      scene.forked?.steps.push({ title, at: seconds(Date.now() - (scene.events[0]?.timestamp ?? Date.now())) });
      scene.depth++;
      let done: unknown;
      try {
        done = await body(info);
      } finally {
        scene.depth--;
      }
      await scene.rest();
      const at = seconds(Date.now() - (scene.events[0]?.timestamp ?? Date.now()));
      await unhovered(scene.page, async () => {
        const { screen, things, items } = await readPage(scene.page);
        scene.readings.push({ step: title, at, screen, things, items });
        scene.pictures.push(await scene.page.screenshot({ animations: "disabled", caret: "hide" }));
      });
      if (run?.fork?.step === title && run.fork.actions === undefined && !scene.forked) await forkOn(scene, run.fork);
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
// Loaded in Playthrough, which says so first (following.ts), test() keeps each scene by its name instead. It's settled once,
// as the file loads: wrapped, Playwright's test() would take the wrapper for where each test is written.
type Annotation = { type: string; description?: string };
const outsideIn = (details: unknown) => {
  const said = [(details as { annotation?: Annotation | Annotation[] } | undefined)?.annotation ?? []].flat().find((annotation) => annotation.type === REACHES_OUTSIDE);
  return said && (said.description?.trim() || "it reaches outside the app");
};
// As in Playwright, what a file or a describe() in it says with test.use holds for every scene in it, wherever it's said
// there, and so does what its annotation says the scenes do outside the app; what's said nearer a scene goes over what's
// said further out.
const keeping: object = Object.assign(
  (title: string, ...rest: unknown[]) => {
    const scopes = [...around];
    const forks = collectingForks;
    collecting?.set(title, {
      body: rest.at(-1) as Body,
      forks,
      outside: (rest.length > 1 ? outsideIn(rest[0]) : undefined) ?? scopes.findLast((scope) => scope.outside)?.outside,
      // Once the file has loaded, so what's said after the scene holds too.
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

// What a person did in the app, written by the agent as a fork of the scene they took over, for the notes they made there:
// in the scene's own file, run from where they took it over, the scene's steps up to there and then the fork's. A fork is
// for its notes alone, so it isn't a scene of the review: it's run while one of them is open, and gone once they're settled.
type Forked = { name: string; notes: string[]; body: Body };
const forks: Forked[] = [];
const fork = (name: string, { notes }: { notes: string[] }, body: Body) => void forks.push({ name, notes: notes.map(String), body });
export const test = ((globalThis as Record<symbol, unknown>)[ALONGSIDE] ? Object.assign(keeping, { inView, fork: (name: string, { notes }: { notes: string[] }, body: Body) => void collectingForks.push({ name, notes: notes.map(String), body }) }) : Object.assign(withSteps(recorded), { inView, fork })) as typeof recorded & { fork: typeof fork; inView: typeof inView };

// Something near the screen's top or bottom edge, or with offScreen, out of sight, scrolled smoothly to the middle, as a
// person would to look at it or do something to it, and the page left to come to rest: a recording has nothing past
// what the browser showed. Already comfortably in view, too tall to be, or out of sight without offScreen, it stays.
const EDGE = 0.15;
async function inView(target: Locator, { offScreen = false } = {}) {
  const moved = await target
    .first()
    .evaluate(
      (element, { offScreen, edge }) => {
        const box = element.getBoundingClientRect();
        const band = innerHeight * edge;
        const seen = box.bottom > 0 && box.top < innerHeight;
        if ((!seen && !offScreen) || (seen && box.top >= band && box.bottom <= innerHeight - band) || box.height > innerHeight - 2 * band) return false;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      },
      { offScreen, edge: EDGE },
      { timeout: 3000 },
    )
    .catch(() => false);
  if (moved && underway) {
    await underway.page.waitForTimeout(100);
    await underway.rest();
  }
}

// Every action on an element glides there first and pauses after, and once it's done is a place to take the scene over.
// Patched once in each worker, for every locator.
const actions = ["click", "dblclick", "check", "uncheck", "setChecked", "hover", "tap", "fill", "selectOption", "press"] as const;
const paced = new WeakSet<object>();

function pace(page: Page) {
  const prototype = Object.getPrototypeOf(page.locator("html"));
  if (paced.has(prototype)) return;
  paced.add(prototype);
  // A fill typed on a recording is still one action: typed with Playwright's own typing, not the scene's, which is one too.
  const typeIn = prototype.type;
  for (const action of actions) {
    const original = prototype[action];
    prototype[action] = async function (this: Locator, ...args: unknown[]) {
      // Handed on, the new hand shows on its page and rests there a moment before it does anything.
      if (pointer?.handed) {
        pointer.handed = false;
        await pointer.page.mouse.move(pointer.x, pointer.y);
        await pointer.page.waitForTimeout(HANDING);
      }
      // As long as the scene said to wait, where it said.
      const timeout = args.findLast((arg): arg is { timeout: number } => !!arg && typeof arg === "object" && typeof (arg as { timeout?: unknown }).timeout === "number")?.timeout;
      // In what a moment shows, what's about to be done is brought comfortably into view first, as a person scrolls to it.
      if (pointer && underway?.depth && underway.frames.size && !underway.readings.length) await inView(this, { offScreen: true });
      const aimed = pointer ? await approach(this, pointer, timeout).catch((error) => Promise.reject(asAction(error, action))) : undefined;
      const on = underway?.depth ? await follow(underway, this) : undefined;
      // Filled in on a recording, words are typed as a person types them, where they're typed: a date or a number is
      // set as it is, as typing it can come out otherwise.
      const [text, options] = args as [unknown, { timeout?: number } | undefined];
      const typed = pointer && action === "fill" && typeof text === "string" && text && (await typedInto(this)) ? text : undefined;
      const act = typed
        ? async () => {
            await original.call(this, "", options);
            await typeIn.call(this, typed, { ...options, delay: Math.min(KEY, TYPED / typed.length) });
          }
        : aimed
          ? // What the hand came to is what's acted on, though pointing at it changed its name, as "Marked done" turning
            // into "Mark as not done": found again by the name the scene gave, it was gone. Drawn anew meanwhile, it's
            // found again.
            () =>
              (aimed[action] as (...args: unknown[]) => Promise<unknown>)
                .apply(aimed, args)
                .catch((error) => (/not attached|detached/i.test(String(error)) ? original.apply(this, args) : Promise.reject(error)))
          : () => original.apply(this, args);
      const choosing = pointer && underway && action === "selectOption" ? await opensList(this, args[0], pointer, underway) : undefined;
      const result = await acted(action, () => pathTo(this), act, args[0], nameOf(action, on, args[0]));
      if (choosing) underway!.events.push({ type: 5, data: { tag: "chose", payload: {} }, timestamp: Date.now() } as { timestamp: number });
      if (pointer) await pointer.page.waitForTimeout(BEAT);
      await glimpse();
      return result;
    };
  }
  // Words typed into an element go a key at a time on a recording too, unless the scene said how fast; and typing them is
  // an action, as filling them in is, done again in your browser where the scene is taken over: Kan's card prefix, cleared
  // and then typed a key at a time, was taken over cleared. pressSequentially is Playwright's type by a newer name, and
  // types with it, so type alone is the action: both, Kan's prefix came back typed twice.
  for (const action of ["pressSequentially", "type"] as const) {
    const original = prototype[action];
    prototype[action] = function (this: Locator, text: string, options?: { delay?: number; timeout?: number }) {
      const paced = pointer && options?.delay === undefined ? { ...options, delay: Math.min(KEY, TYPED / Math.max(1, text.length)) } : options;
      if (action !== "type") return original.call(this, text, paced);
      return (async () => acted("type", () => pathTo(this), () => original.call(this, text, paced), text, nameOf("type", underway && (await doneOn(this)), text)))();
    };
  }
  // The wheel scrolls a little each frame, as a person's does: left to Playwright, a page that's read jumped a screen at
  // each step of its recording.
  const mouse = Object.getPrototypeOf(page.mouse);
  const wheel = mouse.wheel;
  mouse.wheel = async function (this: Page["mouse"], deltaX: number, deltaY: number) {
    if (!pointer) return wheel.call(this, deltaX, deltaY);
    const moves = Math.max(10, Math.min(36, Math.round(Math.hypot(deltaX, deltaY) / 25)));
    let done = 0;
    for (let i = 1; i <= moves; i++) {
      await wheel.call(this, deltaX * (ease(i / moves) - done), deltaY * (ease(i / moves) - done));
      done = ease(i / moves);
      await pointer.page.waitForTimeout(FRAME);
    }
    await pointer.page.waitForTimeout(BEAT);
    await glimpse();
  };
  // Typing and pressing keys are actions too, on whatever has the focus, on the page taken over; with nothing focused, on
  // the page itself, which hears them there, as Kan's ⌘K opens its search: left out, its search was closed, taken over.
  const keyboard = Object.getPrototypeOf(page.keyboard);
  const focused = async (page: Page) => {
    const on = page.locator(":focus").first();
    return (await on.count()) ? pathTo(on) : "body";
  };
  // On a recording, keys go at a person's pace, as words filled in do: typed a key at a time, and a key pressed alone,
  // Home or Enter, with a moment either side, so where it moved the text cursor or what it did is seen.
  for (const [action, does] of [["type", "type"], ["insertText", "type"], ["press", "press"]] as const) {
    const original = keyboard[action];
    keyboard[action] = async function (this: unknown, ...args: unknown[]) {
      const [given, options] = args as [string, { delay?: number } | undefined];
      const act =
        !pointer || options?.delay !== undefined
          ? () => original.apply(this, args)
          : action === "press"
            ? async () => (await pointer!.page.waitForTimeout(KEY * 3), await original.apply(this, args), await pointer!.page.waitForTimeout(KEY * 3))
            : action === "type"
              ? () => original.call(this, given, { ...options, delay: Math.min(KEY, TYPED / Math.max(1, given.length)) })
              : () => original.apply(this, args);
      const on = underway && (await focusedOn(underway.page));
      return acted(does, focused, act, args[0], nameOf(does, on, given));
    };
  }
}

// An action is done, and when, and kept to be done again in the person's browser if it only changed what's on the page;
// the scene is handed over once it's done as many as the recording had.
async function acted(does: string, target: (page: Page) => Promise<string | undefined>, act: () => Promise<unknown>, given: unknown, action: string) {
  const taken = taking.getStore();
  // The scene's own actions, on its way to a step as in one: a panel the way opened is part of the moment it leads to.
  // What made the app and signed in before it isn't the scene's.
  const keeping = taken?.given ? taken : undefined;
  let on: string | undefined, address: string | undefined;
  if (keeping) {
    if (!holds(keeping)) Object.assign(keeping, { from: undefined, again: [] });
    keeping.from ??= await kept(keeping.page, keeping.rest);
    keeping.wrote = false;
    [on, address] = [await target(keeping.page), keeping.page.url()];
  }
  // A dialog the browser shows holds the action up until it's answered, read first, which can be longer than it waits:
  // the action went through, as the dialog it opened shows, and goes on once it's answered.
  if (underway) underway.dialog = undefined;
  const began = Date.now();
  const result = await act().catch(async (error) => {
    const dialog = underway?.dialog;
    if (!dialog) throw error;
    await dialog;
  });
  underway?.actions.push({ action, began, at: Date.now() });
  // Running a note's fork, it leaves the scene where the person did, after as many of the step's actions.
  const fork = run?.fork;
  if (fork && underway?.depth && !underway.forked && fork.step === underway.step && fork.actions === ++underway.inStep) {
    await underway.page.waitForTimeout(BEAT);
    await forkOn(underway, fork);
  }
  if (keeping) {
    // Done again where the person takes over, it needn't wait for the page to be still here: only to see whether it
    // saved something or went to another page, which shows at once. The next action's page is waited for as it's taken.
    await keeping.page.waitForTimeout(SAVING);
    const plain = typeof given === "string" || typeof given === "boolean" || (Array.isArray(given) && given.every((one) => typeof one === "string"));
    if (on && !keeping.wrote && keeping.page.url() === address) Object.assign(keeping, { address }).again.push({ does, on, ...(plain && { with: given }) });
    else Object.assign(keeping, { from: undefined, again: [] });
  }
  if (keeping?.depth && !keeping.forking) await reached(keeping, keeping.step, ++keeping.actions);
  return result;
}

// What each action is done on is noted by its step. On Before, an action the round did on something else stops the scene
// there: a scene is written for the work, and in the app as it was, what it looks for can find another thing, as a card
// for a list's menu. What it did there isn't how the app was, and nobody should have to tell the two apart.
async function follow(scene: Underway, target: Locator): Promise<On | undefined> {
  const on = await doneOn(target);
  const done = (scene.doneOn[scene.step ?? ""] ??= []);
  const inRound = run?.before && run.doneInRound?.[base.info().title]?.[scene.step ?? ""]?.[done.length];
  done.push(on ?? null);
  if (on && inRound && !alike(on, inRound)) throw new Error(`The app as it was has ${on.role} “${on.name}” here, where the round has ${inRound.role} “${inRound.name}”.`);
  return on;
}

// An action as another recording of the scene knows the same one: what it does, and to what, as a person points at it.
// Words going in are typing, however they went in, and never the words, which may be just what changed; a key is which
// key it is, as Escape.
function nameOf(does: string, on: On | undefined, given: unknown): string {
  const kind = does === "press" ? `press ${given}` : /^(fill|type|insertText)$/.test(does) ? "type" : does;
  return on ? `${kind} ${on.role}${on.name ? ` “${on.name}”` : ""}` : kind;
}

// What has the focus, as keys pressed go to it; nothing, where nothing has.
async function focusedOn(page: Page): Promise<On | undefined> {
  const on = page.locator(":focus").first();
  return (await on.count()) ? doneOn(on) : undefined;
}

// What an action is done on, as a person points at it: its role and name, as getByRole finds it, without the state it's
// in; words with no role of their own, by their words. Nothing, for something with neither.
const doneOn = (target: Locator): Promise<On | undefined> =>
  target.ariaSnapshot({ timeout: 1000 }).then(
    (snapshot) => {
      const [, role, name, words] = snapshot.match(/^- ([\w-]+)(?: "((?:[^"\\]|\\.)*)")?[^:\n]*(?::\s*(.*))?/) ?? [];
      return role ? { role, name: name ?? (role === "text" ? (words ?? "") : "") } : undefined;
    },
    () => undefined,
  );

// The same thing, in the app as it was and with the work: the same role, and the same words.
function alike(one: On, other: On): boolean {
  return one.role === other.role && sameWords(one.name, other.name);
}

// The fork the agent wrote for the notes, run where the person took the scene over, recorded as the scene is, each of its
// steps read at its end and the page glimpsed after each action, as the scene's are; then the scene goes no further. With
// no fork written for them, nothing more is run.
async function forkOn(scene: Underway, run: ForkRun) {
  await scene.rest();
  const since = () => seconds(Date.now() - (scene.events[0]?.timestamp ?? Date.now()));
  const written = forks.find((fork) => fork.notes.some((note) => run.notes.includes(note)));
  const ran: ForkRan = (scene.forked = { from: since(), steps: [], ...(written && { fork: written.name }) });
  if (written) {
    // Its steps are its own, not inside the scene's step it starts after.
    const depth = scene.depth;
    scene.depth = 0;
    try {
      await written.body(scene.given!);
    } catch (error) {
      ran.failed = { ...(ran.steps.length && { at: ran.steps.at(-1)!.title }), why: firstLine(String((error as Error)?.message ?? error)) };
    } finally {
      scene.depth = depth;
    }
  }
  base.info().skip(true, "Ran as far as the note's fork");
}

// One of a person's steps, done again as the scene does its own: on what's at its path, by the paced actions.
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
  const scene = underway;
  if (!pointer || !scene || (run?.fork && !scene.forked)) return;
  const at = seconds(Date.now() - (scene.events[0]?.timestamp ?? Date.now()));
  const read = await readPage(scene.page).catch(() => undefined);
  if (read) scene.glimpses.push({ step: scene.step ?? "", at, ...read });
  // In a moment, pictured too, for what it changes that you can see on the way, as a Copied that goes again.
  if (read && scene.frames.size && !scene.readings.length && scene.depth)
    scene.frames.set(`after-${scene.frames.size - 1}`, await unhovered(scene.page, () => scene.page.screenshot({ animations: "disabled", caret: "hide" })));
}

// A dropdown's list of options is the browser's, not the page's, so rrweb never sees it open, as with a dialog: the
// choice changed with nothing pressed ("It doesn't even click the drop down, just instantly switches it"). So it's kept
// in the recording as a moment of its own, with where the dropdown is and its options, for the viewer to draw: it opens,
// the pointer goes down to the option the scene chooses, and it's chosen there.
async function opensList(target: Locator, given: unknown, at: { page: Page; x: number; y: number }, scene: Underway) {
  const list = await target
    .evaluate((select, given) => {
      if (!(select instanceof HTMLSelectElement) || select.multiple || select.size > 1) return undefined;
      const options = [...select.options];
      const first = Array.isArray(given) ? given[0] : given;
      const chosen = options.findIndex((option, i) =>
        typeof first === "string" ? option.value === first || option.label === first : first && typeof first === "object" ? (first.value !== undefined ? option.value === first.value : first.label !== undefined ? option.label === first.label : first.index === i) : false,
      );
      const box = select.getBoundingClientRect();
      return { x: box.left, y: box.bottom, width: box.width, options: options.map((option) => option.label), from: select.selectedIndex, chosen };
    }, given)
    .catch(() => undefined);
  if (!list || list.chosen < 0) return false;
  const { chosen, ...shown } = list;
  scene.events.push({ type: 5, data: { tag: "choice", payload: { ...shown, row: OPTION } }, timestamp: Date.now() } as { timestamp: number });
  await at.page.waitForTimeout(OPENED);
  const to = { x: list.x + Math.min(list.width / 2, 60), y: list.y + 4 + OPTION * (chosen + 0.5) };
  await glide(at, to, async () => to);
  await at.page.waitForTimeout(REST);
  return true;
}

// Somewhere a person types words: a text box, a text area, an editor.
const typedInto = (target: Locator) =>
  target
    .evaluate((on) => (on as HTMLElement).isContentEditable || on instanceof HTMLTextAreaElement || (on instanceof HTMLInputElement && ["text", "search", "email", "url", "tel", "password"].includes(on.type)))
    .catch(() => false);

// What's acted on, waited for in the action's place, fails in the action's words: the scene said click, not waitFor.
function asAction(error: unknown, action: string) {
  if (error instanceof Error) {
    error.message = error.message.replace("locator.waitFor", `locator.${action}`);
    error.stack &&= error.stack.replace("locator.waitFor", `locator.${action}`);
  }
  return error;
}

async function approach(target: Locator, at: { page: Page; x: number; y: number }, timeout?: number) {
  // What it acts on is waited for here, as long as the action waits (scenes.ts), and one that never comes fails here, in
  // Playwright's words: waited for again by the action, it took twice as long to give up on. It's found now, before the
  // hand is on its way, and that's what's acted on.
  await target.waitFor({ state: "attached", timeout });
  const aimed = (await target.elementHandle({ timeout: 5000 }).catch(() => null)) ?? undefined;
  const scroll = await target
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= innerHeight) return undefined;
      const most = document.documentElement.scrollHeight - innerHeight;
      return { from: scrollY, to: Math.max(0, Math.min(most, scrollY + box.top + box.height / 2 - innerHeight / 2)) };
    }, undefined, { timeout: 5000 })
    .catch(() => undefined);
  if (scroll && Math.abs(scroll.to - scroll.from) >= 1) {
    const moves = Math.max(10, Math.min(36, Math.round(Math.abs(scroll.to - scroll.from) / 25)));
    for (let i = 1; i <= moves; i++) {
      await at.page.evaluate((y) => scrollTo(0, y), scroll.from + (scroll.to - scroll.from) * ease(i / moves));
      await at.page.waitForTimeout(FRAME);
    }
    await at.page.waitForTimeout(REST);
  }
  // On a touch screen nothing is pointed at on the way: a finger comes down where it taps.
  if (await at.page.evaluate(() => navigator.maxTouchPoints > 0).catch(() => false)) return aimed;

  // A page still settling moves the target while the pointer is on its way, and Playwright then acts where it is now:
  // the pointer jumped there. So the pointer keeps its eye on the target, re-aiming as it goes, until both hold still.
  const centre = async () => {
    const box = await target.boundingBox({ timeout: 5000 }).catch(() => null);
    return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  let to = await centre();
  if (!to) return aimed;
  for (let tries = 0; tries < 3 && to; tries++) {
    to = await glide(at, to, centre);
    await at.page.waitForTimeout(REST);
    const now = await centre();
    if (!now || Math.hypot(now.x - at.x, now.y - at.y) < 3) return aimed;
    to = now;
  }
  return aimed;
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
