// What changed at a moment in a step, as it was and as it is: the part of the page it's on, close, in the picture the
// step ended on before and the one it ends on now, one over the other. The recording shows where it is when you go
// there; this shows what it is at a glance, with no words for what eyes can see.

import type { Reading } from "@playthrough/page";
import { clamp } from "./moments.ts";
import { Picture, union, type Box, type Frame } from "./Picture.tsx";

// A part of the page what changed is on, and how wide it is for its height.
export type Part = { frame: Frame; shape: number };

// Things this far apart, in pixels, are pictured apart; and pictured, the most parts one moment shows.
const APART = 96;
const PARTS = 2;
// Room around what changed, in pixels; the least and the most of the page a part shows across, so a small thing is
// seen in its place and no closer than the page itself, and words in a wide one can still be read; and the widest and
// narrowest a part's picture is, for its height.
const ROOM = { x: 24, y: 16 };
const ACROSS = [320, 480] as const;
const SHAPES = [2.4, 5] as const;

// Where what changed is on a step's page, in regions top to bottom, each the things close together: what's off the screen
// it was read on isn't in them. Each is met on its own, outlined on the recording and pictured as it was and as it is.
export function regionsOf<Thing extends Box>(boxes: Thing[], screen: Reading["screen"]): Thing[][] {
  const groups: Thing[][] = [];
  const seen = boxes.filter((box) => box.x < screen.width && box.y < screen.height && box.x + box.width > 0 && box.y + box.height > 0).sort((a, b) => a.y - b.y);
  for (const box of seen) {
    const last = groups.at(-1);
    const bottom = last && union(last).y + union(last).height;
    if (last && box.y <= bottom! + APART) last.push(box);
    else groups.push([box]);
  }
  return groups.slice(0, PARTS);
}

// A region, framed for its picture.
export function partOf(around: Box, screen: Reading["screen"]): Part {
  const [wide, high] = [around.width + 2 * ROOM.x, around.height + 2 * ROOM.y];
  const shape = clamp(wide / high, ...SHAPES);
  const width = Math.min(screen.width, ACROSS[1], Math.max(wide, high * shape, ACROSS[0]), screen.height * shape);
  const height = width / shape;
  const x = clamp(around.x + around.width / 2 - width / 2, 0, screen.width - width);
  const y = clamp(around.y + around.height / 2 - height / 2, 0, screen.height - height);
  return { frame: { x: x / screen.width, y: y / screen.height, width: width / screen.width, height: height / screen.height }, shape };
}

// One part, before over now, together on a ground of their own; with nothing before it, now alone.
export function Difference({ part, now, before }: { part: Part; now: string; before?: string }) {
  return (
    <span className="grid gap-1 rounded-lg bg-hover p-1.5 pt-1">
      {before && (
        <>
          <span className="px-0.5 text-[11px] leading-4 text-faint">Before</span>
          <Crop src={before} part={part} />
        </>
      )}
      <span className={`px-0.5 text-[11px] leading-4 text-faint ${before ? "pt-0.5" : ""}`}>Now</span>
      <Crop src={now} part={part} />
    </span>
  );
}

function Crop({ src, part }: { src: string; part: Part }) {
  return (
    <span className="relative block overflow-hidden rounded-md bg-paper shadow-frame" style={{ aspectRatio: part.shape }}>
      <Picture shot={{ src, frame: part.frame }} />
    </span>
  );
}
