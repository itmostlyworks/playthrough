// The fonts, images and stylesheets a page loads, kept with its recording, each once by what's in it, so a recording plays
// the same with the app gone, or on another machine: the viewer shows them from there, never from the app.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { join } from "node:path";
import type { Page } from "@playwright/test";

// Each address the page loaded something from, and the file it's kept in, beside the hand-back's recordings.
export type Assets = Record<string, string>;
export const assetsOf = (recording: string) => `assets/${recording}`;

const KINDS = new Set(["font", "image", "stylesheet"]);
// Served by what it is, so a font or an image is read as one.
const ENDINGS: Record<string, string> = {
  "font/woff2": ".woff2",
  "font/woff": ".woff",
  "font/ttf": ".ttf",
  "font/otf": ".otf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "text/css": ".css",
};

// From now until it's asked for what it kept.
export function keepAssets(page: Page, folder: string): () => Promise<Assets> {
  const kept: Assets = {};
  const keeping: Promise<void>[] = [];
  mkdirSync(join(folder, "assets"), { recursive: true });
  page.on("response", (response) => {
    const address = response.url();
    if (!KINDS.has(response.request().resourceType()) || response.status() !== 200 || address in kept) return;
    kept[address] = "";
    keeping.push(
      response
        .body()
        .then((bytes) => {
          const type = response.headers()["content-type"]?.split(";")[0]?.trim() ?? "";
          // Named for what it is, by what it was served as, else by its address's ending (a font served as bytes); one
          // that's neither isn't kept, as Playthrough keeps only what it can say the kind of (`KEPT`).
          const ending = ENDINGS[type] ?? Object.values(ENDINGS).find((one) => new URL(address).pathname.toLowerCase().endsWith(one));
          if (!ending) return void delete kept[address];
          const file = `assets/${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${ending}`;
          writeFileSync(join(folder, file), bytes);
          kept[address] = file;
        })
        // Gone before it could be read, as when the page moves on: the recording names it, and the viewer can't show it.
        .catch(() => void delete kept[address]),
    );
  });
  return async () => {
    await Promise.all(keeping);
    return Object.fromEntries(Object.entries(kept).filter(([, file]) => file));
  };
}

// What a recording made outside Playthrough's own browser names (yours, taking over the app, or a guest's through a
// shared link) kept as a recording's are: each font, image and stylesheet it names that isn't kept already, asked of the
// app, at its own address, by the path it was named at. Never fetched from the address as it's named: what's recorded
// is whatever the page had in it, a guest's choosing or words the page shows, and Playthrough asks nothing of an address
// someone else chose, on this machine or anywhere. Nor where the app sends it on. One the app doesn't have (a font from
// elsewhere) isn't kept: the recording names it, and the viewer's browser asks for it there. Asked as taking over asks
// the app (`onTheWay`, use.ts), with what the run's browser added, as an app that needs it answers nothing without.
const NAMED = /\.(woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico|css)$/i;
export async function keepNamed(recorded: string, kept: Assets, app: string, save: (file: string, bytes: Uint8Array) => Promise<void>, onTheWay: (headers: IncomingHttpHeaders) => IncomingHttpHeaders = (same) => same): Promise<Assets> {
  const headers = Object.fromEntries(Object.entries(onTheWay({})).flatMap(([name, value]) => (typeof value === "string" ? [[name, value]] : [])));
  const addresses = [...new Set(recorded.match(/https?:\/\/[^\s"'()\\]+/g) ?? [])].filter((address) => !(address in kept) && URL.canParse(address) && NAMED.test(new URL(address).pathname));
  const found = await Promise.all(
    addresses.map(async (address): Promise<[string, string] | undefined> => {
      const at = new URL(app);
      const named = new URL(address);
      // Set, not joined: a path beginning “//” would be another address altogether.
      Object.assign(at, { pathname: named.pathname, search: named.search, hash: "" });
      const answer = await fetch(at, { headers, redirect: "manual", signal: AbortSignal.timeout(5000) }).catch(() => undefined);
      const type = answer?.ok ? (answer.headers.get("content-type")?.split(";")[0]?.trim() ?? "") : "";
      if (!answer || !(type in ENDINGS)) return undefined;
      const bytes = new Uint8Array(await answer.arrayBuffer());
      const file = `assets/${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${ENDINGS[type]}`;
      await save(file, bytes);
      return [address, file];
    }),
  );
  return { ...kept, ...Object.fromEntries(found.filter((one) => one !== undefined)) };
}
