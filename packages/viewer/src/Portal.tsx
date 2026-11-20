// Taking over, the app opens in its picture like a portal. Asked for before it's ready, the picture's edge breathes and
// the recording's pointer waits where it is. Once it's there, the recording's pointer comes to yours, wherever yours has
// gone meanwhile on the app and goes on the way, and the app opens from where they meet, a ring going out to the
// picture's edges; yours anywhere else, it opens from the recording's, which goes where it stands. Who you are there is
// the bar's to say. Given back, it closes on where your pointer was in the app, and the pointer goes back to where the
// recording has it; yours not in the app, the recording's comes back where it is.

import { flushSync } from "react-dom";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import type { Scrolled } from "./replay.ts";
import { pointerScale } from "./view.ts";

// The app's frame, as the page talks to it: what's posted to it, and what it says, its points in the recording's
// pixels as the picture is drawn now.
export type App = { post: (message: object) => void };
export type Heard = (said: any, at: (x: number, y: number) => { x: number; y: number }) => void;

type Props = {
  // The app: made ready unseen, being made ready while you wait, or yours.
  live?: { address?: string; shown: boolean; inApp: boolean };
  // The page the recording was made of, at its size.
  screen: { width: number; height: number };
  scrolled: () => Scrolled | undefined;
  // Where the recording draws its pointer, in the picture, if it does. The pointer here stands in for it from when
  // it's taken over until it's given back, and says so, so the recording's isn't drawn meanwhile: there's one
  // pointer, never one left where it was.
  theirs: () => { x: number; y: number } | undefined;
  onStandIn: (standing: boolean) => void;
  app?: Ref<App>;
  onHeard?: Heard;
};

