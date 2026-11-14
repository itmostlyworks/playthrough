// What you did stepping into the app is kept with the fonts and pictures its pages named, so a note made there looks as
// it did once you've left the app.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { keepNamed } from "../src/assets.ts";

test("a font your recording names is kept, fetched from the app at the same path once the address it was seen at is gone", async () => {
  const app = createServer((request, response) => {
    if (request.url === "/_next/static/media/sans.woff2") return response.writeHead(200, { "content-type": "font/woff2" }).end("font");
    response.writeHead(404).end();
  });
  await new Promise<void>((done) => app.listen(0, "127.0.0.1", done));
  const port = (app.address() as { port: number }).port;
  try {
    const saved = new Map<string, string>();
    const recorded = JSON.stringify([{ css: "@font-face{src:url(http://127.0.0.1:1/_next/static/media/sans.woff2)}" }, { href: "http://127.0.0.1:1/boards" }]);
    const kept = await keepNamed(recorded, { "http://127.0.0.1:1/logo.png": "assets/logo.png" }, `http://127.0.0.1:${port}`, async (file, bytes) => void saved.set(file, Buffer.from(bytes).toString()));
    const font = kept["http://127.0.0.1:1/_next/static/media/sans.woff2"];
    assert.match(font ?? "", /^assets\/[0-9a-f]{16}\.woff2$/);
    assert.equal(saved.get(font!), "font");
    assert.equal(kept["http://127.0.0.1:1/logo.png"], "assets/logo.png");
    assert.equal(kept["http://127.0.0.1:1/boards"], undefined);
  } finally {
    app.close();
  }
});
