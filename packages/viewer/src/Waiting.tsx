// What's waiting on you, top left on every page: how many, and opened, every change as a sheet over the page, the page
// under it softened and still. Pressed, or from the keyboard, the sheet stays until Escape, a press beside it, or going
// somewhere. Pointed at, it opens by itself after a breath, and goes once the pointer has been away from it a moment.
// From the keyboard it's W, anywhere, and W again closes it: the keyboard is on a change at once, ↑ and ↓ go from one
// to the next, and Enter goes in.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Key } from "./Key.tsx";
import { Mark } from "./Mark.tsx";

export type Opened = "pointed" | "pressed" | "keyed";

// The key that opens it, and closes it again.
const OPENS = "w";
// How long it takes to go, in milliseconds: quicker than it came.
const GOING = 140;
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Whether the sheet is open and how; closed, the keyboard is given back where it opened it from, and the sheet is
// still drawn for as long as it takes to go.
export function useSheet() {
  const [open, setOpen] = useState<Opened>();
  const [going, setGoing] = useState<Opened>();
  // Each opening is a sheet of its own, so one opened as the last still goes comes in as any does.
  const [times, setTimes] = useState(0);
  const giveBack = useRef<HTMLElement | null>(null);
  // Opened from the keyboard, it's given back there on closing; opened with a press, nothing keeps it, so Space is the
  // page's again (going in), not the button's (the sheet once more).
  const openBy = (how: Opened) => {
    const from = document.activeElement as HTMLElement | null;
    const keyboard = !!from?.matches(":focus-visible");
    giveBack.current = keyboard ? from : null;
    from?.blur();
    setTimes((n) => n + 1);
    setOpen(how === "pressed" && keyboard ? "keyed" : how);
  };
  // Gone somewhere, there's nothing to give the keyboard back to.
  const close = (giveItBack: boolean) => {
    if (!giveItBack) giveBack.current = null;
    setOpen(undefined);
  };
  useEffect(() => {
    if (open) return setGoing(open);
    if (giveBack.current?.isConnected) giveBack.current.focus({ preventScroll: true });
    const gone = setTimeout(() => setGoing(undefined), calm() ? 0 : GOING);
    return () => clearTimeout(gone);
  }, [open]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.closest("textarea, input, [contenteditable]");
      // A key the page has already taken (W typed while noting) opens nothing.
      if (typing || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== OPENS) return;
      event.preventDefault();
      openBy("keyed");
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);
  return { open, drawn: open ?? going, times, openBy, close };
}

// Its pointer has to rest on it a breath, so one passing over the corner opens nothing.
const BREATH = 80;

// How many changes wait on you, in words: on the opener and the tab alike.
export const waitingSays = (count: number) => `${count} ${count === 1 ? "change" : "changes"} waiting`;

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
      aria-keyshortcuts={OPENS.toUpperCase()}
      className="-ml-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg"
    >
      {/* Whose page this is, and what's in it: Playthrough's mark and name lead what's waiting, one thing to press. On
          a phone the mark and the count alone, so the change's title keeps its room. */}
      <Mark className="size-[18px]" />
      <span className="mr-2.5 font-semibold text-fg phone:hidden">Playthrough</span>
      {waiting ? <><span className="phone:hidden">{waitingSays(waiting)}</span><span className="hidden phone:inline">{waiting} waiting</span></> : "Every change"}
      <svg viewBox="0 0 12 12" className="size-3 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.5 4.5L6 8l3.5-3.5" />
      </svg>
      <Key className="ml-0.5 phone:hidden">{OPENS.toUpperCase()}</Key>
    </button>
  );
}

// How long the pointer can be away from a sheet opened by pointing before it goes.
const AWAY = 300;

// Every change, over the page, opened from what's waiting, as if from it. What belongs to it says so with `data-sheet`:
// opened by pointing, it goes once the pointer has been off that a while.
// Going, it's still drawn, fading where it is, and nothing of it answers: the page under it already does.
export function Sheet({ pointed, going, onClose, children }: { pointed: boolean; going: boolean; onClose: () => void; children: ReactNode }) {
  const own = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // The keyboard comes into it, so Tab goes on to its first change.
    own.current?.focus({ preventScroll: true });
    if (!calm()) own.current?.animate([{ opacity: 0, transform: "translateY(-6px) scale(0.985)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  }, []);
  useEffect(() => {
    if (going) {
      const gone = { duration: GOING, easing: "ease-out", fill: "forwards" as const };
      own.current?.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-4px) scale(0.99)" }], gone);
      under.current?.animate([{ opacity: 1 }, { opacity: 0 }], gone);
      return;
    }
    // The change the keyboard is on, or the one above or below it: the first or the last, come to from none.
    const walk = (by: 1 | -1) => {
      const rows = [...(own.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])].filter((row) => !row.closest("[inert]"));
      const on = document.activeElement?.closest("[data-change]");
      const at = rows.findIndex((row) => row === document.activeElement || on?.contains(row));
      const to = rows[at < 0 ? (by > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, at + by))];
      to?.focus({ preventScroll: true });
      (to?.closest("[data-change]") ?? to)?.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
    };
    // The page under it hears no keys while it's open. In it, Tab, Enter and Space do what they do, ↑ and ↓ go from
    // one change to the next, and Escape closes it, as the key that opened it does.
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      const closes = key === "escape" || (plain && key === OPENS);
      const by = !plain ? 0 : /^(arrowdown|j)$/.test(key) ? 1 : /^(arrowup|k)$/.test(key) ? -1 : 0;
      if (closes) (event.preventDefault(), close.current());
      if (by) (event.preventDefault(), walk(by));
      if (closes || by || !own.current?.contains(event.target as Node) || !/^(tab|enter| )$/.test(key)) event.stopImmediatePropagation();
    };
    addEventListener("keydown", down, { capture: true });
    return () => removeEventListener("keydown", down, { capture: true });
  }, [going]);
  useEffect(() => {
    if (!pointed || going) return;
    let closing: ReturnType<typeof setTimeout> | undefined;
    const away = () => (closing ??= setTimeout(() => close.current(), AWAY));
    const moved = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!(event.target instanceof Element && event.target.closest("[data-sheet]"))) return away();
      clearTimeout(closing);
      closing = undefined;
    };
    addEventListener("pointermove", moved);
    document.documentElement.addEventListener("pointerleave", away);
    return () => (clearTimeout(closing), removeEventListener("pointermove", moved), document.documentElement.removeEventListener("pointerleave", away));
  }, [pointed, going]);
  return (
    <div className={`fixed inset-0 z-50 ${going ? "pointer-events-none" : ""}`} inert={going}>
      <div ref={under} className="absolute inset-0 animate-arrive bg-[color-mix(in_srgb,var(--ground)_55%,transparent)]" style={{ animationDuration: "180ms" }} onPointerDown={onClose} />
      <div
        ref={own}
        data-sheet
        role="dialog"
        aria-label="Every change"
        tabIndex={-1}
        className="absolute top-2 left-3 max-h-[calc(100dvh-16px)] w-[min(600px,calc(100vw-24px))] origin-top-left overflow-y-auto overscroll-contain inside:overscroll-auto rounded-xl bg-surface shadow-float outline-none phone:left-2 phone:w-[calc(100vw-16px)]"
      >
        {children}
      </div>
    </div>
  );
}
