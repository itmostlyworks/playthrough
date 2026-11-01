// What Playthrough calls things, and what happened to them, in its fixed words: “Export button”, “Total for Q3 $27,785.00”, the
// “Who owes whom” area. Never the agent's words: the same thing is called the same way in every change.

import type { Thing } from "./reading.ts";

export const WORD: Record<string, string> = {
  button: "button", link: "link", dialog: "dialog", alertdialog: "dialog", table: "table", grid: "table", treegrid: "table", heading: "heading", textbox: "field",
  searchbox: "search field", combobox: "menu", checkbox: "checkbox", radio: "option", switch: "switch", slider: "slider", listbox: "list", option: "option",
  tab: "tab", menu: "menu", menuitem: "menu item", img: "image", group: "choice", radiogroup: "choice",
};
// What a thing is called by: what it is, its name, and what it says itself.
export type Named = Pick<Thing, "role" | "name" | "words" | "wordsInside" | "live">;

export const word = (thing: Named) => WORD[thing.role] ?? thing.role;

// A button or link that shows only a symbol or an icon, a ⋯ or a +, is called by its label alone: “Actions for INV-1065”,
// “Create expense”.
export const symbolOnly = (thing: Named) => (thing.role === "button" || thing.role === "link") && !!thing.name && thing.words.replace(/\s/g, "").length <= 2 && !/[\p{L}\p{N}]/u.test(thing.words);
const cut = (words: string, most = 60) => (words.length > most ? words.slice(0, most - 1).trimEnd() + "…" : words);

export function called(thing: Named): string {
  if (thing.role === "status" || thing.role === "alert") return "Message";
  if (thing.role === "box") return `“${cut(areaName(thing))}” ${thing.live ? "message" : "area"}`;
  if (thing.role === "text") return `“${cut(thing.words)}”`;
  // What Playthrough has no word for, such as a list item noted in the app, is called by its words, as a text is.
  if (!WORD[thing.role] && thing.name) return `“${cut(thing.name)}”`;
  if (thing.role === "menuitem" && thing.name) return `“${cut(thing.name)}” in the menu`;
  if (symbolOnly(thing)) return thing.name;
  return `${cut(thing.name)} ${word(thing)}`.trim();
}
// An area is called by its label or its first words; when those are only an avatar's initial or an icon, by the words in
// it past them: Kan's comment is “Maja · in about 23 hours Can we use the one…”, not “M”.
function areaName({ name, wordsInside }: Named): string {
  if (name.length > 2 || !wordsInside?.startsWith(name)) return name;
  return wordsInside.slice(name.length).trim() || name;
}
export const the = (thing: Named) => {
  const name = called(thing);
  return name === "Message" ? "the message" : name.startsWith("“") && thing.role === "text" ? name : `the ${name}`;
};
export const a = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);
export const plural = (word: string) => (/(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`);
export const things = (count: number) => (count > 1 ? "things" : "thing");
// Words with their data as “…”, for alike things that differ only by it: “$40.00” and “$120.00” are both “$…”.
export const dataLeftOut = (words: string) => words.replace(/\d[\d.,:/]*/g, "…");
export const sentence = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
export const wayOf = (across: number, down: number) => [down > 0 ? "down" : down < 0 ? "up" : "", across > 0 ? "right" : across < 0 ? "left" : ""].filter(Boolean).join(" and ");

// Two or more of one kind, called together: “Mark as paid” and “Send reminder” in the menu; “Actions for INV-1043,
// INV-1050 and INV-1057”, the words they all start with said once.
export function together(all: Thing[], name: (thing: Thing) => string = called): string {
  if (all.every((thing) => thing.role === "menuitem" && thing.name)) return `${together(all, (thing) => `“${thing.name}”`)} in the menu`;
  const names = all.map(name);
  let shared = names.reduce((common, next) => {
    let i = 0;
    while (i < common.length && common[i] === next[i]) i++;
    return common.slice(0, i);
  });
  shared = shared.slice(0, shared.lastIndexOf(" ") + 1);
  if (shared.trim().split(" ").length < 2) shared = "";
  const short = names.map((name, i) => (i ? name.slice(shared.length) : name));
  const shown = short.length > 4 ? [...short.slice(0, 3), `${short.length - 3} more`] : short;
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

// Words that changed, told by the part that differs, with a few words either side: “…Hello Marcus, This is…”.
export function rewordedWords(a: Thing, b: Thing): string {
  if (a.role !== "text") return `${called(a)} now says “${cut(b.name)}”`;
  let start = 0;
  while (start < a.words.length && start < b.words.length && a.words[start] === b.words[start]) start++;
  let end = 0;
  while (end < a.words.length - start && end < b.words.length - start && a.words.at(-1 - end) === b.words.at(-1 - end)) end++;
  const part = (words: string) => {
    if (words.length <= 60) return words;
    const from = start <= 15 ? 0 : words.lastIndexOf(" ", start - 15) + 1;
    const after = words.indexOf(" ", words.length - end + 15);
    const to = end <= 15 || after < 0 ? words.length : after;
    return `${from > 0 ? "…" : ""}${cut(words.slice(from, to), 80)}${to < words.length ? "…" : ""}`;
  };
  return `“${part(a.words)}” now says “${part(b.words)}”`;
}

// What reads differently in words reworded: the newer words that aren't the older's, as whole words, so the viewer marks
// just them (“on their own”, added to “For reviewing what your coding agents build”). Nothing, where words only went.
export function rewordedPart(a: string, b: string): string | undefined {
  const letter = /[\p{L}\p{N}’']/u;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a.at(-1 - end) === b.at(-1 - end)) end++;
  let to = b.length - end;
  while (start > 0 && letter.test(b[start - 1]!) && letter.test(b[start] ?? "")) start--;
  while (to < b.length && to > 0 && letter.test(b[to - 1]!) && letter.test(b[to]!)) to++;
  return b.slice(start, to).trim() || undefined;
}

// The look of something, in words: what about it changed.
export function lookWords(a: Thing, b: Thing): string {
  const parts: string[] = [];
  if (a.look.background !== b.look.background) parts.push("background");
  if (a.look.color !== b.look.color) parts.push("text colour");
  if (a.look.size !== b.look.size) parts.push(parseFloat(b.look.size) > parseFloat(a.look.size) ? "bigger text" : "smaller text");
  if (a.look.weight !== b.look.weight) parts.push(Number(b.look.weight) > Number(a.look.weight) ? "bolder text" : "lighter text");
  if (a.look.border !== b.look.border) parts.push("border");
  return parts.join(", ");
}
