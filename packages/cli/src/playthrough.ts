#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
// An app's playthrough/setup.ts is loaded here, and Node would say each time that an app not written as modules has one:
// nothing anyone need act on.
// The command line: what an agent runs to show a person its work as moments, and `open`, for the person to look at them.
// When one stops, it says why and what to do.

import "./node.ts";
import { readFileSync } from "node:fs";
import { Refused } from "@playthrough/change";
import { as, stop } from "./as.ts";
import { change } from "./change.ts";
import { again, answer, answering, drop, moment, wait } from "./moments.ts";
import { know } from "./machine.ts";
import { close, openBehind } from "./open.ts";
import { repo } from "./repo.ts";
import { unheardSaid } from "./wait.ts";

// Everything an agent needs to know, read once: bare, the command says it.
const HELP = readFileSync(new URL("../MOMENTS.md", import.meta.url), "utf8").trimEnd();

// Each command, how many words it takes after its name, at least and at most, and how it's said: anything more is
// refused rather than ignored, so a stray word never starts something that wasn't meant.
const commands = {
  change: [2, 2, `playthrough change "<a title, as a pull request's>" "<what you were asked, in the person's words>"`, ([title, asked]) => change(repo(), title, asked)],
  as: [1, 2, `playthrough as <person> ["<moment>" or <note>]`, ([person, at]) => as(repo(), person!, at)],
  stop: [0, 0, "playthrough stop", () => stop(repo())],
  moment: [1, 2, `playthrough moment "<what's there, in under eight words>" ["<what it's about, as the page names it>"] [--last N]`, ([words, named], last) => moment(repo(), words!, named, last)],
  drop: [1, 1, `playthrough drop "<moment>"`, ([words]) => drop(repo(), words!)],
  again: [0, 0, "playthrough again", () => again(repo())],
  answer: [2, 2, answering("<note>"), ([note, words]) => answer(repo(), note!, words)],
  wait: [0, 0, "playthrough wait", () => wait(repo())],
  open: [0, 0, "playthrough open", () => openBehind()],
  close: [0, 0, "playthrough close", () => close()],
} satisfies Record<string, [number, number, string, (words: string[], last?: number) => Promise<unknown>]>;

const [command, ...given] = process.argv.slice(2);
// --last N, which only moment takes: how many of the last things done the moment shows.
const lastAt = given.findIndex((word) => word === "--last" || word.startsWith("--last="));
const lastSaid = lastAt < 0 ? undefined : given[lastAt]!.includes("=") ? given[lastAt]!.split("=")[1] : given[lastAt + 1];
const words = lastAt < 0 ? given : given.toSpliced(lastAt, given[lastAt]!.includes("=") ? 1 : 2);
// The app this is run in is known to the machine's one page from now on, as soon as Playthrough has a folder in it.
know(repo().root);
// Notes the person sent with no agent listening are said before anything else, help included, as the first thing an
// agent runs is often the help, cut short. Wait gets them; open and close are the person's; and what `as` and `open`
// start behind themselves (process.send, behind.ts) says nothing the command that was run hasn't.
if (!["wait", "open", "close"].includes(command!) && !process.send) {
  const unheard = await unheardSaid(repo());
  if (unheard.length) console.log(`${unheard.join("\n")}\n`);
}
try {
  // Asked for help anywhere, as by reflex after a command, it's the help, never the command.
  if (!command || ["help", "--help", "-h"].includes(command) || words.some((word) => ["--help", "-h"].includes(word))) console.log(HELP);
  else if (!Object.hasOwn(commands, command)) throw new Refused([`There's no command “${command}”. Run playthrough alone for what each one does.`]);
  else {
    const [least, most, said, run] = commands[command as keyof typeof commands];
    if (words.length > most) throw new Refused([`That's more than it takes: ${said}`]);
    if (words.length < least) throw new Refused([`That needs more: ${said}`]);
    if (lastAt >= 0 && command !== "moment") throw new Refused([`Only playthrough moment takes --last: ${said}`]);
    if (lastAt >= 0 && !/^\d+$/.test(lastSaid ?? "")) throw new Refused([`--last takes how many of the last things done the moment shows, 0 for a still: ${said}`]);
    await run(words, lastAt < 0 ? undefined : Number(lastSaid));
    know(repo().root);
  }
} catch (error) {
  if (!(error instanceof Refused)) throw error;
  console.error(error.problems.join("\n"));
  process.exitCode = 1;
}
