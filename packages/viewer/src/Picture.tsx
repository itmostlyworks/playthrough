// A flow's picture is one of its readings' pictures: the page once a step had settled. It's framed as a part of the page,
// so the same picture drawn at any size shows the same part of it, and one can grow into the other.

import { useEffect, useState } from "react";
import type { Reading } from "@vantage/page";
import type { Flow, Review, Round } from "@vantage/review";
import { picture, readings, recording } from "./api.ts";
import type { Diamond } from "./changes.ts";
import { clamp } from "./moments.ts";
import { recorded } from "./replay.ts";

// A part of the page, as shares of it.
export type Frame = { x: number; y: number; width: number; height: number };
// Without a frame, the whole page, as large as fits.
export type Shot = { src: string; frame?: Frame };

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
        const { width, height, clicks, pointer } = recorded(events);
        const click = clicks.find((click) => click >= last.at);
        const point = click === undefined ? undefined : pointer.findLast(([moment]) => moment <= click + 0.01)?.slice(1);
        if (current && point && Math.abs(width / height - 1.6) < 0.05)
          setClose({ src, frame: { x: clamp(point[0]! / width - 0.2, 0, 0.6), y: clamp(point[1]! / height - 0.2, 0, 0.6), width: 0.4, height: 0.4 } });
      });
    return () => void (current = false);
  }, [review.id, round.number, flow, src]);
  return close?.src === src ? close : { src };
}

// Its story: the page at each of its steps, in turn.
export function useStory(review: Review, round: Round, flow: Flow): Shot[] {
  const [story, setStory] = useState<Shot[]>([]);
  useEffect(() => {
    let current = true;
    readings(review.id, round.number, flow.recording).then((read) => current && setStory(read.map((_, k) => ({ src: picture(review.id, round.number, flow.recording, k) }))));
    return () => void (current = false);
  }, [review.id, round.number, flow]);
  return story;
}

// The first new thing in a flow, close up: the page at the moment it's first seen, framed round it and outlined, at most
// half the page across so its words can be read; and the page as it was on the round it's new since, framed the same.
export type New = Shot & { frame: Frame; outline: Frame; was?: Shot & { round: number } };

export function useFirstNew(review: Review, round: Round, flow: Flow, diamonds: Diamond[]): New | undefined {
  const [found, setFound] = useState<New>();
  const first = diamonds.find((diamond) => diamond.flow === flow.name && diamond.until === undefined);
  const since = first?.changes[0]!.since;
  const then = review.rounds.find((kept) => kept.number === since)?.flows.find((kept) => kept.name === flow.name);
  useEffect(() => {
    let current = true;
    setFound(undefined);
    if (first) closeUp(review.id, round, flow, first, then && { round: since!, flow: then }).then((close) => current && setFound(close));
    return () => void (current = false);
  }, [review.id, round, flow, first?.id, since, then]);
  return found;
}

const PAD = 24;

async function closeUp(review: string, round: Round, flow: Flow, diamond: Diamond, then?: { round: number; flow: Flow }): Promise<New | undefined> {
  const now = await readings(review, round.number, flow.recording);
  // A change is found at a step, so its moment is that step's.
  const k = now.findIndex((reading) => Math.abs(reading.at - diamond.at) < 0.01);
  const reading = now[k];
  if (!reading) return undefined;
  const { width, height } = reading.screen;
  const boxes = diamond.changes.flatMap(({ on }) => {
    const box = on.element?.node !== undefined ? reading.things.find((thing) => thing.node === on.element!.node)?.box : on.box && { x: on.box.x * width, y: on.box.y * height, width: on.box.width * width, height: on.box.height * height };
    const shown = box && onScreen(box, reading.screen);
    return shown ? [shown] : [];
  });
  // The first that can be read whole at half the page across, or else the first there is.
  const box = boxes.find((box) => box.width + 2 * PAD <= width / 2) ?? boxes[0];
  if (!box) return undefined;

  const across = clamp(box.width + 2 * PAD, width * 0.3, width / 2);
  const down = Math.min(height, across / 1.6);
  const x = clamp(box.x + box.width / 2 - across / 2, 0, width - across);
  const y = clamp(box.height + 2 * PAD > down ? box.y - PAD : box.y + box.height / 2 - down / 2, 0, height - down);
  const frame = { x: x / width, y: y / height, width: across / width, height: down / height };
  const outline = { x: (box.x - x) / across, y: (box.y - y) / down, width: box.width / across, height: box.height / down };
  // How it was: the same step on the round it's new since, if that round recorded it.
  const was = then && (await readings(review, then.round, then.flow.recording)).findIndex((kept) => kept.step === reading.step);
  return {
    src: picture(review, round.number, flow.recording, k),
    frame,
    outline,
    was: then && was !== undefined && was >= 0 ? { src: picture(review, then.round, then.flow.recording, was), frame, round: then.round } : undefined,
  };
}

function onScreen(box: { x: number; y: number; width: number; height: number }, screen: Reading["screen"]) {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const right = Math.min(screen.width, box.x + box.width);
  const bottom = Math.min(screen.height, box.y + box.height);
  return right - x >= 4 && bottom - y >= 4 ? { x, y, width: right - x, height: bottom - y } : undefined;
}
