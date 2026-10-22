// A note in the column: one line while it's closed, and open, its conversation and the one thing you can do with it.
// A new note is written where it will live, never over the recording.

import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@vantage/review";
import { fill, type Shown } from "./notes.ts";
import { clock } from "./Ruler.tsx";

export const number = "size-[18px] flex-none rounded-full text-center text-[10px] leading-[18px] font-semibold text-white";

export function NoteRow(props: {
  note: Shown;
  open: boolean;
  fresh: boolean;
  you: string;
  readOnly: boolean;
  onOpen: () => void;
  onClose: () => void;
  onJudge: (verdict: Verdict | undefined) => void;
  onEdit: (words: string | undefined) => void;
}) {
  const { note, open } = props;
  return (
    <div className={`rounded-lg transition-colors duration-150 ease-calm ${open ? "bg-hover" : "hover:bg-hover"} ${props.fresh ? "animate-glow" : ""}`}>
      <button className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2 text-left" onClick={open ? props.onClose : props.onOpen} aria-expanded={open}>
        <span className={`${number} mt-px ${fill(note)}`}>{note.number}</span>
        <span className={open ? "" : "truncate"}>{note.turns[0]?.words}</span>
        <span className="text-xs leading-5 text-faint tabular-nums">{note.on?.at === undefined ? "" : clock(note.on.at)}</span>
      </button>
      {open && <Card {...props} />}
    </div>
  );
}

function Card({ note, you, readOnly, onJudge, onEdit, onClose }: Parameters<typeof NoteRow>[0]) {
  const draftNote = note.unsent && note.turns.length === 1;
  const judged = note.unsent && !draftNote ? note.turns.at(-1) : undefined;
  const [asking, setAsking] = useState(judged?.verdict === "not quite");
  const inset = "pr-2.5 pb-2.5 pl-9";

  if (draftNote && !readOnly)
    return (
      <div className={inset}>
        <Writing words={note.turns[0]?.words ?? ""} placeholder="What do you think?" onSave={(words) => (onEdit(words), onClose())} onRemove={() => onEdit(undefined)} onCancel={onClose} />
      </div>
    );

  const said = judged ? note.turns.slice(0, -1) : note.turns;
  const theAgents = said[0]?.by === "agent";
  const choice = "h-[26px] flex-1 rounded-md bg-hover px-2.5 font-medium text-soft transition-colors duration-150 ease-calm hover:text-fg";
  return (
    <div className={`${inset} flex flex-col gap-2`}>
      {theAgents && <p className="text-xs text-faint">The agent changed this unprompted.</p>}
      {said.slice(1).map((turn, i) => (
        <p key={i} className={turn.by === "agent" ? "text-soft" : ""}>
          <span className="mr-1 font-medium text-soft">{who(turn.by, you)}:</span>
          {turn.verdict === "looks good" && <span className="text-green">Looks good. </span>}
          {turn.verdict === "not quite" && <span className="text-amber-ink">Not quite. </span>}
          {turn.words}
        </p>
      ))}
      {readOnly ? null : note.state === "needs you" || judged ? (
        <>
          <p className="mt-1 font-medium">{theAgents ? "Is this right?" : "Does this fix it?"}</p>
          <div className="flex gap-2">
            <button
              className={`${choice} aria-pressed:bg-green/12 aria-pressed:text-green`}
              aria-pressed={judged?.verdict === "looks good"}
              onClick={() => {
                setAsking(false);
                onJudge(judged?.verdict === "looks good" ? undefined : { note: note.id, verdict: "looks good" });
                if (judged?.verdict !== "looks good") onClose();
              }}
            >
              Looks good
            </button>
            <button
              className={`${choice} aria-pressed:bg-amber/16 aria-pressed:text-amber-ink`}
              aria-pressed={asking}
              onClick={() => {
                if (asking) onJudge(undefined);
                setAsking(!asking);
              }}
            >
              Not quite
            </button>
          </div>
          {asking && (
            <Writing
              words={judged?.verdict === "not quite" ? judged.words : ""}
              placeholder="What's still not right?"
              onSave={(words) => (onJudge({ note: note.id, verdict: "not quite", words }), onClose())}
              onCancel={() => setAsking(false)}
            />
          )}
        </>
      ) : (
        note.state === "with the agent" && <p className="text-xs text-slate">✓ Sent to the agent</p>
      )}
    </div>
  );
}

// Writing a note, or what's still not right. Escape never throws words away: it only closes an empty box.
export function Writing(props: { words: string; placeholder: string; onSave: (words: string) => void; onCancel: () => void; onRemove?: () => void }) {
  const [words, setWords] = useState(props.words);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.focus(), []);
  const save = () => words.trim() && props.onSave(words.trim());
  return (
    <div>
      <textarea
        ref={box}
        rows={4}
        value={words}
        placeholder={props.placeholder}
        className="block w-full resize-none rounded-md bg-hover px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)] placeholder:text-faint focus:shadow-[inset_0_0_0_1px_var(--amber)] focus-visible:outline-none"
        onChange={(event) => setWords(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) save();
          if (event.key === "Escape" && !words.trim()) props.onCancel();
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <button className="h-7 px-1 text-soft transition-colors duration-150 ease-calm hover:text-fg" onClick={props.onRemove ?? props.onCancel}>
          {props.onRemove ? "Remove" : "Cancel"}
        </button>
        <button className="flex h-7 items-center gap-2 rounded-[7px] bg-fg px-3 font-medium text-ground disabled:opacity-40" disabled={!words.trim()} onClick={save}>
          Save <kbd className="font-ui text-[11px] opacity-60">{mac ? "⌘" : "Ctrl"} ↵</kbd>
        </button>
      </div>
    </div>
  );
}

export const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);
const who = (by: string, you: string) => (by === "agent" ? "The agent" : by === you ? "You" : by);
