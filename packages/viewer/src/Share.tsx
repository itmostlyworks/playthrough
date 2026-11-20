// Share, top right of a moment's page: the change to someone else, by a link straight to this computer, for as long as
// it's on (share.ts). Pressed, its card opens under it, where it lives: what sharing does and the one step to take now,
// start, copy the link, or try again. A light before its word says whether the change is shared: green, breathing,
// while the link works; gray and still otherwise. Only the light changes. Only the person whose machine it is shares: a
// guest's page, or another page's, has no Share.

import { useEffect, useRef, useState } from "react";
import { source, type Shared } from "./api.ts";
import { copyText } from "./Changes.tsx";
import { SendButton, tick } from "./Send.tsx";

// What sharing does, the same words whatever it's doing, so nothing under them moves.
const DOES = "Anyone with the link can watch this change, leave notes, and take over to use your app as its moments do. It runs on this computer, for as long as it's on.";

// In the app, it rests, as Download video beside it does: closed and not to be pressed, and on a phone, where it stays in
// sight, quieter. Elsewhere the page around it takes it away.
export function Share({ change, rests }: { change: string; rests: boolean }) {
  const share = source.share;
  const [shared, setShared] = useState<Shared>({ is: "off" });
  const [open, setOpen] = useState(false);
  const own = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Asked as the page opens, and again while it's on its way, and now and then while it's on, as a link can stop working.
  useEffect(() => {
    if (!share) return;
    let current = true;
    const ask = () => void share.of(change).then((now) => current && setShared(now));
    if (shared.is === "off" || shared.is === "failed") {
      ask();
      return () => void (current = false);
    }
    const every = setInterval(ask, shared.is === "starting" ? 600 : 5000);
    return () => ((current = false), clearInterval(every));
  }, [change, shared.is]);
  // Closed by Escape or a press anywhere else, the keyboard back on Share.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => !own.current?.contains(event.target as Node) && setOpen(false);
    const escape = (event: KeyboardEvent) => event.key === "Escape" && (event.stopPropagation(), setOpen(false), button.current?.focus());
    addEventListener("pointerdown", away, { capture: true });
    addEventListener("keydown", escape, { capture: true });
    return () => (removeEventListener("pointerdown", away, { capture: true }), removeEventListener("keydown", escape, { capture: true }));
  }, [open]);
  useEffect(() => void (rests && setOpen(false)), [rests]);
  if (!share) return null;
  const start = () => (setShared({ is: "starting" }), void share.start(change).then(setShared));
  const stop = () => void share.stop(change).then(setShared);
  const on = shared.is === "on";
  return (
    <div ref={own} className="relative flex-none">
      <button
        ref={button}
        data-part="share"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={on ? "Share, sharing now" : undefined}
        disabled={rests}
        onClick={() => setOpen((now) => !now)}
        className={`-mr-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-[background-color,color,opacity] duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg disabled:cursor-default ${rests ? "phone:opacity-(--resting)" : ""}`}
      >
        {/* A light, not a note's dot: smaller, with no ring, and green, which no note ever is. Gray until there's a link. */}
        <i aria-hidden className={`size-1.5 flex-none rounded-full transition-colors duration-300 ease-calm ${on ? "animate-live bg-green" : "bg-faint"}`} />
        Share
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Share this change"
          className="absolute top-[calc(100%+8px)] -right-2 z-50 w-[340px] max-w-[calc(100vw-32px)] animate-arrive rounded-xl bg-surface p-4 shadow-float phone:right-0"
          style={{ animationDuration: "160ms" }}
        >
          <div className="flex h-5 items-center justify-between gap-3">
            <h2 className="text-[13px] font-medium text-fg">Share this change</h2>
            {on && (
              <button onClick={stop} className="-mr-2 rounded-md px-2 py-0.5 text-[12.5px] text-soft hover:bg-hover hover:text-fg">
                Stop sharing
              </button>
            )}
          </div>
          <p className={`mt-1.5 text-[13px] leading-5 text-pretty ${shared.is === "failed" ? "text-amber-ink" : "text-soft"}`}>{shared.is === "failed" ? shared.why : DOES}</p>
          <div className="mt-3 flex h-8 items-center justify-end gap-2">
            {on ? <Link link={shared.link} /> : <Start starting={shared.is === "starting"} again={shared.is === "failed"} onStart={start} />}
          </div>
        </div>
      )}
    </div>
  );
}

// The one button: start, or try again; while it's on its way, its words say so where they stand, at its size.
function Start({ starting, again, onStart }: { starting: boolean; again: boolean; onStart: () => void }) {
  return (
    <>
      {starting && <span className="mr-auto animate-arrive text-[12.5px] text-faint">This takes a few seconds.</span>}
      <SendButton filled onClick={onStart} disabled={starting} className="grid! place-items-center">
        <span className={`[grid-area:1/1] ${starting ? "invisible" : ""}`}>
          {again ? "Try again" : "Start sharing"}
        </span>
        <span className={`[grid-area:1/1] ${starting ? "" : "invisible"}`}>Getting a link…</span>
      </SendButton>
    </>
  );
}

// The link, whole on a press, and Copy, which says it copied in its own place for a moment, at its size.
function Link({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const shown = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(shown.current), []);
  const copy = async (pressed: HTMLElement) => {
    if (!(await copyText(link, pressed))) return;
    clearTimeout(shown.current);
    setCopied(true);
    shown.current = setTimeout(() => setCopied(false), 1400);
  };
  return (
    <>
      <input
        readOnly
        value={link}
        aria-label="Link"
        onFocus={(event) => event.currentTarget.select()}
        className="h-8 min-w-0 flex-1 animate-arrive truncate rounded-lg bg-ground px-2.5 text-[12.5px] text-fg shadow-[0_0_0_1px_var(--edge)] outline-none focus:shadow-[0_0_0_1.5px_var(--soft)]"
        style={{ animationDuration: "160ms" }}
      />
      <SendButton filled={false} onClick={() => void copy(document.activeElement as HTMLElement)} disabled={false} className="grid! place-items-center">
        <span className={`[grid-area:1/1] ${copied ? "invisible" : ""}`}>Copy</span>
        <span className={`flex items-center [grid-area:1/1] ${copied ? "" : "invisible"}`}>
          {tick}
          Copied
        </span>
      </SendButton>
    </>
  );
}
