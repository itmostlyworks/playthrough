// What's kept can be committed and shown to others: an address the browser only passed through on its way to another
// keeps no query or hash, and one where something was done, or a moment rests, is kept whole, as it's gone back to.

import assert from "node:assert/strict";
import { test } from "node:test";
import { keep } from "../src/as.ts";
import { passedThroughIn } from "../src/passed.ts";
import type { Done } from "../src/way.ts";

const callback = "https://sign-in.example.com/callback?code=Sam-1&state=Anna-2&nonce=3#token";

test("the agent's browser keeps a page left at once for another without its query or hash, on any origin, and the rest whole", () => {
  const did: Done[] = [];
  for (const done of [
    { does: "goto", on: "page", with: "/boards?tab=mine" },
    { does: "click", on: "a", role: "link", name: "Sign in" },
    { does: "goto", on: "page", with: "/authorize?client_id=shop&state=Anna-2&nonce=3", led: true },
    { does: "goto", on: "page", with: "/callback?code=Sam-1&state=Anna-2#token", led: true },
    { does: "goto", on: "page", with: "/boards?tab=mine", led: true },
  ] as Done[])
    keep(did, done);
  assert.deepEqual(
    did.filter((one) => one.does === "goto").map((one) => one.with),
    ["/boards?tab=mine", "/authorize", "/callback", "/boards?tab=mine"],
  );
});

test("a recording keeps a page left before anything was clicked or typed there without its query or hash, and the rest whole", () => {
  const page = (href: string) => ({ type: 4, data: { href } });
  const click = { type: 3, data: { source: 2 } };
  const moved = { type: 3, data: { source: 1 } };
  const events = [page("http://localhost:3000/boards?tab=mine"), click, page(callback), moved, page("http://localhost:3000/boards?tab=mine#new"), click, page("http://localhost:3000/board?id=7")];
  assert.deepEqual(
    passedThroughIn(events).filter((event) => event.type === 4).map((event) => (event.data as { href: string }).href),
    ["http://localhost:3000/boards?tab=mine", "https://sign-in.example.com/callback", "http://localhost:3000/boards?tab=mine#new", "http://localhost:3000/board?id=7"],
  );
});
