// What's waiting on you from every app on this machine, each change by its title with its moments under it, a still
// each in the agent's words (List.tsx); and a moment opened, the app at the point that matters, still and as large as
// the window allows (Moment.tsx). Going on to the next moment is the yes. What you said goes to the agent by Send, or
// Done with nothing to say. The list is at /, each moment at /moments/<its change's address>/<n>: here is which.

import { useEffect, useRef, useState } from "react";
import { latestOf, sentBy, standingOf, type Note } from "@playthrough/change";
import { useChanges, useYou, type Listed } from "./api.ts";
import { useUnsent, keepUnsent, keepScroll, openedLines, keepOpened, type YourReply } from "./kept.ts";
import { List } from "./List.tsx";
import { MomentView } from "./Moment.tsx";
import { takingOf, markSeen, whoIn } from "./standing.ts";

// Where you are: the list, or a change's moment, by the change's address and the moment's place in it from 1, and a
// note open by its pin.
type Where = { change?: string; moment?: number; note?: string };

const whereFrom = (path: string, search = ""): Where => {
  const [first, ...parts] = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (first !== "moments" || !parts.length) return {};
  const moment = parts.length > 1 && /^\d+$/.test(parts.at(-1)!) ? Number(parts.pop()) : 1;
  const note = new URLSearchParams(search).get("note") ?? undefined;
  return { change: parts.join("/"), moment: Math.max(1, moment), ...(note && { note }) };
};

const pathOf = ({ change, moment, note }: Where) =>
  change ? `/moments/${change.split("/").map(encodeURIComponent).join("/")}/${moment ?? 1}${note ? `?note=${encodeURIComponent(note)}` : ""}` : "/";

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
  const waiting = changes && you ? changes.filter(({ change }) => latestOf(change) && standingOf(change, you).is === "waiting").length : 0;
  useEffect(() => void (document.title = waiting ? `${waiting} waiting · Playthrough` : "Playthrough"), [waiting]);
  // A change by its own name alone, as addresses were before every app's were listed, is the first with that name.
  const listed = where.change ? changes?.find(({ change }) => change.id === where.change || change.id.endsWith(`/${where.change}`)) : undefined;
  useEffect(() => void (listed && listed.change.id !== where.change && go({ ...where, change: listed.change.id }, true)), [listed?.change.id]);
  if (where.change) {
    if (!changes || !you || (listed && listed.change.id !== where.change)) return <div className="h-dvh bg-ground" />;
    if (!listed) return <div className="grid h-dvh place-items-center bg-ground text-soft">There's no change here.</div>;
    return <Change key={where.change} listed={listed} you={you} moment={where.moment ?? 1} note={where.note} go={go} />;
  }
  return <List changes={changes} you={you} onOpen={(change, moment, note) => (keepScroll(), go({ change, moment, note }))} />;
}

// A change's moments, one at a time. What the agent hands back while you're on one waits until you go to another, so
// nothing changes under you.
function Change({ listed, you, moment, note, go }: { listed: Listed; you: string; moment: number; note?: string; go: (to: Where, replace?: boolean) => void }) {
  const { change } = listed;
  const id = change.id;
  // Back on the list, the change you were in is open, wherever it stands.
  useEffect(() => void (openedLines().includes(id) || keepOpened([...openedLines(), id])), [id]);
  const latest = latestOf(change);
  const { notes, replies } = useUnsent(id, latest?.number ?? 1);
  const setNotes = (edit: (notes: Note[]) => Note[]) => keepUnsent(id, latest?.number ?? 1, (now) => ({ ...now, notes: edit(now.notes) }));
  const setReplies = (edit: (replies: YourReply[]) => YourReply[]) => keepUnsent(id, latest?.number ?? 1, (now) => ({ ...now, replies: edit(now.replies) }));
  const at = useRef<{ moment: number; round?: number }>(undefined);
  if (at.current?.moment !== moment) at.current = { moment, round: latest?.number };
  const round = change.rounds.find((one) => one.number === at.current!.round);
  const n = round && Math.min(moment, round.scenes.length);
  // Opened, it's seen: for the list, and for next time.
  const taking = round && n && takingOf(round.number, round.scenes[n - 1]!.name);
  useEffect(() => void (taking && markSeen(change, you, [taking])), [taking]);
  if (!round || !n) return <div className="grid h-dvh place-items-center bg-ground text-soft">Nothing is waiting on you here.</div>;
  const scene = round.scenes[n - 1]!;
  const sent = sentBy(change, you).flatMap((one) => one.notes);
  return (
    <MomentView
      key={`${round.number}`}
      change={change}
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
      onMoment={(to) => go({ change: id, moment: to }, true)}
      onLeave={() => go({})}
    />
  );
}
