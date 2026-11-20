// A change's card: the page / opens on, what it is and what you asked, over the first moment you haven't seen, softened,
// so you know what you're judging before you judge it. With nothing waiting on you, that said calmly.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { latestOf, type Moment } from "@playthrough/change";
import { picture, readings as readingsOf, type Listed } from "./api.ts";
import { TellYours } from "./Changes.tsx";
import { Header, headerRows } from "./Header.tsx";
import { Key } from "./Key.tsx";
import { inItsRoom } from "./Moment.tsx";
import type { Go } from "./Moments.tsx";
import { usePhone } from "./phone.ts";
import { ago } from "./standing.ts";
import { backAgain, firstUnseen, lookOf, sectionOf, stepOf } from "./step.ts";

// A change's card, over the first moment you haven't seen; the whole card is one press, as its look says on hover: it,
// Space, ↓ or Next go in, to that moment. (Seen all through, there's nothing left to open: / goes straight to its last
// moment, where the step left is.)
export function Opening(props: { listed: Listed; you: string; opener: ReactNode; go: Go }) {
  const { listed, you, opener, go } = props;
  const { change } = listed;
  const handBack = latestOf(change)!;
  const to = firstUnseen(listed, you);
  const moment = handBack.moments[to.moment - 1]!;
  const look = lookOf(listed, you);
  const phone = usePhone();
  const [screen, setScreen] = useState<{ width: number; height: number }>();
  useEffect(() => {
    let current = true;
    readingsOf(change.id, handBack.number, moment.recording).then((read) => current && setScreen(read.at(-1)?.screen ?? { width: 1280, height: 800 }));
    return () => void (current = false);
  }, [moment.recording]);
  const enter = () => go({ change: change.id, moment: to.moment });
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea"))) return;
    if (!/^( |arrowdown|j)$/.test(event.key.toLowerCase())) return;
    event.preventDefault();
    enter();
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current(event);
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);
  const words = (
    <div className="flex max-w-[34em] flex-col items-center text-center phone:items-start phone:text-left">
      <h1 className="text-[22px] leading-[30px] font-semibold text-balance text-fg phone:text-[19px] phone:leading-[26px]">{change.title}</h1>
      {change.asked && <p className="mt-3 text-[16px] leading-[25px] text-pretty text-soft phone:text-[15px] phone:leading-[23px]">{change.asked}</p>}
      <p className="mt-4 text-[13px] leading-5 text-faint">
        {listed.app} · {backAgain(listed.change, you) ? "back again" : "back"} {ago(handBack.finished!, Date.now())}
      </p>
      <div className="mt-6">
        {/* Pressed with the card: the card's hover is its hover, so the whole card reads as this one button. */}
        <span className="flex h-9 items-center gap-2 rounded-lg bg-surface px-3.5 text-[14px] font-medium text-fg shadow-[0_0_0_1px_var(--edge),0_1px_2px_var(--drop)] transition-colors duration-150 ease-calm group-hover:bg-hover">
          {look}
          <Key>Space</Key>
        </span>
      </div>
    </div>
  );
  return (
    <div className={`grid h-dvh ${headerRows()} overflow-clip bg-ground`}>
      <Header opener={opener}>
        <button
          onClick={enter}
          className="-mr-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg"
        >
          Next
          <Key>↓</Key>
        </button>
      </Header>
      {phone ? (
        <div onClick={enter} className="group flex cursor-pointer flex-col gap-6 px-4 pt-4">
          {words}
          <Softened listed={listed} moment={moment} screen={screen} fill={false} />
        </div>
      ) : (
        // The picture is where the recording will be, in the same room.
        <div className="relative grid min-h-0 place-items-center [container-type:size]">
          <div onClick={enter} className="group relative cursor-pointer" style={{ aspectRatio: screen ? `${screen.width} / ${screen.height}` : "16 / 10", ...inItsRoom(screen ? screen.width / screen.height : 1.6) }}>
            <Softened listed={listed} moment={moment} screen={screen} fill />
            <div className="absolute inset-0 grid place-items-center p-10">{words}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// The moment's picture at its end, as its page will show it at rest, softened under the card's words: filling the
// recording's place beside the edges, or on a phone at its own shape under them. Pointed at with the card, it clears a
// little, as what you'll see next.
function Softened({ listed, moment, screen, fill }: { listed: Listed; moment: Moment; screen?: { width: number; height: number }; fill: boolean }) {
  const handBack = latestOf(listed.change)!;
  return (
    <div className={`overflow-hidden rounded-lg bg-paper shadow-frame ${fill ? "absolute inset-0" : "relative w-full"}`} style={fill ? undefined : { aspectRatio: screen ? `${screen.width} / ${screen.height}` : "1.6" }}>
      <img src={picture(listed.change.id, handBack.number, moment.recording, 0)} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain blur-[3px]" />
      <div
        className={`absolute inset-0 transition-[background-color] duration-200 ease-calm ${fill ? "bg-[color-mix(in_srgb,var(--ground)_84%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--ground)_78%,transparent)]" : "bg-[color-mix(in_srgb,var(--ground)_40%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--ground)_28%,transparent)]"}`}
      />
    </div>
  );
}

// Nothing waiting on you: said calmly, with what your agents are still on, and apart, what no agent is listening for,
// so "Your agents are on" is never said over a change nobody is on. Its first line stays where it is as a change goes
// from one to the other when an agent arrives: what's under it grows and shrinks downwards.
export function NothingWaiting({ changes, you, opener }: { changes: Listed[]; you: string; opener: ReactNode }) {
  const steps = changes.filter((one) => sectionOf(one, you) === "agents").map((one) => ({ one, step: stepOf(one, you) }));
  const on = steps.filter(({ step }) => !(step.is === "with" && step.tell));
  const unheard = steps.flatMap(({ one, step }) => (step.is === "with" && step.tell ? [{ one, tell: step.tell }] : []));
  return (
    <div className={`grid h-dvh ${headerRows()} bg-ground`}>
      <Header opener={opener} />
      <div className="grid animate-arrive content-start justify-items-center overflow-y-auto px-6 pt-[30dvh] pb-12">
        <div className="w-full max-w-[420px]">
          <p className="text-[17px] leading-[26px] text-fg">Nothing's waiting on you.</p>
          {on.length > 0 && (
            <>
              <p className="mt-1 text-[15px] leading-[22px] text-soft">Your agents are on:</p>
              <ul className="mt-3">
                {on.map(({ one, step }) => (
                  <li key={one.change.id} className="flex items-baseline gap-x-3 py-1 text-[14px] leading-[22px]">
                    <span className="min-w-0 flex-1 truncate text-fg">{one.change.title}</span>
                    <span className="flex-none text-[13px] text-soft">{"words" in step ? step.words : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {unheard.length > 0 && (
            <>
              <p className={`${on.length ? "mt-5" : "mt-1"} text-[15px] leading-[22px] text-amber-ink`}>No agent listening:</p>
              <ul className="mt-3">
                {unheard.map(({ one, tell }) => (
                  <li key={one.change.id} className="py-1 text-[14px] leading-[22px]">
                    <p className="truncate text-fg">{one.change.title}</p>
                    <TellYours words={tell} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {!changes.length && <p className="mt-1 text-[15px] leading-[22px] text-soft">To see an agent's work here, tell it: “When you're done, show me with npx playthrough.”</p>}
        </div>
      </div>
    </div>
  );
}
