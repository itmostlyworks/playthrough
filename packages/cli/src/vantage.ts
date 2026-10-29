#!/usr/bin/env node
// The command line: the commands an agent runs to have a person review its work, and take-over, for a person to carry on
// from a moment of a flow by hand. When one stops, it says why and what to do.

import { readFileSync } from "node:fs";
import { Refused } from "@mostlyworks/vantage-review";
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

const [command, review, ...words] = process.argv.slice(2);
const needs = (usage: string) => new Refused([`That needs more: ${usage}`]);

try {
  if (!command || ["help", "--help", "-h"].includes(command)) console.log(HELP);
  else {
    // A command stopped while flows recorded on Before left the agent's work set aside: it's put back before anything else.
    await putBack(repo());
    if (command === "start") {
      if (!review) throw needs(`vantage start <review> "<title>"`);
      await start(repo(), review, words.join(" ") || undefined);
    } else if (command === "record") {
      if (!review) throw needs("vantage record <review>");
      await record(repo(), review);
    } else if (command === "wait") {
      if (!review) throw needs("vantage wait <review>");
      await wait(repo(), review);
    } else if (command === "walk") {
      if (!review) throw needs("vantage walk <review>");
      await walk(repo(), review);
    } else if (command === "open") await open(repo(), review);
    else if (command === "take-over") {
      if (!review) throw needs(`vantage take-over <review> "<flow>" ["<step>"]`);
      await takeOver(repo(), review, words[0], words[1]);
    }
    else throw new Refused([`There's no command “${command}”. Run vantage alone for what each one does.`]);
  }
} catch (error) {
  if (!(error instanceof Refused)) throw error;
  console.error(error.problems.join("\n"));
  process.exitCode = 1;
}
