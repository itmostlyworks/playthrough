// What you did taking over the app is kept with the fonts and pictures its pages named, so a note made there looks as
// it did once you've left the app.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { keepNamed } from "../src/assets.ts";
import { onTheWay } from "../src/use.ts";

test("a font your recording names is kept, asked of the app by the path it was named at", async () => {
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

test("what's named is asked of the app as taking over asks it, with what setup.ts's use adds on the way, so an app that answers only with it still gives its stylesheet", async () => {
  const app = createServer((request, response) => {
    const asTheRun = request.headers["x-backend"] === "staging" && request.headers.authorization === `Basic ${Buffer.from("sam:launch").toString("base64")}`;
    if (asTheRun && request.url === "/style.css") return response.writeHead(200, { "content-type": "text/css" }).end("body{}");
    response.writeHead(401).end();
  });
  await new Promise<void>((done) => app.listen(0, "127.0.0.1", done));
  const address = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
  try {
    const recorded = JSON.stringify([{ href: `${address}/style.css` }]);
    const use = { extraHTTPHeaders: { "X-Backend": "staging" }, httpCredentials: { username: "sam", password: "launch" } };
    assert.deepEqual(await keepNamed(recorded, {}, address, async () => {}), {}, "without it, the app gives nothing");
    const kept = await keepNamed(recorded, {}, address, async () => {}, onTheWay(use, address));
    assert.match(kept[`${address}/style.css`] ?? "", /^assets\/[0-9a-f]{16}\.css$/);
  } finally {
    app.close();
  }
});

test("an address a recording names is never asked as it is, only the app by its path, never where the app sends it on, and never another address by a path that looks like one", async () => {
  const asked: string[] = [];
  const elsewhere = createServer((request, response) => (asked.push(`elsewhere ${request.url}`), response.writeHead(200, { "content-type": "image/png" }).end("secret")));
  const app = createServer((request, response) => {
    asked.push(`app ${request.url}`);
    if (request.url === "/moved.png") return response.writeHead(302, { location: `http://127.0.0.1:${port(elsewhere)}/secret.png` }).end();
    response.writeHead(404).end();
  });
  const port = (server: typeof app) => (server.address() as { port: number }).port;
  await Promise.all([app, elsewhere].map((server) => new Promise<void>((done) => server.listen(0, "127.0.0.1", done))));
  try {
    const saved: string[] = [];
    const recorded = JSON.stringify([
      { src: `http://127.0.0.1:${port(elsewhere)}/metadata.png` },
      { src: `http://127.0.0.1:${port(app)}/moved.png` },
      { src: `http://127.0.0.1:${port(app)}//127.0.0.1:${port(elsewhere)}/x.png` },
    ]);
    const kept = await keepNamed(recorded, {}, `http://127.0.0.1:${port(app)}`, async (file) => void saved.push(file));
    assert.deepEqual(kept, {});
    assert.deepEqual(saved, []);
    assert.ok(!asked.some((one) => one.startsWith("elsewhere")), `asked: ${asked.join(", ")}`);
    assert.deepEqual(asked.sort(), ["app //127.0.0.1:" + port(elsewhere) + "/x.png", "app /metadata.png", "app /moved.png"].sort());
  } finally {
    app.close();
    elsewhere.close();
  }
});
