// Whether a moment changes anything you can see: its first frame against those after, in pictures the page took of itself,
// with what moves by itself left out. What moves by itself is what differs with nothing done: between the first frame and
// the one a beat later, in either run, and between the two runs, at either end. A change that's only a colour counts; a
// clock ticking doesn't.

import { chromium, type Page } from "@playwright/test";

// One run's frames: the first, the same a beat later with nothing done, after each thing done, the last, and the last once
// it has held.
export type Frames = { first: Buffer; later: Buffer; after: Buffer[]; last: Buffer; held?: Buffer };
// A square of the screen, SQUARE pixels a side, by its column and row.
export type Square = { x: number; y: number };
export const SQUARE = 16;

// What changed from the first frame, after anything done or at the end, in both runs, but for what moves by itself; what
// was seen moving with nothing done (with the squares of words that tell the time, which a beat may not see change); and what was still changing, in both runs, once the end had held.
export async function seenChanging([one, two]: [Frames, Frames], timed: Square[] = []): Promise<{ changed: Square[]; moving: Square[]; unsettled: Square[] }> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const differing = (a: Buffer, b: Buffer) => squaresDiffering(page, a, b);
    // Seen moving with nothing done, in a run; and different between the runs, at either end, which may be no more than
    // timing, so it's left out but not said.
    const restless = new Set((await Promise.all([differing(one.first, one.later), differing(two.first, two.later)])).flat());
    const moving = new Set([...timed.map(({ x, y }) => `${x},${y}`), ...restless, ...(await Promise.all([differing(one.first, two.first), differing(one.last, two.last)])).flat()]);
    const fromFirst = async ({ first, after, last }: Frames) => new Set((await Promise.all([...after, last].map((frame) => differing(first, frame)))).flat());
    const both = (a: Set<string> | string[], b: Set<string> | string[]) => [...a].filter((square) => new Set(b).has(square) && !moving.has(square));
    const changed = both(await fromFirst(one), await fromFirst(two));
    const unsettled = one.held && two.held ? both(await differing(one.last, one.held), await differing(two.last, two.held)) : [];
    const asSquare = (key: string) => ({ x: Number(key.split(",")[0]), y: Number(key.split(",")[1]) });
    return { changed: changed.map(asSquare), moving: [...restless].map(asSquare), unsettled: unsettled.map(asSquare) };
  } finally {
    await browser.close();
  }
}

// The squares where two pictures differ: a few dots in them by more than a pale edge's softening.
async function squaresDiffering(page: Page, then: Buffer, now: Buffer): Promise<string[]> {
  return page.evaluate(
    async ({ then, now, side }) => {
      const DIFFERENT = 8;
      const DOTS = 4;
      const load = async (picture: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${picture}`)).blob());
      const [before, after] = [await load(then), await load(now)];
      const { width, height } = after;
      if (before.width !== width || before.height !== height) return ["0,0"];
      const dots = (picture: ImageBitmap) => {
        const canvas = new OffscreenCanvas(width, height).getContext("2d")!;
        canvas.drawImage(picture, 0, 0);
        return canvas.getImageData(0, 0, width, height).data;
      };
      const [a, b] = [dots(before), dots(after)];
      const counted = new Map<string, number>();
      for (let i = 0; i < width * height; i++) {
        const k = i * 4;
        if (Math.max(Math.abs(a[k]! - b[k]!), Math.abs(a[k + 1]! - b[k + 1]!), Math.abs(a[k + 2]! - b[k + 2]!)) <= DIFFERENT) continue;
        const key = `${Math.floor((i % width) / side)},${Math.floor(Math.floor(i / width) / side)}`;
        counted.set(key, (counted.get(key) ?? 0) + 1);
      }
      return [...counted].filter(([, count]) => count >= DOTS).map(([key]) => key);
    },
    { then: then.toString("base64"), now: now.toString("base64"), side: SQUARE },
  );
}

// The squares a box covers.
export const squaresOf = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }): Square[] => {
  const squares: Square[] = [];
  for (let column = Math.floor(x / SQUARE); column * SQUARE < x + width; column++) for (let row = Math.floor(y / SQUARE); row * SQUARE < y + height; row++) squares.push({ x: column, y: row });
  return squares;
};
