// What only the pictures show. The reading names what changed, but some things it can't see: a bar with no words, an icon,
// something brought in front of another, something moved a pixel or two. So the pictures of the same moment are compared
// too, and where they differ with nothing the reading found there, that's a change of its own, named by what it's on. They
// are taken from the page itself, so where nothing changed they're the same dot for dot, and a flow whose pictures are the
// same at every step looks the same.

import type { Page } from "@playwright/test";
import { idOf, onScreen, type Found } from "./changes.ts";
import { bare, differences, HOLDS, holderOf, identity } from "./differences.ts";
import { called, sentence, the, wayOf } from "./names.ts";
import type { Reading, Thing } from "./read.ts";

// Where two pictures differ: a patch of the screen, in pixels; whether it's the same picture nudged up to 2px, which only
// follows from what else changed; or moved further, up to 24px, along or across.
type Patch = { x: number; y: number; width: number; height: number; nudged: boolean; moved?: { x: number; y: number } };
type Area = { x: number; y: number; width: number; height: number };

export async function picturesAt(page: Page, then: Reading, now: Reading, pictures: { then: Buffer; now: Buffer }): Promise<Found[]> {
  // A page scrolled to another place differs in every dot, though nothing on it moved: there, the reading speaks alone.
  if (scrollOf(then) !== scrollOf(now)) return [];
  const { differences: found } = differences(then, now);
  const explained = found.flatMap((difference) => ["then" in difference ? difference.then.box : [], "now" in difference ? difference.now.box : []].flat());
  const patches = await page.evaluate(differ, { then: pictures.then.toString("base64"), now: pictures.now.toString("base64"), explained });

  // What changed inside something at this moment: a patch moved inside it is that change's doing (the columns beside a wider one).
  const changedInside = new Set(found.flatMap((difference) => (difference.what === "gone" ? [] : holdersOf(now, difference.now))));
  const told = new Map<string, { words: string; patch: Area }>();
  for (const patch of patches) {
    if (patch.nudged && found.length) continue;
    if (patch.moved && [...changedInside].some((holder) => contains(holder.box, patch, 8))) continue;
    const on = whatsThere(now, patch);
    const by = patch.moved && Math.max(Math.abs(patch.moved.x), Math.abs(patch.moved.y));
    const words = patch.moved ? `${on.called} moved ${wayOf(patch.moved.x, patch.moved.y)}, ${by}px` : `${on.called} looks different`;
    const id = idOf(on.identity ?? `place:${Math.round(patch.x / 32)},${Math.round(patch.y / 32)}`, patch.moved ? "moved" : "looks different");
    // Patches on the same thing are one change to it, over all of them.
    const same = told.get(id);
    told.set(id, { words, patch: same ? around(same.patch, patch) : patch });
  }
  return [...told].map(([id, { words, patch }]) => {
    const box = onScreen(patch, now.screen);
    return { id, words: sentence(words), ...(box && { box }) };
  });
}

// What a patch is on: the smallest named thing or words round all of it; under a heading of a table the page marks as
// one, that column; else what's nearest it, as a person points at a spot (“Something near “-60.00””); else just where it
// is. Something named only by data is known by where it is.
function whatsThere(reading: Reading, patch: Area): { called: string; identity?: string } {
  const area = (box: Area) => box.width * box.height;
  const named = reading.things.filter((thing) => (thing.role === "text" ? thing.words.length > 1 : thing.role !== "box" && !!thing.name));
  // Words and controls are drawn smaller than their boxes, which run the width of what holds them; what holds things is
  // only named by a patch that's a fair part of it.
  const fair = (thing: Thing, most: number) => !HOLDS.test(thing.role) || area(thing.box) < most;
  const round = named.filter((thing) => contains(thing.box, patch, 2) && fair(thing, 6 * area(patch))).sort((p, q) => area(p.box) - area(q.box))[0];
  const middle = patch.x + patch.width / 2;
  const table = reading.things.find((thing) => /^(table|grid|treegrid)$/.test(thing.role) && contains(thing.box, patch, 2));
  const cell = table && reading.things.find((thing) => thing.column && holderOf(reading, thing) === table && middle >= thing.box.x && middle < thing.box.x + thing.box.width);
  if (cell && (!round || round === table)) return { called: `${cell.column} column`, identity: `column:${bare(cell.column!)} in ${identity(reading, table!)}` };
  if (round) return { called: called(round), identity: bare(round.name) ? identity(reading, round) : undefined };

  const gap = (thing: Thing) =>
    Math.hypot(
      Math.max(thing.box.x - patch.x - patch.width, 0, patch.x - thing.box.x - thing.box.width),
      Math.max(thing.box.y - patch.y - patch.height, 0, patch.y - thing.box.y - thing.box.height),
    );
  const near = named.filter((thing) => gap(thing) <= 80 && fair(thing, 4 * area(patch) + 4000)).sort((p, q) => gap(p) - gap(q) || area(p.box) - area(q.box))[0];
  if (near) return { called: `something near ${the(near)}`, identity: bare(near.name) ? `near ${identity(reading, near)}` : undefined };
  return { called: "this part of the page" };
}

