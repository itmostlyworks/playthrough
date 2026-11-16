// The step left for a change, Send while something's unsent, Done while it waits on you: what the change ends in. Its
// place is the last stop, after the last moment, where the bar holds it (`StepAction`); on the Moments edge, the
// list's last card is the way there (`StepCard`), as a moment's card is for a moment. Pressed, it says Sent or Done
// where it was, then goes on to what's next. Already with your agents, or done, it says so, and there's nothing to press.

import { useLayoutEffect, useRef, useState } from "react";
import { standingOf, type Note } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { TellYours } from "./Changes.tsx";
import { Key } from "./Key.tsx";
import { FILLED_KEY, SAID, SendButton, Taken, take, tick } from "./Send.tsx";
import { toSend } from "./standing.ts";
import { stepOf } from "./step.ts";

// The step, and what pressing it has come to: one for the page, read by its card and by the bar alike.
export function useStepLeft(listed: Listed, you: string, onSent: (notes: Note[]) => void, goOn: () => void) {
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
  const press = async () => {
    if (!what || said === "sending" || said === "Sent" || said === "Done") return;
    setPressed(what);
    setSaid("sending");
    const problems = await take(change, you, what, onSent);
    if (problems.length) return setSaid(problems);
    setSaid(what === "send" ? "Sent" : "Done");
    setTimeout(goOn, matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : SAID);
  };
  const count = unsent.current.notes + unsent.current.replies;
  // Taken: pressed and kept, or already with your agents or done before you came.
  const taken = !what ? (standing.is === "done" ? "Done" : "Sent") : said === "Sent" || said === "Done" ? said : undefined;
  return { what, said, taken, step, standing, count, words: `Send ${toSend(unsent.current.notes, unsent.current.replies)}`, press: () => void press() };
}
export type Step = ReturnType<typeof useStepLeft>;

// From the card's side to its words, as a moment card's words stand; and at rest, tucked past the screen's edge, how
// far from that edge its words are held instead, so they read whole in what shows. The card is as wide as a moment's.
const WORDS = 14;
const AT_REST = 8;
const CARD = 188;

// The last stop's card on the Moments edge: always one short line, quiet, and where you are while you're there, with
// the line a moment's card has then. Pressed, it goes there.
// Its notes' dots, the notes on the whole change, as a moment's card carries its notes'.
export function StepCard({ step, here, forward, tucked, dots, onPress }: { step: Step; here: boolean; forward: boolean; tucked: number; dots: { id: string; sent: boolean }[]; onPress: () => void }) {
  // Send's words in full, measured: where they don't fit in what shows at rest, it says only how many ("Send 12"),
  // in full as the edge comes forward.
  const full = useRef<HTMLSpanElement>(null);
  const [fullWidth, setFullWidth] = useState(0);
  useLayoutEffect(() => setFullWidth(full.current?.offsetWidth ?? 0), [step.words]);
  // What shows of the card at rest, from where its words are held to just inside its box.
  const shows = CARD - 10 - tucked - AT_REST;
  const words = step.taken ? (
    <>
      {tick}
      {step.taken}
    </>
  ) : step.said === "sending" ? (
    step.what === "send" ? "Sending…" : "Done"
  ) : step.what === "send" ? (
    !tucked || fullWidth <= shows ? step.words : `Send ${step.count}`
  ) : (
    "Done"
  );
  return (
    <button
      data-tile="the last stop"
      aria-label={step.what === "send" ? step.words : step.taken ?? "Done"}
      aria-pressed={here}
      onClick={(event) => {
        // Pressed with the pointer, the keys go back to the page; with the keyboard, it stays.
        if (event.detail) event.currentTarget.blur();
        onPress();
      }}
      className={`group/tile block w-full rounded-xl p-1.5 text-left transition-[background-color,box-shadow] duration-200 ease-calm focus-visible:outline-none ${forward ? `bg-surface focus-visible:shadow-[0_0_0_2px_var(--amber)] ${here ? "shadow-[0_0_0_1.5px_var(--soft)]" : "shadow-[0_0_0_1px_var(--edge)] hover:shadow-[0_0_0_1.5px_var(--faint)]"}` : "bg-ground shadow-[0_0_0_0_transparent]"}`}
    >
      <span
        className={`relative flex h-7 items-center rounded-lg px-2 text-[12.5px] font-medium transition-[box-shadow,color] duration-200 ease-calm ${here || step.taken ? "text-fg" : "text-soft"} ${forward ? "shadow-[0_0_0_0_transparent]" : `group-focus-visible/tile:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--amber)] ${here ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--soft)]" : "shadow-[0_0_0_1px_var(--edge)] group-hover/tile:shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--faint)]"}`}`}
      >
        {/* The words held where they read at rest, settling where a card's words stand as it comes forward, with it. */}
        <span className="flex items-center whitespace-nowrap transition-[translate] duration-300 ease-calm" style={{ translate: `${Math.max(0, tucked + AT_REST - WORDS)}px 0` }}>
          {words}
        </span>
        <span ref={full} aria-hidden className="invisible absolute whitespace-nowrap">
          {step.words}
        </span>
        {dots.length > 0 && (
          <span className="absolute top-1.5 right-1.5 flex gap-[3px]">
            {dots.slice(0, 5).map((one) => (
              <i key={one.id} className={`size-[7px] rounded-full shadow-[0_0_0_1.5px_#fff] ${one.sent ? "bg-slate" : "bg-amber"}`} />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

// The last stop's one thing to do, in the bar's place: Done or Send, pressed or Enter, with what it does by it; and,
// pressed, what came of it, there.
export function StepAction({ step }: { step: Step }) {
  const { what, said, taken, standing } = step;
  const line = "truncate px-2 text-[13px] text-soft phone:hidden";
  if (taken) {
    const tell = !what && step.step.is === "with" && step.step.tell;
    const words = what ? undefined : standing.is === "done" ? "Every moment looked good." : step.step.is === "with" && step.step.words !== "Sent" ? step.step.words : "With your agent.";
    return (
      <div className="flex min-w-0 items-center">
        <Taken>{taken}</Taken>
        {words && <span className={line}>{words}</span>}
        {tell && (
          <span className="truncate pr-2 phone:hidden">
            <TellYours words={tell} />
          </span>
        )}
      </div>
    );
  }
  const filled = what === "send";
  return (
    // Space is never a press here: only pressing it, or Enter.
    <div data-goes-on className="flex min-w-0 items-center">
      <SendButton filled={filled} onClick={step.press} disabled={said === "sending"}>
        {said === "sending" ? (
          what === "send" ? "Sending…" : "Done"
        ) : (
          <>
            {what === "send" ? step.words : "Done"}
            <Key className={filled ? FILLED_KEY : ""}>↵</Key>
          </>
        )}
      </SendButton>
      {Array.isArray(said) ? (
        <span className="truncate px-2 text-[13px] text-amber-ink">Not sent: {said[0]}</span>
      ) : (
        !said && <span className={line}>{what === "send" ? `Your agent starts on ${step.count === 1 ? "it" : "them"}.` : "Says every moment looks good, and the change is done."}</span>
      )}
    </div>
  );
}
