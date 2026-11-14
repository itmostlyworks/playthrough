// Compare: a moment as it is now beside how it was when you last saw it, played together.

import type { Cut } from "./Player.tsx";

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

// What each side is, at its top left.
export const CHIP = "pointer-events-none absolute top-2.5 left-2.5 z-3 rounded-md bg-ground px-2 py-0.5 text-xs leading-4 text-soft shadow-tip";
