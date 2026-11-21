// The step left for a change, Send while something's unsent, Done while it waits on you: what the change ends in. It
// stands in a box of its own at the foot of the Moments side on every moment (`StepBox`), and the line over it says only
// what the box can't hold (`StepNotice`). Sent, you stay where you are; Done says it was, then goes on to
// what's next. Already with your agents, or done, it says so, and there's nothing to press. A guest on a shared change
// only sends: with nothing to send, there's nothing to press.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { standingOf, type Note } from "@playthrough/change";
import { isGuest, type Listed } from "./api.ts";
import { TellYours } from "./Changes.tsx";
import { Notice as OverTheBar } from "./MomentBar.tsx";
import { SAID, take, tick } from "./Send.tsx";
import { toSend } from "./standing.ts";
import { agentOn, NO_AGENT, stepOf, tellOf } from "./step.ts";

// Over the box, once sent with no agent on the change.
const NOT_LISTENING = "No agent listening. Kept for when one is.";
const NOTHING_YET = "No notes yet";

// What came of a send: sent to your agent; sent with no agent listening; the agent working on them.
type Went = "sent" | "no agent" | "working";

// The step, and what pressing it has come to: one for the page, read by its box and the line over it alike.
export function useStepLeft(listed: Listed, you: string, onSent: (notes: Note[]) => void, goOn: () => void) {
  const { change } = listed;
  const step = stepOf(listed, you);
  const standing = standingOf(change, you);
  // What's offered stays what was pressed, as the change moves on under it.
  const [pressed, setPressed] = useState<"send" | "done">();
  const [said, setSaid] = useState<"sending" | "Sent" | "Done" | string[]>();
  const [held, setHeld] = useState(false);
  // Done is the person's alone (`isGuest`): a guest is offered Send, or nothing.
  const what = pressed ?? (step.is === "send" ? "send" : standing.is === "waiting" && !isGuest() ? "done" : undefined);
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
    setHeld(true);
    // Sent says so as long as anything pressed does, before it says the agent is on them.
    setTimeout(() => setHeld(false), SAID);
    // Sent, you stay where you pressed it, the bar saying where it stands; Done ends the change, and goes on.
    if (what === "done") setTimeout(goOn, matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : SAID);
  };
  // Sent, and something new said since: Send again.
  useEffect(() => {
    if (said === "Sent" && step.is === "send") (setPressed(undefined), setSaid(undefined));
  }, [said, step.is]);
  const count = unsent.current.notes + unsent.current.replies;
  // Taken: pressed and kept, or already with your agents or done before you came.
  const taken = !what ? (standing.is === "done" ? "Done" : standing.is === "sent" ? "Sent" : undefined) : said === "Sent" || said === "Done" ? said : undefined;
  // Before the change comes back with the send, whether an agent is on it is as it was when Send was pressed.
  // A guest isn't told nobody's listening: it's the person's to start one.
  const went: Went | undefined =
    taken !== "Sent" ? undefined : step.is !== "with" ? (agentOn(listed) || isGuest() ? "sent" : "no agent") : step.words === NO_AGENT ? (isGuest() ? "sent" : "no agent") : step.words === "Agent working" && !held ? "working" : "sent";
  // Just sent, it says Sent until that's been read, even when the change comes back with the agent already on it.
  const working = went ? went === "working" : step.is === "with" && step.words === "Agent working";
  return { what, said, taken, went, working, step, standing, count, agentOn: agentOn(listed), tell: isGuest() ? undefined : tellOf(listed, you), words: `Send ${toSend(unsent.current.notes, unsent.current.replies)}`, press: () => void press() };
}
export type Step = ReturnType<typeof useStepLeft>;

