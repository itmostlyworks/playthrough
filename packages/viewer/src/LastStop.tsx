// The last stop's sheet, in the recording's place: the whole change at a glance before you say Done or Send. Every
// moment as the picture of how it ends, its name and whom it's done as, and under it what you said on it; what you
// haven't watched said so. Only your words and the pictures: nothing the agent wrote.

import type { Change, HandBack, Note } from "@playthrough/change";
import { usePhone } from "./phone.ts";
import { StillPicture } from "./Still.tsx";

// Past this many notes on a moment, the rest are counted.
const SHOWN = 3;

export function LastStop(props: {
  change: Change;
  handBack: HandBack;
  // What you said on the change, sent and unsent.
  said: { note: Note; sent: boolean }[];
  // A note's words as yours, and whether its answer is new and not yet opened.
  says: (note: Note, sent: boolean) => { words: string; fresh: boolean };
  // The moments you haven't watched, by their place from 1.
  unwatched: number[];
  onMoment: (n: number) => void;
}) {
  const { change, handBack, said, says } = props;
  const moments = handBack.moments;
  const on = (name: string) => said.filter(({ note }) => note.on?.moment === name);
  const elsewhere = said.filter(({ note }) => !moments.some((one) => one.name === note.on?.moment));
  // One row while six fit, then two rows, then three, of pictures all one size; past what the frame holds, it scrolls.
  // On a phone, two to a row.
  const phone = usePhone();
  const columns = phone ? Math.min(2, moments.length) : Math.ceil(moments.length / (moments.length <= 6 ? 1 : moments.length <= 12 ? 2 : 3));
  const note = ({ note, sent }: { note: Note; sent: boolean }) => {
    const { words, fresh } = says(note, sent);
    return (
      <li key={note.id} className="flex gap-[7px]">
        {/* A dot means a note, in its colours everywhere. */}
        <i className={`mt-[5px] size-[7px] flex-none rounded-full shadow-[0_0_0_1.5px_#fff] ${sent ? "bg-slate" : "bg-amber"}`} />
        <span className="min-w-0">
          <span className="line-clamp-2 text-[12.5px] leading-[17px] text-fg">{words}</span>
          {fresh && <span className="block text-[11.5px] leading-4 font-medium text-fg">answer not opened</span>}
        </span>
      </li>
    );
  };
  return (
    <div className="absolute inset-0 overflow-y-auto rounded-lg bg-surface shadow-frame [scrollbar-width:thin]">
      {/* Clear of the bar, which hangs across the frame's foot as across the recording's. */}
      <div className="flex min-h-full flex-col justify-center gap-6 px-6 pt-6 pb-9 phone:px-4 phone:pt-4 phone:pb-8">
        <div className="grid justify-center gap-x-5 gap-y-6 phone:gap-x-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 240px))` }}>
          {moments.map((moment, i) => {
            const notes = on(moment.name);
            return (
              <div key={moment.name} className="min-w-0">
                <button onClick={() => props.onMoment(i + 1)} className="group/stop block w-full text-left focus-visible:outline-none" aria-label={moment.name}>
                  <span className="relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-[0_0_0_1px_var(--edge),0_1px_3px_var(--edge)] transition-shadow duration-200 ease-calm group-hover/stop:shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--faint)] group-focus-visible/stop:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--amber)]">
                    <StillPicture change={change} handBack={handBack} moment={moment} about={moment.about ?? moment.acted} />
                  </span>
                  {/* What happens, then as whom, as on its card on the edge. */}
                  <span className="mt-2 line-clamp-2 text-[12.5px] leading-[17px] text-fg">
                    {moment.name}
                    {moment.person && <span className="text-soft"> as {moment.person}</span>}
                  </span>
                  {props.unwatched.includes(i + 1) && <span className="block text-[11.5px] leading-4 text-soft">not watched</span>}
                </button>
                {notes.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {notes.slice(0, SHOWN).map(note)}
                    {notes.length > SHOWN && <li className="pl-[14px] text-[11.5px] leading-4 text-soft">+{notes.length - SHOWN} more</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        {elsewhere.length > 0 && <ul className="mx-auto flex w-full max-w-[540px] flex-col gap-1.5 border-t border-line pt-4">{elsewhere.map(note)}</ul>}
      </div>
    </div>
  );
}
