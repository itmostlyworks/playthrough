// Taking a scene over, the app opens in its picture like a portal. Asked for before it's ready, the picture's edge
// breathes and the recording's pointer says it's being taken over, counting down when it's known how long. Once it's
// there, the recording's pointer comes to yours, and the app opens from where they meet, a ring going out to the
// picture's edges; your name goes with your pointer, as whoever the scene is done as. Given back, it closes on where
// your pointer was in the app, and the pointer goes back to where the recording has it.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Scrolled } from "./replay.ts";

type Props = {
  // The app: made ready unseen, being made ready while you wait, or yours; and where your pointer was in it as you left.
  live?: { address?: string; shown: boolean; inApp: boolean; due?: number; at?: { x: number; y: number } };
  // Who the scene is done as, there.
  person?: string;
  // The page the recording was made of, at its size.
  screen: { width: number; height: number };
  scrolled: () => Scrolled | undefined;
  // What the pointer says while it's made ready.
  waiting?: string;
  // Whether your name goes with your pointer; where the page says who you are elsewhere, it doesn't.
  named?: boolean;
};

export function Portal({ live, person, screen, scrolled, waiting: waitingWords = "Taking over…", named = true }: Props) {
  const room = useRef<HTMLDivElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const sheen = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLSpanElement>(null);
  const words = useRef<HTMLSpanElement>(null);
  const [wide, setWide] = useState(0);
  useEffect(() => {
    const watching = new ResizeObserver(() => setWide(room.current?.clientWidth ?? 0));
    watching.observe(room.current!);
    return () => watching.disconnect();
  }, []);
  const k = wide / screen.width;
  const inPortal = !!live?.shown && live.inApp;
  const waiting = !!live?.shown && !inPortal;
  const open = useRef(false);
  const taking = useRef(false);
  // Where you last pointed, on the page; and your hand in the picture while you're in the app.
  const pointed = useRef<{ x: number; y: number }>(undefined);
  const yourHand = useRef<{ x: number; y: number }>(undefined);
  const handing = useRef<number[]>([]);
  const handingOver = (then: () => void, after: number) => void handing.current.push(window.setTimeout(then, after));
  const tip = (point: { x: number; y: number }) => `translate(${(point.x - 3).toFixed(1)}px,${(point.y - 2).toFixed(1)}px)`;
  // Where the recording draws its pointer, in the picture, if it does.
  const theirs = () => {
    const drawn = room.current?.parentElement?.querySelector<HTMLElement>("[data-hand]");
    if (!drawn || drawn.style.opacity === "0") return undefined;
    const [box, at] = [room.current!.getBoundingClientRect(), drawn.getBoundingClientRect()];
    return { x: at.left - box.left + 3, y: at.top - box.top + 2 };
  };
  const handTo = (at: { x: number; y: number }, inside: boolean, text: boolean) => {
    yourHand.current = at;
    Object.assign(hand.current!.style, { transform: tip(at), opacity: inside ? "1" : "0" });
    shape(hand.current!, text);
  };
  useEffect(() => {
    if (!live?.address) return;
    const aimed = (event: PointerEvent) => {
      pointed.current = { x: event.clientX, y: event.clientY };
      // In the app, outside the part it has opened so far, the hand still follows yours.
      const box = open.current && room.current?.getBoundingClientRect();
      if (!box) return;
      const at = { x: event.clientX - box.left, y: event.clientY - box.top };
      handTo(at, at.x >= 0 && at.y >= 0 && at.x <= box.width && at.y <= box.height, false);
    };
    // In the app, your name goes where your pointer is, and leaves the picture with it.
    const told = ({ data, source }: MessageEvent) => {
      if (data?.playthrough === "pointer" && open.current && source === frame.current?.contentWindow) handTo({ x: data.x * k, y: data.y * k }, data.inside, !!data.text);
    };
    addEventListener("pointermove", aimed, true);
    addEventListener("pointerdown", aimed, true);
    addEventListener("message", told);
    return () => {
      removeEventListener("pointermove", aimed, true);
      removeEventListener("pointerdown", aimed, true);
      removeEventListener("message", told);
    };
  }, [live?.address, k]);

  // Opening into the app, and closing it again.
  useLayoutEffect(() => {
    const [box, door, glow, rim, edging, yours, name, said] = [room.current, app.current, sheen.current, ring.current, edge.current, hand.current, tag.current, words.current];
    if (!box || !rim || !edging || !yours || !name || !said || inPortal === open.current) return;
    // Gone from under it already, as the next moment is made ready, the app is closed: only what was drawn over it goes,
    // so the next one opens as the first did.
    if (!door || !glow) {
      open.current = false;
      edging.style.opacity = "0";
      yours.removeAttribute("data-yours");
      Object.assign(yours.style, { opacity: "0" });
      yourHand.current = undefined;
      name.hidden = true;
      return;
    }
    handing.current.forEach(clearTimeout);
    handing.current = [];
    // Waited for, the edge is already glowing, and the opening carries on from there.
    const glowing = { opacity: getComputedStyle(edging).opacity, boxShadow: getComputedStyle(edging).boxShadow };
    const waited = taking.current;
    for (const part of [door, glow, rim, edging, yours, name, said]) part.getAnimations().forEach((animation) => animation.cancel());
    const { width, height, left: x0, top: y0 } = box.getBoundingClientRect();
    const mine = pointed.current && { x: pointed.current.x - x0, y: pointed.current.y - y0 };
    const onIt = mine && mine.x >= 0 && mine.y >= 0 && mine.x <= width && mine.y <= height ? mine : undefined;
    const recorded = theirs();
    const left = live?.at && { x: live.at.x * k, y: live.at.y * k };
    const at = (inPortal ? (onIt ?? recorded) : (yourHand.current ?? left ?? onIt)) ?? { x: width / 2, y: height / 2 };
    const reach = Math.max(...[[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => Math.hypot(x! - at.x, y! - at.y)));
    const circle = (r: number) => `circle(${r.toFixed(1)}px at ${at.x.toFixed(1)}px ${at.y.toFixed(1)}px)`;
    Object.assign(rim.style, { left: `${at.x - reach}px`, top: `${at.y - reach}px`, width: `${reach * 2}px`, height: `${reach * 2}px` });
    glow.style.setProperty("--x", `${at.x}px`);
    glow.style.setProperty("--y", `${at.y}px`);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    open.current = inPortal;
    door.toggleAttribute("data-yours", inPortal);
    // Once the recording's pointer has come to yours, the pointer is your own, with no drawn one trailing it: only your
    // name goes with it.
    const real = (handed: boolean) => {
      yours.toggleAttribute("data-yours", handed);
      frame.current?.contentWindow?.postMessage({ playthrough: "yours", yours: handed }, "*");
    };

    if (inPortal) {
      frame.current?.contentWindow?.postMessage({ playthrough: "scroll", ...scrolled() }, "*");
      Object.assign(door.style, { opacity: "1", pointerEvents: "auto" });
      frame.current?.focus();
      edging.style.opacity = "1";
      // The recording's pointer becomes yours: where your hand is, its name changing hands with it.
      yourHand.current = at;
      Object.assign(yours.style, { transform: tip(at), opacity: "1" });
      name.hidden = false;
      if (still) return void (real(true), say(name, said, person ? `You, as ${person}` : "You", true, false));
      if (!waited) say(name, said, person ?? "You are in control", !person, false);
      else if (said.textContent !== waitingWords) say(name, said, waitingWords, false);
      // It goes from where the recording had it to your hand, and the portal opens from where they meet.
      const handed = recorded && onIt && Math.hypot(onIt.x - recorded.x, onIt.y - recorded.y) > 4 ? HANDING : 0;
      if (handed) yours.animate([{ translate: `${recorded!.x - at.x}px ${recorded!.y - at.y}px` }, { translate: "0px 0px" }], { duration: handed, easing: PORTAL });
      else if (!recorded) yours.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      handingOver(() => real(true), handed);
      const told = handed + (person || waited ? 240 : 0);
      if (person || waited) handingOver(() => say(name, said, "You are in control"), told);
      handingOver(() => say(name, said, person ? `You, as ${person}` : "You"), told + 1700);
      const after = { delay: handed, easing: PORTAL, fill: "backwards" as const };
      door.animate([{ clipPath: circle(0) }, { clipPath: circle(reach) }], { ...after, duration: OPENING });
      glow.animate([{ opacity: 1 }, { opacity: 0 }], { ...after, duration: OPENING + 240 });
      rim.animate([{ transform: "scale(0)", opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.85, offset: 0.7 }, { transform: "scale(1)", opacity: 0 }], { ...after, duration: OPENING });
      edging.animate([glowing, { ...glowing, offset: 0.5 }, { opacity: 1, boxShadow: "inset 0 0 0 2px rgba(236,178,72,0.95), inset 0 0 40px rgba(255,214,150,0.45)", offset: 0.75 }, { opacity: 1 }], { ...after, duration: OPENING + 500 });
      return;
    }

    edging.style.opacity = "0";
    real(false);
    shape(yours, false);
    yourHand.current = undefined;
    door.style.pointerEvents = "none";
    const shut = () => (door.style.opacity = "0");
    const hide = () => ((yours.style.opacity = "0"), (name.hidden = true));
    if (still) return void (shut(), hide());
    // Your hand goes back to where the recording has it, its name back to whoever the scene is done as, and goes.
    const back = recorded ? tip(recorded) : tip(at);
    yours.animate([{ transform: tip(at), opacity: 1 }, { transform: tip(at), opacity: 1, offset: 0.3 }, { transform: back, opacity: recorded ? 1 : 0 }], { duration: CLOSING + HANDING, easing: PORTAL });
    if (person) say(name, said, person, false);
    const closing = { duration: CLOSING, easing: "cubic-bezier(0.55, 0, 0.7, 0.2)" };
    edging.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in" });
    rim.animate([{ transform: "scale(1)", opacity: 0 }, { opacity: 0.9, offset: 0.65 }, { transform: "scale(0)", opacity: 0 }], closing);
    glow.animate([{ opacity: 0 }, { opacity: 0.8 }], closing);
    // Closed, it stays shut: its circle let go of, the app stood whole again for a moment before it went.
    door.animate([{ clipPath: circle(reach) }, { clipPath: circle(0) }], { ...closing, fill: "forwards" }).finished.then(() => (shut(), setTimeout(hide, HANDING)), () => {});
  }, [inPortal]);

  // Asked for before it's ready, the edge breathes and the recording's pointer says it's being taken over, until the
  // portal opens or it's called off.
  useLayoutEffect(() => {
    const [edging, yours, name, said] = [edge.current, hand.current, tag.current, words.current];
    if (!edging || !yours || !name || !said || waiting === taking.current) return;
    taking.current = waiting;
    if (waiting) {
      const recorded = theirs();
      if (recorded) Object.assign(yours.style, { transform: tip(recorded), opacity: "1" });
      name.hidden = false;
      say(name, said, waitingWords, false);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void (edging.style.opacity = "1");
      edging.animate([{ opacity: 0.25 }, { opacity: 1, boxShadow: BREATH }], { duration: 1000, easing: "ease-in-out", direction: "alternate", iterations: Infinity });
      return;
    }
    if (inPortal) return;
    edging.getAnimations().forEach((animation) => animation.cancel());
    Object.assign(edging.style, { opacity: "0" });
    Object.assign(yours.style, { opacity: "0" });
    name.hidden = true;
  }, [waiting]);
  // Known how long it will be, and more than a moment, the pointer counts down to it a second at a time, only the number
  // changing; if it isn't there when the count is done, it says it's taking over until it is.
  const due = waiting ? live?.due : undefined;
  useLayoutEffect(() => {
    const [name, said] = [tag.current, words.current];
    if (!due || !name || !said || due - Date.now() < COUNTED) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = 0;
    const tick = () => {
      const seconds = (due - Date.now()) / 1000;
      const left = shown ? Math.min(shown, Math.ceil(seconds)) : Math.ceil(seconds - 0.5);
      if (left === shown) return;
      if (left < 1) return void (clearInterval(ticking), say(name, said, waitingWords, false));
      const from = !shown && name.getBoundingClientRect().width;
      const number = document.createElement("span");
      number.className = "inline-block";
      number.textContent = String((shown = left));
      said.replaceChildren("Taking over in ", number, "…");
      if (still) return;
      if (from) name.animate([{ width: `${from}px` }, { width: `${name.getBoundingClientRect().width}px` }], { duration: 380, easing: PORTAL });
      number.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: PORTAL });
    };
    const ticking = setInterval(tick, 100);
    tick();
    return () => clearInterval(ticking);
  }, [due]);

  return (
    <div ref={room} className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-lg">
      {/* See-through rather than hidden until it's yours, as a hidden frame from another address never settles. */}
      {live?.address && (
        <div ref={app} data-live className="pointer-events-none absolute inset-0 overflow-hidden opacity-0">
          <div ref={sheen} className="pointer-events-none absolute inset-0 z-1 opacity-0 [background:radial-gradient(circle_at_var(--x)_var(--y),rgba(255,232,190,0.15),rgba(255,214,150,0.5))]" />
          <iframe
            ref={frame}
            key={live.address}
            src={live.address}
            title="The app, taken over"
            // As in a recording, a click there may copy, the app being yours.
            allow="clipboard-read; clipboard-write"
            className="absolute top-0 left-0 origin-top-left border-0 bg-paper"
            // Drawn at its own size and scaled as a picture is, as the recording is: scaled as it's drawn, its words are
            // set at one size and drawn at another, the spaces between them lost ("BrightStudio").
            style={{ width: screen.width, height: screen.height, transform: `scale(${k})`, willChange: "transform" }}
          />
        </div>
      )}
      <div ref={ring} className="pointer-events-none absolute top-0 left-0 rounded-full opacity-0 [border:2.5px_solid_rgba(236,178,72,0.95)] [box-shadow:0_0_40px_14px_rgba(226,170,70,0.38),inset_0_0_36px_10px_rgba(255,214,150,0.4)]" />
      <div ref={edge} className="pointer-events-none absolute inset-0 rounded-lg opacity-0 [box-shadow:inset_0_0_0_1.5px_rgba(217,162,58,0.75),inset_0_0_22px_rgba(217,162,58,0.16)]" />
      <div ref={hand} className="pointer-events-none absolute top-0 left-0 z-2 size-5 opacity-0 will-change-transform [&[data-yours]>svg]:invisible [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))]">
        <svg data-arrow viewBox="0 0 20 20" width="20" height="20" aria-hidden>
          <path d="M3 2l13 7.5-5.6 1.3L7.6 16z" fill="#FFFFFF" stroke="#1E2330" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        {/* Over words you can type into, in the app, the pointer is the text cursor, its middle where the arrow's tip is. */}
        <svg data-beam viewBox="0 0 20 20" style={{ display: "none" }} width="20" height="20" className="absolute -top-2 -left-[7px]" aria-hidden>
          <path d="M7 3.5h6M10 3.5v13M7 16.5h6" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M7 3.5h6M10 3.5v13M7 16.5h6" fill="none" stroke="#1E2330" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span ref={tag} hidden className={`${TAG} transition-[background-color,color] duration-300 ease-calm data-mine:bg-[#EDB654] data-mine:text-[#3B2A07] ${named ? "" : "hidden!"}`}>
          <span ref={words} />
        </span>
      </div>
    </div>
  );
}