// Everything holding a thing, itself first when it holds things too.
function holdersOf(reading: Reading, thing: Thing): Thing[] {
  const holders: Thing[] = [];
  for (let holder: Thing | undefined = thing; holder; holder = holderOf(reading, holder)) if (HOLDS.test(holder.role)) holders.push(holder);
  return holders;
}

const around = (a: Area, b: Area): Area => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};
const contains = (outer: Area, inner: Area, by = 0) =>
  outer.x <= inner.x + by && outer.y <= inner.y + by && outer.x + outer.width >= inner.x + inner.width - by && outer.y + outer.height >= inner.y + inner.height - by;
const scrollOf = ({ things: [first] }: Reading) => (first ? `${first.page.x - first.box.x},${first.page.y - first.box.y}` : "");

// Runs in the page, where the browser reads the pictures, so everything it uses is inside it. Gives each patch where the
// pictures differ that nothing in `explained` is at.
async function differ({ then, now, explained }: { then: string; now: string; explained: Area[] }): Promise<Patch[]> {
  // A dot differs when a colour moves further than this, 0 to 255: a pale badge's corners on a pale page differ by 18. The
  // pictures are taken from the page itself, so where nothing changed they're the same dot for dot.
  const DIFFERENT = 8;
  const MISFIT = 36; // tried moved, a softened dot still differs by more than smoothing an edge does
  const SQUARE = 16; // differences are counted in squares this size,
  const DOTS = 4; // and a square differs with at least this many different dots in it
  const GAP = 3; // squares within this many of each other are one patch
  const AROUND = 8; // pixels round what the reading found that are its doing too
  const NUDGE = 2; // the same picture moved this far, in quarter pixels, is nudged
  const FARTHEST = 24; // and this far, along or across, moved

  const load = async (picture: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${picture}`)).blob());
  const [before, after] = [await load(then), await load(now)];
  const { width, height } = after;
  if (before.width !== width || before.height !== height) return [{ x: 0, y: 0, width, height, nudged: false }];
  const dots = (picture: ImageBitmap) => {
    const canvas = new OffscreenCanvas(width, height).getContext("2d")!;
    canvas.drawImage(picture, 0, 0);
    return canvas.getImageData(0, 0, width, height).data;
  };
  const [a, b] = [dots(before), dots(after)];

  // Each square's different dots: how many, and how far they reach.
  const squares = new Map<string, { count: number; x: number; y: number; right: number; bottom: number }>();
  for (let i = 0; i < width * height; i++) {
    const k = i * 4;
    if (Math.max(Math.abs(a[k]! - b[k]!), Math.abs(a[k + 1]! - b[k + 1]!), Math.abs(a[k + 2]! - b[k + 2]!)) <= DIFFERENT) continue;
    const x = i % width, y = Math.floor(i / width);
    const key = `${Math.floor(x / SQUARE)},${Math.floor(y / SQUARE)}`;
    const square = squares.get(key) ?? squares.set(key, { count: 0, x, y, right: x + 1, bottom: y + 1 }).get(key)!;
    square.count++;
    square.x = Math.min(square.x, x);
    square.y = Math.min(square.y, y);
    square.right = Math.max(square.right, x + 1);
    square.bottom = Math.max(square.bottom, y + 1);
  }
  const hot = [...squares].filter(([, square]) => square.count >= DOTS).map(([key]) => key.split(",").map(Number) as [number, number]);

  // Squares near each other are one patch.
  const seen = new Set<string>();
  const patches: (Area & { squares: number })[] = [];
  for (const start of hot) {
    if (seen.has(String(start))) continue;
    seen.add(String(start));
    const queue = [start];
    const part: [number, number][] = [];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      part.push([x, y]);
      for (const next of hot) {
        if (seen.has(String(next)) || Math.abs(next[0] - x) > GAP || Math.abs(next[1] - y) > GAP) continue;
        seen.add(String(next));
        queue.push(next);
      }
    }
    // As far as its different dots reach.
    const reach = part.map(([x, y]) => squares.get(`${x},${y}`)!);
    const x = Math.min(...reach.map((square) => square.x)), y = Math.min(...reach.map((square) => square.y));
    const right = Math.max(...reach.map((square) => square.right));
    const bottom = Math.max(...reach.map((square) => square.bottom));
    patches.push({ x, y, width: right - x, height: bottom - y, squares: part.length });
  }
  const meets = (patch: Area, box: Area) =>
    box.x - AROUND < patch.x + patch.width && patch.x < box.x + box.width + AROUND && box.y - AROUND < patch.y + patch.height && patch.y < box.y + box.height + AROUND;
  const left = patches.filter((patch) => !explained.some((box) => meets(patch, box)));
  if (!left.length) return [];

  // Whether a patch is the earlier picture moved: both softened over 3×3 dots, so a part-pixel move doesn't count, then the
  // earlier one read over by dx, dy, between its dots where the step falls between them. Only dots that aren't as they were
  // are tried (what's over the patch and stayed put, a dialog's edge, doesn't stop it), and a tenth of its squares may still
  // misfit, where what slid under that edge shows a sliver more or less of itself. Other words, a colour or bold misfit
  // nearly all of them.
  const soften = (d: Uint8ClampedArray) => {
    const out = new Float32Array(width * height * 3);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let channel = 0; channel < 3; channel++) {
          let sum = 0;
          for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) sum += d[(Math.min(height - 1, Math.max(0, y + j)) * width + Math.min(width - 1, Math.max(0, x + i))) * 4 + channel]!;
          out[(y * width + x) * 3 + channel] = sum / 9;
        }
    return out;
  };
  const [softA, softB] = [soften(a), soften(b)];
  const earlier = (x: number, y: number, channel: number) => {
    const clampX = (v: number) => Math.min(width - 1, Math.max(0, v));
    const clampY = (v: number) => Math.min(height - 1, Math.max(0, v));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (i: number, j: number) => softA[(clampY(j) * width + clampX(i)) * 3 + channel]!;
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  const off = (x: number, y: number, dx: number, dy: number) => {
    const p = (y * width + x) * 3;
    return [0, 1, 2].some((channel) => Math.abs(softB[p + channel]! - earlier(x + dx, y + dy, channel)) > MISFIT);
  };
  const fits = (patch: Area & { squares: number }, dx: number, dy: number) => {
    const misfits = new Map<string, number>();
    const bad = new Set<string>();
    for (let y = patch.y; y < Math.min(height, patch.y + patch.height); y++)
      for (let x = patch.x; x < Math.min(width, patch.x + patch.width); x++) {
        if (!off(x, y, dx, dy) || !off(x, y, 0, 0)) continue;
        const square = `${Math.floor(x / SQUARE)},${Math.floor(y / SQUARE)}`;
        const count = (misfits.get(square) ?? 0) + 1;
        misfits.set(square, count);
        if (count >= DOTS && !bad.has(square) && bad.add(square).size > Math.floor(patch.squares / 10)) return false;
      }
    return true;
  };
  const shifts = (most: number) => {
    const steps: [number, number][] = [];
    for (let dy = -most; dy <= most; dy += 0.25) for (let dx = -most; dx <= most; dx += 0.25) steps.push([dx, dy]);
    return steps;
  };

  return left.map(({ squares, ...patch }) => {
    const nudged = shifts(NUDGE).some(([dx, dy]) => fits({ ...patch, squares }, dx, dy));
    if (nudged) return { ...patch, nudged };
    for (let by = NUDGE + 0.25; by <= FARTHEST; by += 0.25)
      for (const [dx, dy] of [[by, 0], [-by, 0], [0, by], [0, -by]] as const)
        if (fits({ ...patch, squares }, dx, dy)) return { ...patch, nudged, moved: { x: Math.round(-dx) || 0, y: Math.round(-dy) || 0 } };
    return { ...patch, nudged };
  });
}
