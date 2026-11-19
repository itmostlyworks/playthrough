// The top of every page, its two corners: at the left Playthrough and what's waiting in it, the way to every other
// change; at the right what to do with this one: Next on its opening card, Download video and Share on its moments. Between them, nothing:
// what this is stands on the recording's top, where it's looked at. On a phone there's no room over the recording for it: the change's title takes the room between.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { shownByAnotherPage } from "./api.ts";
import { usePhone } from "./phone.ts";

// The header's height, and the gap between the title and what you asked.
const HEADER = 48;
const GAP = 6;

// Shown by another page, a change is shown on its own: nothing of the list of changes, and that page says what the
// change is, so no header at all.
export function Header({ opener, centre, children }: { opener: ReactNode; centre?: ReactNode; children?: ReactNode }) {
  if (shownByAnotherPage()) return null;
  return (
    // Never wider than the page: a title that can't wrap would otherwise widen it, on a phone, past the screen's edge,
    // and take Send's words and every note card's foot out of sight with it.
    <header className="grid h-12 min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 phone:flex phone:px-4">
      <div className="flex min-w-0 items-center phone:flex-none">{opener}</div>
      <div className="flex min-w-0 justify-center phone:flex-1 phone:justify-start">{centre}</div>
      <div className="flex min-w-0 items-center justify-end gap-3 phone:flex-none">{children}</div>
    </header>
  );
}

// A page's rows, the header's and the room under it: shown by another page, with no header, the room alone.
export const headerRows = () => (shownByAnotherPage() ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]");

// The change's title, quietly, over the moment's own line on the recording's top: what this is a moment of, with what
// it is, in one place. (On a phone, in the header's room between.) Pointed at, or with the keyboard on it, what you
// asked comes by it in your own words, with where it's from and when it came back: what you judge by, at hand without
// being on the line. That comes up over the title where it fits under the header, so it covers nothing of the moment;
// where it's too long for that, or the window too short, under it.
export function Title({ title, asked, quiet }: { title: string; asked?: string; quiet: string }) {
  const phone = usePhone();
  const [shown, setShown] = useState(false);
  const [place, setPlace] = useState<"over" | "under">();
  const own = useRef<HTMLSpanElement>(null);
  const said = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!shown) return setPlace(undefined);
    const [top, height] = [own.current?.getBoundingClientRect().top ?? 0, said.current?.offsetHeight ?? 0];
    setPlace(top - GAP - height >= HEADER ? "over" : "under");
  }, [shown]);
  // A breath, so a pointer passing over the title shows nothing.
  const breath = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rest = () => (clearTimeout(breath.current), (breath.current = undefined));
  const show = (now: boolean) => (rest(), now ? setShown(true) : (breath.current = setTimeout(() => (rest(), setShown(true)), 70)));
  const hide = () => (rest(), setShown(false));
  useEffect(() => rest, []);
  if (phone) return <span data-part="title" className="min-w-0 truncate text-fg">{title}</span>;
  return (
    <div data-part="title" className="relative flex min-w-0 max-w-full justify-center">
      <span
        ref={own}
        tabIndex={0}
        aria-describedby="what-you-asked"
        onPointerMove={(event) => event.pointerType === "mouse" && !shown && !breath.current && show(false)}
        onPointerLeave={hide}
        onFocus={(event) => event.currentTarget.matches(":focus-visible") && show(true)}
        onBlur={hide}
        className="block max-w-full truncate rounded-md px-1 text-[13px] leading-[22px] text-soft transition-colors duration-150 ease-calm hover:text-fg focus-visible:text-fg"
      >
        {title}
      </span>
      {shown && (
        <div
          id="what-you-asked"
          role="tooltip"
          ref={said}
          className={`pointer-events-none absolute left-1/2 z-40 w-max max-w-[min(34em,calc(100vw-48px))] -translate-x-1/2 rounded-xl bg-surface px-4 py-3 shadow-float ${place === "over" ? "bottom-[calc(100%+6px)] animate-arrive" : place ? "top-[calc(100%+6px)] animate-arrive" : "invisible"}`}
          style={{ animationDuration: "150ms" }}
        >
          {asked && <p className="text-[14px] leading-[22px] text-pretty text-fg">{asked}</p>}
          <p className={`text-[13px] leading-5 text-faint ${asked ? "mt-1.5" : ""}`}>{quiet}</p>
        </div>
      )}
    </div>
  );
}
