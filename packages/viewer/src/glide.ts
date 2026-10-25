// The column never jumps. Everything in it is known by its data-key, so when it's drawn again, what's still there glides
// from where it was on screen, what's new fades in where the rest made room, and what's gone fades where it was.

import { useLayoutEffect, type RefObject } from "react";

const GLIDE = { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", id: "glide" };

export function useGlide(room: RefObject<HTMLElement | null>, ghosts: RefObject<HTMLElement | null>) {
  // Where each thing was as last seen, read while drawing, before the page changes, and mid-glide where it is then.
  const was = new Map<string, { element: HTMLElement; box: DOMRect }>();
  if (room.current && room.current.getBoundingClientRect().height > 0)
    for (const element of room.current.querySelectorAll<HTMLElement>("[data-key]")) was.set(element.dataset.key!, { element, box: element.getBoundingClientRect() });

  useLayoutEffect(() => {
    const map = room.current;
    if (!map || !was.size || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const now = [...map.querySelectorAll<HTMLElement>("[data-key]")];
    for (const element of now) for (const animation of element.getAnimations()) if (animation.id === "glide") animation.cancel();
    for (const element of now) {
      const before = was.get(element.dataset.key!);
      if (!before) {
        element.animate([{ opacity: 0 }, { opacity: 1 }], { ...GLIDE, delay: 80, fill: "backwards" });
        continue;
      }
      const moved = before.box.top - element.getBoundingClientRect().top;
      if (Math.abs(moved) > 0.5) element.animate([{ transform: `translateY(${moved}px)` }, { transform: "none" }], GLIDE);
    }

    const keys = new Set(now.map((element) => element.dataset.key));
    const at = map.getBoundingClientRect();
    for (const [key, { element, box }] of was) {
      if (keys.has(key) || !ghosts.current) continue;
      // A copy, standing where it was, that nothing else takes for the real thing.
      const ghost = element.cloneNode(true) as HTMLElement;
      for (const part of [ghost, ...ghost.querySelectorAll("*")]) for (const name of ["data-key", "data-open", "data-stop", "data-mark", "data-tick"]) part.removeAttribute(name);
      Object.assign(ghost.style, { position: "absolute", margin: "0", top: `${box.top - at.top + map.scrollTop}px`, left: `${box.left - at.left}px`, width: `${box.width}px`, transformOrigin: "top" });
      ghost.inert = true;
      ghosts.current.append(ghost);
      ghost.animate([{ opacity: 1 }, { opacity: 0, transform: "scaleY(0.96)" }], { ...GLIDE, duration: 200 }).onfinish = () => ghost.remove();
    }
  });
}
