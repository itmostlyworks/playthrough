// Sharing a change: anyone with its link watches it, steps into the app from its moments and leaves notes, through a
// Cloudflare quick tunnel straight to this machine, for as long as `playthrough open` runs and sharing isn't stopped.
// What's shared answers at a door of its own, a listener only the tunnel reaches, so a guest is told from the person by
// where they knocked, never by anything they could say. Through it, only the one change (the page, its files, and what
// the person can do on it but share) and the app as a guest stepped into it; nothing of the rest of the machine.
//
// The app and the guest's page are one address, as they are to the person, both on this machine's name: the app's
// cookies, its sign-in among them, go with its pages in the guest's browser as they do in the person's, which they
// wouldn't between two addresses. The page is in a folder the app doesn't use, beside /step-in, which is Playthrough's
// already; everything else is the app's, for a browser that stepped in here.

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, request as ask, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { Refused } from "@playthrough/change";
import { answered, json, serve } from "./open.ts";

// Where a shared change stands, as its Share says it.
export type Shared = { is: "off" } | { is: "starting" } | { is: "on"; link: string } | { is: "failed"; why: string };

// What the door asks of `playthrough open`: its page, whose it is, the shared change as listed, and what's asked of it,
// answered as the person's are but as a guest. Each by the change's address alone: nothing else on the machine is read.
export type Door = {
  page: string;
  owner: string;
  listed(address: string): Promise<unknown[]>;
  answerOn(address: string, rest: string[], request: IncomingMessage, response: ServerResponse, guest: Guest): Promise<unknown>;
};

// A guest, as the change's own answers know them: in any name but the person's, sending notes and replies but never
// Done, which is the person's alone, and stepping in for themselves.
export type Guest = { speaksAs(by: string): void; sends(send: { by: string; done?: true }): void; steppedIn(name: string, port: number): void };

// What a guest may ask of the change, and nothing else: watching it (its files), saying what they opened and sending
// notes, and stepping in (how long it takes, kept ready, what they did there, and a note's picture of it).
const ASKS: Record<string, string[]> = { GET: ["hand-backs"], POST: ["seen", "sends", "step-in", "ready-in", "keep-ready", "branches", "frames", "stills"] };

// The page's folder, beside /step-in, Playthrough's already in the app's address.
const HOME = "/.playthrough/shared/";
// The cookie a browser that stepped in through the link carries, which lets it on to the app.
const COOKIE = "playthrough-shared";
// How long Cloudflare has to give a link.
const GIVEN = 30_000;
const NOT_INSTALLED = "Sharing needs cloudflared, which isn't on this computer. Install it with brew install cloudflared, or from Cloudflare's site, then try again.";

type Share = { address: string; token: string; shared: Shared; door?: Server; tunnel?: ChildProcess; steppedIn: Set<string>; passing?: number };

export type Sharing = ReturnType<typeof sharing>;

export function sharing(door: Door) {
  const shares = new Map<string, Share>();
  const of = (address: string): Shared => shares.get(address)?.shared ?? { is: "off" };

  function stop(address: string): Shared {
    const share = shares.get(address);
    shares.delete(address);
    share?.tunnel?.kill();
    share?.door?.close();
    share?.door?.closeAllConnections();
    return { is: "off" };
  }

  // Once, whatever's pressed meanwhile: started again, it's a new link, as the last may have been passed on.
  function start(address: string): Shared {
    const now = shares.get(address);
    if (now?.shared.is === "starting" || now?.shared.is === "on") return now.shared;
    stop(address);
    const share: Share = { address, token: randomBytes(18).toString("base64url"), shared: { is: "starting" }, steppedIn: new Set() };
    shares.set(address, share);
    const failed = (why: string) => {
      if (shares.get(address) !== share) return;
      stop(address);
      shares.set(address, { address, token: share.token, steppedIn: new Set(), shared: { is: "failed", why } });
    };
    share.door = guestDoor(share, door);
    void opened(share.door).then((port) => {
      if (shares.get(address) !== share) return;
      share.tunnel = tunnelTo(
        port,
        (at) => shares.get(address) === share && (share.shared = { is: "on", link: `${at}${HOME}${share.token}/` }),
        failed,
      );
    }, (error) => failed(`This computer wouldn't open a way in for the link: ${error.message}. Try again.`));
    return share.shared;
  }

  // Ended, nothing shared is left running.
  process.once("exit", () => [...shares.keys()].forEach(stop));
  return { of, start, stop };
}

// On this machine alone, at a port of its own: the tunnel is what reaches it from elsewhere.
export function opened(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
  });
}

