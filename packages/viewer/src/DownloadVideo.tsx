// The flow you're in, as it's shown, as a video your browser downloads. Making one takes a while, and the button says so
// where you pressed it, as taking over does: it counts down to the download a second at a time, filling as it goes, and
// ends on a tick, “Downloaded”. Only it redraws while it counts.

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { downloadVideo } from "./api.ts";
import { Key, tick } from "./Card.tsx";

// What to film, as the page is now: nothing where there's no flow to film.
export type Asked = { review: string; filmed: { round: number; flow: string; beside?: number; dark: boolean }; name: string };
// Since you asked, and when it's due once that's known; then downloaded, or what went wrong.
type Making = { since: number; due?: number } | { downloaded: true } | { problems: string[] };

// A count shorter than this isn't worth counting.
const COUNTED = 1500;
const GROW = "cubic-bezier(0.22, 0.8, 0.24, 1)";

type Props = { asked: () => Asked | undefined; shown: boolean; resting: boolean; ref: Ref<{ start: () => void }> };

export function DownloadVideo({ asked, shown, resting, ref }: Props) {
  const [making, setMaking] = useState<Making>();
  const busy = !!making && "since" in making;
  const start = () => {
    const what = asked();
    if (busy || !what) return;
    setMaking({ since: Date.now() });
    void downloadVideo(what.review, what.filmed, what.name, (left) => setMaking((now) => (now && "since" in now ? { ...now, due: Date.now() + left * 1000 } : now))).then((problems) => {
      setMaking(problems.length ? { problems } : { downloaded: true });
      setTimeout(() => setMaking((now) => (now && !("since" in now) ? undefined : now)), problems.length ? 6000 : 2500);
    });
  };
  useImperativeHandle(ref, () => ({ start }));

  const left = useCount(busy ? (making as { due?: number }).due : undefined);
  const words = !making
    ? "Download video"
    : "downloaded" in making
      ? "Downloaded"
      : "problems" in making
        ? "Couldn’t make the video"
        : left
          ? <>Downloading in <Rising key={left}>{left}</Rising>…</>
          : "Downloading…";

  // The button grows and shrinks to its words, from its right edge, rather than jumping.
  const button = useRef<HTMLButtonElement>(null);
  const width = useRef(0);
  useLayoutEffect(() => {
    const now = button.current!.getBoundingClientRect().width;
    if (width.current && Math.abs(width.current - now) > 0.5 && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      button.current!.animate([{ width: `${width.current}px` }, { width: `${now}px` }], { duration: 380, easing: GROW });
    width.current = now;
  });

  return (
    <button
      ref={button}
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-2.5 py-1.5 whitespace-nowrap text-soft transition-[background-color,color,opacity] duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default aria-busy:text-fg ${shown ? "" : "invisible opacity-0"} ${resting ? "opacity-32" : ""}`}
      disabled={!shown || resting}
      aria-busy={busy}
      title={making && "problems" in making ? making.problems.join(" ") : "The flow as it's shown, as an MP4"}
      onClick={start}
    >
      <Fill making={making} />
      {making && "downloaded" in making ? (
        tick
      ) : (
        <svg viewBox="0 0 16 16" className="relative size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 2.5v7.5M4.75 7l3.25 3.25L11.25 7M3 13h10" />
        </svg>
      )}
      <span className="relative tabular-nums">{words}</span>
      <Key className="relative ml-1">V</Key>
    </button>
  );
}

// The seconds left, a whole one at a time, the first shown for at least half of one, only ever going down; nothing once
// the count is done or not worth counting.
function useCount(due: number | undefined): number | undefined {
  const [shown, setShown] = useState<number>();
  useEffect(() => {
    if (!due) return setShown(undefined);
    const count = () =>
      setShown((shown) => {
        const seconds = (due - Date.now()) / 1000;
        if (!shown && seconds * 1000 < COUNTED) return undefined;
        const left = shown ? Math.min(shown, Math.ceil(seconds)) : Math.ceil(seconds - 0.5);
        return left < 1 ? undefined : left;
      });
    count();
    const counting = setInterval(count, 100);
    return () => clearInterval(counting);
  }, [due]);
  return shown;
}

// Behind the words, how far it's got, by the time it's had and the time it has left; full once it's downloaded, then gone.
function Fill({ making }: { making?: Making }) {
  const fill = useRef<HTMLSpanElement>(null);
  const reached = useRef(0);
  useEffect(() => {
    const shown = fill.current!;
    if (!making || "problems" in making) return void ((reached.current = 0), (shown.style.transform = "scaleX(0)"));
    if ("downloaded" in making) return void (shown.style.transform = "scaleX(1)");
    let frame = 0;
    const grow = () => {
      if (making.due) reached.current = Math.max(reached.current, Math.min(1, (Date.now() - making.since) / (making.due - making.since)));
      shown.style.transform = `scaleX(${reached.current.toFixed(4)})`;
      frame = requestAnimationFrame(grow);
    };
    grow();
    return () => cancelAnimationFrame(frame);
  }, [making]);
  const busy = !!making && "since" in making;
  // Downloaded, it fills the rest quickly and stands full a beat before it goes.
  const downloaded = !!making && "downloaded" in making;
  return (
    <span
      ref={fill}
      aria-hidden
      className={`absolute inset-0 origin-left bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] ${busy ? "opacity-100" : "opacity-0"} ${downloaded ? "[transition:transform_200ms_var(--ease-calm),opacity_500ms_var(--ease-calm)_700ms]" : "transition-opacity duration-500 ease-calm"}`}
      style={{ transform: "scaleX(0)" }}
    />
  );
}

// A number rises into place as it changes.
function Rising({ children }: { children: number }) {
  const number = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      number.current!.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: GROW });
  }, []);
  return (
    <span ref={number} className="inline-block">
      {children}
    </span>
  );
}
