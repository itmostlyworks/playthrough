// Going from every flow at once to one, each flow's picture flies from its tile to its place in the column, and back
// again on the way back: a picture is in one place at a time, so you see where each went. It turns into the picture it
// lands as on the way. One whose place is out of view fades where it is.
//
// A picture is marked by data-picture, its flow's name; data-flying hides it while its copy is in the air.

import { onPhone } from "./phone.ts";

const FLIGHT = { duration: 420, apart: 30, easing: "cubic-bezier(.3,.7,.1,1)" };

export type Taking = { flow: string; from: HTMLElement; box: DOMRect; copy: HTMLElement }[];

// Each picture in the room as it shows now, and where; in the room's view, if it scrolls.
export function takeOff(room: Element, view?: DOMRect): Taking {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return [];
  return [...room.querySelectorAll<HTMLElement>("[data-picture]")].flatMap((from) => {
    const box = from.getBoundingClientRect();
    if (!box.width || (view && (box.top < view.top || box.bottom > view.bottom))) return [];
    return [{ flow: from.dataset.picture!, from, box, copy: copyOf(from) }];
  });
}

// Flies each to its own picture in the room, which shows once it lands. How long until the last one has.
export function land(taking: Taking, room: Element, view?: DOMRect): number {
  let last = 0;
  taking.forEach(({ flow, from, box, copy }, i) => {
    const to = room.querySelector<HTMLElement>(`[data-picture="${CSS.escape(flow)}"]`);
    const there = to?.getBoundingClientRect();
    const home = to && there && there.width > 0 && (!view || (there.top >= view.top && there.bottom <= view.bottom));
    const flier = document.createElement("div");
    flier.className = "pointer-events-none fixed z-60 overflow-hidden bg-paper shadow-frame";
    Object.assign(flier.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: getComputedStyle(from).borderRadius });
    flier.append(copy);
    document.body.append(flier);
    from.toggleAttribute("data-flying", true);
    const delay = i * FLIGHT.apart;
    const done = () => {
      for (const picture of [from, to]) picture?.removeAttribute("data-flying");
      flier.remove();
    };
    if (!home) {
      flier.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, delay, fill: "forwards" }).onfinish = done;
      last = Math.max(last, delay + 240);
      return;
    }
    const arriving = copyOf(to);
    flier.append(arriving);
    arriving.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: FLIGHT.duration, delay, fill: "both" });
    to.toggleAttribute("data-flying", true);
    const landed = { left: `${there.left}px`, top: `${there.top}px`, width: `${there.width}px`, height: `${there.height}px`, borderRadius: getComputedStyle(to).borderRadius };
    flier.animate([{}, landed], { duration: FLIGHT.duration, delay, easing: FLIGHT.easing, fill: "forwards" }).onfinish = done;
    last = Math.max(last, delay + FLIGHT.duration);
  });
  return last;
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

// The column comes in from the right as the pictures fly into it; on a phone, the drawer comes up from below.
export function slideIn(column: Element) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  column.animate([{ opacity: 0, transform: onPhone() ? "translateY(40px)" : "translateX(40px)" }, {}], { duration: FLIGHT.duration, easing: FLIGHT.easing });
}
