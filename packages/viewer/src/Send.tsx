// Sending, from every change's row and the foot of a change's moments alike.

import type { ReactNode } from "react";
import { latestOf, newId, type Change, type Note } from "@playthrough/change";
import { send as post } from "./api.ts";
import { keepUnsent, unsentOf, type YourReply } from "./kept.ts";

// What a send says: notes and replies, or Done.
type Saying = { notes: Note[]; replies: YourReply[]; done?: true };

// One send on a change, from wherever it's pressed: what you said, on the moments as last handed back. Kept, what went
// is no longer this browser's to keep (only that: what you wrote meanwhile, here or in another tab, stays), in the same
// breath as what pressed it is told, so nothing said is drawn unsaid between; not kept, what stopped it.
async function sendOn(change: string, handBack: number, you: string, saying: Saying, sent?: () => void): Promise<string[]> {
  const problems = await post(change, { id: newId(), handBack, by: you, sent: new Date().toISOString(), notes: saying.notes, ...(saying.replies.length && { replies: saying.replies }), ...(saying.done && { done: true }) });
  if (problems.length) return problems;
  sent?.();
  keepUnsent(change, handBack, (now) => ({
    notes: now.notes.filter((note) => !saying.notes.some((one) => one.id === note.id)),
    replies: now.replies.filter((reply) => !saying.replies.some((one) => one.note === reply.note && one.words === reply.words)),
  }));
  return [];
}

// A change's one step: everything unsent on it, or Done, which says every moment looks good and nothing else. Told
// with the notes that went as they're kept, so a page showing them draws them sent at once.
export function take(change: Change, you: string, what: "send" | "done", sent?: (notes: Note[]) => void): Promise<string[]> {
  const handBack = latestOf(change)!.number;
  const saying: Saying = what === "send" ? unsentOf(change.id, handBack) : { notes: [], replies: [], done: true };
  return sendOn(change.id, handBack, you, saying, sent && (() => sent(saying.notes)));
}

// Send, the one filled button there is, while something is unsent; else plain, as Done is.
export function SendButton({ filled, className = "", children, ...rest }: { filled: boolean; className?: string; children: ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onMouseDown={(event) => event.preventDefault()}
      {...rest}
      className={`flex h-8 flex-none items-center gap-2 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow,opacity] duration-200 ease-calm ${filled ? "bg-fg text-ground shadow-[0_1px_2px_var(--drop)] enabled:hover:bg-[color-mix(in_srgb,var(--fg)_86%,var(--ground))]" : "bg-surface text-fg shadow-[0_0_0_1px_var(--edge),0_1px_2px_var(--drop)] enabled:hover:bg-hover"} ${className}`}
    >
      {children}
    </button>
  );
}

// Sent or done: said with a tick.
export const tick = (
  <svg viewBox="0 0 12 12" className="mr-1 size-3 text-green in-aria-pressed:text-inherit" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2.8 6.2l2.2 2.2 4.2-4.6" />
  </svg>
);

// What a button said once it's taken, in its place: the button's box gone, its word with a tick, so it plainly isn't
// there to press any more. It takes the room the button had, so nothing beside it moves.
export function Taken({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span role="status" className={`flex h-8 flex-none animate-arrive items-center justify-center px-3 text-[13px] font-medium whitespace-nowrap text-fg ${className}`} style={{ animationDuration: "160ms" }}>
      {tick}
      {children}
    </span>
  );
}

// A key's cap on the filled button, in its words' colour.
export const FILLED_KEY = "text-[inherit]! opacity-70 shadow-[0_0_0_1px_color-mix(in_srgb,currentColor_45%,transparent)]!";

// How long what you sent says so where you pressed, before it goes where it goes.
export const SAID = 1400;
