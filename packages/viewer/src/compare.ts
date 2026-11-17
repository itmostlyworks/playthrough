// Compare: a moment as it is now beside how it was when you last saw it, played together.

import type { Reading, Thing } from "@playthrough/page";
import type { Finding } from "@playthrough/change";
import type { Cut } from "./Player.tsx";
import type { Box } from "./view.ts";

// Two recordings of a moment played together, from the moments both pass together: now with its waiting cut short, as
// it plays alone, and where only the other moves, as long as that takes there. Along it, where each is; and where now's
// moment first is along it.
type Played = { at: (along: number) => [number, number]; of: (moment: number) => number };

export function playedTogether(cut: Cut, [now, then]: [number[], number[]]): Played {
  const spans = now.slice(1).map((to, i) => (to > now[i]! ? cut.cut(to) - cut.cut(now[i]!) : then[i + 1]! - then[i]!));
  const starts = spans.map((_, i) => spans.slice(0, i).reduce((sum, span) => sum + span, 0));
  return {
    at(along) {
      const i = Math.max(0, starts.findLastIndex((start) => start <= along));
      const into = Math.min(Math.max(0, along - starts[i]!), spans[i] ?? 0);
      if (now[i + 1] === undefined) return [now[i]!, then[i]!];
      if (now[i + 1] === now[i]) return [now[i]!, then[i]! + into];
      const moment = cut.real(cut.cut(now[i]!) + into);
      return [moment, then[i]! + ((then[i + 1]! - then[i]!) * (moment - now[i]!)) / (now[i + 1]! - now[i]!)];
    },
    of(moment) {
      const i = now.findIndex((to, k) => k > 0 && to >= moment && to > now[k - 1]!) - 1;
      if (i < 0) return moment <= 0 ? 0 : starts.at(-1)! + spans.at(-1)!;
      return starts[i]! + cut.cut(Math.max(moment, now[i]!)) - cut.cut(now[i]!);
    },
  };
}

// What changed in a moment since it was last seen, where it is on either side at the moment's point: each thing found
// changed, and what it changed alike with; something gone, where it was. Found as a part of the page, a whole table with
// “8 things changed inside”, it's the things the hand-back counted inside it, on whichever side each is, else the part
// itself.
export function changedAt(findings: Finding[], moment: string, then: Reading | undefined, now: Reading): Box[] {
  return findings.flatMap((finding) =>
    finding.seen.flatMap((place) => {
      if (place.moment !== moment) return [];
      if (place.element) return [place.element, ...(place.alike ?? [])].flatMap((named) => calledIn(finding.gone ? then : now, named));
      if (place.point) return [{ left: place.point.x * now.screen.width, top: place.point.y * now.screen.height, width: 0, height: 0 }];
      if (!place.box) return [];
      const things = (place.inside ?? []).flatMap((named) => [...calledIn(now, named), ...calledIn(then, named)]);
      return things.length ? things : [{ left: place.box.x * now.screen.width, top: place.box.y * now.screen.height, width: place.box.width * now.screen.width, height: place.box.height * now.screen.height }];
    }),
  );
}

// Where the things called so are on the screen, as a reading has them.
export const calledIn = (reading: Reading | undefined, named: { role: string; name: string }): Box[] =>
  (reading?.things ?? []).filter((thing) => thing.role === named.role && thing.name === named.name).map(boxOf);
const boxOf = (thing: Thing): Box => ({ left: thing.box.x, top: thing.box.y, width: thing.box.width, height: thing.box.height });

// What each side is, at its top left, in a note card's ink and edge, so it reads over any app in either scheme.
export const CHIP = "pointer-events-none absolute top-2.5 left-2.5 z-3 rounded-md bg-surface px-2 py-0.5 text-xs leading-4 text-fg shadow-tip";
