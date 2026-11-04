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
// Room around what changed, in pixels; the least of the page a part shows across, so a small thing is seen in its
// place and no closer than the page itself; and the widest and narrowest a part's picture is, for its height.
const ROOM = { x: 24, y: 16 };
const ACROSS = 320;
const SHAPES = [2.4, 5] as const;

// The parts of a step's page what changed is on, top to bottom: what's off the screen it was read on isn't in them.
export function partsOf(boxes: Box[], screen: Reading["screen"]): Part[] {
  const groups: Box[][] = [];
  const seen = boxes.filter((box) => box.x < screen.width && box.y < screen.height && box.x + box.width > 0 && box.y + box.height > 0).sort((a, b) => a.y - b.y);
  for (const box of seen) {
    const last = groups.at(-1);
    const bottom = last && union(last).y + union(last).height;
    if (last && box.y <= bottom! + APART) last.push(box);
    else groups.push([box]);
  }
  return groups.slice(0, PARTS).map((group) => {
    const around = union(group);
    const [wide, high] = [around.width + 2 * ROOM.x, around.height + 2 * ROOM.y];
    const shape = clamp(wide / high, ...SHAPES);
    const width = Math.min(screen.width, Math.max(wide, high * shape, ACROSS), screen.height * shape);
    const height = width / shape;
    const x = clamp(around.x + around.width / 2 - width / 2, 0, screen.width - width);
    const y = clamp(around.y + around.height / 2 - height / 2, 0, screen.height - height);
    return { frame: { x: x / screen.width, y: y / screen.height, width: width / screen.width, height: height / screen.height }, shape };
  });
}

// One part, before and now; with nothing before it, now alone. Pointed at, before is shown where the recording is too,
// as holding C shows it, where the recording's at its moment.
export function Difference({ part, now, before, onBefore }: { part: Part; now: string; before?: string; onBefore?: (shown: boolean) => void }) {
  return (
    <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
      {before && (
        <>
          <span className="text-[11px] leading-4 text-faint">Before</span>
          <span onPointerEnter={() => onBefore?.(true)} onPointerLeave={() => onBefore?.(false)}>
            <Crop src={before} part={part} />
          </span>
        </>
      )}
      <span className="text-[11px] leading-4 text-faint">Now</span>
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
