// Where what changed is on a step's page, a part of the page at a time: the things close together, top to bottom, each
// part outlined as one on the recording rather than each thing in it (the phone card's top bar, not its five pieces).

import type { Reading } from "@playthrough/page";
import { union, type Box } from "./Picture.tsx";

// Things this far apart, in pixels, are in parts apart.
const APART = 96;

// What's off the screen the step was read on isn't in them: its recording can't show it.
export function regionsOf(boxes: Box[], screen: Reading["screen"]): Box[] {
  const parts: Box[][] = [];
  const seen = boxes.filter((box) => box.x < screen.width && box.y < screen.height && box.x + box.width > 0 && box.y + box.height > 0).sort((a, b) => a.y - b.y);
  for (const box of seen) {
    const last = parts.at(-1);
    const bottom = last && union(last).y + union(last).height;
    if (last && box.y <= bottom! + APART) last.push(box);
    else parts.push([box]);
  }
  return parts.map(union);
}
