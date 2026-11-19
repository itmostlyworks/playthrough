// How long a downloaded video is: its moments as they play, each coming in, a beat between them, and the close.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ARRIVE, END, LAST, videoLength } from "../src/filming.ts";

test("a moment's video is the moment, its coming in and the close, and nothing more", () => {
  assert.equal(videoLength([6]), ARRIVE + 6 + END);
});

test("the whole change is its moments, a beat at the end of each but the last, and one close", () => {
  assert.equal(videoLength([4, 5, 7]), 3 * ARRIVE + 16 + 2 * LAST + END);
});
