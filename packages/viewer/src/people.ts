// Who does a flow: the person it's done as, then each it's handed to, in order. Once a review has more than one person
// in it, every flow says who, by its name: “as a patient, then Dr. Lee”. One done by everyone alike says nothing.

import type { Flow, Review } from "@mostlyworks/vantage-review";

export const handsOf = (flow: Flow): string[] => [...new Set([flow.person, ...flow.steps.map((step) => step.person)].filter((person): person is string => !!person))];

// Whoever has it at a moment: the person it was last handed to by then.
export const personAt = (flow: Flow, at: number) => flow.steps.findLast((step) => step.at <= at)?.person ?? flow.person;

export const manyIn = (review: Review) => new Set(review.rounds.flatMap((round) => round.flows.flatMap(handsOf))).size > 1;

export function asWho(flow: Flow) {
  const hands = handsOf(flow);
  return hands.length ? `as ${hands.join(", then ")}` : "";
}
