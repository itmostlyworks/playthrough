// Hands the round over and waits for what people say about it. Handing over finishes the round, which the rules allow once
// every note is answered. Then it waits for a send that asks for something, takes it, and prints the notes to answer,
// each with a picture of what it's on.

import { allNotes, conversation, list, notesToAnswer, quote, Refused, roundInProgress, time, type Did, type Place } from "@mostlyworks/vantage-review";
import { agent } from "./agent.ts";
import { keepFlows } from "./flows.ts";
import { pictureNotes } from "./noted.ts";
import type { Repo } from "./repo.ts";

export async function wait(repo: Repo, id: string) {
  const reviews = repo.reviews;
  let review = await reviews.get(id);
  const last = review.rounds.at(-1);
  if (!review.accepted) {
    if (!last || last.number === 0) throw new Refused([`There's nothing to hand over yet. Record round 1 first: vantage record ${id}`]);
    if (!last.finished) {
      try {
        await reviews.finish(id, last.number);
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
        throw new Refused([
          `Round ${last.number} isn't ready to hand over yet:`,
          ...error.problems.map((problem) => `  ${problem}`),
          `${error.problems.length > 1 ? "Fix these" : "Fix it"} in ${repo.show(repo.round(id, last.number))}, then hand it over again: vantage wait ${id}`,
        ]);
      }
      console.log(`Round ${last.number} is ready for review.`);
    }
    console.log(`Waiting for notes on ${id}…`);
  }

  for (;;) {
    review = await reviews.wait(id, (review) => !!review.accepted || review.sends.some((send) => !review.taken.some((taken) => taken.send === send.id)));
    if (review.accepted) {
      const { joined, updated } = await keepFlows(repo, review);
      const kept = [
        joined.length && `${list(joined.map(quote))} joined the app's flows in vantage/flows/`,
        updated.length && `${list(updated.map(quote))} ${updated.length > 1 ? "were" : "was"} updated there`,
      ].filter(Boolean);
      const them = joined.length + updated.length > 1 ? "them" : "it";
      return console.log(
        `\n${review.accepted.by} accepted the work. The review is done.${kept.length ? ` ${kept.join(", and ")}: commit ${them} with the work, so every later review records ${them} too.` : ""}`,
      );
    }
    const taken = await reviews.take(id);
    review = await reviews.get(id);
    const round = roundInProgress(review);
    const asking = notesToAnswer(review, round);
    for (const send of taken) {
      const good = [
        ...send.looksGood.map(quote),
        ...send.verdicts.filter((verdict) => verdict.verdict === "looks good").map((verdict) => `your answer to note ${verdict.note}`),
      ];
      if (good.length) console.log(`\n${send.by} says ${list(good)} ${good.length > 1 ? "look" : "looks"} good.`);
    }
    if (!asking.length) continue;

    const notes = allNotes(review);
    const you = agent();
    const pictures = await pictureNotes(repo, review, round, asking);
    console.log(`\nNotes to answer in round ${round}:`);
    for (const note of asking) {
      const turns = conversation(review, note).map((turn) => {
        const who = turn.agent ? `${turn.by === you ? "You" : turn.by}, in round ${turn.round}` : turn.verdict ? `${turn.by}, ${turn.verdict}` : turn.by;
        return `    ${who}${turn.words.trim() ? `: ${turn.words}` : ""}`;
      });
      const picture = pictures.get(note);
      console.log(`\n  ${note}  ${where(notes.get(note)?.note.on)}${picture ? `\n    As they saw it: ${picture}` : ""}\n${turns.join("\n")}`);
    }
    const first = pictures.size ? "Look at what each note is on, change" : "Change";
    return console.log(`\n${first} the app, then record round ${round}: vantage record ${id}`);
  }
}

function where(place: Place | undefined): string {
  if (!place) return "on the work in general";
  const at = place.at === undefined ? "" : ` at ${time(place.at)}${place.until === undefined ? "" : ` to ${time(place.until)}`}`;
  const on = place.element
    ? `, the ${place.element.role} “${place.element.name}”`
    : place.point
      ? `, ${share(place.point.x)} across and ${share(place.point.y)} down the screen`
      : place.box
        ? `, the part of the screen ${share(place.box.x)} across and ${share(place.box.y)} down`
        : "";
  if (place.app) return `on “${place.app.from.flow}”, in the app: taken over at ${time(place.app.from.at)}, then ${place.app.did.length ? list(place.app.did.map(done)) : "nothing done there yet"}${on}`;
  return `on “${place.flow}”${at}${on}`;
}

// What a person did in the app, as they'd say it.
function done({ does, with: given, what }: Did): string {
  const named = what ? ` “${what}”` : "";
  if (does === "fill") return `typed “${given}” into${named || " a box"}`;
  if (does === "press") return `pressed ${given}`;
  if (does === "selectOption") return `chose “${given}”${named && ` in${named}`}`;
  return `clicked${named || " something with no words"}`;
}

const share = (fraction: number) => `${Math.round(fraction * 100)}%`;
