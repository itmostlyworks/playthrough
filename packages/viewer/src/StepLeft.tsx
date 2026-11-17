// The step left for a change, Send while something's unsent, Done while it waits on you: what the change ends in. Its
// place is the last stop, after the last moment, where the bar holds it (`StepAction`); on the Moments edge, the
// list's last card is the way there (`StepCard`), as a moment's card is for a moment. Pressed, it says Sent or Done
// where it was, then goes on to what's next. Already with your agents, or done, it says so, and there's nothing to press.

import { useLayoutEffect, useRef, useState } from "react";
import { standingOf, type Note } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { Key } from "./Key.tsx";
import { Notice } from "./MomentBar.tsx";
import { FILLED_KEY, SAID, SendButton, Taken, take, tick } from "./Send.tsx";
import { toSend } from "./standing.ts";
import { agentOn, NO_AGENT, stepOf, tellOf } from "./step.ts";

// What the bar says of a change sent on, by its tick: someone's on it, at it, or nobody is.
const WITH_AGENTS = ["With your agent.", "Agent working", NO_AGENT];
// What Send says it does with no agent listening.
const NOT_LISTENING = "No agent listening. Kept for when one is.";

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
  return { what, said, taken, step, standing, count, agentOn: agentOn(listed), tell: tellOf(listed, you), words: `Send ${toSend(unsent.current.notes, unsent.current.replies)}`, press: () => void press() };
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
  // Its dots, five at most as a moment's card has; at rest, as many as fit after the words in what shows, all of them
  // as the edge comes forward.
  const said = useRef<HTMLSpanElement>(null);
  const [saidWidth, setSaidWidth] = useState(0);
  useLayoutEffect(() => setSaidWidth(said.current?.offsetWidth ?? 0));
  const dotted = dots.slice(0, tucked ? Math.max(0, Math.min(5, Math.floor((shows - saidWidth - 8) / 10))) : 5);
  // Saying Send, it waits on you, so it's at full while the edge sits back.
  const sends = !step.taken && step.said !== "sending" && step.what === "send";
  const words = step.taken ? (
    <>
      {tick}
      {step.taken}
    </>
  ) : step.said === "sending" ? (
    step.what === "send" ? "Sending…" : "Done"
  ) : sends ? (
    !tucked || fullWidth + (dots.length ? 8 + 10 * Math.min(5, dots.length) : 0) <= shows ? step.words : `Send ${step.count}`
  ) : (
    "Done"
  );
  return (
    <button
      data-tile="the last stop"
      data-waiting={sends || undefined}
      aria-label={step.what === "send" ? step.words : step.taken ?? "Done"}
      aria-pressed={here}
      onClick={(event) => {
        // Pressed with the pointer, the keys go back to the page; with the keyboard, it stays.
        if (event.detail) event.currentTarget.blur();
        onPress();
      }}
      className={`group/tile block w-full rounded-xl p-1.5 text-left transition-[background-color,box-shadow,opacity] duration-200 ease-calm focus-visible:outline-none ${forward ? `bg-surface focus-visible:shadow-[0_0_0_2px_var(--amber)] ${here ? "shadow-[0_0_0_1.5px_var(--soft)]" : "shadow-[0_0_0_1px_var(--edge)] hover:shadow-[0_0_0_1.5px_var(--faint)]"}` : "bg-ground shadow-[0_0_0_0_transparent]"}`}
    >
      <span
        className={`relative flex h-7 items-center rounded-lg px-2 text-[12.5px] font-medium transition-[box-shadow,color] duration-200 ease-calm ${here || step.taken ? "text-fg" : "text-soft"} ${forward ? "shadow-[0_0_0_0_transparent]" : `group-focus-visible/tile:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--amber)] ${here ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--soft)]" : "shadow-[0_0_0_1px_var(--edge)] group-hover/tile:shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--faint)]"}`}`}
      >
        {/* The words held where they read at rest, settling where a card's words stand as it comes forward, with it. */}
        <span className="flex items-center whitespace-nowrap transition-[translate] duration-300 ease-calm" style={{ translate: `${Math.max(0, tucked + AT_REST - WORDS)}px 0` }}>
          <span ref={said} data-says className="flex items-center">
            {words}
          </span>
          {/* After its words, held with them where they read at rest. */}
          {dotted.length > 0 && (
            <span className="ml-2 flex gap-[3px]">
              {dotted.map((one) => (
                <i key={one.id} className={`size-[7px] rounded-full shadow-[0_0_0_1.5px_#fff] ${one.sent ? "bg-slate" : "bg-amber"}`} />
              ))}
            </span>
          )}
        </span>
        <span ref={full} aria-hidden className="invisible absolute whitespace-nowrap">
          {step.words}
        </span>
      </span>
    </button>
  );
}

// The last stop's one thing to do, in the bar's place: Done or Send, pressed or Enter; and, pressed, what came of it,
// there. What it does, or where it stands, is the bar's notice over it, so the bar holds only what's pressed.
export function StepAction({ step }: { step: Step }) {
  const { what, said, taken, standing } = step;
  const filled = what === "send";
  // The notice: before it's pressed, what pressing it does; arrived at taken, only where it stands, in a word (what to
  // tell a new agent is on the sheet, not by the bar). Each is held in one place with what else it turns into as an
  // agent comes or goes, the one not true unseen, so the notice keeps its width.
  const notice = ((): { words: string; held: string[] } | undefined => {
    if (taken) {
      if (what) return undefined;
      if (standing.is === "done") return { words: "Every moment looked good.", held: [] };
      const words = step.step.is === "with" && step.step.words !== "Sent" ? step.step.words : WITH_AGENTS[0]!;
      return { words, held: [...new Set([...WITH_AGENTS, words])] };
    }
    if (said) return undefined;
    if (!filled) return { words: "Says every moment looks good, and the change is done.", held: [] };
    const starts = `Your agent starts on ${step.count === 1 ? "it" : "them"}.`;
    return { words: step.agentOn ? starts : NOT_LISTENING, held: [starts, NOT_LISTENING] };
  })();
  const warns = (line: string) => line === NO_AGENT || line === NOT_LISTENING;
  return (
    // Space is never a press here: only pressing it, or Enter.
    <div data-goes-on className="grid min-w-0 items-center">
      {/* Pressed, what it says stands in the button's place, the button kept there unseen, so the bar keeps its width. */}
      {what && (
        <SendButton filled={filled} onClick={step.press} disabled={said === "sending" || !!taken} className={`[grid-area:1/1] ${taken ? "invisible" : ""}`}>
          {said === "sending" ? (
            what === "send" ? "Sending…" : "Done"
          ) : (
            <>
              {what === "send" ? step.words : "Done"}
              <Key className={filled ? FILLED_KEY : ""}>↵</Key>
            </>
          )}
        </SendButton>
      )}
      {taken && <Taken className="[grid-area:1/1]">{taken}</Taken>}
      {Array.isArray(said) ? (
        <Notice className="text-amber-ink">Not sent: {said[0]}</Notice>
      ) : (
        notice && (
          <Notice className="phone:hidden">
            {(notice.held.length ? notice.held : [notice.words]).map((one) => (
              <span key={one} className={`[grid-area:1/1] ${warns(one) ? "text-amber-ink" : "text-soft"} ${one === notice.words ? "" : "invisible"}`}>
                {one}
              </span>
            ))}
          </Notice>
        )
      )}
    </div>
  );
}
