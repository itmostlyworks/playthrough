// Beside the recording, the column. On a phone it's a drawer from the bottom, resting under the recording's controls
// with the foot at its bottom, in reach of the thumb. Pulled up by its handle, or tapped there, it slides over the
// controls as far as the recording, which it never covers, and back down the same way. Typing in it pulls it up too,
// to leave room for the keyboard.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { clamp } from "./moments.ts";
import { onPhone } from "./phone.ts";

type Props = {
  ref: RefObject<HTMLElement | null>;
  // What it slides over when it's pulled up.
  over: RefObject<HTMLElement | null>;
  away: boolean;
  children: ReactNode;
};

export function Drawer({ ref, over, away, children }: Props) {
  const [raised, setRaised] = useState(false);
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(() => setLift(over.current?.offsetHeight ?? 0));
    if (over.current) observer.observe(over.current);
    return () => observer.disconnect();
  }, [over]);

  // A press on the handle is a tap until it moves 4px; from then on the drawer follows the finger, and let go, it goes
  // the way it was flicked, or else to the nearer end.
  const pulled = useRef(false);
  const pull = (event: PointerEvent<HTMLButtonElement>) => {
    const drawer = ref.current!;
    const start = event.clientY;
    const from = raised ? lift : 0;
    const id = event.pointerId;
    let last = { y: start, at: event.timeStamp };
    let speed = 0;
    pulled.current = false;
    const move = (moving: globalThis.PointerEvent) => {
      if (moving.pointerId !== id || (!pulled.current && Math.abs(moving.clientY - start) < 4)) return;
      pulled.current = true;
      drawer.toggleAttribute("data-pulling", true);
      drawer.style.setProperty("--lift", `${clamp(from + start - moving.clientY, 0, lift)}px`);
      speed = (last.y - moving.clientY) / Math.max(1, moving.timeStamp - last.at);
      last = { y: moving.clientY, at: moving.timeStamp };
    };
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      if (!pulled.current) return;
      drawer.removeAttribute("data-pulling");
      const raise = Math.abs(speed) > 0.3 ? speed > 0 : from + start - ending.clientY > lift / 2;
      drawer.style.setProperty("--lift", `${raise ? lift : 0}px`);
      setRaised(raise);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  return (
    <aside
      ref={ref}
      inert={away}
      style={{ "--lift": `${raised ? lift : 0}px` } as CSSProperties}
      className={`flex min-h-0 min-w-0 flex-col pb-4 phone:relative phone:z-10 phone:-mx-4 phone:mt-[calc(var(--lift)*-1)] phone:flex-1 phone:rounded-t-2xl phone:bg-ground phone:shadow-[0_-1px_0_var(--line),0_-10px_24px_-14px_rgba(20,24,34,0.2)] phone:transition-[margin-top] phone:duration-300 phone:ease-calm phone:data-pulling:transition-none ${away ? "invisible" : ""}`}
      onFocus={(event) => event.target instanceof HTMLTextAreaElement && onPhone() && setRaised(true)}
    >
      <button
        className="hidden h-6 flex-none touch-none items-center justify-center phone:flex"
        aria-label={raised ? "Lower the column" : "Raise the column"}
        aria-expanded={raised}
        onPointerDown={pull}
        onClick={() => pulled.current || setRaised(!raised)}
      >
        <i className="h-1 w-9 rounded-full bg-[color-mix(in_srgb,var(--faint)_60%,var(--ground))]" />
      </button>
      {children}
    </aside>
  );
}
