// A scene's picture is one of its readings' pictures: the page once a step had settled. It's framed as a part of the page,
// so the same picture drawn at any size shows the same part of it, and one can grow into the other.

import { useState } from "react";
import { clamp } from "./clamp.ts";

// A part of the page, as shares of it.
export type Crop = { x: number; y: number; width: number; height: number };
// Without a crop, the whole page, as large as fits.
export type Shot = { src: string; crop?: Crop };
// A part of the page, in its pixels.
export type Box = { x: number; y: number; width: number; height: number };

// The part of the page several things take up together.
export const union = (boxes: Box[]): Box => {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return { x: left, y: top, width: Math.max(...boxes.map((box) => box.x + box.width)) - left, height: Math.max(...boxes.map((box) => box.y + box.height)) - top };
};

// A part of the page with room around a box on it, this wide for its height, at most so many times as close as the
// page's full height.
export function around(box: Box, page: { width: number; height: number }, shape: number, closest = 2): Crop {
  const { width: across, height: down } = page;
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height];
  const height = Math.min(down, across / shape, Math.max((right - left + across * 0.08) / shape, bottom - top + down * 0.25, down / closest));
  const width = height * shape;
  const x = clamp((left + right) / 2 - width / 2, 0, across - width);
  const y = clamp((top + bottom) / 2 - height / 2, 0, down - height);
  return { x: x / across, y: y / down, width: width / across, height: height / down };
}

// A picture that isn't there leaves its place empty.
export function Picture({ shot }: { shot: Shot }) {
  const { src, crop } = shot;
  const [missing, setMissing] = useState<string>();
  if (missing === src) return null;
  const lost = () => setMissing(src);
  if (!crop) return <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" onError={lost} />;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={lost}
      className="pointer-events-none absolute max-w-none"
      style={{ width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${(-crop.x / crop.width) * 100}%`, top: `${(-crop.y / crop.height) * 100}%` }}
    />
  );
}
