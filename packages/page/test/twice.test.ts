// Escape while the app is yours: one is the app's, two right after each other are Back.

import assert from "node:assert/strict";
import { test } from "node:test";
import { escapedTwice, RIGHT_AFTER } from "../src/twice.ts";

test("a second Escape within the half second after the first is Back; the first is the app's, the one Back's key lights for", () => {
  const twice = escapedTwice(RIGHT_AFTER);
  assert.equal(twice(1000), false);
  assert.equal(twice(1000 + RIGHT_AFTER - 1), true);
});

test("a second Escape after the half second is a first again, and after Back the next is a first too", () => {
  const twice = escapedTwice(RIGHT_AFTER);
  assert.equal(twice(1000), false);
  assert.equal(twice(1000 + RIGHT_AFTER), false);
  assert.equal(twice(1000 + RIGHT_AFTER + 100), true);
  assert.equal(twice(1000 + RIGHT_AFTER + 200), false);
});

test("it's put into the app's pages as written, so it needs nothing from outside it", () => {
  const twice = new Function(`return (${escapedTwice.toString()})(${RIGHT_AFTER})`)() as (at: number) => boolean;
  assert.equal(twice(0), false);
  assert.equal(twice(100), true);
});
