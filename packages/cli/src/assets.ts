// The fonts, images and stylesheets a page loads, kept with its recording, each once by what's in it, so a recording plays
// the same with the app gone, or on another machine: the viewer shows them from there, never from the app.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

// Each address the page loaded something from, and the file it's kept in, beside the round's recordings.
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
          const file = `assets/${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${ENDINGS[type] ?? ""}`;
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
