// A moment's still: its picture closed in on what it's about, as a change's row shows it in the sheet and a moment's left edge
// does.

import { useEffect, useState } from "react";
import type { Reading, Thing } from "@playthrough/page";
import type { Change, HandBack, Moment } from "@playthrough/change";
import { fineStill, picture, readings as readingsOf } from "./api.ts";
import { clamp } from "./clamp.ts";
import { around, Picture, union, type Crop } from "./Picture.tsx";

// Each edge of a part of the page that isn't the page's own edge fades out.
function fadeOf(crop: Crop): React.CSSProperties {
  const [left, right, top, bottom] = [crop.x > 0.001, crop.x + crop.width < 0.999, crop.y > 0.001, crop.y + crop.height < 0.999].map((cut) => (cut ? FADE : 0));
  const mask = `linear-gradient(to right, transparent, #000 ${left}px, #000 calc(100% - ${right}px), transparent), linear-gradient(to bottom, transparent, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent)`;
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
}

// The part of a moment's page that shows what it's about, this wide for its height: closed in on it with enough around
// it to know where you are, its nearest words with it, as a field's label and the line under it. Nothing, where it
// names nothing on the page.
const STILL = 1.6;

export function closeOn(reading: Reading | undefined, about: { role: string; name: string } | undefined, shape: number): Crop | undefined {
  const shown = reading && aboutBox(reading, about);
  return shown && around(shown, reading.screen, shape, 3);
}

// Where a phone's picture of a moment starts: closed in on what it's about as its still is, and widened to the whole of
// the dialog or panel that holds it, so no line in it is cut in half, however much smaller that comes out. Where nothing
// smaller than the page holds it, as on a board or a page of its own, as close as its still, to be moved by a drag.
export function startOn(reading: Reading | undefined, about: { role: string; name: string } | undefined, shape: number): Crop | undefined {
  const shown = reading && aboutBox(reading, about);
  const close = shown && around(shown, reading.screen, shape, 3);
  const panel = close && panelOf(reading, aboutThing(reading, about)!);
  if (!close || !panel) return close;
  const { width: across, height: down } = reading.screen;
  const width = Math.min(across, down * shape, Math.max(panel.width + 2 * ROOM, close.width * across));
  const height = width / shape;
  // All of it where it fits, else from its top, as far down as what it's about.
  const fits = panel.height + 2 * ROOM <= height;
  const from = fits ? panel.y + panel.height / 2 - height / 2 : panel.y - ROOM;
  const y = clamp(clamp(from, shown.y + shown.height + ROOM - height, shown.y - ROOM), 0, down - height);
  const x = clamp(panel.x + panel.width / 2 - width / 2, 0, across - width);
  return { x: x / across, y: y / down, width: width / across, height: height / down };
}

// Room kept round a panel in a phone's picture, in the page's pixels.
const ROOM = 24;

// The outermost of what holds a thing that's still a panel of the page, not the page: no wider than three quarters of it.
export function panelOf(reading: Reading, thing: Thing) {
  let panel: Thing["box"] | undefined;
  for (let holder = reading.things[thing.holder ?? -1]; holder; holder = reading.things[holder.holder ?? -1])
    if (holder.box.width <= (reading.screen.width * 3) / 4) panel = holder.box;
  return panel;
}

// Of several things the same, the one in view, as the moment was kept with.
function aboutThing(reading: Reading | undefined, about: { role: string; name: string } | undefined) {
  const alike = about ? (reading?.things ?? []).filter((one) => one.role === about.role && one.name === about.name) : [];
  const inView = (box: { x: number; y: number; width: number; height: number }) => box.y + box.height > 0 && box.y < reading!.screen.height && box.x + box.width > 0 && box.x < reading!.screen.width;
  return alike.find((one) => inView(one.box)) ?? alike[0];
}

// What a moment is about with its nearest words, as a field's label and the line under it, on its page: the part of
// it to keep in view.
export function aboutBox(reading: Reading | undefined, about: { role: string; name: string } | undefined) {
  const thing = aboutThing(reading, about);
  if (!reading || !thing) return undefined;
  const gap = (a: number, aSize: number, b: number, bSize: number) => Math.max(0, Math.max(a, b) - Math.min(a + aSize, b + bSize));
  // What holds it, as a list whose header its menu sits in, isn't near it: it's around it.
  const holds = (one: Thing) =>
    one !== thing && one.box.x <= thing.box.x && one.box.y <= thing.box.y && one.box.x + one.box.width >= thing.box.x + thing.box.width && one.box.y + one.box.height >= thing.box.y + thing.box.height;
  const near = reading.things.filter(
    (one) =>
      one.role !== "box" &&
      one.holder === thing.holder &&
      !holds(one) &&
      gap(one.box.y, one.box.height, thing.box.y, thing.box.height) <= 40 &&
      gap(one.box.x, one.box.width, thing.box.x, thing.box.width) <= 24,
  );
  // A line of words is laid out across its whole column: it's as wide as its words, as near as can be told.
  const wordsOf = (one: (typeof near)[number]) =>
    one.words && /^(text|heading)$/.test(one.role) ? { ...one.box, width: Math.min(one.box.width, one.words.length * parseFloat(one.look.size) * 0.55) } : one.box;
  return union([thing.box, ...near.map(wordsOf)]);
}

// What runs off an edge the page goes on past fades there rather than being cut.
const FADE = 20;

// A moment's still, for whatever holds it, a change's row in the sheet or a moment's edge: the app at its point, closed in on
// what it's about, or where it names nothing, on the last thing done on the way that's still there; the whole screen
// where there's neither.
export function StillPicture({ change, handBack, moment, about }: { change: Change; handBack: HandBack; moment: Moment; about?: { role: string; name: string } }) {
  const [crop, setCrop] = useState<Crop>();
  // Closed in, the picture kept as it was recorded is shown larger than it was taken on a screen of twice the dots: there,
  // it's drawn twice as fine, and the kept one shows until that's in.
  const [sharp, setSharp] = useState<string>();
  useEffect(() => {
    let current = true;
    readingsOf(change.id, handBack.number, moment.recording).then((read) => current && setCrop(closeOn(read.at(-1), about, STILL)));
    if (devicePixelRatio > 1)
      void fineStill(change.id, handBack.number, moment.recording, moment.length).then((src) => {
        if (!src || !current) return;
        const loaded = new Image();
        loaded.onload = () => current && setSharp(src);
        loaded.src = src;
      });
    return () => void (current = false);
  }, [moment.recording, about?.name]);
  return (
    <span className="absolute inset-0" style={crop && fadeOf(crop)}>
      <Picture shot={{ src: sharp ?? picture(change.id, handBack.number, moment.recording, 0), crop }} />
    </span>
  );
}
