// Every review of the app, from every copy of it: where you arrive without a review's address, and where Playthrough's
// name takes you. It's the page with every flow a level up: the app's name, then its reviews as a list, what waits for
// you first and otherwise the newest, each saying where it stands for you as its round does; and beside them the frame,
// showing the review you point at as it opens, its title over its first picture. Opened, its frame is where this one is.

import { useEffect, useState } from "react";
import type { Review, Round } from "@playthrough/review";
import { picture, useReviews, useYou } from "./api.ts";
import { unsentOn, watchedOf } from "./draft.ts";
import { FRAME, LIST, ROW, SPREAD, THUMB, ToCheck, Veiled } from "./Grid.tsx";
import { needsYou, seen, standings, watchedOn, workingSince } from "./notes.ts";
import { Picture } from "./Picture.tsx";
import { Page } from "./Review.tsx";
import { clock, roundName } from "./Rounds.tsx";

// Where a review stands for you, worked out as its own page does, from the review and what's kept in your browser.
type Standing = { review: Review; latest?: Round; toCheck: number; good: boolean; working?: string; moved: string };

function standingOf(kept: Review, you: string): Standing {
  const review = seen(kept);
  const latest = review.rounds.findLast((round) => round.number > 0);
  const moved = [review.started, ...review.rounds.map((round) => round.finished ?? ""), ...review.sends.map((send) => send.sent), ...review.taken.map((taken) => taken.at), review.accepted?.at ?? ""].sort().at(-1)!;
  if (!latest) return { review, toCheck: 0, good: false, moved };
  const standing = standings(review, latest.number, you, unsentOn(review.id), watchedOn(review, latest.number, watchedOf(review.id)));
  return {
    review,
    latest,
    toCheck: review.accepted ? 0 : latest.flows.filter((flow) => needsYou(standing.get(flow.name))).length,
    good: latest.flows.every((flow) => standing.get(flow.name)?.is === "good"),
    working: workingSince(review, latest),
    moved,
  };
}

const first = (a: Standing, b: Standing) => Number(b.toCheck > 0) - Number(a.toCheck > 0) || b.moved.localeCompare(a.moved);

export function Reviews() {
  const listed = useReviews();
  const you = useYou();
  // The review you point at stays in the frame until you leave the list and the frame both, so you can go across to it.
  const [pointed, setPointed] = useState<string>();
  useEffect(() => void (document.title = listed ? `${listed.app} · Playthrough` : "Playthrough"), [listed]);
  if (!listed || !you) return <Page />;
  if (!listed.reviews.length) return <Page><p className="m-auto text-soft">There are no reviews here yet. An agent starts one with playthrough start.</p></Page>;
  const all = listed.reviews.map((review) => standingOf(review, you)).sort(first);
  const shown = all.find((it) => it.review.id === pointed) ?? all[0]!;

  return (
    <Page>
      <main className="relative min-h-0">
        <div className="absolute inset-0 flex overflow-y-auto">
          <div className={SPREAD} onPointerLeave={() => setPointed(undefined)}>
            <div className={LIST}>
              <h2 className="line-clamp-2 px-2.5 text-[15px] leading-[21px] font-semibold">{listed.app}</h2>
              <div className="-mx-1 mt-5 min-h-0 overflow-y-auto px-1">
                {all.map((it) => (
                  <Row key={it.review.id} it={it} on={it === shown} onPoint={setPointed} />
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-col justify-center">
              <a href={`/${shown.review.id}`} className={`${FRAME} block`} aria-label={`Open ${shown.review.title}`}>
                <FirstPicture it={shown} />
                <Veiled>{shown.review.title}</Veiled>
              </a>
              {/* Where a round's page has its one step: here the frame and the rows are the way in. */}
              <div className="mt-3 min-h-8" />
            </div>
          </div>
        </div>
      </main>
    </Page>
  );
}

// A review in the list: its first picture, its title, and under it where it stands, in its round's words; at its end,
// when it last moved.
function Row({ it, on, onPoint }: { it: Standing; on: boolean; onPoint: (review: string) => void }) {
  return (
    <a href={`/${it.review.id}`} data-on={on ? "" : undefined} className={ROW} onPointerEnter={() => onPoint(it.review.id)} onFocus={() => onPoint(it.review.id)}>
      <span className={THUMB}>
        <FirstPicture it={it} />
      </span>
      <span className="grid min-w-0">
        <span className="line-clamp-2 text-[13px] leading-[18px] text-fg">{it.review.title}</span>
        <span className="mt-0.5 text-xs leading-4">
          <Stands it={it} />
        </span>
      </span>
      <span className="self-start text-xs leading-[18px] whitespace-nowrap text-faint tabular-nums">{when(it.moved)}</span>
    </a>
  );
}

// As its round says it on its page: the round, or the next one coming while the agent works, then what's yours to check,
// or all good; or accepted.
function Stands({ it }: { it: Standing }) {
  if (it.review.accepted) return <span className="text-green">Accepted</span>;
  if (!it.latest) return <span className="text-faint">Nothing recorded yet</span>;
  // A row is narrower than the round's line: what doesn't fit goes under, whole.
  return (
    <span className="flex flex-wrap gap-x-1.5 text-soft">
      {it.working ? (
        <span className="text-slate before:mr-1.5 before:mb-px before:inline-block before:size-1.5 before:animate-breathe before:rounded-full before:bg-slate before:align-middle before:content-['']">
          {roundName(it.latest.number + 1)} coming
        </span>
      ) : (
        <span>{roundName(it.latest.number)}</span>
      )}
      {it.toCheck ? <ToCheck count={it.toCheck} /> : it.good ? <span>· All good</span> : null}
    </span>
  );
}

// The page its first flow starts on, on its latest round; before a round, the paper it will be on.
function FirstPicture({ it }: { it: Standing }) {
  const flow = it.latest?.flows[0];
  return flow ? <Picture key={it.review.id} shot={{ src: picture(it.review.id, it.latest!.number, flow.recording, 0) }} /> : null;
}

// Today, the time, as everything in the viewer says it; before, the day.
function when(iso: string): string {
  const then = new Date(iso);
  return then.toDateString() === new Date().toDateString() ? clock(iso) : then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