export function Portal({ live, screen, scrolled, theirs, onStandIn, app: talk, onHeard }: Props) {
  const room = useRef<HTMLDivElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const sheen = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(0);
  useEffect(() => {
    // Drawn at its new size in the frame its picture's resized in, as the app takes the page and gives it back.
    const watching = new ResizeObserver(() => flushSync(() => setWide(room.current?.clientWidth ?? 0)));
    watching.observe(room.current!);
    return () => watching.disconnect();
  }, []);
  const k = wide / screen.width;
  const heard = useRef(onHeard);
  heard.current = onHeard;
  useImperativeHandle(talk, () => ({ post: (message) => iframe.current?.contentWindow?.postMessage(message, "*") }), []);
  const inPortal = !!live?.shown && live.inApp;
  const waiting = !!live?.shown && !inPortal;
  const open = useRef(false);
  const taking = useRef(false);
  // Where you last pointed, on the page, if it's still on it; and your hand in the app while you're there. The hand's
  // places are in the app's own pixels, and it's drawn over the app scaled as the app is, so as the picture grows or
  // shrinks around it, taking over and giving back, it stays on what it points at.
  const pointed = useRef<{ x: number; y: number }>(undefined);
  const yourHand = useRef<{ x: number; y: number }>(undefined);
  const inTheApp = (point: { x: number; y: number }) => ({ x: point.x / k, y: point.y / k });
  const tip = (point: { x: number; y: number }) => `translate(${point.x.toFixed(1)}px,${point.y.toFixed(1)}px)`;
  // As large as the recording's pointer is over the picture, so it doesn't change size as it comes into the app.
  const grown = pointerScale(k);
  // The recording's pointer, in the app, until it has come to yours: where it stands, and what follows once it's there.
  const theirHand = useRef<{ from: { x: number; y: number }; then: () => void; coming?: Animation }>(undefined);
  // Or, yours not on the app as it becomes yours, going where it stands; yours is your own as soon as it comes in.
  const theirsGoing = useRef<{ going: Animation; then: () => void }>(undefined);
  // On its way to yours, it's as far along from where it stood to where yours is now: homing in, wherever yours goes.
  const onItsWay = () => {
    const [yours, their, to] = [hand.current!, theirHand.current, yourHand.current];
    const along = their?.coming?.playState === "running" ? their.coming.effect?.getComputedTiming().progress : undefined;
    const still = their && to && along != null;
    yours.style.translate = still ? `${((their.from.x - to.x) * (1 - along)).toFixed(1)}px ${((their.from.y - to.y) * (1 - along)).toFixed(1)}px` : "";
    return still;
  };
  const homing = () => void (onItsWay() && requestAnimationFrame(homing));
  const come = () => {
    const their = theirHand.current!;
    // Held at its start until it starts: your pointer moving just as it's set off can be heard a moment before the
    // page's clock reaches its start, and it was then nowhere along, drawn on yours for a frame.
    their.coming = hand.current!.animate([], { duration: HANDING, easing: PORTAL, fill: "backwards" });
    their.coming.onfinish = () => {
      theirHand.current = undefined;
      onItsWay();
      their.then();
    };
    homing();
  };
  const handTo = (at: { x: number; y: number }, inside: boolean, text: boolean) => {
    const their = theirHand.current;
    // Yours not in the picture yet, the recording's waits where it is, and comes once yours is.
    if (their && !their.coming && !inside) return;
    const going = theirsGoing.current;
    if (going && !inside) return;
    if (going) {
      theirsGoing.current = undefined;
      going.going.cancel();
      going.then();
    }
    yourHand.current = at;
    Object.assign(hand.current!.style, { transform: tip(at), opacity: inside || their ? "1" : "0" });
    shape(hand.current!, text && !their);
    if (their && !their.coming) come();
    else if (their) onItsWay();
  };
  useEffect(() => {
    const aimed = (event: PointerEvent) => {
      pointed.current = { x: event.clientX, y: event.clientY };
      // In the app, outside the part it has opened so far, the hand still follows yours.
      const box = open.current && room.current?.getBoundingClientRect();
      if (!box) return;
      const at = { x: event.clientX - box.left, y: event.clientY - box.top };
      handTo(inTheApp(at), at.x >= 0 && at.y >= 0 && at.x <= box.width && at.y <= box.height, false);
    };
    // Gone out of the window, it's pointing at nothing here.
    const left = () => (pointed.current = undefined);
    // In the app, the hand goes where your pointer is, and leaves the picture with it. All else it says is the page's.
    const told = ({ data, source }: MessageEvent) => {
      if (!data?.playthrough || !iframe.current || source !== iframe.current.contentWindow) return;
      if (data.playthrough !== "pointer") return heard.current?.(data, (x, y) => ({ x: x * k, y: y * k }));
      if (open.current) handTo({ x: data.x, y: data.y }, data.inside, !!data.text);
    };
    addEventListener("pointermove", aimed, true);
    addEventListener("pointerdown", aimed, true);
    document.documentElement.addEventListener("pointerleave", left);
    addEventListener("message", told);
    return () => {
      removeEventListener("pointermove", aimed, true);
      removeEventListener("pointerdown", aimed, true);
      document.documentElement.removeEventListener("pointerleave", left);
      removeEventListener("message", told);
    };
  }, [k]);

  // Opening into the app, and closing it again.
  useLayoutEffect(() => {
    const [box, door, glow, rim, edging, yours] = [room.current, app.current, sheen.current, ring.current, edge.current, hand.current];
    if (!box || !rim || !edging || !yours || inPortal === open.current) return;
    // Gone from under it already, as the next moment is made ready, the app is closed: only what was drawn over it goes,
    // so the next one opens as the first did.
    if (!door || !glow) {
      open.current = false;
      onStandIn(false);
      edging.style.opacity = "0";
      yours.removeAttribute("data-yours");
      Object.assign(yours.style, { opacity: "0" });
      yourHand.current = undefined;
      return;
    }
    // Waited for, the edge is already glowing, and the opening carries on from there.
    const glowing = { opacity: getComputedStyle(edging).opacity, boxShadow: getComputedStyle(edging).boxShadow };
    for (const part of [door, glow, rim, edging, yours]) part.getAnimations().forEach((animation) => animation.cancel());
    theirHand.current = theirsGoing.current = undefined;
    yours.style.translate = door.style.clipPath = "";
    // Where you're pointing, and where the recording's pointer and the ring are: in the app's own pixels.
    const { left: x0, top: y0 } = box.getBoundingClientRect();
    const [width, height] = [screen.width, screen.height];
    const mine = pointed.current && inTheApp({ x: pointed.current.x - x0, y: pointed.current.y - y0 });
    const onIt = mine && mine.x >= 0 && mine.y >= 0 && mine.x <= width && mine.y <= height ? mine : undefined;
    const drawnAt = theirs();
    const recorded = drawnAt && inTheApp(drawnAt);
    const centre = { x: width / 2, y: height / 2 };
    // The ring and the glow set around a point, and the circle the app shows through, from nothing out to the picture's
    // farthest corner. The circle and the glow are the app's, drawn scaled as it is; the ring is the picture's.
    const around = (at: { x: number; y: number }) => {
      const reach = Math.max(...[[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => Math.hypot(x! - at.x, y! - at.y)));
      Object.assign(rim.style, { left: `${(at.x - reach) * k}px`, top: `${(at.y - reach) * k}px`, width: `${reach * 2 * k}px`, height: `${reach * 2 * k}px` });
      glow.style.setProperty("--x", `${at.x}px`);
      glow.style.setProperty("--y", `${at.y}px`);
      const circle = (r: number) => `circle(${r.toFixed(1)}px at ${at.x.toFixed(1)}px ${at.y.toFixed(1)}px)`;
      return [circle(0), circle(reach)];
    };
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    open.current = inPortal;
    door.toggleAttribute("data-yours", inPortal);
    // Once the recording's pointer has come to yours, the pointer is your own, with no drawn one trailing it.
    const real = (handed: boolean) => {
      yours.toggleAttribute("data-yours", handed);
      iframe.current?.contentWindow?.postMessage({ playthrough: "yours", yours: handed }, "*");
    };

    if (inPortal) {
      iframe.current?.contentWindow?.postMessage({ playthrough: "scroll", ...scrolled() }, "*");
      Object.assign(door.style, { opacity: "1", pointerEvents: "auto" });
      iframe.current?.focus();
      edging.style.opacity = "1";
      // Yours is on the app only where the app is what's under it: not over the bar across the picture's foot, nor
      // pointing nowhere, as before the mouse first moves, once it has left the window, or on a touch screen.
      const onTheApp = onIt && pointed.current && document.elementFromPoint(pointed.current.x, pointed.current.y) === iframe.current ? onIt : undefined;
      const at = onTheApp ?? recorded ?? centre;
      // The recording's pointer becomes yours: where your hand is.
      yourHand.current = onTheApp;
      Object.assign(yours.style, { transform: tip(at), opacity: "1" });
      onStandIn(true);
      if (still) return void real(true);
      const opening = (at: { x: number; y: number }) => {
        const [shut, whole] = around(at);
        const eased = { easing: PORTAL, fill: "backwards" as const };
        door.style.clipPath = "";
        door.animate([{ clipPath: shut }, { clipPath: whole }], { ...eased, duration: OPENING });
        glow.animate([{ opacity: 1 }, { opacity: 0 }], { ...eased, duration: OPENING + 240 });
        rim.animate([{ transform: "scale(0)", opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.85, offset: 0.7 }, { transform: "scale(1)", opacity: 0 }], { ...eased, duration: OPENING });
        edging.animate([glowing, { ...glowing, offset: 0.5 }, { opacity: 1, boxShadow: "inset 0 0 0 2px rgba(236,178,72,0.95), inset 0 0 40px rgba(255,214,150,0.45)", offset: 0.75 }, { opacity: 1 }], { ...eased, duration: OPENING + 500 });
      };
      // Yours on the app, the recording's comes to it and the portal opens from where they meet, wherever that turns
      // out to be. Yours anywhere else, it opens from the recording's, which goes where it stands: there's nothing of
      // yours for it to come to, and left there it would read as the agent's hands still on the app.
      const apart = recorded && (!onTheApp || Math.hypot(onTheApp.x - recorded.x, onTheApp.y - recorded.y) > 4 / k);
      if (apart && onTheApp) {
        door.style.clipPath = around(at)[0]!;
        theirHand.current = { from: recorded, then: () => (real(true), opening(yourHand.current ?? at)) };
        come();
      } else if (apart) {
        const going = yours.animate([{ opacity: 1 }, { opacity: 0 }], { duration: HANDING, easing: PORTAL });
        yours.style.opacity = "0";
        theirsGoing.current = { going, then: () => real(true) };
        going.onfinish = () => theirsGoing.current?.going === going && ((theirsGoing.current = undefined), real(true));
        opening(at);
      } else {
        if (!recorded) yours.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        real(true);
        opening(at);
      }
      return;
    }

    edging.style.opacity = "0";
    real(false);
    // The keyboard comes back with you: left in the app waiting underneath, S and every other key would go to it.
    if (document.activeElement === iframe.current) iframe.current?.blur();
    shape(yours, false);
    // Your hand, if it's in the app, goes back to where the recording has it; not there, the recording's comes back
    // where it is.
    const from = yours.style.opacity !== "0" ? yourHand.current : undefined;
    const at = from ?? recorded ?? centre;
    yourHand.current = undefined;
    door.style.pointerEvents = "none";
    const shut = () => (door.style.opacity = "0");
    const hide = () => ((yours.style.opacity = "0"), onStandIn(false));
    if (still) return void (shut(), hide());
    const [gone, whole] = around(at);
    const back = tip(recorded ?? at);
    // It rests where it's going, so once there it never shows where it was; and it goes in the very frame the recording's own
    // is drawn again, in its place.
    Object.assign(yours.style, { transform: back, opacity: recorded ? "1" : "0" });
    const returning = from
      ? [{ transform: tip(from), opacity: 1 }, { transform: tip(from), opacity: 1, offset: 0.3 }, { transform: back, opacity: recorded ? 1 : 0 }]
      : [{ transform: back, opacity: 0 }, { transform: back, opacity: recorded ? 1 : 0 }];
    yours.animate(returning, { duration: CLOSING + HANDING, easing: PORTAL }).finished.then(() => flushSync(hide), () => {});
    const closing = { duration: CLOSING, easing: "cubic-bezier(0.55, 0, 0.7, 0.2)" };
    edging.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in" });
    rim.animate([{ transform: "scale(1)", opacity: 0 }, { opacity: 0.9, offset: 0.65 }, { transform: "scale(0)", opacity: 0 }], closing);
    glow.animate([{ opacity: 0 }, { opacity: 0.8 }], closing);
    // Closed, it stays shut: its circle let go of, the app stood whole again for a moment before it went.
    door.animate([{ clipPath: whole }, { clipPath: gone }], { ...closing, fill: "forwards" }).finished.then(shut, () => {});
  }, [inPortal]);

  // Asked for before it's ready, the edge breathes and the recording's pointer waits where it is, until the portal opens
  // or it's called off.
  useLayoutEffect(() => {
    const [edging, yours] = [edge.current, hand.current];
    if (!edging || !yours || waiting === taking.current) return;
    taking.current = waiting;
    if (waiting) {
      const recorded = theirs();
      if (recorded) (Object.assign(yours.style, { transform: tip(inTheApp(recorded)), opacity: "1" }), onStandIn(true));
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void (edging.style.opacity = "1");
      edging.animate([{ opacity: 0.25 }, { opacity: 1, boxShadow: BREATH }], { duration: 1000, easing: "ease-in-out", direction: "alternate", iterations: Infinity });
      return;
    }
    if (inPortal) return;
    edging.getAnimations().forEach((animation) => animation.cancel());
    Object.assign(edging.style, { opacity: "0" });
    Object.assign(yours.style, { opacity: "0" });
    onStandIn(false);
  }, [waiting]);
  return (
    <div ref={room} className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-lg">
      {/* See-through rather than hidden until it's yours, as a hidden frame from another address never settles; and
          out of the keyboard's way till then, so Tab never walks an app nobody can see. */}
      {live?.address && (
        // The app, at its own size and scaled as a picture is, as the recording is, with what's drawn over it: scaled as
        // it's drawn, its words are set at one size and drawn at another, the spaces between them lost ("BrightStudio").
        <div
          ref={app}
          data-live
          inert={!inPortal}
          className="pointer-events-none absolute top-0 left-0 origin-top-left overflow-hidden opacity-0"
          style={{ width: screen.width, height: screen.height, transform: `scale(${k})`, willChange: "transform" }}
        >
          <div ref={sheen} className="pointer-events-none absolute inset-0 z-1 opacity-0 [background:radial-gradient(circle_at_var(--x)_var(--y),rgba(255,232,190,0.15),rgba(255,214,150,0.5))]" />
          <iframe
            ref={iframe}
            key={live.address}
            src={live.address}
            title="The app, taken over"
            // As in a recording, a click there may copy, the app being yours.
            allow="clipboard-read; clipboard-write"
            className="absolute inset-0 size-full border-0 bg-paper"
          />
        </div>
      )}
      <div ref={ring} className="pointer-events-none absolute top-0 left-0 rounded-full opacity-0 [border:2.5px_solid_rgba(236,178,72,0.95)] [box-shadow:0_0_40px_14px_rgba(226,170,70,0.38),inset_0_0_36px_10px_rgba(255,214,150,0.4)]" />
      <div ref={edge} className="pointer-events-none absolute inset-0 rounded-lg opacity-0 [box-shadow:inset_0_0_0_1.5px_rgba(217,162,58,0.75),inset_0_0_22px_rgba(217,162,58,0.16)]" />
      {/* The hand, over the app and scaled as it is, where it points in it; at the recording's pointer's size whatever the app's is. */}
      <div className="pointer-events-none absolute top-0 left-0 z-2 origin-top-left" style={{ width: screen.width, height: screen.height, transform: `scale(${k})` }}>
      <div ref={hand} className="absolute top-0 left-0 opacity-0 will-change-transform [&[data-yours]_svg]:invisible">
      <div className="relative size-5 origin-top-left [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.3))]" style={{ transform: `scale(${grown / (k || 1)}) translate(-3px, -2px)` }}>
        <svg data-arrow viewBox="0 0 20 20" width="20" height="20" aria-hidden>
          <path d="M3 2l13 7.5-5.6 1.3L7.6 16z" fill="#FFFFFF" stroke="#1E2330" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        {/* Over words you can type into, in the app, the pointer is the text cursor, its middle where the arrow's tip is. */}
        <svg data-beam viewBox="0 0 20 20" style={{ display: "none" }} width="20" height="20" className="absolute -top-2 -left-[7px]" aria-hidden>
          <path d="M7 3.5h6M10 3.5v13M7 16.5h6" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M7 3.5h6M10 3.5v13M7 16.5h6" fill="none" stroke="#1E2330" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
      </div>
      </div>
    </div>
  );
}

// The pointer's shape: the arrow, or the text cursor over words you can type into.
function shape(hand: HTMLElement, text: boolean) {
  hand.querySelector<SVGElement>("[data-arrow]")!.style.display = text ? "none" : "";
  hand.querySelector<SVGElement>("[data-beam]")!.style.display = text ? "" : "none";
}

// The name on a pointer, just below and right of its tip.
export const TAG = "absolute top-[17px] left-[13px] overflow-hidden rounded-full bg-[#2B2E35] px-[7px] font-ui text-[11px] leading-[17px] whitespace-nowrap text-white tabular-nums shadow-[0_1px_3px_rgba(0,0,0,0.25)]";

// Opening into the app takes a breath, after the agent's pointer has come to yours; leaving it is quicker, as stepping
// out is.
const HANDING = 420;
// The edge at the top of a breath, while it waits: deeper than while you're in the app, to be seen over any page.
const BREATH = "inset 0 0 0 3px rgba(236,170,50,1), inset 0 0 70px 6px rgba(226,160,50,0.55)";
const OPENING = 1050;
const CLOSING = 560;
const PORTAL = "cubic-bezier(0.22, 0.8, 0.24, 1)";
