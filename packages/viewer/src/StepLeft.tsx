// The step left for a change, at the foot of its moments, so the change ends in what you do: Send while something's
// unsent, Done while it waits on you. It's there on every moment, quiet, so the end is seen coming, and full on the
// last. Pressed, it says Sent or Done where it was, then goes on to what's next. Already with your agents, or done,
// it says so, and there's nothing to press.

import { useRef, useState, type Ref, type RefObject } from "react";
import { standingOf, type Note } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { TellYours } from "./Changes.tsx";
import { Key } from "./Key.tsx";
import { FILLED_KEY, SAID, SendButton, Taken, take, tick } from "./Send.tsx";
import { toSend } from "./standing.ts";
import { stepOf } from "./step.ts";

// Its words where the edge's word is, its box out to where the moments' cards stand as the edge comes forward. On a
// phone the cards stand at the word's place, and so does it.
const HUNG = "-ml-3.5 px-3.5! phone:ml-0";

export function StepLeft(props: {
  listed: Listed;
  you: string;
  // On the change's last moment: it's the step to take now.
  last: boolean;
  // The edge forward: the line saying what pressing it does shows, as the moments' words do.
  forward: boolean;
  // Pressed with Ctrl+Enter from anywhere on the moment, or Enter with the keyboard on it.
  press: RefObject<(() => void) | undefined>;
  button?: Ref<HTMLButtonElement>;
  // The notes that went, as they're kept, so they're drawn sent at once.
  onSent: (notes: Note[]) => void;
  goOn: () => void;
  // The answers new as you came to the change that you haven't opened: on the last, gone past, still new.
  unopened: number;
  onUnopened: () => void;
}) {
  const { listed, you, last, press, onSent, goOn } = props;
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
    setSaid("sending");
    const problems = await take(change, you, what, onSent);
    if (problems.length) return setSaid(problems);
    setSaid(what === "send" ? "Sent" : "Done");
    setTimeout(goOn, matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : SAID);
  };
  press.current = what && (() => void takeIt());
  const line = "text-[13px] leading-5 text-faint";
  const answers = last && props.unopened > 0 && (
    // Gone past, an answer is still new: pressed, it's open on its moment.
    <button onClick={props.onUnopened} className="rounded-sm text-[13px] leading-5 font-medium text-fg underline decoration-line underline-offset-[3px] transition-colors duration-150 ease-calm hover:decoration-current">
      {props.unopened === 1 ? "1 answer" : `${props.unopened} answers`} not opened
    </button>
  );
  if (!what) {
    const tell = step.is === "with" && step.tell;
    return (
      <div className="flex flex-col items-start gap-1">
        <Taken className={HUNG}>{standing.is === "done" ? "Done" : "Sent"}</Taken>
        <p className={line}>{standing.is === "done" ? "Every moment looked good." : step.is === "with" && step.words !== "Sent" ? step.words : "With your agent."}</p>
        {tell && <TellYours words={tell} />}
        {answers}
      </div>
    );
  }
  const taken = said === "Sent" || said === "Done";
  const filled = what === "send" && !taken;
  // What pressing it does, said only while it's looked at: the edge forward, or the keyboard on it. Under what stays,
  // never part of its height, so nothing moves as it comes and goes.
  const explains = !said && (props.forward || keyed);
  return (
    // Space is never a press here: only pressing it, or Enter.
    <div data-goes-on className="relative flex flex-col items-start gap-1">
      {taken ? (
        <Taken className={HUNG}>{said}</Taken>
      ) : (
        <SendButton
          ref={props.button}
          className={HUNG}
          filled={filled}
          quiet={!last}
          lit={keyed}
          onFocus={() => setKeyed(true)}
          onBlur={() => setKeyed(false)}
          // Pressed, the keyboard goes back to the page: what it says next is read at rest.
          onClick={(event) => (event.currentTarget.blur(), void takeIt())}
          disabled={said === "sending"}
        >
          {said === "sending" ? (
            what === "send" ? "Sending…" : "Done"
          ) : (
            <>
              {what === "send" ? `Send ${toSend(unsent.current.notes, unsent.current.replies)}` : "Done"}
              <Key className={filled && (last || keyed) ? FILLED_KEY : ""}>↵</Key>
            </>
          )}
        </SendButton>
      )}
      {Array.isArray(said) && <p className="text-[13px] leading-5 text-amber-ink">Not sent: {said[0]}</p>}
      {answers}
      <p className={`absolute top-full mt-1 whitespace-nowrap transition-opacity duration-200 ease-calm phone:static phone:mt-0 phone:whitespace-normal ${line} ${explains ? "" : "opacity-0"}`} aria-hidden={!explains}>
        {what === "send" ? `Your agent starts on ${unsent.current.notes + unsent.current.replies === 1 ? "it" : "them"}.` : "Says every moment looks good, and the change is done."}
      </p>
    </div>
  );
}
