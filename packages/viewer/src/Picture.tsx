// A flow's picture is one of its readings' pictures: the page once a step had settled. It's framed as a part of the page,
// so the same picture drawn at any size shows the same part of it, and one can grow into the other.

import { useEffect, useState } from "react";
import type { Flow, Review, Round } from "@playthrough/review";
import { picture, recording } from "./api.ts";
import { clamp } from "./moments.ts";
import { recorded, shapeOf } from "./replay.ts";

// A part of the page, as shares of it.
export type Frame = { x: number; y: number; width: number; height: number };
// Without a frame, the whole page, as large as fits.
export type Shot = { src: string; frame?: Frame };
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
export function around(box: Box, page: { width: number; height: number }, shape: number, closest = 2): Frame {
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
  const { src, frame } = shot;
  const [missing, setMissing] = useState<string>();
  if (missing === src) return null;
  const lost = () => setMissing(src);
  if (!frame) return <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" onError={lost} />;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={lost}
      className="pointer-events-none absolute max-w-none"
      style={{ width: `${100 / frame.width}%`, height: `${100 / frame.height}%`, left: `${(-frame.x / frame.width) * 100}%`, top: `${(-frame.y / frame.height) * 100}%` }}
    />
  );
}

// A flow's own picture: its page just before its last step, two and a half times closer on what that step clicks, so
// flows on one page look different. A page that isn't the picture's shape shows whole.
export function useStill(review: Review, round: Round, flow: Flow): Shot {
  const src = picture(review.id, round.number, flow.recording, Math.max(0, flow.steps.length - 2));
  const [close, setClose] = useState<{ src: string; frame: Frame }>();
  useEffect(() => {
    let current = true;
    const last = flow.steps.at(-1);
    if (flow.steps.length > 1 && last)
      recording(review.id, round.number, flow.recording).then((events) => {
        const { shapes, clicks, pointer } = recorded(events);
        const click = clicks.find((click) => click >= last.at);
        const { width, height } = shapeOf(shapes, click ?? last.at);
        const point = click === undefined ? undefined : pointer.findLast(([moment]) => moment <= click + 0.01)?.slice(1);
        if (current && point && Math.abs(width / height - 1.6) < 0.05)
          setClose({ src, frame: { x: clamp(point[0]! / width - 0.2, 0, 0.6), y: clamp(point[1]! / height - 0.2, 0, 0.6), width: 0.4, height: 0.4 } });
      });
    return () => void (current = false);
  }, [review.id, round.number, flow, src]);
  return close?.src === src ? close : { src };
}
