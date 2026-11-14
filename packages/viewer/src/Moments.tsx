// What's waiting on you from every app on this machine, each change by its title with its moments under it, a still
// each in the agent's words (List.tsx); and a moment opened, the app at the point that matters, still and as large as
// the window allows (Moment.tsx). Going on to the next moment is the yes. What you said goes to the agent by Send, or
// Done with nothing to say. The list is at /, each moment at /moments/<its change's address>/<n>: here is which.

import { useEffect, useRef, useState } from "react";
import type { Note } from "@playthrough/review";
import { useChanges, useYou, type Listed } from "./api.ts";
import { unsentOf, keepUnsent, repliesOf, keepReplies, keepScroll, openedLines, keepOpened, type Replied } from "./kept.ts";
import { List } from "./List.tsx";
import { MomentView } from "./Moment.tsx";
import { takingOf, seenOf, markSeen, latestOf, sentBy, whoIn, standingOf } from "./standing.ts";

// Where you are: the list, or a change's moment, by the change's address and the moment's place in it from 1, and a
// note open by its pin.
type Where = { review?: string; moment?: number; note?: string };

const whereFrom = (path: string, search = ""): Where => {
  const [first, ...parts] = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (first !== "moments" || !parts.length) return {};
  const moment = parts.length > 1 && /^\d+$/.test(parts.at(-1)!) ? Number(parts.pop()) : 1;
  const note = new URLSearchParams(search).get("note") ?? undefined;
  return { review: parts.join("/"), moment: Math.max(1, moment), ...(note && { note }) };
};

const pathOf = ({ review, moment, note }: Where) =>
  review ? `/moments/${review.split("/").map(encodeURIComponent).join("/")}/${moment ?? 1}${note ? `?note=${encodeURIComponent(note)}` : ""}` : "/";

export function MomentsPage() {
  const [where, setWhere] = useState(() => whereFrom(location.pathname, location.search));
  useEffect(() => {
    const back = () => setWhere(whereFrom(location.pathname, location.search));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  // Going from one moment to the next replaces the address, so the browser's back is the list, as Back is.
  const go = (to: Where, replace = false) => {
    history[replace ? "replaceState" : "pushState"](null, "", pathOf(to));
    setWhere(to);
  };
  const changes = useChanges();
  const you = useYou();
  // The tab says how many changes wait on you, so it's seen from any other.
  const waiting = changes && you ? changes.filter(({ review }) => latestOf(review) && standingOf(review, you).is === "waiting").length : 0;
  useEffect(() => void (document.title = waiting ? `${waiting} waiting · Playthrough` : "Playthrough"), [waiting]);
  // A change by its own name alone, as addresses were before every app's were listed, is the first with that name.
  const listed = where.review ? changes?.find(({ review }) => review.id === where.review || review.id.endsWith(`/${where.review}`)) : undefined;
  useEffect(() => void (listed && listed.review.id !== where.review && go({ ...where, review: listed.review.id }, true)), [listed?.review.id]);
  if (where.review) {
    if (!changes || !you || (listed && listed.review.id !== where.review)) return <div className="h-dvh bg-ground" />;
    if (!listed) return <div className="grid h-dvh place-items-center bg-ground text-soft">There's no change here.</div>;
    return <Change key={where.review} listed={listed} you={you} moment={where.moment ?? 1} note={where.note} go={go} />;
  }
  return <List changes={changes} you={you} onOpen={(review, moment, note) => (keepScroll(), go({ review, moment, note }))} />;
}

// A change's moments, one at a time. What the agent hands back while you're on one waits until you go to another, so
// nothing changes under you.
function Change({ listed, you, moment, note, go }: { listed: Listed; you: string; moment: number; note?: string; go: (to: Where, replace?: boolean) => void }) {
  const { review } = listed;
  const id = review.id;
  // Back on the list, the change you were in is open, wherever it stands.
  useEffect(() => void (openedLines().includes(id) || keepOpened([...openedLines(), id])), [id]);
  const [notes, setNotesNow] = useState(() => unsentOf(id));
  const setNotes = (change: (notes: Note[]) => Note[]) =>
    setNotesNow((now) => {
      const next = change(now);
      keepUnsent(id, next);
      return next;
    });
  const [replies, setRepliesNow] = useState(() => repliesOf(id));
  const setReplies = (change: (replies: Replied[]) => Replied[]) =>
    setRepliesNow((now) => {
      const next = change(now);
      keepReplies(id, next);
      return next;
    });
  const latest = latestOf(review);
  const at = useRef<{ moment: number; round?: number }>(undefined);
  if (at.current?.moment !== moment) at.current = { moment, round: latest?.number };
  const round = review.rounds.find((one) => one.number === at.current!.round);
  if (!round) return <div className="grid h-dvh place-items-center bg-ground text-soft">Nothing is waiting on you here.</div>;
  const n = Math.min(moment, round.scenes.length);
  const scene = round.scenes[n - 1]!;
  markSeen(review, you, [...seenOf(review, you), takingOf(round.number, scene.name)]);
  const sent = sentBy(review, you).flatMap((one) => one.notes);
  return (
    <MomentView
      key={`${round.number}`}
      review={review}
      round={round}
      n={n}
      about={scene.about}
      who={whoIn(listed, scene)}
      notes={notes}
      sent={sent}
      setNotes={setNotes}
      replies={replies}
      setReplies={setReplies}
      you={you}
      opening={note}
      onMoment={(to) => go({ review: id, moment: to }, true)}
      onLeave={() => go({})}
    />
  );
}
