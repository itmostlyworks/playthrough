// The clock every flow runs on: the day the review started, at the time of day it's recorded, so the page and the app's
// server, which keeps the real time, agree on what “just now” is.

import assert from "node:assert/strict";
import { test } from "node:test";
import { onReviewDay } from "../src/test.ts";

const started = "2026-10-28T13:57:05.284Z";

test("on the day the review started, a flow runs at the real time, so what the server stamps reads as it would", () => {
  const now = Date.parse("2026-10-28T19:40:15.399Z");
  assert.equal(onReviewDay(started, now).toISOString(), "2026-10-28T19:40:15.399Z");
});

test("on a later day, a flow still runs on the day the review started, at the time of day it's recorded", () => {
  assert.equal(onReviewDay(started, Date.parse("2026-10-30T09:12:00.000Z")).toISOString(), "2026-10-28T09:12:00.000Z");
  assert.equal(onReviewDay(started, Date.parse("2026-11-02T23:59:59.000Z")).toISOString(), "2026-10-28T23:59:59.000Z");
});