// Over the box, what it can't hold: sent with no agent listening, and what to tell a new one; Done
// pressed with something not yet seen, what that is, each pressed going to the first of it; a send that didn't go. Faded while the recording plays, as all over it but the bar is. Always
// a line in the page (`inFlow`): over the box at the Moments' foot, and on a phone, where the box is a row under the bar, under it.
export function StepNotice({ step, todo, faded, inFlow = false }: { step: Step; todo?: { words: string; go: () => void }[]; faded: boolean; inFlow?: boolean }) {
  const { taken, said, standing } = step;
  const Notice = inFlow ? Line : OverTheBar;
  const fade = `transition-opacity duration-200 ease-calm ${faded ? "opacity-0" : ""}`;
  if (Array.isArray(said)) return <Notice className={`text-amber-ink ${fade}`}>Not sent: {said[0]}</Notice>;
  if (todo?.length)
    return (
      <Notice className={`text-soft ${fade}`}>
        <span className="pointer-events-auto flex flex-wrap justify-center gap-x-4">
          {todo.map((one) => (
            <button key={one.words} onClick={one.go} className="rounded-sm underline decoration-line underline-offset-[3px] transition-colors duration-150 ease-calm hover:text-fg hover:decoration-current">
              {one.words}
            </button>
          ))}
        </span>
      </Notice>
    );
  // The box says Sent, the agent working and Done itself: over it only what it can't hold, nobody listening, with
  // what to tell a new agent. A guest isn't told it: it's the person's to start one.
  if ((taken !== "Sent" && standing.is !== "sent") || isGuest() || !(step.went === "no agent" || (!step.went && !step.agentOn))) return null;
  return (
    <Notice className={fade}>
      <span className="text-amber-ink">{NOT_LISTENING}</span>
      {step.tell && (
        <span className="mt-0.5 block">
          <TellYours words={step.tell} />
        </span>
      )}
    </Notice>
  );
}

// The step left, in a box of its own at the Moments' foot, one slot that changes in place: Send, Sent, the agent working once
// it has them, Done, Done anyway, Done with its tick. Every face is laid in it, all but one unseen, so it's as wide as
// its widest and nothing moves as it turns. Pressed: what it says.
// Flat, it lies on the page rather than floating over it, as at the Moments' foot.
export function StepBox({ step, anyway, onPress, flat = false, className = "" }: { step: Step; anyway: boolean; onPress: () => void; flat?: boolean; className?: string }) {
  const { what, said, taken, working } = step;
  const faces: [string, ReactNode][] = [
    ["send", step.words],
    ["sending", "Sending…"],
    ["sent", <>{tick}Sent</>],
    ["working", <><i className="mr-[7px] size-[7px] animate-breathe rounded-full bg-slate" />Agent working</>],
    ["done", "Done"],
    ["anyway", "Done anyway"],
    ["done taken", <>{tick}Done</>],
    ["nothing", NOTHING_YET],
  ];
  const now =
    said === "sending" ? "sending" : taken === "Sent" ? (working ? "working" : "sent") : taken === "Done" ? "done taken" : what === "send" ? "send" : what === "done" ? (anyway ? "anyway" : "done") : "nothing";
  const pressable = !!what && !taken && said !== "sending";
  return (
    <button
      data-part="step"
      data-goes-on
      disabled={!pressable}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => (event.detail && event.currentTarget.blur(), onPress())}
      // Of the bar's own material, so the two read as one bar and its neighbour: what says there's something to send is
      // its words in full ink, and the amber light as a note is saved. Pointed at, the tint lies over its surface.
      className={`grid h-10 flex-none items-center rounded-xl bg-surface px-3.5 text-[13px] whitespace-nowrap ${flat ? "shadow-[0_0_0_1px_var(--edge)]" : "shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"} transition-[background-color,color] duration-150 ease-calm ${pressable ? "text-fg enabled:hover:bg-[image:linear-gradient(var(--hover),var(--hover))] enabled:active:bg-[image:linear-gradient(var(--hover),var(--hover)),linear-gradient(var(--hover),var(--hover))]" : `cursor-default ${taken ? "text-fg" : "text-soft"}`} ${className}`}
    >
      {/* Turning, the face going goes first and the one coming follows it in, so two never lie over each other; a face
          there only for an instant, as the change catches up, never shows at all. */}
      {faces.map(([is, words]) => (
        <span
          key={is}
          aria-hidden={is !== now}
          className={`flex items-center justify-center transition-opacity ease-calm [grid-area:1/1] ${is === now ? "delay-100 duration-200" : "opacity-0 duration-100"}`}
        >
          {words}
        </span>
      ))}
    </button>
  );
}

// The notice's words as a line in the page.
function Line({ children, className = "text-soft" }: { children: ReactNode; className?: string }) {
  return (
    <p role="status" className={`grid justify-items-center text-center text-xs leading-[18px] ${className}`}>
      {children}
    </p>
  );
}
