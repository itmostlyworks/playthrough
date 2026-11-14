// A moment's edges: on the left the change's moments, on the right this moment's notes, each a picture of the same size
// one after another. At rest they sit beside the recording, never over it, fading into the screen's edge. Pointed at,
// or reached with Tab, they come forward, all the way onto the screen and a little over the recording, each with its
// words; a touch brings them forward first. While you're in the app they rest, quieter, as everything that drives the
// recording does. On a phone there's no room beside the recording: they're rows under it, words and all.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

// A picture's size, and the room around it.
export const TILE = 176;
const GAP = 16;
const DRAWER = TILE + 2 * GAP;
// How wide the screen's edge fades.
const VEIL = 64;

type Room = { top: number; height: number; inner: number; screen: number };

export function Edge(props: {
  side: "left" | "right";
  label: string;
  // The recording, which the edge sits beside.
  frame: RefObject<HTMLDivElement | null>;
  // Stepped in: what drives the recording rests.
  quiet: boolean;
  phone: boolean;
  // The tile to keep in view, by its data-tile: the moment you're on, a note opened or arriving.
  showing?: string;
  children: (forward: boolean) => ReactNode;
}) {
  const { side, label, frame, quiet, phone, showing, children } = props;
  const [room, setRoom] = useState<Room>();
  useLayoutEffect(() => {
    const shown = frame.current;
    if (!shown || phone) return;
    const measure = () => {
      const box = shown.getBoundingClientRect();
      setRoom({ top: box.top, height: box.height, inner: side === "right" ? box.right : box.left, screen: innerWidth });
    };
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(shown);
    addEventListener("resize", measure);
    return () => (watching.disconnect(), removeEventListener("resize", measure));
  }, [phone, side]);
  const [forward, setForward] = useState(false);
  const timer = useRef(0);
  const own = useRef<HTMLDivElement>(null);
  // Whether the pointer is over it: a picture pressed lets go of the keys, which mustn't send it back from under the pointer.
  const under = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  // Coming forward waits a breath, so a pointer passing on its way elsewhere moves nothing; going back waits a little
  // longer, so a pointer slipping off a card for an instant doesn't send it all away.
  const toward = (now: boolean, after: number) => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setForward(now), after);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => void (quiet && (clearTimeout(timer.current), setForward(false))), [quiet]);
  // A touch elsewhere sends it back.
  useEffect(() => {
    if (!forward) return;
    const away = (event: PointerEvent) => !own.current?.contains(event.target as Node) && event.pointerType === "touch" && setForward(false);
    addEventListener("pointerdown", away, true);
    return () => removeEventListener("pointerdown", away, true);
  }, [forward]);
  // What's overflowing fades where it's cut, above and below.
  const [cut, setCut] = useState({ above: false, below: false });
  const look = () => {
    const shown = list.current;
    if (!shown) return;
    const [above, below] = [shown.scrollTop > 1, shown.scrollTop + shown.clientHeight < shown.scrollHeight - 1];
    setCut((now) => (now.above === above && now.below === below ? now : { above, below }));
  };
  useLayoutEffect(look);
  useEffect(() => {
    const tile = showing && list.current?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(showing)}"]`);
    const shown = list.current;
    if (!tile || !shown) return;
    // Only the edge's own list scrolls, never the page around it, by as little as brings it in.
    const [box, room] = [tile.getBoundingClientRect(), shown.getBoundingClientRect()];
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (phone) {
      const by = box.left < room.left ? box.left - room.left - 16 : box.right > room.right ? box.right - room.right + 16 : 0;
      return void (by && shown.scrollBy({ left: by, behavior }));
    }
    const by = box.top < room.top + 28 ? box.top - room.top - 28 : box.bottom > room.bottom - 28 ? box.bottom - room.bottom + 28 : 0;
    if (by) shown.scrollBy({ top: by, behavior });
  }, [showing]);

  if (phone)
    return (
      <section aria-label={label} className={`transition-opacity duration-200 ease-calm ${quiet ? "pointer-events-none opacity-40" : ""}`} inert={quiet}>
        <h2 className="text-[13px] leading-5 font-semibold text-soft">{label}</h2>
        <div ref={list} className="-mx-4 -mb-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pt-2 pb-4 [scrollbar-width:none] [&>*]:w-[148px] [&>*]:flex-none [&>*]:snap-start">
          {children(true)}
        </div>
      </section>
    );
  if (!room) return null;
  const right = side === "right";
  // Forward, it's all on the screen, its pictures as far from the screen's edge as from the recording at rest.
  const shift = right ? Math.max(0, room.inner + DRAWER - room.screen) : Math.max(0, DRAWER - room.inner);
  const fade = (to: string) => `linear-gradient(${to}, transparent, #000 ${cut.above ? 28 : 0}px, #000 calc(100% - ${cut.below ? 28 : 0}px), transparent)`;
  return (
    <>
      <div
        ref={own}
        role="region"
        aria-label={label}
        inert={quiet}
        className={`fixed z-30 transition-[translate,opacity] duration-300 ease-calm ${quiet ? "opacity-40" : ""}`}
        style={{ top: room.top - 8, height: room.height + 16, width: DRAWER, left: right ? room.inner : room.inner - DRAWER, translate: forward ? `${right ? -shift : shift}px 0` : "0 0" }}
        onPointerEnter={(event) => event.pointerType !== "touch" && ((under.current = true), toward(true, 70))}
        onPointerLeave={(event) => event.pointerType !== "touch" && ((under.current = false), toward(false, 220))}
        onPointerDownCapture={(event) => {
          if (event.pointerType !== "touch" || forward) return;
          // The first touch brings it forward; what's under it is pressed by the next.
          setForward(true);
          const swallow = (click: Event) => (click.stopPropagation(), click.preventDefault());
          addEventListener("click", swallow, { capture: true, once: true });
          setTimeout(() => removeEventListener("click", swallow, { capture: true }), 600);
        }}
        onFocus={() => toward(true, 0)}
        onBlur={(event) => !under.current && !event.currentTarget.contains(event.relatedTarget as Node) && toward(false, 0)}
      >
        <div
          ref={list}
          onScroll={look}
          className="grid h-full grid-cols-[minmax(0,1fr)] content-start gap-1 overflow-x-clip overflow-y-auto overscroll-contain px-2.5 py-2 [scrollbar-width:none]"
          style={{ maskImage: fade("to bottom"), WebkitMaskImage: fade("to bottom") }}
        >
          {children(forward)}
        </div>
      </div>
      {/* The screen's edge, fading what runs past it at rest. */}
      <div
        aria-hidden
        className={`pointer-events-none fixed z-30 transition-opacity duration-300 ease-calm ${forward ? "opacity-0" : ""}`}
        style={{ top: room.top - 8, height: room.height + 16, width: VEIL, [right ? "right" : "left"]: 0, background: `linear-gradient(to ${right ? "right" : "left"}, transparent, var(--ground) 92%)` }}
      />
    </>
  );
}

