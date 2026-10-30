// The one step to take, on the page with every flow: worked out from where you are, a button that takes it, as Enter
// does, or what the agent is doing with what you sent. And where each flow stands, in words.

import type { ReactNode } from "react";
import { Key, mac } from "./Card.tsx";
import type { Standing } from "./notes.ts";

// A button takes the step, as Enter does, or Ctrl+Enter for what can't be undone; one that goes to a flow names it.
// Otherwise it only says where things stand: what's playing, where the flow's question is, what the agent is doing, or
// that it's done.
export type Step =
  | { kind: "go"; words: string; what?: string; take: () => void; flow?: string; send?: boolean; final?: boolean }
  | { kind: "say"; words: string; what?: string }
  | { kind: "agent"; words: string; what?: string; busy: boolean }
  | { kind: "done"; words: string; just: boolean };

export function Go({ step, before, className }: { step: Extract<Step, { kind: "go" }>; before?: ReactNode; className: string }) {
  return (
    <button
      className={`flex h-8 min-w-0 items-center rounded-lg bg-hover px-3 text-xs leading-4 text-fg shadow-[inset_0_0_0_1px_var(--line)] transition-colors duration-150 ease-calm ${className}`}
      aria-keyshortcuts={step.final ? (mac ? "Meta+Enter" : "Control+Enter") : "Enter"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={step.take}
    >
      {before}
      <span className="flex-none">{step.words}</span>
      {step.what && <span className="flex-none text-faint">·</span>}
      {step.what && <b className="min-w-0 truncate font-medium">{step.what}</b>}
      <Key className="ml-auto">{step.final ? mac ? "⌘↵" : "Ctrl ↵" : "↵"}</Key>
    </button>
  );
}

// What the agent is doing, its dot breathing while it works.
export function Agent({ step, className }: { step: Extract<Step, { kind: "agent" }>; className: string }) {
  return (
    <p key={step.words} className={`flex h-8 min-w-0 animate-arrive items-center gap-1.5 text-xs font-medium whitespace-nowrap text-fg ${className}`} role="status">
      <i className={`mr-0.5 size-1.5 flex-none rounded-full bg-slate ${step.busy ? "animate-breathe" : "opacity-45"}`} aria-hidden />
      <span className="flex-none">{step.words}</span>
      {step.what && <span className="flex-none font-normal text-faint">·</span>}
      {step.what && <span className="min-w-0 truncate font-normal text-soft">{step.what}</span>}
    </p>
  );
}

// Where a flow stands, in words.
export const says = (standing: Standing) => {
  const notes = `${standing.count} ${standing.count === 1 ? "note" : "notes"}`;
  return {
    good: "Looks good",
    "not saved": "Your note isn’t saved",
    "needs you": `${standing.count} waiting for your answer`,
    "to send": `${notes} to send`,
    "with the agent": "With the agent",
    "is it good": "Is it good?",
    "looked good": "Looked good earlier, changed since",
    "to watch": "Not watched yet",
  }[standing.is];
};
