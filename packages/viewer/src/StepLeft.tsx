// The step left for a change, the last card of its moments, so the change ends in what you do: Send while something's
// unsent, Done while it waits on you. A short card, one line, there on every moment, quiet, so the end is seen coming,
// and full on the last. Pressed, it says Sent or Done in its place, then goes on to what's next. Already with your
// agents, or done, it says so, and there's nothing to press.

import { useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { standingOf, type Note } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { TellYours } from "./Changes.tsx";
import { Key } from "./Key.tsx";
import { FILLED_KEY, SAID, take, tick } from "./Send.tsx";
import { toSend } from "./standing.ts";
import { stepOf } from "./step.ts";

// From the card's side to its words, as a moment card's words stand; and at rest, tucked past the screen's edge, how
// far from that edge its words are held instead, so they read whole in what shows. The card is as wide as a moment's.
const WORDS = 14;
const AT_REST = 8;
const CARD = 188;

export function StepLeft(props: {
  listed: Listed;
  you: string;
  // On the change's last moment: it's the step to take now.
  last: boolean;
  // The edge forward: the card is a card, and what it says beyond its word shows under it.
  forward: boolean;
  // How much of the card runs past the screen's edge.
  tucked: number;
  // Pressed with Ctrl+Enter from anywhere on the moment, or Enter with the keyboard on it.
  press: RefObject<(() => void) | undefined>;
  button?: Ref<HTMLButtonElement>;
  // The notes that went, as they're kept, so they're drawn sent at once.
  onSent: (notes: Note[]) => void;
  // Pressed: the edge stays forward from now on, so what it says next is never missed.
  onPressed: () => void;
  goOn: () => void;
  // The answers new as you came to the change that you haven't opened: on the last, gone past, still new.
  unopened: number;
  onUnopened: () => void;
}) {
  const { listed, you, last, forward, press, onSent, goOn } = props;
  const { change } = listed;
  const step = stepOf(listed, you);
  const standing = standingOf(change, you);
  // What's offered stays what was pressed, as the change moves on under it.
  const [pressed, setPressed] = useState<"send" | "done">();
  const [said, setSaid] = useState<"sending" | "Sent" | "Done" | string[]>();
  const [keyed, setKeyed] = useState(false);
  const what = pressed ?? (step.is === "send" ? "send" : standing.is === "waiting" ? "done" : undefined);
  // What's unsent, as it was before it went, so the words stay while it says Sent.
  const unsent = useRef({ notes: 0, replies: 0 });
  if (step.is === "send") unsent.current = step;
  const takeIt = async () => {
    if (!what || said === "sending" || said === "Sent" || said === "Done") return;
    setPressed(what);
    props.onPressed();
    setSaid("sending");
    const problems = await take(change, you, what, onSent);
    if (problems.length) return setSaid(problems);
    setSaid(what === "send" ? "Sent" : "Done");
    setTimeout(goOn, matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : SAID);
  };
  press.current = what && (() => void takeIt());

  const taken = !what || said === "Sent" || said === "Done";
  const filled = what === "send" && !taken && last;
  // At rest it's the box a moment's picture is; forward, the card is, and the box is only Send's fill. Quiet before the
  // last moment: soft words in an outline.
  const box = filled
    ? `bg-fg text-ground ${forward ? "" : "shadow-[0_1px_2px_var(--drop)]"} enabled:hover:bg-[color-mix(in_srgb,var(--fg)_86%,var(--ground))]`
    : `${last || taken || keyed ? "text-fg" : "text-soft"} ${forward ? "enabled:hover:bg-hover" : last && !taken ? "bg-surface shadow-[0_0_0_1px_var(--edge),0_1px_3px_var(--edge)]" : "shadow-[0_0_0_1px_var(--edge)]"}`;
  // The words held where they read at rest, settling where a card's words stand as it comes forward, with it.
  const words = (children: React.ReactNode) => (
    <span className="flex items-center whitespace-nowrap transition-[translate] duration-300 ease-calm" style={{ translate: `${Math.max(0, props.tucked + AT_REST - WORDS)}px 0` }}>
      {children}
    </span>
  );
  // Send's words in full, measured: where they don't fit in what shows at rest, it says only how many ("Send 12"),
  // in full as the edge comes forward.
  const sendWords = `Send ${toSend(unsent.current.notes, unsent.current.replies)}`;
  const full = useRef<HTMLSpanElement>(null);
  const [fullWidth, setFullWidth] = useState(0);
  useLayoutEffect(() => setFullWidth(full.current?.offsetWidth ?? 0), [sendWords]);
  // What shows of the card at rest, from where its words are held to just inside its box.
  const shows = CARD - 10 - props.tucked - AT_REST;
  const sendSays = !props.tucked || fullWidth <= shows ? sendWords : `Send ${unsent.current.notes + unsent.current.replies}`;
  const row = `relative flex h-7 w-full items-center rounded-lg px-2 text-left text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200 ease-calm focus-visible:outline-none ${box}`;

  const line = "text-faint";
  const answers = last && props.unopened > 0 && (
    // Gone past, an answer is still new: pressed, it's open on its moment.
    <button onClick={props.onUnopened} className="self-start rounded-sm font-medium text-fg underline decoration-line underline-offset-[3px] transition-colors duration-150 ease-calm hover:decoration-current">
      {props.unopened === 1 ? "1 answer" : `${props.unopened} answers`} not opened
    </button>
  );
  const tell = !what && step.is === "with" && step.tell;
  // What it says beyond its word, under it, while the edge is forward.
  const lines = !what ? (
    <>
      <p className={line}>{standing.is === "done" ? "Every moment looked good." : step.is === "with" && step.words !== "Sent" ? step.words : "With your agent."}</p>
      {tell && <TellYours words={tell} />}
      {answers}
    </>
  ) : Array.isArray(said) ? (
    <p className="text-amber-ink">Not sent: {said[0]}</p>
  ) : said ? undefined : (
    <>
      <p className={line}>{what === "send" ? `Your agent starts on ${unsent.current.notes + unsent.current.replies === 1 ? "it" : "them"}.` : "Says every moment looks good, and the change is done."}</p>
      {answers}
    </>
  );

  return (
    // Space is never a press here: only pressing it, or Enter. With the keyboard on it, lit as a row of what's waiting.
    <div
      data-goes-on
      className={`rounded-xl p-1.5 transition-[background-color,box-shadow] duration-200 ease-calm ${forward ? (keyed ? "bg-hover shadow-[0_0_0_1.5px_var(--faint)]" : "bg-surface shadow-[0_0_0_1px_var(--edge)]") : "bg-ground shadow-[0_0_0_0_transparent]"}`}
    >
      {taken ? (
        <span role="status" className={row}>
          {words(
            <>
              {tick}
              {!what ? (standing.is === "done" ? "Done" : "Sent") : said}
            </>,
          )}
        </span>
      ) : (
        <button
          ref={props.button}
          className={row}
          onMouseDown={(event) => event.preventDefault()}
          onFocus={() => setKeyed(true)}
          onBlur={() => setKeyed(false)}
          // Pressed, the keyboard goes back to the page; the edge stays forward with what it says.
          onClick={(event) => (event.currentTarget.blur(), void takeIt())}
          disabled={said === "sending"}
        >
          {words(said === "sending" ? (what === "send" ? "Sending…" : "Done") : what === "send" ? sendSays : "Done")}
          <span ref={full} aria-hidden className="invisible absolute whitespace-nowrap">
            {sendWords}
          </span>
          {/* Enter presses it only with the keyboard on it, so only then is its key drawn: over the row's end, so its
              words never move. */}
          <span className={`absolute right-1.5 flex transition-opacity duration-150 ease-calm ${keyed && said !== "sending" ? "" : "opacity-0"}`}>
            <Key className={filled ? FILLED_KEY : ""}>↵</Key>
          </span>
        </button>
      )}
      {lines && (
        <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-calm ${forward ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!forward}>
          <div className="flex min-h-0 flex-col gap-1 overflow-hidden px-2 text-[12.5px] leading-[18px] [&>*:first-child]:mt-1.5 [&>*:last-child]:mb-1">{lines}</div>
        </div>
      )}
    </div>
  );
}
