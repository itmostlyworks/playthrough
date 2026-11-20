// What you're watching as a video your browser downloads, at the top right of a moment's page. Pressed, it asks which
// where it is: this moment, as it's shown (beside how it was, with Compare on), or the whole change, its moments in
// order; a change of one moment has nothing to choose. Making one takes as long as the video, and the
// button says so where you pressed it: it counts down to the download a second at a time, filling as it goes, and ends
// on a tick, “Downloaded”. Only it redraws while it counts, and nothing in it moves: one box, as wide as its widest
// words, the arrow, the seconds and the tick in one slot before them, and the words always starting where they start.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Change, HandBack } from "@playthrough/change";
import { source, type AskedVideo } from "./api.ts";
import { usePhone } from "./phone.ts";
import { tick } from "./Send.tsx";

// Since you asked, and when it's due once that's known; then downloaded, or what went wrong.
type Making = { since: number; due?: number } | { downloaded: true } | { problems: string[] };

// A count shorter than this isn't worth counting.
const COUNTED = 1500;

// What it says, each in turn; all of them held in one place, so the button is as wide as the widest and never changes.
const WORDS = { rest: "Download video", making: "Downloading…", downloaded: "Downloaded", failed: "Didn’t work" } as const;

type Props = {
  change: Change;
  handBack: HandBack;
  // The moment you're on, by its place from 1.
  n: number;
  // How it's shown now: beside how it was, and where you've taken the window.
  asShown: () => Pick<AskedVideo, "beside" | "window">;
  // In the app, it rests: closed and not to be pressed, and on a phone, where it stays in sight, quieter.
  rests: boolean;
};

