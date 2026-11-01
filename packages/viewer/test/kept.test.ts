// A recording plays with what was kept with it: the fonts, images and stylesheets its page loaded, never the app's own,
// which may be gone or on another machine.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fromKept } from "../src/api.ts";

const files = "/api/reviews/lake-trip/rounds/1/files/";
const kept = {
  "http://localhost:3000/_next/static/media/inter.woff2": "assets/1a2b.woff2",
  "http://localhost:3000/_next/image?url=%2Flogo.png&w=256&q=75": "assets/3c4d.webp",
};

test("what the page loaded is played from where it's kept", () => {
  const events = JSON.stringify([{ data: { cssText: '@font-face { src: url("http://localhost:3000/_next/static/media/inter.woff2") }' } }]);
  assert.equal(JSON.parse(fromKept(events, kept, files))[0].data.cssText, `@font-face { src: url("${files}assets/1a2b.woff2") }`);
});

test("of the sizes an image offered, it shows the one it was recorded at, whatever the screen it's watched on", () => {
  const offered = "http://localhost:3000/_next/image?url=%2Flogo.png&w=256&q=75 1x, http://localhost:3000/_next/image?url=%2Flogo.png&w=640&q=75 2x";
  const events = JSON.stringify([{ attributes: { srcset: offered, src: "http://localhost:3000/_next/image?url=%2Flogo.png&w=640&q=75" } }]);
  const [{ attributes }] = JSON.parse(fromKept(events, kept, files));
  assert.equal(attributes.srcset, `${files}assets/3c4d.webp`);
});

test("what wasn't kept, like a link, stays as it was", () => {
  const events = JSON.stringify([{ attributes: { href: "http://localhost:3000/groups/abc" } }]);
  assert.equal(fromKept(events, kept, files), events);
  assert.equal(fromKept(events, {}, files), events);
});

test("an SVG it drew asks for light or dark as the recording's browser was, not the viewer's: the site's logo, recorded light, in a dark viewer", () => {
  const logo = { "http://localhost:3000/logo.svg": "assets/5e6f.svg" };
  const page = (dark: boolean) => JSON.stringify([{ type: 5, data: { tag: "browser", payload: { dark, still: false } } }, { attributes: { src: "http://localhost:3000/logo.svg" } }]);
  assert.equal(JSON.parse(fromKept(page(false), logo, files))[1].attributes.src, `${files}assets/5e6f.svg?as=light,moving`);
  assert.equal(JSON.parse(fromKept(page(true), logo, files))[1].attributes.src, `${files}assets/5e6f.svg?as=dark,moving`);
});