// One picture on an edge, and its words under it once the edge has come forward. Strong: the moment you're on, the
// note open. Lit: its pin on the recording is pointed at, or it is.
export function Tile(props: {
  id: string;
  label: string;
  forward: boolean;
  strong: boolean;
  quiet?: boolean;
  lit?: boolean;
  // New since the page opened, it arrives from this side.
  arriving?: "left" | "right";
  picture: ReactNode;
  words: ReactNode;
  onPress: () => void;
  onPoint?: (pointed: boolean) => void;
}) {
  const { id, label, forward, strong, quiet, lit, arriving: from, picture, words, onPress, onPoint } = props;
  const arriving = !!from;
  const own = useRef<HTMLButtonElement>(null);
  // A new one comes in from past the screen's edge, so it's seen arriving where it'll stay.
  useEffect(() => {
    if (!arriving || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    own.current?.animate(
      [
        { opacity: 0, translate: `${from === "right" ? 48 : -48}px 0` },
        { opacity: 1, translate: "0 0" },
      ],
      { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", delay: 120, fill: "backwards" },
    );
  }, []);
  return (
    <button
      ref={own}
      data-tile={id}
      aria-label={label}
      aria-pressed={strong}
      onClick={(event) => {
        // Pressed with the pointer, the keys go back to the page, so Space plays; with the keyboard, it stays.
        if (event.detail) event.currentTarget.blur();
        onPress();
      }}
      onPointerEnter={() => onPoint?.(true)}
      onPointerLeave={() => onPoint?.(false)}
      onFocus={() => onPoint?.(true)}
      onBlur={() => onPoint?.(false)}
      className={`group/tile block w-full rounded-xl p-1.5 text-left transition-[background-color,box-shadow,opacity] duration-200 ease-calm focus-visible:outline-none ${forward ? "bg-surface shadow-float" : "shadow-[0_0_0_0_transparent]"}`}
    >
      <span
        className={`relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper transition-[box-shadow,opacity,scale] duration-200 ease-calm group-active/tile:scale-[0.97] group-active/tile:duration-75 ${quiet && !strong ? "opacity-60 group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100" : ""} group-focus-visible/tile:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--amber)] ${strong ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--soft)]" : lit ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--faint)]" : "shadow-frame group-hover/tile:shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--faint)]"}`}
      >
        {picture}
      </span>
      <span className={`block px-1 pt-2 pb-0.5 transition-opacity duration-200 ease-calm ${forward ? "opacity-100 delay-75" : "opacity-0"}`}>{words}</span>
    </button>
  );
}
