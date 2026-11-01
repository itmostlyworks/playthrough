#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
// An app's playthrough/setup.ts is loaded here to take flows over, and Node would say each time that an app not written as
// modules has one: nothing anyone need act on.
// The command line: the commands an agent runs to have a person review its work, and take-over, for a person to carry on
// from a moment of a flow by hand. When one stops, it says why and what to do.

import "./node.ts";
import { readFileSync } from "node:fs";
import { Refused } from "@playthrough/review";
import { putBack } from "./before.ts";
import { open } from "./open.ts";
import { record } from "./record.ts";
import { repo } from "./repo.ts";
import { start } from "./start.ts";
import { takeOver } from "./take-over.ts";
import { wait } from "./wait.ts";
import { walk } from "./walk.ts";

// Everything an agent needs to know, read once: bare, the command says it.
const HELP = readFileSync(new URL("../INSTRUCTIONS.md", import.meta.url), "utf8").trimEnd();

const given = process.argv.slice(2);
const [command, review, ...words] = given;
const needs = (usage: string) => new Refused([`That needs more: ${usage}`]);
// How many words each command takes after the review's name: anything more is refused rather than ignored, so a stray
// word never starts something that wasn't meant.
const takes = {
  start: [2, `playthrough start <review> "<title>" "<what was asked>"`],
  record: [0, "playthrough record <review>"],
  wait: [0, "playthrough wait <review>"],
  walk: [0, "playthrough walk <review>"],
  open: [0, "playthrough open [<review>]"],
  "take-over": [2, `playthrough take-over <review> "<flow>" ["<step>"]`],
} satisfies Record<string, [number, string]>;
const limit = Object.hasOwn(takes, command ?? "") ? takes[command as keyof typeof takes] : undefined;

try {
  // Asked for help anywhere, as by reflex after a command, it's the help, never the command.
  if (!command || command === "help" || given.some((word) => ["--help", "-h"].includes(word))) console.log(HELP);
  else if (limit && words.length > limit[0]) throw new Refused([`That's more than it takes: ${limit[1]}`]);
  else {
    // A command stopped while flows recorded on Before left the agent's work set aside: it's put back before anything else.
    await putBack(repo());
    if (command === "start") {
      if (!review) throw needs(takes.start[1]);
      await start(repo(), review, words[0], words[1]);
    } else if (command === "record") {
      if (!review) throw needs(takes.record[1]);
      await record(repo(), review);
    } else if (command === "wait") {
      if (!review) throw needs(takes.wait[1]);
      await wait(repo(), review);
    } else if (command === "walk") {
      if (!review) throw needs(takes.walk[1]);
      await walk(repo(), review);
    } else if (command === "open") await open(repo(), review);
    else if (command === "take-over") {
      if (!review) throw needs(takes["take-over"][1]);
      await takeOver(repo(), review, words[0], words[1]);
    }
    else throw new Refused([`There's no command “${command}”. Run playthrough alone for what each one does.`]);
  }
} catch (error) {
  if (!(error instanceof Refused)) throw error;
  console.error(error.problems.join("\n"));
  process.exitCode = 1;
}
