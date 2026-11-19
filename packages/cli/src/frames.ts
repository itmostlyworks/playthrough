// A note's frame as a picture: its recording at the moment the note was made on it, drawn by the viewer itself, and
// where on it the note's thing is. The page shows each note on a moment's edge as this picture closed in on its thing,
// so fifteen notes are fifteen pictures, never fifteen recordings played at once. Each is drawn once and kept with
// what the person did, as theirs (`branches/frames/<note>`), as the frame it was made on never changes.

import { chromium, type Browser } from "@playwright/test";
import type { Repo } from "./repo.ts";

// Where a note was made: which recording, the moment in it, and what it's on there, by the recording's own numbering or
// its spot on the screen.
export type Framed = { handBack: number; recording: string; at: number; node?: number; point?: { x: number; y: number } };
// The picture's name among the person's own files, the screen's size, and where its thing is on it, as shares of the
// screen.
export type Frame = { picture: string; screen: { width: number; height: number }; box?: { x: number; y: number; width: number; height: number } };

// One browser draws them all, one at a time, and goes once nothing's been asked for a while.
let browser: Promise<Browser> | undefined;
let drawing: Promise<unknown> = Promise.resolve();
let resting: NodeJS.Timeout | undefined;
const IDLE = 30_000;

// The page asks by the change's address on this machine, which the browser drawing it opens it by.
export async function frameOf(repo: Repo, id: string, address: string, note: string, framed: Framed, port: number): Promise<Frame> {
  const name = `frames/${note}`;
  const kept = await repo.changes.branch(id, `${name}.json`);
  if (kept) return JSON.parse(Buffer.from(kept).toString("utf8"));
  const shape = await shapeAt(repo, id, framed);
  const drawn = drawing.then(() => draw(port, address, framed, shape, 1));
  drawing = drawn.catch(() => {});
  const { png, box } = await drawn;
  const frame: Frame = { picture: `branches/${name}.png`, screen: shape, ...(box && { box }) };
  await repo.changes.saveBranch(id, `${name}.png`, png);
  await repo.changes.saveBranch(id, `${name}.json`, Buffer.from(JSON.stringify(frame)));
  return frame;
}

// The screen the recording had at that moment, as its last word on its size before then says.
export async function shapeAt(repo: Repo, id: string, { handBack, recording, at }: Framed) {
  const branch = recording.match(/^branches\/(.+)$/);
  const bytes = branch ? await repo.changes.branch(id, branch[1]!) : await repo.changes.file(id, handBack, recording);
  if (!bytes) throw new Error(`Hand-back ${handBack} of ${id} has no recording called “${recording}”.`);
  const events: { type: number; timestamp: number; data: { width?: number; height?: number } }[] = JSON.parse(Buffer.from(bytes).toString("utf8"));
  const start = events[0]?.timestamp ?? 0;
  const sized = events.filter((event) => event.type === 4 && event.data.width && (event.timestamp - start) / 1000 <= at + 0.05).at(-1) ?? events.find((event) => event.type === 4);
  return { width: sized?.data.width ?? 1280, height: sized?.data.height ?? 800 };
}

// A moment's still, its recording at its end drawn twice as fine as the picture kept as it was recorded, which a list
// closing in on what it's about shows larger than it was taken on a screen of twice the dots: drawn once and kept.
export async function stillOf(repo: Repo, id: string, address: string, framed: Framed, port: number): Promise<string> {
  const name = `stills/${framed.handBack}-${framed.recording.replace(/^branches\//, "").replace(/\.json$/, "")}.png`;
  if (await repo.changes.branch(id, name)) return `branches/${name}`;
  const shape = await shapeAt(repo, id, framed);
  const drawn = drawing.then(() => draw(port, address, framed, shape, 2));
  drawing = drawn.catch(() => {});
  await repo.changes.saveBranch(id, name, (await drawn).png);
  return `branches/${name}`;
}

async function draw(port: number, address: string, framed: Framed, shape: { width: number; height: number }, scale: number) {
  clearTimeout(resting);
  browser ??= chromium.launch();
  const page = await (await browser).newPage({ viewport: shape, deviceScaleFactor: scale });
  try {
    await page.goto(`http://localhost:${port}/?frame=${encodeURIComponent(JSON.stringify({ change: address, ...framed }))}`);
    await page.waitForFunction(() => "framed" in window, undefined, { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    // What the page's own images take to come in, once it's drawn.
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => (window as unknown as { framed?: Frame["box"] }).framed);
    return { png: await page.screenshot(), box };
  } finally {
    await page.close();
    resting = setTimeout(() => {
      const going = browser;
      browser = undefined;
      void going?.then((one) => one.close());
    }, IDLE);
  }
}