// The pointer's shape: the arrow, or the text cursor over words you can type into.
export function shape(hand: HTMLElement, text: boolean) {
  hand.querySelector<SVGElement>("[data-arrow]")!.style.display = text ? "none" : "";
  hand.querySelector<SVGElement>("[data-beam]")!.style.display = text ? "" : "none";
}

// A name changes in place: its pill grows or shrinks to the new words as they come in, warm once they're yours.
export function say(tag: HTMLElement, words: HTMLElement, said: string, mine = true, gently = true) {
  const from = tag.getBoundingClientRect().width;
  words.textContent = said;
  if (mine) tag.dataset.mine = "";
  else delete tag.dataset.mine;
  if (!gently || !from) return;
  const to = tag.getBoundingClientRect().width;
  tag.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 380, easing: PORTAL });
  words.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { delay: 90, duration: 280, easing: PORTAL, fill: "backwards" });
}

// The name on a pointer, just below and right of its tip.
export const TAG = "absolute top-[17px] left-[13px] overflow-hidden rounded-full bg-[#2B2E35] px-[7px] font-ui text-[11px] leading-[17px] whitespace-nowrap text-white tabular-nums shadow-[0_1px_3px_rgba(0,0,0,0.25)]";

// Opening into the app takes a breath, after the agent's pointer has come to yours; leaving it is quicker, as stepping
// out is.
export const HANDING = 420;
// The edge at the top of a breath, while it waits: deeper than while you're in the app, to be seen over any page.
export const BREATH = "inset 0 0 0 3px rgba(236,170,50,1), inset 0 0 70px 6px rgba(226,160,50,0.55)";
export const OPENING = 1050;
export const CLOSING = 560;
export const PORTAL = "cubic-bezier(0.22, 0.8, 0.24, 1)";
// Taking over in less than this, there's no counting: it opens as soon as it would be read.
export const COUNTED = 1500;
