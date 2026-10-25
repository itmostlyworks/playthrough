// A list that scrolls fades out at an edge with more past it, rather than cutting its rows off there. The fade grows
// with what's past the edge, up to 24px, so it comes in as you scroll and an edge with nothing past it stays sharp.

import { useEffect, useLayoutEffect, type RefObject } from "react";

export const fades = "[mask-image:linear-gradient(to_bottom,transparent,#000_var(--above,0px),#000_calc(100%_-_var(--below,0px)),transparent)]";

export function useFade(list: RefObject<HTMLElement | null>) {
  const edges = () => {
    const shown = list.current;
    if (!shown) return;
    shown.style.setProperty("--above", `${Math.min(24, shown.scrollTop)}px`);
    shown.style.setProperty("--below", `${Math.min(24, Math.max(0, shown.scrollHeight - shown.clientHeight - shown.scrollTop))}px`);
  };
  // Rows that open, close or arrive change what's past the edges as much as scrolling does.
  useLayoutEffect(edges);
  useEffect(() => {
    const shown = list.current;
    if (!shown) return;
    const observer = new ResizeObserver(edges);
    observer.observe(shown);
    shown.addEventListener("scroll", edges, { passive: true });
    return () => {
      observer.disconnect();
      shown.removeEventListener("scroll", edges);
    };
  }, [list]);
}
