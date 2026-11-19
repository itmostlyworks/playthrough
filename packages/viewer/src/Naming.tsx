// Saying something on a shared change: a guest who hasn't said who they are is asked once, as they first say anything,
// where they're saying it (a note's or a reply's Save, Tell the agent), and what they said is kept once they have. Every
// way a guest says something goes through `useSaying`, so every send of theirs carries a name.

import { useState, type ReactNode } from "react";
import { nameYou, source, useYou } from "./api.ts";
import { Key } from "./Key.tsx";

export function useSaying(): { say: (then: () => void) => void; asking: boolean; ask: ReactNode } {
  const you = useYou();
  const [waiting, setWaiting] = useState<() => void>();
  const say = (then: () => void) => (source.name && you === "" ? setWaiting(() => then) : then());
  const ask = waiting && (
    <YourName
      onSaid={async (name) => {
        const problems = await nameYou(name);
        if (!problems.length) (setWaiting(undefined), waiting());
        return problems;
      }}
      onBack={() => setWaiting(undefined)}
    />
  );
  return { say, asking: !!waiting, ask };
}

// Who's saying it, asked once: the name every note and reply of theirs carries from then on, to the agent and to the
// person who shared the change. One that can't be theirs (the person's, the agent's) says why under it. Escape goes back.
function YourName({ onSaid, onBack }: { onSaid: (name: string) => Promise<string[]>; onBack: () => void }) {
  const [name, setName] = useState("");
  const [wrong, setWrong] = useState<string>();
  const said = name.trim();
  const save = () => void (said && onSaid(said).then((problems) => setWrong(problems[0])));
  return (
    <div className="mt-2 animate-arrive border-t border-line px-1 pt-2" style={{ animationDuration: "160ms" }}>
      <label htmlFor="your-name" className="block text-[11.5px] leading-4 text-soft">
        Your name, so they know who said it
      </label>
      <div className="mt-1 flex items-center gap-1 text-xs">
        <input
          id="your-name"
          ref={(field) => void (field && !field.dataset.focused && ((field.dataset.focused = "1"), field.focus({ preventScroll: true })))}
          value={name}
          autoComplete="name"
          maxLength={60}
          className="h-7 min-w-0 flex-1 rounded-md bg-ground px-2 text-[13px] text-fg shadow-[0_0_0_1px_var(--edge)] outline-none placeholder:text-faint focus:shadow-[0_0_0_1.5px_var(--soft)]"
          onChange={(event) => (setName(event.target.value), setWrong(undefined))}
          onKeyDown={(event) => {
            if (event.key === "Escape") return (event.stopPropagation(), onBack());
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              save();
            }
          }}
        />
        <button className="rounded-md px-2 py-1 font-medium text-fg enabled:hover:bg-hover disabled:opacity-50" disabled={!said} onClick={save}>
          Save <Key>↵</Key>
        </button>
      </div>
      {wrong && <p className="mt-1 animate-arrive text-[11.5px] leading-4 text-amber-ink">{wrong}</p>}
    </div>
  );
}
