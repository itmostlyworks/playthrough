// What a shared change's link promises: a guest reaches the one change and nothing else on this machine; what they say
// reaches the agent in their own name, never the person's; and the app is theirs only as they stepped into it there.

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { newId, type Send } from "@playthrough/change";
import { change } from "../src/change.ts";
import { know } from "../src/machine.ts";
import { wait } from "../src/moments.ts";
import { doorOf } from "../src/open.ts";
import { repo, type Repo } from "../src/repo.ts";
import { guestDoor, opened, sharing } from "../src/share.ts";

const TOTAL = "total-under-the-invoices-table";
const OTHER = "a-change-not-shared";
const quietly = async <T>(run: () => Promise<T>) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
};

describe("a shared change's link", () => {
  let folder = "";
  let here: Repo;
  let door: Server;
  let app: Server;
  let base = "";
  // What reached the app, as Playthrough's way through to it was asked.
  const reached: { path: string; headers: IncomingHttpHeaders }[] = [];
  const share = { address: `shop/${TOTAL}`, token: "an-unguessable-token", steppedIn: new Set<string>(), passing: undefined as number | undefined };
  const home = `/.playthrough/shared/${share.token}/`;
  const asked = (path: string, init?: RequestInit) => fetch(`${base}${path}`, { redirect: "manual", ...init });
  const sent = (by: string): Send => ({ id: newId(), handBack: 1, by, sent: new Date().toISOString(), notes: [{ id: newId(), words: "Say what it's the total of.", on: { handBack: 1, moment: "The total of all eight", at: 1 } }] });
  const post = (path: string, body: unknown) => asked(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  before(async () => {
    folder = await realpath(await mkdtemp(join(tmpdir(), "playthrough-share-")));
    process.env.PLAYTHROUGH_HOME = join(folder, "home");
    const root = join(folder, "shop");
    await mkdir(join(root, "playthrough"), { recursive: true });
    await mkdir(join(root, ".playthrough"), { recursive: true });
    know(root);
    here = repo(root);
    for (const [id, title] of [[OTHER, "A change not shared"], [TOTAL, "Total under the invoices table"]])
      await quietly(async () => {
        await change(here, title!, "Show the total under the table.");
        await here.changes.saveHandBack(id!, { number: 1, by: "Claude Code", moments: [{ name: "The total of all eight", length: 2, actions: [], recording: "the-total-of-all-eight.json", person: "Ana", from: 0 }], replies: [] });
        await here.changes.saveFile(id!, 1, "the-total-of-all-eight.json", Buffer.from("[]"));
        await here.changes.finish(id!, 1);
      });
    const page = join(folder, "viewer");
    await mkdir(join(page, "assets"), { recursive: true });
    await writeFile(join(page, "index.html"), `<script type="module" src="/assets/viewer.js"></script>`);
    await writeFile(join(page, "assets", "viewer.js"), "");
    door = guestDoor(share, doorOf(page, "Ludwig", 0));
    base = `http://127.0.0.1:${await opened(door)}`;
    app = createServer((request, response) => (reached.push({ path: request.url!, headers: request.headers }), response.writeHead(200, { "set-cookie": "session=theirs; Path=/" }), response.end("the app")));
    share.passing = await opened(app);
  });
  after(async () => {
    door.closeAllConnections();
    door.close();
    app.close();
    delete process.env.PLAYTHROUGH_HOME;
    await rm(folder, { recursive: true, force: true });
  });

  test("opens the change's page, its files asked for from the link's own folder", async () => {
    const page = await asked(home);
    assert.equal(page.status, 200);
    assert.match(await page.text(), new RegExp(`src="${home}assets/viewer.js"`));
    assert.equal((await asked(`${home}assets/viewer.js`)).status, 200);
    assert.equal((await asked(home.slice(0, -1))).headers.get("location"), home, "without its last slash, it's there");
  });

  test("gives the change alone, and its recordings", async () => {
    const listed = await (await asked(`${home}api/change`)).json();
    assert.deepEqual(listed.map((one: { change: { id: string } }) => one.change.id), [`shop/${TOTAL}`]);
    const file = await asked(`${home}api/change/hand-backs/1/files/the-total-of-all-eight.json`);
    assert.equal(file.status, 200);
    assert.equal(await file.text(), "[]");
  });

  test("reads only the shared change: it's there for a guest even where the machine's list of changes can't be read", async () => {
    const changes = join(here.root, ".playthrough");
    await chmod(changes, 0o300);
    try {
      const listed = await (await asked(`${home}api/change`)).json();
      assert.deepEqual(listed.map((one: { change: { id: string } }) => one.change.id), [`shop/${TOTAL}`]);
      assert.equal((await asked(`${home}api/change/hand-backs/1/files/the-total-of-all-eight.json`)).status, 200);
    } finally {
      await chmod(changes, 0o755);
    }
  });

  test("a guest can't say Done: their sends carry notes and replies, never Done", async () => {
    const done = await post(`${home}api/change/sends`, { id: newId(), handBack: 1, by: "Sam", sent: new Date().toISOString(), notes: [], done: true });
    assert.equal(done.status, 400);
    assert.match((await done.json()).problems[0], /Done is for the person who shared this to say/);
    assert.equal((await here.changes.get(TOTAL)).sends.length, 0, "nothing was kept");
  });

  test("reaches nothing else on this machine: not another change, not the list of them, not who the person is, not sharing, not with another token", async () => {
    for (const path of [
      "/",
      "/api/changes",
      `/api/changes/shop/${OTHER}`,
      "/api/you",
      `${home}api/changes`,
      `${home}api/changes/shop/${OTHER}/hand-backs/1/files/the-total-of-all-eight.json`,
      `${home}api/you`,
      "/.playthrough/shared/another-token/api/change",
    ])
      assert.equal((await asked(path)).status, 404, path);
    const climbing = await asked(`${home}api/change/hand-backs/1/files/..%2F..%2F..%2F${OTHER}%2Fchange.json`);
    assert.notEqual(climbing.status, 200, "no file outside the change's");
    for (const [method, path] of [
      ["POST", `${home}api/change/share`],
      ["DELETE", `${home}api/change/share`],
      ["GET", `${home}api/change/share`],
      ["POST", `${home}api/change/hand-backs`],
      ["PUT", `${home}api/change/sends`],
    ])
      assert.equal((await asked(path!, { method })).status, 404, `${method} ${path}`);
  });

  test("sends a guest's note to the agent in their name, and never in the name of the person who shared it", async () => {
    const theirs = await post(`${home}api/change/sends`, sent("Ludwig"));
    assert.equal(theirs.status, 400);
    assert.match((await theirs.json()).problems[0], /Ludwig is the name of the person who shared this/);
    assert.equal((await post(`${home}api/change/seen`, { by: "Ludwig", moments: [{ handBack: 1 }] })).status, 400, "nor says what the person has seen");
    assert.equal((await post(`${home}api/change/sends`, sent("Sam"))).status, 200);
    const lines: string[] = [];
    const log = console.log;
    console.log = (...words: unknown[]) => void lines.push(words.join(" "));
    try {
      await wait(here);
    } finally {
      console.log = log;
    }
    assert.match(lines.join("\n"), /Sam said:[\s\S]*Sam: Say what it's the total of\./);
  });

  test("without cloudflared, sharing says so and how to install it, and leaves nothing open", async () => {
    const path = process.env.PATH;
    process.env.PATH = folder;
    try {
      const shares = sharing(doorOf(join(folder, "viewer"), "Ludwig", 0));
      assert.deepEqual(shares.start(`shop/${TOTAL}`), { is: "starting" });
      let now = shares.of(`shop/${TOTAL}`);
      for (let waited = 0; now.is === "starting" && waited < 5000; waited += 50) (await new Promise((done) => setTimeout(done, 50)), (now = shares.of(`shop/${TOTAL}`)));
      assert.equal(now.is, "failed");
      assert.match(now.is === "failed" ? now.why : "", /cloudflared, which isn't on this computer\. Install it with brew install cloudflared/);
      assert.deepEqual(shares.stop(`shop/${TOTAL}`), { is: "off" });
    } finally {
      process.env.PATH = path;
    }
  });

  test("lets a guest's browser on to the app only through a step in made at the link, as if asked on this machine", async () => {
    assert.equal((await asked("/boards")).status, 404, "nobody stepped in");
    assert.equal((await asked("/step-in/someone-elses")).status, 404, "another's step in");
    share.steppedIn.add("theirs");
    const handed = await asked("/step-in/theirs");
    assert.equal(handed.status, 200);
    const cookie = handed.headers.getSetCookie().find((one) => one.startsWith("playthrough-shared="));
    assert.match(cookie ?? "", /^playthrough-shared=an-unguessable-token; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    assert.ok(handed.headers.getSetCookie().includes("session=theirs; Path=/"), "the app's own cookies come too");
    assert.equal((await asked("/.playthrough/held/someone-elses")).status, 404);
    assert.equal((await asked("/boards", { headers: { cookie: "playthrough-shared=a-guess" } })).status, 404);
    assert.equal((await asked("/step-in/someone-elses", { headers: { cookie: "playthrough-shared=an-unguessable-token" } })).status, 404, "the cookie never opens another's step in");
    // As the tunnel brings it: by the link's own name, from its page.
    const board = await new Promise<string>((done, failed) =>
      request(`${base}/boards`, { headers: { cookie: "session=theirs; playthrough-shared=an-unguessable-token", host: "shared.example", origin: "https://shared.example" } }, (answer) => {
        let text = "";
        answer.on("data", (chunk) => (text += chunk)).on("end", () => done(text));
      })
        .on("error", failed)
        .end(),
    );
    assert.equal(board, "the app");
    const { headers } = reached.at(-1)!;
    assert.equal(headers.host, `localhost:${share.passing}`);
    assert.equal(headers.origin, `http://localhost:${share.passing}`);
    assert.equal(headers.cookie, "session=theirs", "the app never sees the link's cookie");
  });
});
