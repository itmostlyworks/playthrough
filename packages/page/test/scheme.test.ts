// A page's light or dark, and still or moving, as the browser a flow was recorded in answered them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { asRecorded } from "../src/scheme.ts";

test("each asking of light or dark, still or moving, is answered as the recording's browser did: always holds, or never does", () => {
  const styles = "@media (prefers-color-scheme: dark) { .round { fill: #e3e4e7 } } @media (prefers-reduced-motion: reduce) { * { animation: none } } @media (min-width: 640px) { a { color: red } }";
  assert.equal(
    asRecorded(styles, { dark: false, still: false }),
    "@media (max-width: 0px) { .round { fill: #e3e4e7 } } @media (max-width: 0px) { * { animation: none } } @media (min-width: 640px) { a { color: red } }",
  );
  assert.equal(asRecorded("(prefers-color-scheme: dark)", { dark: true, still: false }), "(min-width: 0px)");
  assert.equal(asRecorded("(prefers-reduced-motion)", { dark: false, still: true }), "(min-width: 0px)");
});
