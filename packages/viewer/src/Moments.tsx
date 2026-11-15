// What's next, from every app on this machine. / opens on the next change waiting on you, its opening card
// (Opening.tsx); its moments go one by one with Next (Moment.tsx), each at /moments/<its change's address>/<n>, and
// after the last, Next comes back to the change's card, at /moments/<its change's address>/end, holding the one step
// left for it, which goes on to the next change's card.
// Top left on every page, how many wait on you opens every change as a sheet over the page (Waiting.tsx), from which
// any can be gone to. Going on to the next moment is the yes; what you said goes to the agent by Send, or Done with
// nothing to say. Here is which page, and what's next.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { latestOf, sentBy, type Note } from "@playthrough/change";
import { useChanges, useYou, type Listed } from "./api.ts";
import { Changes } from "./Changes.tsx";
import { useUnsent, keepUnsent, type YourReply } from "./kept.ts";
import { MomentView } from "./Moment.tsx";
import { NothingWaiting, Opening } from "./Opening.tsx";
import { takingOf, markSeen, whoIn } from "./standing.ts";
import { unreadOf, waitingInOrder } from "./step.ts";
import { Opener, Sheet, useSheet, waitingSays } from "./Waiting.tsx";

// Where you are: what's next, or a change's moment, by the change's address and the moment's place in it from 1, and a
// note open by its pin; or a change's card after its last moment, its end.
export type Where = { change?: string; moment?: number; note?: string; end?: true };
export type Go = (to: Where, replace?: boolean) => void;

const whereFrom = (path: string, search = ""): Where => {
  const [first, ...parts] = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (first !== "moments" || !parts.length) return {};
  if (parts.length > 1 && parts.at(-1) === "end") return { change: parts.slice(0, -1).join("/"), end: true };
  const moment = parts.length > 1 && /^\d+$/.test(parts.at(-1)!) ? Number(parts.pop()) : 1;
  const note = new URLSearchParams(search).get("note") ?? undefined;
  return { change: parts.join("/"), moment: Math.max(1, moment), ...(note && { note }) };
};

const pathOf = ({ change, moment, note, end }: Where) =>
  change ? `/moments/${change.split("/").map(encodeURIComponent).join("/")}/${end ? "end" : (moment ?? 1)}${note ? `?note=${encodeURIComponent(note)}` : ""}` : "/";

// The browser's own mark on a change's end come to from its last moment, so going back up is the browser's Back.
const AFTER_THE_LAST = "after the last moment";

