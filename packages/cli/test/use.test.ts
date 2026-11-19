// What stepping in promises about setup.ts's use: the person's browser talks to the app as the run's did, what use adds
// to every request added on this computer, on the way to the app alone, and never where a browser could read it.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser } from "@playwright/test";
import { change } from "../src/change.ts";
import { guestDoor, opened } from "../src/share.ts";
import { getReady } from "../src/step-in.ts";
import { repo, type Repo } from "../src/repo.ts";
import { onTheWay, playthroughs, unlike } from "../src/use.ts";

const ROUTE = "staging-7f3a9c41";
const PASSWORD = "launch-week-0b9d";
const MOMENT = "The board, on the staging backend";
const quietly = async <T>(run: () => Promise<T>) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
};

describe("stepping in talks to the app as the run did", () => {
  let folder = "";
  let here: Repo;
  let app: Server;
  let elsewhere: Server;
  let browser: Browser;
  let elsewhereAt = "";
  // What reached another address the app's page asks.
  const reachedElsewhere: IncomingHttpHeaders[] = [];
  const id = "the-board-on-staging";

  before(async () => {
    folder = await realpath(await mkdtemp(join(tmpdir(), "playthrough-use-")));
    process.env.PLAYTHROUGH_HOME = join(folder, "home");
    elsewhere = createServer((request, response) => (reachedElsewhere.push(request.headers), response.writeHead(200, { "access-control-allow-origin": "*" }), response.end("elsewhere")));
    elsewhereAt = `http://127.0.0.1:${await opened(elsewhere)}`;
    // The app answers only a request routed to the staging backend, and the server's error page to any other; and only
    // one signed in for the server, as staging is.
    app = createServer((request, response) => {
      if (request.headers["x-backend"] !== ROUTE) return void (response.writeHead(500, { "content-type": "text/html" }), response.end("<!doctype html><h1>Server error</h1><p id=fetched>Server error</p>"));
      if (request.headers.authorization !== `Basic ${Buffer.from(`staging:${PASSWORD}`).toString("base64")}`)
        return void (response.writeHead(401, { "www-authenticate": 'Basic realm="staging"', "content-type": "text/html" }), response.end("<!doctype html><h1>Sign in</h1><p id=fetched>Sign in</p>"));
      if (request.url === "/api/board") return void (response.writeHead(200, { "content-type": "application/json" }), response.end(JSON.stringify({ name: "Website launch" })));
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><h1>Website launch</h1><p id="fetched"></p>
<script>
  fetch("/api/board").then((answer) => answer.ok ? answer.json() : { name: "Server error" }).then((board) => (fetched.textContent = board.name));
  fetch(${JSON.stringify(elsewhereAt)}).catch(() => {});
</script>`);
    });
    const port = await opened(app);
    const root = join(folder, "board");
    await mkdir(join(root, "playthrough"), { recursive: true });
    await writeFile(join(root, "playthrough", "app.json"), JSON.stringify({ start: "true", url: `http://127.0.0.1:${port}` }));
    await writeFile(join(root, "playthrough", "setup.ts"), `export const use = { extraHTTPHeaders: { "X-Backend": ${JSON.stringify(ROUTE)} }, httpCredentials: { username: "staging", password: ${JSON.stringify(PASSWORD)} } };\n`);
    here = repo(root);
    await quietly(() => change(here, "The board on staging", "Show the board on the staging backend."));
    await mkdir(here.moments(id), { recursive: true });
    await writeFile(
      join(here.moments(id), "the-board.ts"),
      `import { expect, test } from "playthrough/test";\n\ntest(${JSON.stringify(MOMENT)}, async ({ page }) => {\n  await page.goto("/");\n  await test.step(${JSON.stringify(MOMENT)}, async () => {\n    await expect(page.locator("#fetched")).toHaveText("Website launch");\n  });\n});\n`,
    );
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    app.closeAllConnections();
    app.close();
    elsewhere.closeAllConnections();
    elsewhere.close();
    delete process.env.PLAYTHROUGH_HOME;
    await rm(folder, { recursive: true, force: true });
    // Playthrough keeps its browser for runs and its way through to the app open for as long as it runs: this ends them.
    setTimeout(() => process.exit(), 100).unref();
  });

  // Stepped in at `from`, in a browser of its own, reloaded once: everything the browser sent and was sent, and what it
  // keeps, as anyone with devtools open could read it.
  async function steppedIn(from: (port: number, name: string) => Promise<string>) {
    const { port, name } = await getReady(here, id, { moment: MOMENT });
    const context = await browser.newContext();
    const page = await context.newPage();
    const seen: string[] = [];
    page.on("request", (request) => void request.allHeaders().then((headers) => seen.push(request.url(), JSON.stringify(headers), request.postData() ?? "")));
    page.on("response", (response) => void response.allHeaders().then(async (headers) => seen.push(JSON.stringify(headers), await response.text().catch(() => ""))));
    const at = await from(port, name);
    await page.goto(`${at}/step-in/${name}`);
    await page.waitForURL(`${at}/`);
    const fetched = page.locator("#fetched");
    await fetched.filter({ hasText: /./ }).waitFor();
    const shown = { heading: await page.locator("h1").textContent(), fetched: await fetched.textContent() };
    await page.reload();
    await fetched.filter({ hasText: /./ }).waitFor();
    const reloaded = { heading: await page.locator("h1").textContent(), fetched: await fetched.textContent() };
    seen.push(await page.content(), JSON.stringify(await context.storageState()));
    await context.close();
    return { shown, reloaded, seen: seen.join("\n") };
  }

  test("talks to the app as the run did: what use adds to every request is added on this computer, to the page, a reload and its script", async () => {
    const { shown, reloaded } = await steppedIn(async (port) => `http://localhost:${port}`);
    assert.deepEqual(shown, { heading: "Website launch", fetched: "Website launch" });
    assert.deepEqual(reloaded, shown, "reloaded, still the app");
  });

  test("what use adds never reaches the browser stepped in from, in what it sends, what it's sent or what it keeps", async () => {
    const { shown, seen } = await steppedIn(async (port) => `http://localhost:${port}`);
    assert.equal(shown.fetched, "Website launch", "used, all the same");
    for (const secret of [ROUTE, PASSWORD, Buffer.from(`staging:${PASSWORD}`).toString("base64")]) assert.ok(!seen.includes(secret), `${secret} reached the browser`);
  });

  test("what use adds goes only to the app, never to another address its pages ask", async () => {
    reachedElsewhere.length = 0;
    const { shown } = await steppedIn(async (port) => `http://localhost:${port}`);
    assert.equal(shown.fetched, "Website launch", "the app had it");
    assert.ok(reachedElsewhere.length > 0, "the page asked another address");
    for (const headers of reachedElsewhere) assert.ok(!headers["x-backend"] && !headers.authorization, JSON.stringify(headers));
  });

  test("a guest stepping in through a shared link talks to the app the same way, and can't read what's added either", async () => {
    const share = { address: `board/${id}`, token: "an-unguessable-token", steppedIn: new Set<string>(), passing: undefined as number | undefined };
    const door = guestDoor(share, { page: folder, owner: "Ludwig", listed: async () => [], answerOn: async () => {} });
    const doorAt = await opened(door);
    try {
      const { shown, reloaded, seen } = await steppedIn(async (port, name) => (share.steppedIn.add(name), (share.passing = port), `http://localhost:${doorAt}`));
      assert.deepEqual(shown, { heading: "Website launch", fetched: "Website launch" });
      assert.deepEqual(reloaded, shown);
      for (const secret of [ROUTE, PASSWORD]) assert.ok(!seen.includes(secret), `${secret} reached the guest's browser`);
    } finally {
      door.closeAllConnections();
      door.close();
    }
  });
});

describe("what becomes of each of use's options", () => {
  const app = "http://localhost:3000";
  const sent = { host: "localhost:3000", accept: "text/html", "user-agent": "Their browser" };

  test("its headers go over the browser's own, as the run's did in the recording, by any name's case", () => {
    const added = onTheWay({ extraHTTPHeaders: { "X-Backend": "staging", Accept: "application/json" }, userAgent: "The run's browser" }, app)(sent);
    assert.deepEqual(added, { host: "localhost:3000", accept: "application/json", "x-backend": "staging", "user-agent": "The run's browser" });
  });

  test("its sign-in for the server goes only where it's for the app, and never over one the request has of its own", () => {
    const signedIn = (use: Parameters<typeof onTheWay>[0], headers: Record<string, string> = sent) => onTheWay(use, app)(headers).authorization;
    assert.equal(signedIn({ httpCredentials: { username: "staging", password: "secret" } }), `Basic ${Buffer.from("staging:secret").toString("base64")}`);
    assert.equal(signedIn({ httpCredentials: { username: "staging", password: "secret", origin: "http://localhost:3000" } }), `Basic ${Buffer.from("staging:secret").toString("base64")}`);
    assert.equal(signedIn({ httpCredentials: { username: "staging", password: "secret", origin: "https://api.example.com" } }), undefined, "for another address");
    assert.equal(signedIn({ httpCredentials: { username: "staging", password: "secret" } }, { ...sent, authorization: "Bearer theirs" }), "Bearer theirs");
  });

  test("what can't come along is said before you're in, each in what the recording's browser did, never what it was set to", () => {
    assert.equal(
      unlike({ geolocation: { latitude: 59.33, longitude: 18.06 }, permissions: ["geolocation", "notifications"], offline: true, proxy: { server: "http://user:pass@proxy:8080" } }),
      "Your browser can't be as the recording's was, which was told where it is, was allowed geolocation and notifications, was offline and went through a proxy, so the app may not be as it was there.",
    );
    assert.equal(unlike({ offline: false, javaScriptEnabled: true, serviceWorkers: "allow", permissions: [], extraHTTPHeaders: { "x-backend": "staging" } }), undefined, "nothing a browser isn't anyway");
  });

  test("what Playthrough keeps the same everywhere is refused, naming it", () => {
    assert.deepEqual(playthroughs({ viewport: { width: 400, height: 800 }, locale: "sv-SE", extraHTTPHeaders: {} }), ["viewport", "locale"]);
  });
});
