// Who does a scene: the person it's done as, then each it's handed to, in order. Once a review has more than one person
// in it, every scene says who, by its name: “as a patient, then Dr. Lee”. One done by everyone alike says nothing.

import type { Scene, Review } from "@playthrough/review";

const handsOf = (scene: Scene): string[] => [...new Set([scene.person, ...scene.steps.map((step) => step.person)].filter((person): person is string => !!person))];

// Whoever has it at a moment: the person it was last handed to by then, from the moment their page first shows (one of
// `loads`), as until then it's still the other's on screen.
export function personAt(scene: Scene, at: number, loads: number[] = []) {
  const i = scene.steps.findLastIndex((step) => step.at <= at);
  const step = scene.steps[i];
  if (!step) return scene.person;
  const person = step.person ?? scene.person;
  const before = scene.steps[i - 1]?.person ?? scene.person;
  const load = loads.find((moment) => moment >= step.at);
  return person !== before && load !== undefined && at < load ? before : person;
}

export const manyIn = (review: Review) => new Set(review.rounds.flatMap((round) => round.scenes.flatMap(handsOf))).size > 1;

export function asWho(scene: Scene) {
  const hands = handsOf(scene);
  return hands.length ? `as ${hands.join(", then ")}` : "";
}
