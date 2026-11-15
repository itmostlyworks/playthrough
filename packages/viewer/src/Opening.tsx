// A change's opening card, the page / opens on: what it is and what you asked, over the first moment you haven't seen,
// softened, so you know what you're judging before you judge it. And with nothing waiting on you, that said calmly.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { latestOf, type Moment } from "@playthrough/change";
import { picture, readings as readingsOf, type Listed } from "./api.ts";
import { TellYours } from "./Changes.tsx";
import { Header } from "./Header.tsx";
import { Key } from "./Key.tsx";
import { SIDE, UNDER } from "./Moment.tsx";
import { usePhone } from "./phone.ts";
import { SAID, SendButton, take, tick } from "./Send.tsx";
import { ago, toSend } from "./standing.ts";
import { backAgain, firstUnseen, lookOf, sectionOf, stepOf, unreadOf, unseenOf } from "./step.ts";

type Go = (to: { change: string; moment: number }) => void;

// A change's opening card: what it is and what you asked, over the first moment you haven't seen, softened, its picture
// where the moment's recording will be. Nothing plays. The whole card is one press, as its look says on hover: it, Space, ↓ or Next go in, to the first moment with
// something you haven't seen, else the first. Seen all through, its step is the change's own, Done or Send.
export function Opening({ listed, you, opener, go, onTaking, goOn }: { listed: Listed; you: string; opener: ReactNode; go: Go; onTaking: () => void; goOn: () => void }) {
  const { change } = listed;
  const handBack = latestOf(change)!;
  const to = firstUnseen(listed, you);
  const moment = handBack.moments[to.moment - 1]!;
  const look = lookOf(listed, you);
  const seenThrough = !unseenOf(listed, you).length && !unreadOf(listed, you).length;
  const phone = usePhone();
  const [screen, setScreen] = useState<{ width: number; height: number }>();
  useEffect(() => {
    let current = true;
    readingsOf(change.id, handBack.number, moment.recording).then((read) => current && setScreen(read.at(-1)?.screen ?? { width: 1280, height: 800 }));
    return () => void (current = false);
  }, [moment.recording]);
  const enter = () => go({ change: change.id, moment: to.moment });
  const keys = useRef(enter);
  keys.current = enter;
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea"))) return;
      if (/^( |arrowdown|j)$/i.test(event.key) && !event.repeat) (event.preventDefault(), keys.current());
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);
  const words = (
    <div className="flex max-w-[34em] flex-col items-center text-center phone:items-start phone:text-left">
      <h1 className="text-[22px] leading-[30px] font-semibold text-balance text-fg phone:text-[19px] phone:leading-[26px]">{change.title}</h1>
      {change.asked && <p className="mt-3 text-[16px] leading-[25px] text-pretty text-soft phone:text-[15px] phone:leading-[23px]">{change.asked}</p>}
      <p className="mt-4 text-[13px] leading-5 text-faint">
        {listed.app} · {backAgain(listed.change, you) ? "back again" : "back"} {ago(handBack.finished!, Date.now())}
        {seenThrough && ` · ${look.toLowerCase()}`}
      </p>
      <div className="mt-6">
        {seenThrough ? (
          <StepHere listed={listed} you={you} onTaking={onTaking} goOn={goOn} />
        ) : (
          // Pressed with the card: the card's hover is its hover, so the whole card reads as this one button.
          <span className="flex h-9 items-center gap-2 rounded-lg bg-surface px-3.5 text-[14px] font-medium text-fg shadow-[0_0_0_1px_var(--edge),0_1px_2px_var(--drop)] transition-colors duration-150 ease-calm group-hover:bg-hover">
            {look}
            <Key>Space</Key>
          </span>
        )}
      </div>
    </div>
  );
  // The whole card is pressed to go in; Done or Send on it is a button of its own over it.
  const card = "group cursor-pointer [&_button]:cursor-auto";
  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-clip bg-ground phone:grid-rows-[auto_minmax(0,1fr)]">
      <Header opener={opener}>
        <button onClick={enter} className="-mr-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg">
          Next
          <Key>↓</Key>
        </button>
      </Header>
      {/* Where a moment's page says who and where: room kept, so the picture is where the recording will be. */}
      <div className="h-[44px] phone:hidden" />
      {phone ? (
        <div onClick={enter} className={`flex flex-col gap-6 px-4 pt-4 ${card}`}>
          {words}
          <Softened listed={listed} moment={moment} screen={screen} fill={false} />
        </div>
      ) : (
        <div className="relative mt-2 grid min-h-0 place-items-center [container-type:size]">
          <div
            onClick={enter}
            className={`relative ${card}`}
            style={{
              aspectRatio: screen ? `${screen.width} / ${screen.height}` : "16 / 10",
              width: `min(calc(100cqw - 2 * ${SIDE}), calc((100cqh - ${UNDER}px) * ${screen ? screen.width / screen.height : 1.6}))`,
              marginBottom: UNDER,
            }}
          >
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

// Nothing waiting on you: said calmly, with what your agents are still on.
export function NothingWaiting({ changes, you, opener }: { changes: Listed[]; you: string; opener: ReactNode }) {
  const on = changes.filter((one) => sectionOf(one, you) === "agents");
  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] bg-ground">
      <Header opener={opener} />
      <div className="grid animate-arrive place-items-center px-6 pb-24">
        <div className="w-full max-w-[420px]">
          <p className="text-[17px] leading-[26px] text-fg">Nothing's waiting on you.</p>
          {on.length > 0 ? (
            <>
              <p className="mt-1 text-[15px] leading-[22px] text-soft">Your agents are on:</p>
              <ul className="mt-3">
                {on.map((one) => {
                  const step = stepOf(one, you);
                  const tell = step.is === "with" && step.tell;
                  return (
                    <li key={one.change.id} className="flex flex-wrap items-baseline gap-x-3 py-1 text-[14px] leading-[22px]">
                      <span className="min-w-0 flex-1 truncate text-fg">{one.change.title}</span>
                      <span className={`flex-none text-[13px] ${tell ? "text-amber-ink" : "text-soft"}`}>{"words" in step ? step.words : ""}</span>
                      {tell && <TellYours words={tell} />}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            !changes.length && <p className="mt-1 text-[15px] leading-[22px] text-soft">To see an agent's work here, tell it: “Show me this change with npx playthrough.”</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Everything seen already, the card offers the step left, as the last moment does: Send, or Done.
function StepHere({ listed, you, onTaking, goOn }: { listed: Listed; you: string; onTaking: () => void; goOn: () => void }) {
  const step = stepOf(listed, you);
  const [said, setSaid] = useState<"sending" | "Sent" | "Done" | string[]>();
  const press = async () => {
    if (said === "sending" || said === "Sent" || said === "Done") return;
    const what = step.is === "send" ? "send" : "done";
    onTaking();
    setSaid("sending");
    const problems = await take(listed.change, you, what);
    if (problems.length) return setSaid(problems);
    setSaid(what === "send" ? "Sent" : "Done");
    setTimeout(goOn, matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : SAID);
  };
  return (
    // Its own press, not the card's under it.
    <span data-goes-on className="flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
      <SendButton className="h-9 px-3.5 text-[14px]" filled={step.is === "send" && said !== "Sent"} onClick={() => void press()} disabled={said === "sending" || said === "Sent" || said === "Done"}>
        {said === "Sent" || said === "Done" ? <>{tick}{said}</> : step.is === "send" ? `Send ${toSend(step.notes, step.replies)}` : "Done"}
      </SendButton>
      {Array.isArray(said) && <span className="text-[13px] text-amber-ink">Not sent: {said[0]}</span>}
    </span>
  );
}
