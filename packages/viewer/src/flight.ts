// Going from every flow at once to one, the flow's picture grows from where it was into the frame the flow plays in: a
// picture is in one place at a time, so you see where it went. Going back, the frame shrinks home into it.
//
// A picture is marked by data-picture, its flow's name; data-flying hides it while its copy is in the air.

import type { Frame } from "./Picture.tsx";

const FLIGHT = { duration: 420, easing: "cubic-bezier(.3,.7,.1,1)" };

export type Taking = { flow: string; from: HTMLElement; box: DOMRect; copy: HTMLElement }[];

// Each picture in the room as it shows now, and where.
export function takeOff(room: Element): Taking {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return [];
  return [...room.querySelectorAll<HTMLElement>("[data-picture]")].flatMap((from) => {
    const box = from.getBoundingClientRect();
    if (!box.width) return [];
    return [{ flow: from.dataset.picture!, from, box, copy: copyOf(from) }];
  });
}

// Into one flow, its picture grows into the frame it plays in, which shows once it's there: what the frame shows is
// the picture it grows from, the flow opening. How long until it has.
export function grow(taking: Taking, frame: HTMLElement): number {
  const one = taking[0];
  const there = frame.getBoundingClientRect();
  if (!one || !there.width) return 0;
  const flier = lift(one.from, one.box, one.copy);
  frame.toggleAttribute("data-flying", true);
  const landed = { left: `${there.left}px`, top: `${there.top}px`, width: `${there.width}px`, height: `${there.height}px`, borderRadius: getComputedStyle(frame).borderRadius };
  flier.animate([{}, landed], { duration: FLIGHT.duration, easing: FLIGHT.easing, fill: "forwards" }).onfinish = () => {
    for (const picture of [one.from, frame]) picture.removeAttribute("data-flying");
    flier.remove();
  };
  return FLIGHT.duration;
}

// Back to every flow, the frame goes home into the picture it grew from: from what it showed, as the step it was on
// left the page, turning into that picture over the second half of the way.
export function shrink(frame: HTMLElement, box: DOMRect, showing: string | undefined, home: HTMLElement) {
  const there = home.getBoundingClientRect();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !box.width || !there.width) return;
  const copy = copyOf(home);
  const flier = lift(home, box, copy);
  frame.toggleAttribute("data-flying", true);
  if (showing) {
    const was = Object.assign(document.createElement("img"), { src: showing, alt: "", className: "absolute inset-0 size-full object-contain" });
    flier.prepend(was);
    copy.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], FLIGHT.duration);
  }
  const landed = { left: `${there.left}px`, top: `${there.top}px`, width: `${there.width}px`, height: `${there.height}px`, borderRadius: getComputedStyle(home).borderRadius };
  flier.animate([{}, landed], { duration: FLIGHT.duration, easing: FLIGHT.easing, fill: "forwards" }).onfinish = () => {
    for (const picture of [home, frame]) picture.removeAttribute("data-flying");
    flier.remove();
  };
}

// A step, as its picture shows it close up: the page as the step begins, none before a recording's first, the part of it
// in view, and the page's size.
export type CloseUp = { src?: string; frame?: Frame; page: { width: number; height: number } };

// From a step's close-up into the frame, the camera pulls back: what was in view stays in view as the page around it
// comes in, and the whole page settles where the frame draws it, at the top and in the middle. The frame shows once
// it's there. How long until it has.
export function pullBack(from: HTMLElement, closeUp: CloseUp, frame: HTMLElement): number {
  const box = from.getBoundingClientRect();
  const there = frame.getBoundingClientRect();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !box.width || !there.width) return 0;
  const { src, frame: part, page } = closeUp;
  const fit = (room: DOMRect) => Math.min(room.width / page.width, room.height / page.height);
  const start = part
    ? { width: box.width / part.width, height: box.height / part.height, left: (-part.x * box.width) / part.width, top: (-part.y * box.height) / part.height }
    : { width: page.width * fit(box), height: page.height * fit(box), left: (box.width - page.width * fit(box)) / 2, top: (box.height - page.height * fit(box)) / 2 };
  const end = { width: page.width * fit(there), height: page.height * fit(there), left: (there.width - page.width * fit(there)) / 2, top: 0 };
  const px = (place: Record<string, number>) => Object.fromEntries(Object.entries(place).map(([key, value]) => [key, `${value}px`]));
  const copy = Object.assign(document.createElement("img"), { src: src ?? "", alt: "", hidden: !src, className: "absolute max-w-none" });
  Object.assign(copy.style, px(start));
  const flier = lift(from, box, copy);
  frame.toggleAttribute("data-flying", true);
  copy.animate([px(start), px(end)], { duration: FLIGHT.duration, easing: FLIGHT.easing, fill: "forwards" });
  const landed = { left: `${there.left}px`, top: `${there.top}px`, width: `${there.width}px`, height: `${there.height}px`, borderRadius: getComputedStyle(frame).borderRadius };
  flier.animate([{}, landed], { duration: FLIGHT.duration, easing: FLIGHT.easing, fill: "forwards" }).onfinish = () => {
    for (const picture of [from, frame]) picture.removeAttribute("data-flying");
    flier.remove();
  };
  return FLIGHT.duration;
}

// A picture's copy, in the air where the picture is, which hides while it's away.
function lift(from: HTMLElement, box: DOMRect, copy: HTMLElement): HTMLElement {
  const flier = document.createElement("div");
  flier.className = "pointer-events-none fixed z-60 overflow-hidden bg-paper shadow-frame";
  Object.assign(flier.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: getComputedStyle(from).borderRadius });
  flier.append(copy);
  document.body.append(flier);
  from.toggleAttribute("data-flying", true);
  return flier;
}

// What a picture shows, as it shows it: what's only there while you point at it stays behind.
function copyOf(picture: HTMLElement): HTMLElement {
  const copy = document.createElement("div");
  copy.className = "absolute inset-0";
  for (const part of picture.children) {
    const style = getComputedStyle(part);
    if (part.hasAttribute("data-pointing") || Number(style.opacity) < 0.01 || style.visibility === "hidden") continue;
    const kept = part.cloneNode(true) as HTMLElement;
    Object.assign(kept.style, { opacity: style.opacity, zIndex: style.zIndex });
    copy.append(kept);
  }
  return copy;
}
