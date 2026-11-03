// Going from every flow at once to one, the flow's picture grows from where it was into the frame the flow plays in: a
// picture is in one place at a time, so you see where it went. A step's close-up opens by pulling back from it, and
// going back, pushes in on the step you were on.
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
  const fit = Math.min(there.width / page.width, there.height / page.height);
  const start = part
    ? { left: box.left - (part.x * box.width) / part.width, top: box.top - (part.y * box.height) / part.height, width: box.width / part.width, height: box.height / part.height }
    : within(box, page.width / page.height);
  const end = { left: there.left + (there.width - page.width * fit) / 2, top: there.top, width: page.width * fit, height: page.height * fit };
  move(from, box, start, frame, there, end, src);
  return FLIGHT.duration;
}

// Back to every flow, the camera pushes in on the step you were on: the page, from where the frame drew it, closes in
// on the part of it the step's picture shows, until it's that picture. The picture is the page as the step left it.
export function pushIn(frame: HTMLElement, box: DOMRect, page: DOMRect, home: HTMLElement) {
  const there = home.getBoundingClientRect();
  const shown = [...home.querySelectorAll("img")].at(-1);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !box.width || !there.width || !page.width || !shown) return;
  const drawn = shown.getBoundingClientRect();
  move(frame, box, page, home, there, shown.classList.contains("object-contain") ? within(drawn, page.width / page.height) : drawn, shown.src);
}

type Place = { left: number; top: number; width: number; height: number };

// A page as large as fits in a box, in the middle of it.
function within(box: Place, aspect: number): Place {
  const width = Math.min(box.width, box.height * aspect);
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - width / aspect) / 2, width, height: width / aspect };
}

// One box flies into another, showing the page, which moves from where it was drawn to where it will be: both on the
// page's own terms, so whatever's in view in one, the other shows it there too.
function move(from: HTMLElement, box: DOMRect, page: Place, to: HTMLElement, there: DOMRect, landing: Place, src?: string) {
  const px = (place: Place, by: Place) => ({ left: `${place.left - by.left}px`, top: `${place.top - by.top}px`, width: `${place.width}px`, height: `${place.height}px` });
  const copy = Object.assign(document.createElement("img"), { src: src ?? "", alt: "", hidden: !src, className: "absolute max-w-none" });
  Object.assign(copy.style, px(page, box));
  const flier = lift(from, box, copy);
  to.toggleAttribute("data-flying", true);
  copy.animate([px(page, box), px(landing, there)], { duration: FLIGHT.duration, easing: FLIGHT.easing, fill: "forwards" });
  const landed = { left: `${there.left}px`, top: `${there.top}px`, width: `${there.width}px`, height: `${there.height}px`, borderRadius: getComputedStyle(to).borderRadius };
  flier.animate([{}, landed], { duration: FLIGHT.duration, easing: FLIGHT.easing, fill: "forwards" }).onfinish = () => {
    for (const picture of [from, to]) picture.removeAttribute("data-flying");
    flier.remove();
  };
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
