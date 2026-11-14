// A moment's edges: on the left the change's moments, each a picture, on the right this moment's notes, each a slim
// strip of its thing over what was said, all one size, one after another. At rest they sit beside the recording, never
// over it, fading into the screen's edge. Pointed at, or reached with Tab, they come forward, all the way onto the
// screen and a little over the recording, a moment's words coming up over its picture, a note's card as it was; a
// touch brings them forward first. While you're in the app they rest, quieter, as everything that drives the
// recording does. On a phone there's no room beside the recording: they're rows under it, words and all.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

// A picture's size, and the room around it.
export const TILE = 176;
const GAP = 16;
const DRAWER = TILE + 2 * GAP;
// How wide the screen's edge fades, at most; and how, eased, so a picture leaves rather than greys.
const VEIL = 40;
const EASED = ["8%", "22%", "42%", "68%", "100%"].map((alpha, i) => `color-mix(in srgb, var(--ground) ${alpha}, transparent) ${25 + i * 18.75}%`).join(", ");
// From the edge's top to its first picture's: the list's padding and the card's, so the first picture's top is the
// recording's.
const INSET = 8 + 6;
// How long an edge stays forward with what just arrived on it, in milliseconds.
const SHOWN = 1400;
// Where more runs on past the edge's top or foot, it fades over this much, so it reads as more to come.
const MORE = 64;

type Room = { top: number; height: number; inner: number; screen: number };

export function Edge(props: {
  side: "left" | "right";
  label: string;
  // The recording, which the edge sits beside.
  stage: RefObject<HTMLDivElement | null>;
  // Stepped in: what drives the recording rests.
  quiet: boolean;
  phone: boolean;
  // The tile to keep in view, by its data-tile: the moment you're on, a note opened or arriving.
  showing?: string;
  // A tile just arrived: the edge comes forward with it, words and all, for a moment, then rests.
  arrived?: string;
  children: (forward: boolean) => ReactNode;
}) {
  const { side, label, stage, quiet, phone, showing, arrived, children } = props;
  const [room, setRoom] = useState<Room>();
  useLayoutEffect(() => {
    const shown = stage.current;
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
  useEffect(() => {
    if (!arrived || quiet) return;
    setForward(true);
    if (!under.current) toward(false, SHOWN);
  }, [arrived, quiet]);
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
  // How far its pictures run past the screen's edge at rest.
  const cutBy = right ? room.inner + GAP + TILE - room.screen : TILE + GAP - room.inner;
  const fade = (to: string) => `linear-gradient(${to}, ${cut.above ? "transparent" : "#000"}, #000 ${cut.above ? MORE : 0}px, #000 calc(100% - ${cut.below ? MORE : 0}px), ${cut.below ? "transparent" : "#000"})`;
  return (
    <>
      <div
        ref={own}
        role="region"
        aria-label={label}
        inert={quiet}
        className={`fixed z-30 transition-[translate,opacity] duration-300 ease-calm ${quiet ? "opacity-40" : ""}`}
        style={{ top: room.top - INSET, height: room.height + 2 * INSET, width: DRAWER, left: right ? room.inner : room.inner - DRAWER, translate: forward ? `${right ? -shift : shift}px 0` : "0 0" }}
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
          className="h-full overflow-x-clip overflow-y-auto overscroll-contain px-2.5 py-2 [scrollbar-width:none]"
          style={{ maskImage: fade("to bottom"), WebkitMaskImage: fade("to bottom") }}
        >
          {/* The cards stand on nothing of their own: forward, each is its own card over the recording. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">{children(forward)}</div>
        </div>
      </div>
      {/* The screen's edge, at rest, only where the pictures run past it: they leave over its last few pixels, quickly at
          the very edge, rather than a long grey band over pictures wholly on the screen. */}
      {cutBy > 0 && (
        <div
          aria-hidden
          className={`pointer-events-none fixed z-30 transition-opacity duration-300 ease-calm ${forward ? "opacity-0" : ""}`}
          style={{ top: room.top - INSET, height: room.height + 2 * INSET, width: Math.min(VEIL, cutBy + 24), [right ? "right" : "left"]: 0, background: `linear-gradient(to ${right ? "right" : "left"}, transparent, ${EASED})` }}
        />
      )}
    </>
  );
}

// One picture on an edge, and its words over its lower part once the edge has come forward. Strong: the moment you're on, the
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
  // A note's: a slim strip of its picture over its words, both always shown, rather than a picture its words come over.
  strip?: boolean;
  onPress: () => void;
  onPoint?: (pointed: boolean) => void;
}) {
  const { id, label, forward, strong, quiet, lit, arriving: from, picture, words, strip, onPress, onPoint } = props;
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
      className={`group/tile block w-full rounded-xl p-1.5 text-left transition-[background-color,box-shadow,opacity] duration-200 ease-calm focus-visible:outline-none ${forward ? "bg-surface shadow-[0_0_0_1px_var(--edge)]" : "bg-ground shadow-[0_0_0_0_transparent]"}`}
    >
      <span
        className={`relative block overflow-hidden rounded-lg ${strip ? "flex flex-col bg-surface" : "aspect-[1.6] bg-paper"} transition-[box-shadow,opacity,scale] duration-200 ease-calm group-active/tile:scale-[0.97] group-active/tile:duration-75 ${quiet && !strong ? "opacity-80 group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100" : ""} group-focus-visible/tile:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--amber)] ${strong ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--soft)]" : lit ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--faint)]" : "shadow-[0_0_0_1px_var(--edge),0_1px_3px_var(--edge)] group-hover/tile:shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--faint)]"}`}
      >
        {strip ? (
          // The same at rest and forward: nothing inside it moves.
          <>
            <span className="relative block aspect-[3.8] flex-none overflow-hidden bg-paper">{picture}</span>
            <span className="block px-2 pt-1.5 pb-[7px]">{words}</span>
          </>
        ) : (
          <>
            {picture}
            {/* Its words come up over the picture's lower part, on the card's own ground, as the edge comes forward. */}
            <span
              className={`absolute inset-x-0 bottom-0 bg-surface px-2 pt-1.5 pb-[7px] transition-[opacity,translate] duration-200 ease-calm ${forward ? "translate-y-0 opacity-100 delay-75" : "pointer-events-none translate-y-1 opacity-0"}`}
            >
              {words}
            </span>
          </>
        )}
      </span>
    </button>
  );
}
