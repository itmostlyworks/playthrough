// What draws a note's picture or a still, for the person's page or a guest's, asks for nothing but the viewer's own
// page and the one change's kept files: what it draws is a recording someone else may have made, and the picture of it
// goes back to whoever asked.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { frameOf, mayDraw, stillOf } from "../src/frames.ts";
import { repo, type Repo } from "../src/repo.ts";
import { change } from "../src/change.ts";

const ID = "total-under-the-invoices-table";
const ADDRESS = `shop/${ID}`;
const OWN = `/api/changes/shop/${ID}/hand-backs/1/files/`;
// Everything a recording's page can make a browser ask for, at what the person's Playthrough answers and elsewhere.
const HOSTILE = (elsewhere: string) => `<!doctype html><meta http-equiv="refresh" content="0;url=/api/changes">
<link rel="stylesheet" href="/api/you">
<style>body{background:url(/api/changes/shop/secret/hand-backs/1/files/secret.svg)} @font-face{font-family:x;src:url(/share)} p{font-family:x}</style>
<p>words</p>
<img src="/api/changes/shop/secret/hand-backs/1/files/secret.svg">
<img srcset="/api/you 1x, ${elsewhere}/srcset.png 2x">
<img src="${elsewhere}/img.png">
<img src="${OWN}picture.png">
<iframe src="/api/changes"></iframe>
<embed src="/api/you">
<object data="/api/changes/shop/secret"></object>
<script>new WebSocket("ws://" + location.host + "/api/changes?live"); fetch("/api/changes/shop/${ID}/share", { method: "POST" }).catch(() => {});</script>`;

let folder = "";
let here: Repo;
let page: Server;
let elsewhere: Server;
const asked: string[] = [];
const outside: string[] = [];
const port = (server: Server) => (server.address() as { port: number }).port;

before(async () => {
  folder = await mkdtemp(join(tmpdir(), "playthrough-frames-"));
  here = repo(folder);
  await mkdir(join(folder, ".playthrough"), { recursive: true });
  const log = console.log;
  console.log = () => {};
  await change(here, "Total under the invoices table", "Show the total.").finally(() => (console.log = log));
  await here.changes.saveHandBack(ID, { number: 1, by: "Claude Code", moments: [{ name: "The total", length: 2, actions: [], recording: "the-total.json", person: "Ana", from: 0 }], replies: [] });
  await here.changes.saveFile(ID, 1, "the-total.json", Buffer.from(JSON.stringify([{ type: 4, data: { href: "http://app/", width: 800, height: 600 }, timestamp: 1000 }])));
  elsewhere = createServer((request, response) => (outside.push(request.url!), response.end()));
  await new Promise<void>((done) => elsewhere.listen(0, "127.0.0.1", done));
  // The person's Playthrough, as the drawing browser finds it: the page, and whatever else it asks.
  page = createServer((request, response) => {
    asked.push(`${request.method} ${new URL(request.url!, "http://localhost").pathname}`);
    // The recording's page is built in a frame of the viewer's page, as rrweb builds it.
    if (request.url!.startsWith("/?frame="))
      return response
        .writeHead(200, { "content-type": "text/html" })
        .end(`<!doctype html><body><script>const frame = document.body.appendChild(document.createElement("iframe")); frame.contentDocument.write(${JSON.stringify(HOSTILE(`http://127.0.0.1:${port(elsewhere)}`)).replace(/<\//g, "<\\/")}); frame.contentDocument.close(); setTimeout(() => (window.framed = null), 1000);</script></body>`);
    response.writeHead(200, { "content-type": "image/png" }).end();
  });
  await new Promise<void>((done) => page.listen(0, done));
});
after(async () => {
  page.close();
  elsewhere.close();
  await rm(folder, { recursive: true, force: true });
});

test("drawing a picture asks for the viewer's own page and this change's kept files, and nothing else, whoever's recording it is", async () => {
  asked.length = 0;
  await frameOf(here, ID, ADDRESS, "anotepict", { handBack: 1, recording: "the-total.json", at: 1 }, port(page), "shared/");
  await stillOf(here, ID, ADDRESS, { handBack: 1, recording: "the-total.json", at: 1 }, port(page), "shared/");
  assert.deepEqual([...new Set(asked)].sort(), ["GET /", `GET ${OWN}picture.png`].sort(), "only the page, and the change's own picture");
  assert.deepEqual(outside, [], "nothing anywhere else");
});

test("what may be drawn is said by path: this change's files and the viewer's own, read, at the person's Playthrough", () => {
  const at = (path: string, method = "GET", host = "localhost:5801") => mayDraw(method, `http://${host}${path}`, 5801, ADDRESS);
  for (const path of ["/?frame=x", "/assets/index-abc.js", "/logo.svg", `${OWN}x.png`, `${OWN}branches/shared/a.json`]) assert.ok(at(path), path);
  for (const path of ["/api/changes", "/api/you", "/api/changes/shop/secret/hand-backs/1/files/x.png", `/api/changes/shop/${ID}/share`, `/api/changes/shop/${ID}`, `${OWN}../../../secret/x.png`, "/assets/../api/you", "/moments/shop/x/1"])
    assert.ok(!at(path), path);
  assert.ok(!at(`${OWN}x.png`, "POST"), "only read");
  assert.ok(!at(`${OWN}x.png`, "GET", "127.0.0.1:5801"), "only at the address it draws from");
  assert.ok(!at(`${OWN}x.png`, "GET", "localhost:5802"), "only the person's Playthrough");
});
