// A frame arrow held, its key or its button: the first step at once, and after a breath one after another at a steady
// slow pace of the page's own, never the keyboard's repeat, for as long as there's one to take. Held, a step goes no
// further than a pause (stepping.ts), so it stops by itself where the screen goes still; let go and pressed again, it
// goes on.

import { useEffect, useRef } from "react";

// How long a press is held before it walks, so a tap is one step; and how long each frame is shown as it does, a
// quarter of the speed it played at where every frame differs.
const BREATH = 280;
const EACH = 66;

// `step` takes one, held or not, and says whether it went.
export function useHeld(step: (by: 1 | -1, held: boolean) => boolean) {
  const latest = useRef(step);
  latest.current = step;
  const next = useRef<ReturnType<typeof setTimeout>>(undefined);
  const letGo = () => (clearTimeout(next.current), (next.current = undefined));
  const press = (by: 1 | -1) => {
    letGo();
    if (!latest.current(by, false)) return;
    const walk = () => (next.current = latest.current(by, true) ? setTimeout(walk, EACH) : undefined);
    next.current = setTimeout(walk, BREATH);
  };
  // The window left with it held, nothing says it was let go.
  useEffect(() => {
    addEventListener("blur", letGo);
    return () => (removeEventListener("blur", letGo), letGo());
  }, []);
  return { press, letGo };
}
