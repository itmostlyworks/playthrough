// The clock every moment runs on: the day the change started, at the time of day it's recorded, so the page and the app's
// server, which keeps the real time, agree on what “just now” is.

import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { onTheDayItStarted, steadied } from "../src/steady.ts";

const DAY = 24 * 60 * 60 * 1000;
const started = "2026-10-28T13:57:05.284Z";

test("on the day the change started, a moment runs at the real time, so what the server stamps reads as it would", () => {
  const now = Date.parse("2026-10-28T19:40:15.399Z");
  assert.equal(onTheDayItStarted(started, now).toISOString(), "2026-10-28T19:40:15.399Z");
});

test("on a later day, a moment still runs on the day the change started, at the time of day it's recorded", () => {
  assert.equal(onTheDayItStarted(started, Date.parse("2026-10-30T09:12:00.000Z")).toISOString(), "2026-10-28T09:12:00.000Z");
  assert.equal(onTheDayItStarted(started, Date.parse("2026-11-02T23:59:59.000Z")).toISOString(), "2026-10-28T23:59:59.000Z");
});

// What's put in each page, run as a page runs it: in a window of its own.
const inAPage = (script: string) => {
  const page = runInNewContext(`var window = globalThis; var performance = { now: () => 1234 }; ${script}; globalThis`);
  return page as { Date: DateConstructor; performance: { now: () => number } };
};

test("a page is on the day the change started, at the time of day it is, its dates made and read as the browser's are", () => {
  const page = inAPage(steadied(new Date(Date.now() - 3 * DAY).toISOString()));
  const today = new Date();
  const then = new page.Date();
  assert.equal(Math.round((today.getTime() - then.getTime()) / DAY), 3);
  assert.ok(Math.abs(page.Date.now() - then.getTime()) < 1000);
  assert.ok(then instanceof page.Date);
  assert.equal(new page.Date("2026-10-28T13:57:05.284Z").toISOString(), "2026-10-28T13:57:05.284Z");
  assert.equal(page.Date.UTC(2026, 9, 28), Date.UTC(2026, 9, 28));
  assert.match(page.Date(), /\d{4}/);
});

test("only the date is moved: the page's clock for what moves runs from when it loaded, so an animation it starts plays now", () => {
  const page = inAPage(steadied(new Date(Date.now() - 3 * DAY).toISOString()));
  assert.equal(page.performance.now(), 1234);
});

test("on the day the change started, the page's date is the browser's own", () => {
  const page = inAPage(steadied(new Date().toISOString()));
  assert.equal(page.Date.name, "Date");
});