// The door the tunnel leads to, for one shared change: answers only what's on the allowlist, and nothing for anything
// else, the same nothing whether it's there or not.
export function guestDoor(share: Pick<Share, "address" | "token" | "steppedIn" | "passing">, door: Door): Server {
  const home = `${HOME}${share.token}/`;
  const guest: Guest = {
    speaksAs: (by) => {
      if (by.trim() === door.owner) throw new Refused([`${door.owner} is the name of the person who shared this. Say yours.`]);
    },
    sends: (send) => {
      guest.speaksAs(send.by);
      if (send.done) throw new Refused(["Done is for the person who shared this to say. Send your notes instead."]);
    },
    steppedIn: (name, port) => (share.steppedIn.add(name), (share.passing = port)),
  };
  const server = createServer((request, response) =>
    void answered(response, async () => {
      const path = new URL(request.url ?? "/", "http://shared").pathname;
      if (path === home.slice(0, -1)) return void (response.writeHead(308, { location: home }), response.end());
      if (path.startsWith(home)) return theChange(decodeURIComponent(path.slice(home.length)), request, response);
      if (!toTheApp(request)) return nothing(response);
      passOn(share, request, response);
    }),
  );
  server.on("upgrade", (request, socket, head) => {
    if (!toTheApp(request) || !share.passing) return void socket.destroy();
    const upstream = connect(share.passing, "127.0.0.1", () => {
      const headers = Object.entries(asThisMachine(request, share)).flatMap(([name, value]) => [value ?? []].flat().map((one) => `${name}: ${one}`));
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers.join("\r\n")}\r\n\r\n`);
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return server;

  async function theChange(within: string, request: IncomingMessage, response: ServerResponse) {
    const [first, second, ...rest] = within.split("/").filter(Boolean);
    if (first !== "api") return request.method === "GET" ? serve(door.page, within, response, home) : nothing(response);
    if (second !== "change") return nothing(response);
    // The change alone, as the person's page has every change: asked for again and again, as the tunnel holds a stream
    // back until it ends.
    if (!rest.length && request.method === "GET") return json(response, 200, await door.listed(share.address));
    if (!ASKS[request.method ?? ""]?.includes(rest[0] ?? "")) return nothing(response);
    return door.answerOn(share.address, rest, request, response, guest);
  }

  // The app, to a browser that stepped in here: its own step ins by their names, and once it has, the rest of the app.
  function toTheApp(request: IncomingMessage): boolean {
    const [first, second, third] = new URL(request.url ?? "/", "http://shared").pathname.split("/").filter(Boolean);
    if (first === "step-in") return share.steppedIn.has(second ?? "");
    if (first === ".playthrough") return second === "held" && share.steppedIn.has(third ?? "");
    return cookiesOf(request).get(COOKIE) === share.token;
  }
}

// On to Playthrough's way through to the app (step-in.ts), as if asked on this machine, which is all it answers; a step
// in handed over leaves the browser the cookie that lets it on to the rest of the app.
function passOn(share: Pick<Share, "token" | "passing">, request: IncomingMessage, response: ServerResponse) {
  if (!share.passing) return nothing(response);
  const handing = new URL(request.url ?? "/", "http://shared").pathname.startsWith("/step-in/");
  const forward = ask({ host: "127.0.0.1", port: share.passing, method: request.method, path: request.url, headers: asThisMachine(request, share) }, (answer) => {
    const headers = { ...answer.headers };
    if (handing) headers["set-cookie"] = [...(headers["set-cookie"] ?? []), `${COOKIE}=${share.token}; Path=/; HttpOnly; Secure; SameSite=Lax`];
    response.writeHead(answer.statusCode ?? 502, headers);
    answer.pipe(response);
  });
  forward.on("error", () => (response.headersSent ? response.end() : nothing(response, 502)));
  request.pipe(forward);
}

// The guest's request as this machine's own: by its name, from its address, without the cookie that let it in.
function asThisMachine(request: IncomingMessage, share: Pick<Share, "passing">) {
  const here = `localhost:${share.passing}`;
  const theirs = `https://${request.headers.host}`;
  const headers = { ...request.headers, host: here };
  if (headers.origin === theirs) headers.origin = `http://${here}`;
  if (headers.referer?.startsWith(theirs)) headers.referer = `http://${here}${headers.referer.slice(theirs.length)}`;
  const cookies = [...cookiesOf(request)].filter(([name]) => name !== COOKIE);
  if (cookies.length) headers.cookie = cookies.map(([name, value]) => `${name}=${value}`).join("; ");
  else delete headers.cookie;
  return headers;
}

const cookiesOf = (request: IncomingMessage) =>
  new Map(
    (request.headers.cookie ?? "")
      .split(";")
      .map((one) => one.trim())
      .filter(Boolean)
      .map((one) => [one.slice(0, one.indexOf("=")), one.slice(one.indexOf("=") + 1)] as [string, string]),
  );

function nothing(response: ServerResponse, status = 404) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end(status === 404 ? "There's nothing here." : "The app isn't answering.");
}

// A quick tunnel to the door, by cloudflared, found where the shell finds it: no account, a new address each time. Its
// address, once Cloudflare has a connection to it open; or why there's none, with what to do.
function tunnelTo(port: number, given: (address: string) => void, failed: (why: string) => void): ChildProcess {
  const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { stdio: ["ignore", "ignore", "pipe"] });
  let address: string | undefined;
  let last = "";
  let on = false;
  const late = setTimeout(() => (tunnel.kill(), failed("Cloudflare didn't give a link within 30 seconds. Check this computer is online, then try again.")), GIVEN);
  tunnel.stderr!.setEncoding("utf8").on("data", (said: string) => {
    for (const line of said.split("\n").filter((one) => one.trim())) {
      last = line.replace(/^\S+\s+\w{3}\s+/, "").trim();
      address ??= line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
      if (!on && address && /Registered tunnel connection/.test(line)) {
        on = true;
        clearTimeout(late);
        given(address);
      }
    }
  });
  tunnel.on("error", (error: NodeJS.ErrnoException) => (clearTimeout(late), failed(error.code === "ENOENT" ? NOT_INSTALLED : `cloudflared wouldn't start: ${error.message}. Try again.`)));
  tunnel.on("exit", () => {
    clearTimeout(late);
    failed(on ? "Sharing stopped: cloudflared ended, so the link no longer works. Try again for a new one." : `cloudflared ended before giving a link${last ? `: “${last}”` : ""}. Try again.`);
  });
  return tunnel;
}