export function MomentsPage() {
  const [where, setWhere] = useState(() => whereFrom(location.pathname, location.search));
  useEffect(() => {
    const back = () => setWhere(whereFrom(location.pathname, location.search));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  const sheet = useSheet();
  // Going from one moment to the next, or one card at / to the next, replaces the address, so the browser's back is
  // where you came from. Going anywhere closes the sheet.
  const go: Go = (to, replace = false) => {
    sheet.close(false);
    const path = pathOf(to);
    if (path === location.pathname + location.search) replace = true;
    history[replace ? "replaceState" : "pushState"](to.end && where.change === to.change && !replace ? AFTER_THE_LAST : null, "", path);
    setWhere(to);
  };
  const changes = useChanges();
  const you = useYou();
  // The changes you've finished here, each as it was handed back, so the next card is the next change even before the
  // changes come back with where it stands now.
  const [passed, setPassed] = useState<string[]>([]);
  const passing = (listed: Listed) => `${listed.change.id}:${latestOf(listed.change)?.number}`;
  // The changes gone on from with Next from their card, left waiting: each comes after the rest, in the order left.
  const [later, setLater] = useState<string[]>([]);
  // A card whose Done or Send was pressed stays, saying so, though the change has already moved on.
  const [taking, setTaking] = useState<Listed>();
  const waiting = changes && you ? waitingInOrder(changes, you).filter((one) => !passed.includes(passing(one))).sort((a, b) => later.indexOf(passing(a)) - later.indexOf(passing(b))) : [];
  // The answers that were new as you came to a change, each on its moment, kept from the first look in, and the ones
  // you've opened since: one gone past unopened is still new, on its note and on the change's card at its end.
  const asYouCame = useRef(new Map<string, { note: string; moment: number }[]>());
  const [opened, setOpened] = useState<string[]>([]);
  const unopenedOf = (listed: Listed) => {
    const key = passing(listed);
    if (!asYouCame.current.has(key)) asYouCame.current.set(key, unreadOf(listed, you!));
    return asYouCame.current.get(key)!.filter((one) => !opened.includes(one.note));
  };
  // The tab says how many changes wait on you, so it's seen from any other.
  useEffect(() => void (document.title = waiting.length ? `${waitingSays(waiting.length)} · Playthrough` : "Playthrough"), [waiting.length]);
  // A change by its own name alone, as addresses were before every app's were listed, is the first with that name.
  const listed = where.change ? changes?.find(({ change }) => change.id === where.change || change.id.endsWith(`/${where.change}`)) : undefined;
  useEffect(() => void (listed && listed.change.id !== where.change && go({ ...where, change: listed.change.id }, true)), [listed?.change.id]);
  useSpaceStays();
  if (!changes || !you) return <div className="h-dvh bg-ground" />;

  const opener = <Opener waiting={waiting.length} open={sheet.open} onOpen={sheet.openBy} />;
  // On from a change to the next's card: finished, as it was handed back; or left waiting, after the rest.
  const goOn = (from: Listed) => (setPassed((now) => [...now, passing(from)]), go({}));
  const leave = (from: Listed) => (setLater((now) => [...now.filter((one) => one !== passing(from)), passing(from)]), go({}));
  const elseWaiting = (from: Listed) => waiting.some((one) => one.change.id !== from.change.id);
  const card = taking ?? waiting[0];
  const opening = (listed: Listed, end: boolean) => (
    <Opening
      key={listed.change.id}
      listed={listed}
      you={you}
      end={end}
      unopened={unopenedOf(listed)}
      opener={opener}
      go={go}
      afterTheLast={history.state === AFTER_THE_LAST}
      onTaking={() => setTaking(listed)}
      goOn={() => (setTaking(undefined), goOn(listed))}
      leave={elseWaiting(listed) ? () => leave(listed) : undefined}
    />
  );
  let page: ReactNode;
  if (where.change) {
    if (listed && listed.change.id !== where.change) page = <div className="h-dvh bg-ground" />;
    else if (!listed) page = <div className="grid h-dvh place-items-center bg-ground text-soft">There's no change here.</div>;
    else if (where.end) page = opening(listed, true);
    else
      page = (
        <Change
          key={where.change}
          listed={listed}
          you={you}
          moment={where.moment ?? 1}
          note={where.note}
          go={go}
          opener={opener}
          unopened={unopenedOf(listed).map((one) => one.note)}
          onOpened={(note) => setOpened((now) => (now.includes(note) ? now : [...now, note]))}
        />
      );
  } else if (card) page = opening(card, false);
  else page = <NothingWaiting changes={changes} you={you} opener={opener} />;

  return (
    <>
      <div inert={!!sheet.open}>{page}</div>
      {sheet.open && (
        <Sheet pointed={sheet.open === "pointed"} onClose={() => sheet.close(true)}>
          <Changes changes={changes} you={you} onOpen={(change, moment, note) => go({ change, moment, note })} />
        </Sheet>
      )}
    </>
  );
}

// Space plays or does nothing, and never says anything to the agent: on a button that would (Done, Send), it isn't a
// press. Only pressing it, or Enter, does.
function useSpaceStays() {
  useEffect(() => {
    const down = (event: KeyboardEvent) => event.key === " " && event.target instanceof Element && event.target.closest("[data-goes-on]") && event.preventDefault();
    addEventListener("keydown", down, { capture: true });
    addEventListener("keyup", down, { capture: true });
    return () => (removeEventListener("keydown", down, { capture: true }), removeEventListener("keyup", down, { capture: true }));
  }, []);
}

// A change's moments, one at a time. What the agent hands back while you're on one waits until you go to another, so
// nothing changes under you.
function Change(props: { listed: Listed; you: string; moment: number; note?: string; go: Go; opener: ReactNode; unopened: string[]; onOpened: (note: string) => void }) {
  const { listed, you, moment, note, go } = props;
  const { change } = listed;
  const id = change.id;
  const latest = latestOf(change);
  const { notes, replies } = useUnsent(id, latest?.number ?? 1);
  const setNotes = (edit: (notes: Note[]) => Note[]) => keepUnsent(id, latest?.number ?? 1, (now) => ({ ...now, notes: edit(now.notes) }));
  const setReplies = (edit: (replies: YourReply[]) => YourReply[]) => keepUnsent(id, latest?.number ?? 1, (now) => ({ ...now, replies: edit(now.replies) }));
  const at = useRef<{ moment: number; handBack?: number }>(undefined);
  if (at.current?.moment !== moment) at.current = { moment, handBack: latest?.number };
  const handBack = change.handBacks.find((one) => one.number === at.current!.handBack);
  const n = handBack && Math.min(moment, handBack.moments.length);
  // Opened, it's seen: for what's next, and for next time.
  const taking = handBack && n && takingOf(handBack.number, handBack.moments[n - 1]!.name);
  useEffect(() => void (taking && markSeen(change, you, [taking])), [taking]);
  if (!handBack || !n) return <div className="grid h-dvh place-items-center bg-ground text-soft">Nothing is waiting on you here.</div>;
  const shown = handBack.moments[n - 1]!;
  const sent = sentBy(change, you).flatMap((one) => one.notes);
  return (
    <MomentView
      key={`${handBack.number}`}
      change={change}
      app={listed.app}
      handBack={handBack}
      n={n}
      about={shown.about}
      who={whoIn(listed, shown)}
      notes={notes}
      sent={sent}
      setNotes={setNotes}
      replies={replies}
      setReplies={setReplies}
      you={you}
      opening={note}
      opener={props.opener}
      unopened={props.unopened}
      onOpened={props.onOpened}
      onMoment={(to) => go({ change: id, moment: to }, true)}
      onEnd={() => go({ change: id, end: true })}
    />
  );
}
