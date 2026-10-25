// What Vantage calls things, and what happened to them, in its fixed words: “Export button”, “Total for Q3 $27,785.00”, the
// “Who owes whom” area. Never the agent's words: the same thing is called the same way in every change.

import type { Thing } from "./read.ts";

export const WORD: Record<string, string> = {
  button: "button", link: "link", dialog: "dialog", alertdialog: "dialog", table: "table", grid: "table", treegrid: "table", heading: "heading", textbox: "field",
  searchbox: "search field", combobox: "menu", checkbox: "checkbox", radio: "option", switch: "switch", slider: "slider", listbox: "list", option: "option",
  tab: "tab", menu: "menu", menuitem: "menu item", img: "image", group: "choice", radiogroup: "choice",
};
export const word = (thing: Thing) => WORD[thing.role] ?? thing.role;

// A button that shows only a symbol, a ⋯ or a ×, is called by its label alone: “Actions for INV-1065”.
export const symbolOnly = (thing: Thing) => thing.role === "button" && !!thing.name && thing.words.replace(/\s/g, "").length <= 2 && !/[\p{L}\p{N}]/u.test(thing.words);
const cut = (words: string, most = 60) => (words.length > most ? words.slice(0, most - 1).trimEnd() + "…" : words);

export function called(thing: Thing): string {
  if (thing.role === "status" || thing.role === "alert") return "Message";
  if (thing.role === "box") return `“${cut(thing.name)}” area`;
  if (thing.role === "text") return `“${cut(thing.words)}”`;
  if (thing.role === "menuitem" && thing.name) return `“${cut(thing.name)}” in the menu`;
  if (symbolOnly(thing)) return thing.name;
  return `${cut(thing.name)} ${word(thing)}`.trim();
}
export const the = (thing: Thing) => {
  const name = called(thing);
  return name === "Message" ? "the message" : name.startsWith("“") && thing.role === "text" ? name : `the ${name}`;
};
export const a = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);
export const plural = (word: string) => (/(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`);
export const things = (count: number) => (count > 1 ? "things" : "thing");
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
