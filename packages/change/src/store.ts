// The change store: the steps of the loop, each checked against the rules before anything is kept.
// Where things are kept is a Storage, so a folder, memory and later a hosted store all keep changes the same way.

import { comparisonNow, FORMAT, handBackNow, OLDER, seenNow, sendNow, takenNow, wayNow } from "./format.ts";
import type { Comparison, Change, HandBack, Seen, Send, Taken } from "./model.ts";
import {
  problemsFinishing,
  problemsStarting,
  problemsWithComparison,
  problemsWithFile,
  problemsWithFileName,
  problemsWithId,
  problemsWithHandBack,
  problemsWithSend,
  problemsSeeing,
  handBackInProgress,
  sendsNotTaken,
} from "./rules.ts";
import { list, quote } from "./words.ts";

export interface Storage {
  read(path: string): Promise<Uint8Array | undefined>;
  write(path: string, bytes: Uint8Array): Promise<void>; // whole or not at all: a reader never sees half a file
  list(folder: string): Promise<string[]>; // the names directly inside
  move(from: string, to: string): Promise<void>; // a file or a folder, whole, to where nothing is
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
//   <change>/change.json                       the agent, when it starts
//   <change>/hand-backs/<n>/hand-back.json     the agent, until the hand-back is finished
//   <change>/hand-backs/<n>/files/<name>       the agent: recordings, pictures
//   <change>/hand-backs/<n>/since/<k>.json     Playthrough: hand-back n compared with hand-back k, while n is being worked on
//   <change>/sends/<id>.json                   whoever sent it, once: never written again, but by Playthrough bringing it
//                                              to this format
//   <change>/moments/<moment>.ts               the agent: each moment's way there, its step the moment itself
//   <change>/taken.json                        the agent
//   <change>/seen.json                         each person, through the page, as they open a moment
//   <change>/branches/<name>                   each person, through the page: what they did in the app, and its pictures
export class Changes {
  storage: Storage;
  #queues = new Map<string, Promise<unknown>>();

  constructor(storage: Storage) {
    this.storage = storage;
  }

