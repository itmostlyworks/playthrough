// What's waiting on you, top left on every page: how many, and opened, every change as a sheet over the page, the page
// under it softened and still. Pressed, or from the keyboard, the sheet stays until Escape, a press beside it, or going
// somewhere. Pointed at, it opens by itself after a breath, and goes once the pointer has been away from it a moment.

import { useEffect, useRef, useState, type ReactNode } from "react";

export type Opened = "pointed" | "pressed";

// Whether the sheet is open and how; closed, the keyboard is given back where it opened it from.
export function useSheet() {
  const [open, setOpen] = useState<Opened>();
  const giveBack = useRef<HTMLElement | null>(null);
  // Opened from the keyboard, it's given back there on closing; opened with a press, nothing keeps it, so Space is the
  // page's again (going in), not the button's (the sheet once more).
  const openBy = (how: Opened) => {
    const from = document.activeElement as HTMLElement | null;
    giveBack.current = from?.matches(":focus-visible") ? from : null;
    from?.blur();
    setOpen(how);
  };
  // Gone somewhere, there's nothing to give the keyboard back to.
  const close = (giveItBack: boolean) => {
    if (!giveItBack) giveBack.current = null;
    setOpen(undefined);
  };
  useEffect(() => void (!open && giveBack.current?.isConnected && giveBack.current.focus({ preventScroll: true })), [open]);
  return { open, openBy, close };
}

// Its pointer has to rest on it a breath, so one passing over the corner opens nothing.
const BREATH = 80;

export function Opener({ waiting, open, onOpen }: { waiting: number; open?: Opened; onOpen: (how: Opened) => void }) {
  const breath = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rest = () => (clearTimeout(breath.current), (breath.current = undefined));
  // Once the sheet has closed, the pointer has to leave before pointing opens it again: closing it with the pointer
  // here isn't asking for it back.
  const left = useRef(true);
  const was = useRef(open);
  useEffect(() => void ((was.current && !open && (left.current = false)), (was.current = open)), [open]);
  const own = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const moved = (event: PointerEvent) => !left.current && !own.current?.contains(event.target as Node) && (left.current = true);
    addEventListener("pointermove", moved);
    return () => (removeEventListener("pointermove", moved), rest());
  }, []);
  // Only a mouse that moves: a page that loads or changes under a still pointer opens nothing, and touch presses.
  const pointing = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || open || !left.current || breath.current || (!event.movementX && !event.movementY)) return;
    breath.current = setTimeout(() => ((breath.current = undefined), onOpen("pointed")), BREATH);
  };
  return (
    <button
      ref={own}
      onClick={() => (rest(), onOpen("pressed"))}
      onPointerMove={pointing}
      onPointerLeave={rest}
      aria-haspopup="dialog"
      className="-ml-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg"
    >
      {waiting ? `${waiting} waiting` : "Every change"}
      <svg viewBox="0 0 12 12" className="size-3 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.5 4.5L6 8l3.5-3.5" />
      </svg>
    </button>
  );
}

// How long the pointer can be away from a sheet opened by pointing before it goes.
const AWAY = 300;

// Every change, over the page, opened from what's waiting, as if from it. What belongs to it, its previews too, says so
// with `data-sheet`, so the pointer can go to them without the sheet going.
export function Sheet({ pointed, onClose, children }: { pointed: boolean; onClose: () => void; children: ReactNode }) {
  const own = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // The keyboard comes into it, so Tab goes on to its first change.
    own.current?.focus({ preventScroll: true });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      own.current?.animate([{ opacity: 0, transform: "translateY(-6px) scale(0.985)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    // The page under it hears no keys while it's open. In it, Tab, Enter and Space do what they do; Escape closes it.
    const down = (event: KeyboardEvent) => {
      if (event.key === "Escape") (event.preventDefault(), close.current());
      if (event.key === "Escape" || !own.current?.contains(event.target as Node) || !/^(tab|enter| )$/i.test(event.key)) event.stopImmediatePropagation();
    };
    addEventListener("keydown", down, { capture: true });
    return () => removeEventListener("keydown", down, { capture: true });
  }, []);
  useEffect(() => {
    if (!pointed) return;
    let going: ReturnType<typeof setTimeout> | undefined;
    const away = () => (going ??= setTimeout(() => close.current(), AWAY));
    const moved = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!(event.target instanceof Element && event.target.closest("[data-sheet]"))) return away();
      clearTimeout(going);
      going = undefined;
    };
    addEventListener("pointermove", moved);
    document.documentElement.addEventListener("pointerleave", away);
    return () => (clearTimeout(going), removeEventListener("pointermove", moved), document.documentElement.removeEventListener("pointerleave", away));
  }, [pointed]);
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-arrive bg-[color-mix(in_srgb,var(--ground)_55%,transparent)]" style={{ animationDuration: "180ms" }} onPointerDown={onClose} />
      <div
        ref={own}
        data-sheet
        role="dialog"
        aria-label="Every change"
        tabIndex={-1}
        className="absolute top-2 left-3 max-h-[calc(100dvh-16px)] w-[min(600px,calc(100vw-24px))] origin-top-left overflow-y-auto overscroll-contain rounded-xl bg-surface shadow-float outline-none phone:left-2 phone:w-[calc(100vw-16px)]"
      >
        {children}
      </div>
    </div>
  );
}
