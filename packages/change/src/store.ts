// The change store: the steps of the loop, each checked against the rules before anything is kept.
// Where things are kept is a Storage, so a folder, memory and later a hosted store all keep changes the same way.

import { FORMAT, roundNow, sendNow, wayNow } from "./format.ts";
import type { Comparison, Change, Round, Seen, Send, Taken } from "./model.ts";
import {
  problemsFinishing,
  problemsStarting,
  problemsWithComparison,
  problemsWithFile,
  problemsWithFileName,
  problemsWithId,
  problemsWithRound,
  problemsWithSend,
  problemsSeeing,
  roundInProgress,
} from "./rules.ts";
import { list, quote } from "./words.ts";

export interface Storage {
  read(path: string): Promise<Uint8Array | undefined>;
  write(path: string, bytes: Uint8Array): Promise<void>; // whole or not at all: a reader never sees half a file
  list(folder: string): Promise<string[]>; // the names directly inside
  watch(folder: string, changed: () => void): () => void; // returns how to stop watching
}

// Thrown when a step breaks a rule. Nothing has been kept.
export class Refused extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(problems.join("\n"));
    this.name = "Refused";
    this.problems = problems;
  }
}

// How a change is laid out in its storage, each file with one writer:
//   <change>/review.json                 the agent, when it starts
//   <change>/rounds/<n>/round.json       the agent, until the round is finished
//   <change>/rounds/<n>/files/<name>     the agent: recordings, pictures
//   <change>/rounds/<n>/since/<k>.json   Playthrough: round n compared with round k, while n is being worked on
//   <change>/sends/<id>.json             whoever sent it, once: never written again, but by Playthrough bringing it
//                                        to this format
//   <change>/scenes/<moment>.ts          the agent: each moment's way there, its step the moment itself
//   <change>/taken.json                  the agent
//   <change>/seen.json                   each person, through the page, as they open a moment
//   <change>/branches/<name>             each person, through the page: what they did in the app, and its pictures
export class Changes {
  storage: Storage;
  #queues = new Map<string, Promise<unknown>>();

  constructor(storage: Storage) {
    this.storage = storage;
  }

  async list(): Promise<string[]> {
    // Only what's named like a change is one: Playthrough keeps a few files of its own beside them.
    const ids = (await this.storage.list("")).filter((id) => !problemsWithId(id).length);
    const started = await Promise.all(ids.map(async (id) => (await this.storage.read(`${id}/review.json`)) !== undefined));
    return ids.filter((_, i) => started[i]).sort();
  }

  async get(id: string): Promise<Change> {
    if (problemsWithId(id).length) throw new Refused(problemsWithId(id));
    // Kept in another format, it's brought along first, in its turn with every other step on it.
    const kept = await this.#readJson<About>(`${id}/review.json`);
    if (kept && kept.format !== FORMAT) await this.#one(id, async () => {});
    return this.#read(id);
  }

  async #read(id: string): Promise<Change> {
    const about = await this.#readJson<About>(`${id}/review.json`);
    if (!about) {
      const others = await this.list();
      throw new Refused([`There's no change called “${id}”.${others.length ? ` The changes here: ${list(others.map(quote))}.` : ""}`]);
    }

