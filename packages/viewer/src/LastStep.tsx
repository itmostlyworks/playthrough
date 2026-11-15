// After a change's last moment, in Next's place, the one step left for it: Send while something's unsent, Done while it
// waits on you, else on to the next change. Taken, it says so where you pressed, then goes on to the next change.

import { useEffect, useRef, useState, type RefObject } from "react";
import { standingOf, type Change } from "@playthrough/change";
import { Key } from "./Key.tsx";
import { FILLED_KEY, SAID, SendButton, take, tick } from "./Send.tsx";
import { toSend } from "./standing.ts";

export function LastStep(props: {
  change: Change;
  you: string;
  notes: number;
  replies: number;
  sending?: "sending" | "sent" | string[];
  sendNow: () => Promise<void>;
  // What ↓ on the page does here: the same as pressing the step.
  press: RefObject<(() => void) | undefined>;
  onGoOn: () => void;
}) {
  const { change, you, notes, replies, sending, sendNow, onGoOn } = props;
  const unsent = notes + replies;
  const [done, setDone] = useState<"sending" | "done" | string[]>();
  // Sent from here, with the page's own Send, it goes on once it's said Sent. Only a send made here holds the step: one
  // made earlier on the change, from the header, has nothing to do with it.
  const sentHere = useRef(false);
  // At the end, what's left is Done while the change waits on you, whatever you skipped on the way: never what seeing
  // this last moment changes, so the step doesn't change under you as you arrive. Sent from the header on the way, it's
  // with your agents, whatever the changes have caught up with.
  const step = unsent || sentHere.current ? "send" : standingOf(change, you).is === "waiting" && sending !== "sent" ? "done" : "on";
  const after = () => setTimeout(onGoOn, matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : SAID);
  useEffect(() => {
    if (sending !== "sent" || !sentHere.current) return;
    const going = after();
    return () => clearTimeout(going);
  }, [sending]);
  const doneNow = async () => {
    setDone("sending");
    const problems = await take(change, you, "done");
    if (problems.length) return setDone(problems);
    setDone("done");
    after();
  };
  const press = () => {
    if ((sentHere.current && (sending === "sending" || sending === "sent")) || done === "sending" || done === "done") return;
    if (unsent) return void ((sentHere.current = true), sendNow());
    if (step === "done") return void doneNow();
    onGoOn();
  };
  props.press.current = press;
  useEffect(() => () => void (props.press.current = undefined), []);
  const failed = Array.isArray(sending) ? sending[0] : Array.isArray(done) ? done[0] : undefined;
  return (
    <span data-goes-on className="flex items-center">
      {failed && <span className="mr-3 text-[13px] text-amber-ink">Not sent: {failed}</span>}
      {step === "send" ? (
        <SendButton filled={sending !== "sent"} onClick={press} disabled={sending === "sending" || sending === "sent"}>
          {sending === "sent" ? <>{tick}Sent</> : sending === "sending" ? "Sending…" : <>Send {toSend(notes, replies)} <Key className={FILLED_KEY}>↓</Key></>}
        </SendButton>
      ) : step === "done" || done ? (
        <SendButton filled={false} onClick={press} disabled={done === "sending" || done === "done"}>
          {done === "done" ? <>{tick}Done</> : <>Done <Key>↓</Key></>}
        </SendButton>
      ) : (
        <button onClick={press} className="-mr-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg">
          Next change
          <Key>↓</Key>
        </button>
      )}
    </span>
  );
}
