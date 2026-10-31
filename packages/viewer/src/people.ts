// Who does a flow: the person it's done as, then each it's handed to, in order. Once a review has more than one person
// in it, every flow says who, by its name: “as a patient, then Dr. Lee”. One done by everyone alike says nothing.

import type { Flow, Review } from "@mostlyworks/vantage-review";

const handsOf =(flow: Flow): string[] => [...new Set([flow.person, ...flow.steps.map((step) => step.person)].filter((person): person is string => !!person))];

// Whoever has it at a moment: the person it was last handed to by then, from the moment their page first shows (one of
// `loads`), as until then it's still the other's on screen.
export function personAt(flow: Flow, at: number, loads: number[] = []) {
  const i = flow.steps.findLastIndex((step) => step.at <= at);
  const step = flow.steps[i];
  if (!step) return flow.person;
  const person = step.person ?? flow.person;
  const before = flow.steps[i - 1]?.person ?? flow.person;
  const load = loads.find((moment) => moment >= step.at);
  return person !== before && load !== undefined && at < load ? before : person;
}

export const manyIn = (review: Review) => new Set(review.rounds.flatMap((round) => round.flows.flatMap(handsOf))).size > 1;

export function asWho(flow: Flow) {
  const hands = handsOf(flow);
  return hands.length ? `as ${hands.join(", then ")}` : "";
}
