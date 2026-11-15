// The top of every page, in three places: at the left what's waiting, the way to every other change; in the centre what
// this is; at the right what's next. The centre is the window's, as the recording and its bar under it are, whatever
// the sides hold. On a phone there's no room for a centre: what this is takes the room between.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePhone } from "./phone.ts";

export function Header({ opener, centre, children }: { opener: ReactNode; centre?: ReactNode; children?: ReactNode }) {
  return (
    <header className="grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 phone:flex phone:px-4">
      <div className="flex min-w-0 items-center phone:flex-none">{opener}</div>
      <div className="flex min-w-0 justify-center phone:flex-1 phone:justify-start">{centre}</div>
      <div className="flex min-w-0 items-center justify-end gap-3 phone:flex-none">{children}</div>
    </header>
  );
}

// The change's title, quietly, in the centre. Pointed at, or with the keyboard on it, what you asked comes under it in
// your own words, with where it's from and when it came back: what you judge by, at hand without being on the line.
export function Title({ title, asked, quiet }: { title: string; asked?: string; quiet: string }) {
  const phone = usePhone();
  const [shown, setShown] = useState(false);
  // A breath, so a pointer passing over the title shows nothing.
  const breath = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rest = () => (clearTimeout(breath.current), (breath.current = undefined));
  const show = (now: boolean) => (rest(), now ? setShown(true) : (breath.current = setTimeout(() => (rest(), setShown(true)), 70)));
  const hide = () => (rest(), setShown(false));
  useEffect(() => rest, []);
  if (phone) return <span className="min-w-0 truncate text-fg">{title}</span>;
  return (
    <div className="relative flex min-w-0 justify-center">
      <span
        tabIndex={0}
        aria-describedby="what-you-asked"
        onPointerMove={(event) => event.pointerType === "mouse" && !shown && !breath.current && show(false)}
        onPointerLeave={hide}
        onFocus={(event) => event.currentTarget.matches(":focus-visible") && show(true)}
        onBlur={hide}
        className="block max-w-[min(560px,40vw)] truncate rounded-md px-1 text-soft transition-colors duration-150 ease-calm hover:text-fg focus-visible:text-fg"
      >
        {title}
      </span>
      {shown && (
        <div
          id="what-you-asked"
          role="tooltip"
          className="pointer-events-none absolute top-[calc(100%+6px)] left-1/2 z-40 w-max max-w-[min(34em,calc(100vw-48px))] -translate-x-1/2 animate-arrive rounded-xl bg-surface px-4 py-3 shadow-float"
          style={{ animationDuration: "150ms" }}
        >
          {asked && <p className="text-[14px] leading-[22px] text-pretty text-fg">{asked}</p>}
          <p className={`text-[13px] leading-5 text-faint ${asked ? "mt-1.5" : ""}`}>{quiet}</p>
        </div>
      )}
    </div>
  );
}
