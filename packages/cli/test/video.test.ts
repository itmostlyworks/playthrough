// How large a downloaded video is: the app and nothing else, at the shape it was recorded at, as sharp as the places a
// video is played show it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { sizeOf } from "../src/video.ts";

test("a moment recorded on a laptop's screen is a video of exactly that screen, half as large again, 1920 wide", () => {
  assert.deepEqual(sizeOf({ width: 1280, height: 800 }), { width: 1920, height: 1200, larger: 1.5 });
});

test("a small screen is drawn at most twice its size", () => {
  assert.deepEqual(sizeOf({ width: 390, height: 844 }), { width: 780, height: 1688, larger: 2 });
});

test("a screen already as large as a video plays is filmed at its own size, or smaller", () => {
  assert.deepEqual(sizeOf({ width: 1920, height: 1080 }), { width: 1920, height: 1080, larger: 1 });
  assert.equal(sizeOf({ width: 2560, height: 1440 }).width, 1920);
});

test("compared, a video is two whole screens side by side, a line between them, as wide as a video plays", () => {
  assert.deepEqual(sizeOf({ width: 1280, height: 800 }, true), { width: 1920, height: 600, larger: 1920 / 2562 });
});

test("a video's sides are even, as H.264 asks", () => {
  const { width, height } = sizeOf({ width: 1366, height: 771 });
  assert.equal(width % 2, 0);
  assert.equal(height % 2, 0);
});
