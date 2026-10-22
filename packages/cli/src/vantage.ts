#!/usr/bin/env node
// The command line: four commands an agent runs to have a person review its work. When one stops, it says why and what to do.

import { Refused } from "@vantage/review";
import { open } from "./open.ts";
import { record } from "./record.ts";
import { repo } from "./repo.ts";
import { start } from "./start.ts";
import { wait } from "./wait.ts";

const HELP = `Vantage: a person reviews your work on a web app by watching recordings of it, round after round.

  vantage start <review> "<title>"   start a review of what was asked, in the person's words
  vantage record <review>            record the round being worked on, every flow, the way a person would use it
  vantage wait <review>              hand the round over, then wait for the notes to answer
  vantage open [<review>]            open the viewer on this machine

Reviews are kept in .vantage/ in this folder, and the app is started as vantage/app.json says.`;

const [command, review, ...words] = process.argv.slice(2);
const needs = (usage: string) => new Refused([`That needs more: ${usage}`]);

try {
  if (!command || ["help", "--help", "-h"].includes(command)) console.log(HELP);
  else if (command === "start") {
    if (!review || !words.length) throw needs(`vantage start <review> "<title>"`);
    await start(repo(), review, words.join(" "));
  } else if (command === "record") {
    if (!review) throw needs("vantage record <review>");
    await record(repo(), review);
  } else if (command === "wait") {
    if (!review) throw needs("vantage wait <review>");
    await wait(repo(), review);
  } else if (command === "open") await open(repo(), review);
  else throw new Refused([`There's no command “${command}”.\n\n${HELP}`]);
} catch (error) {
  if (!(error instanceof Refused)) throw error;
  console.error(error.problems.join("\n"));
  process.exitCode = 1;
}