    const numbers = (await this.storage.list(`${id}/rounds`)).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    const rounds = await Promise.all(numbers.map((n) => this.#readJson<Round>(`${id}/rounds/${n}/round.json`)));
    const comparisons = await Promise.all(
      numbers.map(async (n) => {
        const names = (await this.storage.list(`${id}/rounds/${n}/since`)).filter((name) => name.endsWith(".json"));
        return Promise.all(names.map((name) => this.#readJson<Comparison>(`${id}/rounds/${n}/since/${name}`)));
      }),
    );
    const names = (await this.storage.list(`${id}/sends`)).filter((name) => name.endsWith(".json"));
    const sends = await Promise.all(names.map((name) => this.#readJson<Send>(`${id}/sends/${name}`)));
    const seen = await this.#readJson<Record<string, Seen[]>>(`${id}/seen.json`);

    return {
      id,
      title: about.title,
      ...(about.asked && { asked: about.asked }),
      started: about.started,
      rounds: rounds.filter((round) => round !== undefined),
      comparisons: comparisons.flat().filter((comparison) => comparison !== undefined).sort((a, b) => a.round - b.round || a.since - b.since),
      sends: sends.filter((send) => send !== undefined).sort((a, b) => a.sent.localeCompare(b.sent) || a.id.localeCompare(b.id)),
      taken: (await this.#readJson<Taken[]>(`${id}/taken.json`)) ?? [],
      ...(seen && { seen }),
    };
  }

  // The agent

  async start(id: string, title: string, asked?: string): Promise<Change> {
    return this.#one(id, async () => {
      const problems = problemsStarting(id, title, asked);
      if (problems.length) throw new Refused(problems);
      if (await this.storage.read(`${id}/review.json`)) throw new Refused([`There's already a change called “${id}”.`]);
      await this.#writeJson(`${id}/review.json`, { format: FORMAT, id, title, ...(asked && { asked }), started: now() });
      return this.#read(id);
    });
  }

  // Saves the round being worked on, as often as the agent likes, until it's finished.
  async saveRound(id: string, round: Round): Promise<void> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const kept = { ...round, finished: undefined };
      const problems = problemsWithRound(change, kept);
      if (problems.length) throw new Refused(problems);
      await this.#writeJson(`${id}/rounds/${round.number}/round.json`, kept);
    });
  }

  async saveFile(id: string, round: number, name: string, bytes: Uint8Array): Promise<void> {
    return this.#one(id, async () => {
      const problems = problemsWithFile(await this.#read(id), round, name);
      if (problems.length) throw new Refused(problems);
      await this.storage.write(`${id}/rounds/${round}/files/${name}`, bytes);
    });
  }

  // What a person did in the app, kept as their branch off a scene: theirs, not a round's, so it's kept beside the rounds
  // and can be kept again, longer, while the round it branches off never changes.
  async saveBranch(id: string, name: string, bytes: Uint8Array): Promise<void> {
    const problems = [...problemsWithId(id), ...problemsWithFileName(name)];
    if (problems.length) throw new Refused(problems);
    await this.storage.write(`${id}/branches/${name}`, bytes);
  }

  async branch(id: string, name: string): Promise<Uint8Array | undefined> {
    const problems = [...problemsWithId(id), ...problemsWithFileName(name)];
    if (problems.length) throw new Refused(problems);
    return this.storage.read(`${id}/branches/${name}`);
  }

