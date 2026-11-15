// A change's card: the page / opens on, what it is and what you asked, over the first moment you haven't seen, softened,
// so you know what you're judging before you judge it; and after its last moment, the same card holding the one step
// left for it. With nothing waiting on you, that said calmly.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { latestOf, standingOf, type Moment } from "@playthrough/change";
import { picture, readings as readingsOf, type Listed } from "./api.ts";
import { TellYours } from "./Changes.tsx";
import { Header } from "./Header.tsx";
import { Key } from "./Key.tsx";
import { inItsRoom } from "./Moment.tsx";
import type { Go } from "./Moments.tsx";
import { usePhone } from "./phone.ts";
import { FILLED_KEY, SAID, SendButton, Taken, take, tick } from "./Send.tsx";
import { ago, toSend } from "./standing.ts";
import { backAgain, firstUnseen, lookOf, sectionOf, stepOf, unreadOf, unseenOf } from "./step.ts";

// A change's card. Before you've seen it through, it's over the first moment you haven't seen, and the whole card is one
// press, as its look says on hover: it, Space, ↓ or Next go in, to that moment. At its end (`end`, after its last
// moment) or seen all through, it's over its last moment and holds the step left, Send or Done, pressed or Enter, and
// says what that does; nothing else says anything to the agent. Next or ↓ goes on to the next change's card and leaves
// this one waiting, ↑ back to its last moment.
export function Opening(props: {
  listed: Listed;
  you: string;
  end: boolean;
  // The answers new as you came to the change that you haven't opened, each on its moment.
  unopened: { note: string; moment: number }[];
  opener: ReactNode;
  go: Go;
  // Come to from the last moment, so going back up to it is the browser's own Back.
  afterTheLast: boolean;
  onTaking: () => void;
  goOn: () => void;
  // On to the next change, leaving this one waiting: none while no other is.
  leave?: () => void;
}) {
  const { listed, you, opener, go, unopened } = props;
  const { change } = listed;
  const handBack = latestOf(change)!;
  const count = handBack.moments.length;
  const atEnd = props.end || (!unseenOf(listed, you).length && !unreadOf(listed, you).length);
  const to = atEnd ? { moment: count } : firstUnseen(listed, you);
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
  const up = () => (props.afterTheLast ? history.back() : go({ change: change.id, moment: count }, props.end));
  const press = useRef<() => void>(undefined);
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea"))) return;
    const key = event.key.toLowerCase();
    const did = atEnd ? { arrowdown: props.leave, j: props.leave, arrowup: up, k: up, enter: press.current }[key] : /^( |arrowdown|j)$/.test(key) ? enter : undefined;
    if (!did) return;
    event.preventDefault();
    did();
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
        {atEnd && unopened.length > 0 && (
          <>
            {" · "}
            {/* Gone past, an answer is still new: pressed, it's open on its moment. */}
            <button
              onClick={() => go({ change: change.id, moment: unopened[0]!.moment, note: unopened[0]!.note })}
              className="rounded-sm font-medium text-fg underline decoration-line underline-offset-[3px] transition-colors duration-150 ease-calm hover:decoration-current"
            >
              {unopened.length === 1 ? "1 answer" : `${unopened.length} answers`} not opened
            </button>
          </>
        )}
      </p>
      <div className="mt-6">
        {atEnd ? (
          <StepLeft listed={listed} you={you} press={press} onTaking={props.onTaking} goOn={props.goOn} />
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
  // Before you've seen it through, the whole card is pressed to go in.
  const card = atEnd ? "" : "group cursor-pointer";
  const onCard = atEnd ? undefined : enter;
  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-clip bg-ground">
      <Header opener={opener}>
        <button
          onClick={atEnd ? props.leave : enter}
          disabled={atEnd && !props.leave}
          className="-mr-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-50"
        >
          Next
          <Key>↓</Key>
        </button>
      </Header>
      {phone ? (
        <div onClick={onCard} className={`flex flex-col gap-6 px-4 pt-4 ${card}`}>
          {words}
          <Softened listed={listed} moment={moment} screen={screen} fill={false} />
        </div>
      ) : (
        // The picture is where the recording will be, in the same room.
        <div className="relative grid min-h-0 place-items-center [container-type:size]">
          <div onClick={onCard} className={`relative ${card}`} style={{ aspectRatio: screen ? `${screen.width} / ${screen.height}` : "16 / 10", ...inItsRoom(screen ? screen.width / screen.height : 1.6) }}>
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

// The step left for a change: Send while something's unsent, Done while it waits on you, with a line saying what
// pressing it does. Pressed, it says Sent or Done where it was, then goes on to the next change's card. Already with
// your agents, or done, it says so, and there's only going on.
function StepLeft({ listed, you, press, onTaking, goOn }: { listed: Listed; you: string; press: RefObject<(() => void) | undefined>; onTaking: () => void; goOn: () => void }) {
  const { change } = listed;
  const step = stepOf(listed, you);
  const standing = standingOf(change, you);
  // What's offered stays what was pressed, as the change moves on under it.
  const [pressed, setPressed] = useState<"send" | "done">();
  const [said, setSaid] = useState<"sending" | "Sent" | "Done" | string[]>();
  const what = pressed ?? (step.is === "send" ? "send" : standing.is === "waiting" ? "done" : undefined);
  // What's unsent, as it was before it went, so the words stay while it says Sent.
  const unsent = useRef({ notes: 0, replies: 0 });
  if (step.is === "send") unsent.current = step;
  const takeIt = async () => {
    if (!what || said === "sending" || said === "Sent" || said === "Done") return;
    setPressed(what);
    onTaking();
    setSaid("sending");
    const problems = await take(change, you, what);
    if (problems.length) return setSaid(problems);
    setSaid(what === "send" ? "Sent" : "Done");
    setTimeout(goOn, matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : SAID);
  };
  press.current = what && (() => void takeIt());
  const line = "text-[13px] leading-5 text-faint";
  if (!what) {
    const tell = step.is === "with" && step.tell;
    return (
      <div className="flex flex-col items-center gap-2 phone:items-start">
        <Taken className="h-9 text-[14px]">{standing.is === "done" ? "Done" : "Sent"}</Taken>
        <p className={line}>{standing.is === "done" ? "Every moment looked good." : step.is === "with" && step.words !== "Sent" ? step.words : "With your agent."}</p>
        {tell && <TellYours words={tell} />}
      </div>
    );
  }
  const taken = said === "Sent" || said === "Done";
  const filled = what === "send" && !taken;
  return (
    // Space is never a press here: only pressing it, or Enter.
    <div data-goes-on className="flex flex-col items-center gap-2 phone:items-start">
      <SendButton className="h-9 px-3.5 text-[14px]" filled={filled} onClick={() => void takeIt()} disabled={said === "sending" || taken}>
        {taken ? (
          <>
            {tick}
            {said}
          </>
        ) : said === "sending" ? (
          what === "send" ? "Sending…" : "Done"
        ) : (
          <>
            {what === "send" ? `Send ${toSend(unsent.current.notes, unsent.current.replies)}` : "Done"}
            <Key className={filled ? FILLED_KEY : ""}>↵</Key>
          </>
        )}
      </SendButton>
      <p className={Array.isArray(said) ? "text-[13px] leading-5 text-amber-ink" : line}>
        {Array.isArray(said) ? `Not sent: ${said[0]}` : what === "send" ? `Your agent starts on ${unsent.current.notes + unsent.current.replies === 1 ? "it" : "them"}.` : "Says every moment looks good, and the change is done."}
      </p>
    </div>
  );
}
