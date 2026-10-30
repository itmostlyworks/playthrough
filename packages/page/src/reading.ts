// What's on the page at a moment, as a person would name it: each control by its role and name, each piece of words, and
// each panel or bar, with where it is, how it looks and what holds it. Each step of a flow ends with the page read, so
// two rounds compare step by step, and something pointed at in one is found in another.

export type Thing = {
  role: string; // button, link, dialog, table, heading…; text for words with no role of their own; box for a panel or bar
  name: string; // what a person would call it: its label, its words, or a panel's own label or first words
  words: string; // what it says itself, with words marked inside it, bold or in a span (“Total for Q3 $27,785”)
  wordsInside?: string; // every word in a panel or menu: one that holds the same words is the same one, wherever it went
  box: { x: number; y: number; width: number; height: number }; // on the screen, in pixels
  page: { x: number; y: number }; // on the page, so a page scrolled further hasn't moved everything on it
  look: { color: string; background: string; size: string; weight: string; border: string };
  holder?: number; // the nearest thing it's in that has a role or is a panel, by its place in the reading
  parent?: number; // the nearest thing it's in that's read at all
  column?: string; // the heading over it, in a table the page marks as one
  labelled?: true; // a panel with a label of its own, which names it, drawn or not
  live?: true; // in a message the page announces and takes away by itself, a toast: aria-live, or a status or an alert
  node?: number; // its element in the recording
};

// The page the step left. Its moment is in seconds from the recording's start, like a step's.
export type Reading = { step: string; at: number; screen: { width: number; height: number }; picture: string; things: Thing[] };
// The page just after an action, read on the way through a step for what a note can be on, as a menu or a dialog that's
// gone by the step's end: its step's reading, without the picture.
export type Glimpse = Omit<Reading, "picture">;