  async list(): Promise<string[]> {
    // Only what's named like a change is one: Playthrough keeps a few files of its own beside them.
    const ids = (await this.storage.list("")).filter((id) => !problemsWithId(id).length);
    const started = await Promise.all(ids.map(async (id) => (await this.#about(id)) !== undefined));
    return ids.filter((_, i) => started[i]).sort();
  }

  async get(id: string): Promise<Change> {
    if (problemsWithId(id).length) throw new Refused(problemsWithId(id));
    // Kept in another format, it's brought along first, in its turn with every other step on it.
    const kept = await this.#about(id);
    if (kept && kept.format !== FORMAT) await this.#one(id, async () => {});
    return this.#read(id);
  }

  async #read(id: string): Promise<Change> {
    const about = await this.#readJson<About>(`${id}/change.json`);
    if (!about) {
      const others = await this.list();
      throw new Refused([`There's no change called “${id}”.${others.length ? ` The changes here: ${list(others.map(quote))}.` : ""}`]);
    }

    const numbers = (await this.storage.list(`${id}/hand-backs`)).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    const handBacks = await Promise.all(numbers.map((n) => this.#readJson<HandBack>(`${id}/hand-backs/${n}/hand-back.json`)));
    const comparisons = await Promise.all(
      numbers.map(async (n) => {
        const names = (await this.storage.list(`${id}/hand-backs/${n}/since`)).filter((name) => name.endsWith(".json"));
        return Promise.all(names.map((name) => this.#readJson<Comparison>(`${id}/hand-backs/${n}/since/${name}`)));
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
      handBacks: handBacks.filter((handBack) => handBack !== undefined),
      comparisons: comparisons.flat().filter((comparison) => comparison !== undefined).sort((a, b) => a.handBack - b.handBack || a.since - b.since),
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
      if (await this.#about(id)) throw new Refused([`There's already a change called “${id}”.`]);
      await this.#writeJson(`${id}/change.json`, { format: FORMAT, id, title, ...(asked && { asked }), started: now() });
      return this.#read(id);
    });
  }

  // Saves the hand-back being worked on, as often as the agent likes, until it's finished.
  async saveHandBack(id: string, handBack: HandBack): Promise<void> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const kept = { ...handBack, finished: undefined };
      const problems = problemsWithHandBack(change, kept);
      if (problems.length) throw new Refused(problems);
      await this.#writeJson(`${id}/hand-backs/${handBack.number}/hand-back.json`, kept);
    });
  }

  async saveFile(id: string, handBack: number, name: string, bytes: Uint8Array): Promise<void> {
    return this.#one(id, async () => {
      const problems = problemsWithFile(await this.#read(id), handBack, name);
      if (problems.length) throw new Refused(problems);
      await this.storage.write(`${id}/hand-backs/${handBack}/files/${name}`, bytes);
    });
  }

  // What a person did in the app, kept as their branch off a moment: theirs, not a hand-back's, so it's kept beside the hand-backs
  // and can be kept again, longer, while the hand-back it branches off never changes.
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

  // Takes what's been sent and not yet taken. The hand-back being worked on answers it.
  async take(id: string): Promise<Send[]> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const fresh = sendsNotTaken(change);
      if (!fresh.length) return [];
      const handBack = handBackInProgress(change);
      const at = now();
      await this.#writeJson(`${id}/taken.json`, [...change.taken, ...fresh.map((send) => ({ send: send.id, handBack, at }))]);
      return fresh;
    });
  }

  async finish(id: string, handBack: number): Promise<void> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const saved = change.handBacks.find((saved) => saved.number === handBack);
      if (saved?.finished) return;
      const problems = problemsFinishing(change, handBack);
      if (problems.length || !saved) throw new Refused(problems);
      await this.#writeJson(`${id}/hand-backs/${handBack}/hand-back.json`, { ...saved, finished: now() });
    });
  }

  // Playthrough

  // What Playthrough found comparing the hand-back being worked on with one before it. Comparing them again replaces it.
  async saveComparison(id: string, comparison: Comparison): Promise<void> {
    return this.#one(id, async () => {
      const problems = problemsWithComparison(await this.#read(id), comparison);
      if (problems.length) throw new Refused(problems);
      await this.#writeJson(`${id}/hand-backs/${comparison.handBack}/since/${comparison.since}.json`, comparison);
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
  async see(id: string, by: string, opened: Seen[]): Promise<void> {
    return this.#one(id, async () => {
      const change = await this.#read(id);
      const problems = problemsSeeing(change, by, opened);
      if (problems.length) throw new Refused(problems);
      const theirs = change.seen?.[by] ?? [];
      const fresh = opened.filter((one) => !theirs.some((kept) => kept.handBack === one.handBack && kept.moment === one.moment));
      if (fresh.length) await this.#writeJson(`${id}/seen.json`, { ...change.seen, [by]: [...theirs, ...fresh] });
    });
  }

  // Anyone

  async file(id: string, handBack: number, name: string): Promise<Uint8Array | undefined> {
    const problems = [...problemsWithId(id), ...problemsWithFileName(name)];
    if (problems.length || !Number.isInteger(handBack)) throw new Refused(problems.length ? problems : [`There's no hand-back ${handBack}.`]);
    return this.storage.read(`${id}/hand-backs/${handBack}/files/${name}`);
  }

  // Resolves with the change once it's the way `until` wants it: something sent to take, a hand-back finished.
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

  // A change kept in an older format, brought to this one. Each folder and file kept by an older name is moved to its
  // name now, whole; each file is rewritten only if it changes; and the change's own file, which says the format, comes
  // last: moved, then said to be in this format. So one stopped anywhere half-way is brought along again from where it
  // is, and one already in this format is never touched. One kept by a newer Playthrough isn't read at all.
  async #bringAlong(id: string): Promise<void> {
    const about = await this.#about(id);
    if (!about || about.format === FORMAT) return;
    if ((about.format ?? 1) > FORMAT)
      throw new Refused([`The change “${id}” was kept by a newer Playthrough (its format is ${about.format}; this one reads ${FORMAT}). Update Playthrough, then run this again.`]);
    const rewrite = async <T>(path: string, bring: (kept: T) => T) => {
      const kept = await this.#readJson<T>(path);
      if (kept === undefined) return;
      const now = bring(kept);
      if (JSON.stringify(now) !== JSON.stringify(kept)) await this.#writeJson(path, now);
    };
    await this.#moveIfThere(`${id}/${OLDER.handBacks}`, `${id}/hand-backs`);
    await this.#moveIfThere(`${id}/${OLDER.moments}`, `${id}/moments`);
    const numbers = (await this.storage.list(`${id}/hand-backs`)).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    for (const n of numbers) {
      // Rewritten where it is, then moved: either way round, what's there is read again as it is.
      await rewrite(`${id}/hand-backs/${n}/${OLDER.handBack}`, handBackNow);
      await this.#moveIfThere(`${id}/hand-backs/${n}/${OLDER.handBack}`, `${id}/hand-backs/${n}/hand-back.json`);
      await rewrite(`${id}/hand-backs/${n}/hand-back.json`, handBackNow);
      for (const name of (await this.storage.list(`${id}/hand-backs/${n}/since`)).filter((name) => name.endsWith(".json")))
        await rewrite(`${id}/hand-backs/${n}/since/${name}`, comparisonNow);
    }
    const handBacks = (await Promise.all(numbers.map((n) => this.#readJson<HandBack>(`${id}/hand-backs/${n}/hand-back.json`)))).filter((handBack) => handBack !== undefined);
    for (const name of (await this.storage.list(`${id}/sends`)).filter((name) => name.endsWith(".json")))
      await rewrite<Send & { round?: number }>(`${id}/sends/${name}`, (send) => sendNow(send, handBacks.find((handBack) => handBack.number === (send.handBack ?? send.round))?.moments ?? []));
    await rewrite(`${id}/taken.json`, takenNow);
    await rewrite(`${id}/seen.json`, seenNow);
    for (const name of (await this.storage.list(`${id}/moments`)).filter((name) => name.endsWith(".ts"))) {
      const bytes = await this.storage.read(`${id}/moments/${name}`);
      const file = bytes && new TextDecoder().decode(bytes);
      const words = file && wordsOf(file);
      const moment = words && handBacks.findLast((handBack) => handBack.moments.some((one) => one.name === words))?.moments.find((one) => one.name === words);
      const now = file && moment && wayNow(file, moment);
      if (now && now !== file) await this.storage.write(`${id}/moments/${name}`, new TextEncoder().encode(now));
    }
    await this.#moveIfThere(`${id}/${OLDER.change}`, `${id}/change.json`);
    await this.#writeJson(`${id}/change.json`, { ...about, format: FORMAT });
  }

  // What a change's own file says, by its name now or, not yet brought along, the one it was kept by before.
  async #about(id: string): Promise<About | undefined> {
    return (await this.#readJson<About>(`${id}/change.json`)) ?? (await this.#readJson<About>(`${id}/${OLDER.change}`));
  }

  // Moved whole where nothing's there yet; where something is, as a folder moved half-way by hand might be, each thing
  // in it that isn't there yet.
  async #moveIfThere(from: string, to: string): Promise<void> {
    const inside = await this.storage.list(from);
    const file = !inside.length && (await this.storage.read(from)) !== undefined;
    if (!inside.length && !file) return;
    const there = (await this.storage.list(to)).length > 0 || (await this.storage.read(to)) !== undefined;
    if (!there) return this.storage.move(from, to);
    for (const name of inside) await this.#moveIfThere(`${from}/${name}`, `${to}/${name}`);
  }

  async #readJson<T>(path: string): Promise<T | undefined> {
    const bytes = await this.storage.read(path);
    if (!bytes) return undefined;
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      // Kept whole, so changed by hand: the agent writes its answers into hand-back.json.
      throw new Refused([`The change's file ${path} isn't JSON: ${(error as Error).message}. Put it right, then run this again.`]);
    }
  }

  #writeJson(path: string, value: unknown): Promise<void> {
    return this.storage.write(path, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
  }
}

const now = () => new Date().toISOString();

// What change.json says: a change's words, and the format it's kept in.
type About = { format?: number; id: string; title: string; asked?: string; started: string };

// A moment's words, from its way's file: the test it is.
function wordsOf(file: string): string | undefined {
  const named = file.match(/^test\(("(?:[^"\\]|\\.)*")/m)?.[1];
  return named === undefined ? undefined : JSON.parse(named);
}
