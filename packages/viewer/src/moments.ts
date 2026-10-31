// Where you are in a round: a flow, and a moment in its recording, in seconds from its start. Each flow opens with its
// title card, part of its time like everything else: for the CARD seconds before its recording starts, its name is up
// over the page its first step left. The times people see are within a flow, from its recording's start.

import type { Flow } from "@playthrough/review";

export type Moment = { flow: string; at: number };

export const CARD = 1.2;
// A flow recorded in another shape (a phone after a laptop) takes its own shape in the first part of its card.
export const MORPH = 0.3;
// Going to a flow lands where its name is up and the frame has its own shape.
export const FLOW_IN = -CARD + MORPH;
// A review opens as a video does before you press play: the first flow's name over its first step's page, softened.
export const POSTER = -CARD + 0.5;

export const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// How soft the first frame is and how clearly the name shows, from 0 to 1, while the title card is up: the frame goes
// soft as the name comes up, holds long enough to read, then sharpens as the recording starts.
export function titleCard(at: number): { soft: number; name: number } | undefined {
  if (at >= 0) return undefined;
  const u = at + CARD;
  return {
    soft: ease(clamp(u / 0.22)) * (1 - ease(clamp((u - (CARD - 0.3)) / 0.3))),
    name: clamp((u - 0.04) / 0.2) * (1 - clamp((u - (CARD - 0.34)) / 0.22)),
  };
}

// A round's flows end to end, each with its card, so a step back or forward can cross from one flow into the next.
export function along(flows: Flow[], moment: Moment): number {
  let start = 0;
  for (const flow of flows) {
    if (flow.name === moment.flow) return start + CARD + moment.at;
    start += CARD + flow.length;
  }
  return 0;
}

export function momentAt(flows: Flow[], seconds: number): Moment {
  let start = 0;
  for (const flow of flows) {
    if (seconds < start + CARD + flow.length || flow === flows.at(-1)) return { flow: flow.name, at: clamp(seconds - start - CARD, -CARD, flow.length) };
    start += CARD + flow.length;
  }
  return { flow: "", at: 0 };
}