  // Takes what's been sent and not yet taken. The round being worked on answers it.
  async take(id: string): Promise<Send[]> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const fresh = change.sends.filter((send) => !change.taken.some((taken) => taken.send === send.id));
      if (!fresh.length) return [];
      const round = roundInProgress(change);
      const at = now();
      await this.#writeJson(`${id}/taken.json`, [...change.taken, ...fresh.map((send) => ({ send: send.id, round, at }))]);
      return fresh;
    });
  }

  async finish(id: string, round: number): Promise<void> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const saved = change.rounds.find((saved) => saved.number === round);
      if (saved?.finished) return;
      const problems = problemsFinishing(change, round);
      if (problems.length || !saved) throw new Refused(problems);
      await this.#writeJson(`${id}/rounds/${round}/round.json`, { ...saved, finished: now() });
    });
  }

  // Playthrough

  // What Playthrough found comparing the round being worked on with one before it. Comparing them again replaces it.
  async saveComparison(id: string, comparison: Comparison): Promise<void> {
    return this.#one(id, async () => {
      const problems = problemsWithComparison(await this.#read(id), comparison);
      if (problems.length) throw new Refused(problems);
      await this.#writeJson(`${id}/rounds/${comparison.round}/since/${comparison.since}.json`, comparison);
    });
  }

  // A person

  // Sending the same send twice keeps it once.
  async send(id: string, send: Send): Promise<void> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const already = change.sends.find((sent) => sent.id === send.id);
      if (already && JSON.stringify(already) === JSON.stringify(send)) return;
      const problems = problemsWithSend(change, send);
      if (problems.length) throw new Refused(problems);
      await this.#writeJson(`${id}/sends/${send.id}.json`, send);
    });
  }

  // Kept with the change, so it holds in every browser they look from.
  async see(id: string, by: string, moments: Seen[]): Promise<void> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const problems = problemsSeeing(change, by, moments);
      if (problems.length) throw new Refused(problems);
      const theirs = change.seen?.[by] ?? [];
      const fresh = moments.filter((one) => !theirs.some((kept) => kept.round === one.round && kept.scene === one.scene));
      if (fresh.length) await this.#writeJson(`${id}/seen.json`, { ...change.seen, [by]: [...theirs, ...fresh] });
    });
  }

  // Anyone

  async file(id: string, round: number, name: string): Promise<Uint8Array | undefined> {
    const problems = [...problemsWithId(id), ...problemsWithFileName(name)];
    if (problems.length || !Number.isInteger(round)) throw new Refused(problems.length ? problems : [`There's no round ${round}.`]);
    return this.storage.read(`${id}/rounds/${round}/files/${name}`);
  }

  // Resolves with the change once it's the way `until` wants it: something sent to take, a round finished.
  async wait(id: string, until: (change: Change) => boolean, signal?: AbortSignal): Promise<Change> {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      let looking = false;
      let again = false;
      const done = (end: () => void) => {
        stop();
        signal?.removeEventListener("abort", aborted);
        end();
      };
      const look = async () => {
        if (looking) return void (again = true);
        looking = true;
        try {
          do {
            again = false;
            const change = await this.get(id);
            if (until(change)) return done(() => resolve(change));
          } while (again);
        } catch (error) {
          done(() => reject(error));
        } finally {
          looking = false;
        }
      };
      const aborted = () => done(() => reject(signal?.reason));
      const stop = this.storage.watch(id, look);
      signal?.addEventListener("abort", aborted, { once: true });
      look();
    });
  }

  // One step at a time on each change, so a step always sees the one before it; and the change in this format before
  // the first.
  #one<T>(id: string, step: () => Promise<T>): Promise<T> {
    const next = (this.#queues.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.#bringAlong(id))
      .then(step);
    this.#queues.set(id, next);
    return next;
  }

  // A change kept in an older format, brought to this one: each file rewritten only if it changes, and review.json, which
  // says the format, last, so one stopped half-way is brought along again from where it is, and one already in this
  // format is never touched. One kept by a newer Playthrough isn't read at all.
  async #bringAlong(id: string): Promise<void> {
    const about = await this.#readJson<About>(`${id}/review.json`);
    if (!about || about.format === FORMAT) return;
    if ((about.format ?? 1) > FORMAT)
      throw new Refused([`The change “${id}” was kept by a newer Playthrough (its format is ${about.format}; this one reads ${FORMAT}). Update Playthrough, then run this again.`]);
    const rewrite = async <T>(path: string, bring: (kept: T) => T) => {
      const kept = await this.#readJson<T>(path);
      if (kept === undefined) return;
      const now = bring(kept);
      if (JSON.stringify(now) !== JSON.stringify(kept)) await this.#writeJson(path, now);
    };
    const numbers = (await this.storage.list(`${id}/rounds`)).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    for (const n of numbers) await rewrite<Round>(`${id}/rounds/${n}/round.json`, roundNow);
    const rounds = (await Promise.all(numbers.map((n) => this.#readJson<Round>(`${id}/rounds/${n}/round.json`)))).filter((round) => round !== undefined);
    for (const name of (await this.storage.list(`${id}/sends`)).filter((name) => name.endsWith(".json")))
      await rewrite<Send>(`${id}/sends/${name}`, (send) => sendNow(send, rounds.find((round) => round.number === send.round)?.scenes ?? []));
    for (const name of (await this.storage.list(`${id}/scenes`)).filter((name) => name.endsWith(".ts"))) {
      const bytes = await this.storage.read(`${id}/scenes/${name}`);
      const file = bytes && new TextDecoder().decode(bytes);
      const words = file && wordsOf(file);
      const scene = words && rounds.findLast((round) => round.scenes.some((one) => one.name === words))?.scenes.find((one) => one.name === words);
      const now = file && scene && wayNow(file, scene);
      if (now && now !== file) await this.storage.write(`${id}/scenes/${name}`, new TextEncoder().encode(now));
    }
    await this.#writeJson(`${id}/review.json`, { ...about, format: FORMAT });
  }

  async #readJson<T>(path: string): Promise<T | undefined> {
    const bytes = await this.storage.read(path);
    if (!bytes) return undefined;
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      // Kept whole, so changed by hand: the agent writes its answers into round.json.
      throw new Refused([`The change's file ${path} isn't JSON: ${(error as Error).message}. Put it right, then run this again.`]);
    }
  }

  #writeJson(path: string, value: unknown): Promise<void> {
    return this.storage.write(path, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
  }
}

const now = () => new Date().toISOString();

// What review.json says: a change's words, and the format it's kept in.
type About = { format?: number; id: string; title: string; asked?: string; started: string };

// A moment's words, from its way's file: the test it is.
function wordsOf(file: string): string | undefined {
  const named = file.match(/^test\(("(?:[^"\\]|\\.)*")/m)?.[1];
  return named === undefined ? undefined : JSON.parse(named);
}