export function DownloadVideo({ change, handBack, n, asShown, rests }: Props) {
  const phone = usePhone();
  const [choosing, setChoosing] = useState(false);
  const [making, setMaking] = useState<Making>();
  const busy = !!making && "since" in making;
  const button = useRef<HTMLButtonElement>(null);
  const make = (whole: boolean) => {
    setChoosing(false);
    if (busy || !source.video) return;
    const moment = whole ? undefined : handBack.moments[n - 1];
    const shown = moment ? asShown() : {};
    const asked: AskedVideo = { handBack: handBack.number, moments: moment ? [n] : handBack.moments.map((_, i) => i + 1), ...shown, dark: matchMedia("(prefers-color-scheme: dark)").matches };
    const name = moment ? `${moment.name}${shown.beside ? ", now and when you last saw it" : ""}` : change.title;
    setMaking({ since: Date.now() });
    void source.video(change.id, asked, (left) => setMaking((now) => (now && "since" in now ? { ...now, due: Date.now() + left * 1000 } : now))).then((made) => {
      if (!Array.isArray(made)) save(made, `${name}.mp4`);
      const problems = Array.isArray(made) ? made : [];
      setMaking(problems.length ? { problems } : { downloaded: true });
      setTimeout(() => setMaking((now) => (now && !("since" in now) ? undefined : now)), problems.length ? 6000 : 2500);
    });
  };
  // One moment is nothing to choose between.
  const press = () => (handBack.moments.length === 1 ? make(true) : setChoosing((now) => !now));

  const left = useCount(busy ? (making as { due?: number }).due : undefined);
  const said: keyof typeof WORDS = !making ? "rest" : "downloaded" in making ? "downloaded" : "problems" in making ? "failed" : "making";
  // Before the words, in one slot: the arrow, the seconds left once they're worth counting, then the tick.
  const slot = said === "downloaded" ? "tick" : left ? "seconds" : "arrow";
  const shows = (here: boolean) => (here ? "" : "opacity-0");

  // Closed as the app becomes yours: the pair rests then.
  useEffect(() => void (rests && setChoosing(false)), [rests]);

  if (!source.video) return null;
  return (
    <div className="relative flex flex-none">
      <button
        ref={button}
        className={`relative flex items-center gap-1.5 overflow-hidden rounded-lg px-2 py-1 whitespace-nowrap phone:h-[27.5px] phone:w-8 phone:justify-center phone:px-0 text-soft transition-[background-color,color,opacity] duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg aria-busy:text-fg aria-expanded:bg-hover aria-expanded:text-fg disabled:cursor-default ${rests ? "phone:opacity-(--resting)" : ""}`}
        disabled={rests || busy}
        aria-busy={busy}
        aria-expanded={choosing}
        aria-haspopup={n !== undefined && handBack.moments.length > 1 ? "menu" : undefined}
        aria-label={slot === "seconds" ? `Downloading, ${left} ${left === 1 ? "second" : "seconds"} left` : WORDS[said]}
        title={making && "problems" in making ? making.problems.join(" ") : undefined}
        onClick={press}
      >
        <Fill making={making} />
        <span aria-hidden className="relative grid size-3.5 flex-none place-items-center *:[grid-area:1/1] *:transition-opacity *:duration-150 *:ease-calm [&_svg]:mr-0">
          <svg viewBox="0 0 16 16" className={`size-3.5 ${shows(slot === "arrow")}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2.5v7.5M4.75 7l3.25 3.25L11.25 7M3 13h10" />
          </svg>
          {/* Each second comes in where the last stood, at the width every digit has, centred on the slot without
              widening it, so 10 or more takes no room from the words. */}
          <span className={`absolute top-1/2 left-1/2 -translate-1/2 text-[12px] leading-none tabular-nums ${shows(slot === "seconds")}`}>
            <span key={left} className="block animate-arrive" style={{ animationDuration: "200ms" }}>
              {left}
            </span>
          </span>
          <span className={`flex ${shows(slot === "tick")}`}>{tick}</span>
        </span>
        {!phone && (
          <span aria-hidden className="relative grid justify-items-start *:[grid-area:1/1] *:transition-opacity *:duration-150 *:ease-calm">
            {Object.entries(WORDS).map(([is, words]) => (
              <span key={is} className={shows(is === said)}>
                {words}
              </span>
            ))}
          </span>
        )}
      </button>
      {choosing && <Choices count={handBack.moments.length} comparing={!!asShown().beside} onChoose={make} onClose={() => (setChoosing(false), button.current?.focus())} button={button} />}
    </div>
  );
}

// Hanging from the button, its right edge on the button's: this moment, or the whole change. Escape or a press beside it
// closes it; it keeps the keys pressed in it to itself, so Space presses a choice rather than playing the moment.
function Choices({ count, comparing, onChoose, onClose, button }: { count: number; comparing: boolean; onChoose: (whole: boolean) => void; onClose: () => void; button: RefObject<HTMLButtonElement | null> }) {
  const own = useRef<HTMLDivElement>(null);
  useEffect(() => {
    own.current?.querySelector("button")?.focus();
    const away = (event: PointerEvent) => !own.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node) && onClose();
    addEventListener("pointerdown", away, { capture: true });
    return () => removeEventListener("pointerdown", away, { capture: true });
  }, []);
  const choice = "flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left whitespace-nowrap text-fg hover:bg-hover focus-visible:bg-hover";
  return (
    <div
      ref={own}
      role="menu"
      aria-label="Download video"
      className="absolute top-[calc(100%+8px)] right-0 z-40 flex min-w-[220px] animate-arrive flex-col rounded-xl bg-surface p-1 shadow-float"
      style={{ animationDuration: "160ms" }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") return onClose();
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const choices = [...own.current!.querySelectorAll("button")];
        const by = event.key === "ArrowDown" ? 1 : choices.length - 1;
        choices[(choices.indexOf(document.activeElement as HTMLButtonElement) + by) % choices.length]?.focus();
      }}
    >
      <button role="menuitem" className={choice} onClick={() => onChoose(false)}>
        This moment
        {comparing && <span className="text-soft">with Compare</span>}
      </button>
      <button role="menuitem" className={choice} onClick={() => onChoose(true)}>
        The whole change
        <span className="text-soft">{count} moments</span>
      </button>
    </div>
  );
}

// Handed to the browser as a file of its own, as a link that downloads it would.
function save(video: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(video);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// The seconds left, a whole one at a time, the first shown for at least half of one, only ever going down and staying
// on 1 until it's downloaded, so the arrow never comes back between the count and the tick; nothing when it isn't worth
// counting.
function useCount(due: number | undefined): number | undefined {
  const [shown, setShown] = useState<number>();
  useEffect(() => {
    if (!due) return setShown(undefined);
    const count = () =>
      setShown((shown) => {
        const seconds = (due - Date.now()) / 1000;
        if (!shown && seconds * 1000 < COUNTED) return undefined;
        const left = shown ? Math.min(shown, Math.ceil(seconds)) : Math.ceil(seconds - 0.5);
        return Math.max(left, 1);
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
