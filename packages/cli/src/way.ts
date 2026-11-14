// The way to a moment: what the agent did in its browser, written as a scene Playthrough runs again from a fresh start,
// and whether running it again landed where the agent was.

import { differences, type Reading, type Thing } from "@playthrough/page";
import { quote } from "@playthrough/review";

// What was done, as take-over keeps a person's, and what it was done on as getByRole finds it: its role and name, and
// which of those alike it was, where it isn't the only one; with no role, by its words; by its path only where it has
// neither.
// And the address it was done at; a page loaded, whether something done on the page before led there (a link followed, a
// form sent) or it was gone to directly.
export type Done = { does: string; on: string; with?: string; what?: string; role?: string; name?: string; text?: string; nth?: number; address?: string; led?: boolean; scrolled?: { x: number; y: number }; button?: "right" };

// What a moment is about, read where the agent is: one thing on the page, by its role and name, with what can be
// checked of it again; or words with no role of their own (role "text"), by what they say, the first that does.
export type About = { role: string; name: string; value?: string; disabled: boolean; checked?: boolean; nth?: number };

// A moment's file, by its words: the same words are the same moment, marked again in its place.
export const fileOf = (words: string) => `${words.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "moment"}.ts`;

// A moment's words, from its file.
export function wordsIn(file: string): string | undefined {
  const named = file.match(/^test\(("(?:[^"\\]|\\.)*")/m)?.[1];
  return named === undefined ? undefined : JSON.parse(named);
}

// The way there, written as a scene: each page gone to, and what was done on each, as getByRole finds it, or by its path
// where it has no role and name; scrolled where the page was, as a footer is only seen there; then what it's about, as
// it was, checked again. What's done from `from` on is the scene's step, the moment itself; what's done before it is the
// way there, kept and never shown. Tried, it also writes where it ended, beside itself, as no reading says the address.
export function sceneOf({
  words,
  person,
  did,
  setup,
  about,
  scrolled,
  from = 0,
  tried = false,
}: {
  words: string;
  person: string;
  did: Done[];
  setup: Record<string, unknown>;
  about?: About;
  scrolled?: { x: number; y: number };
  from?: number;
  tried?: boolean;
}): string {
  const written = did.map((done) => {
    const at = locatorOf(done);
    const what = done.what && !done.role && !done.text ? ` // ${done.what.replace(/\n/g, " ")}` : "";
    const given = JSON.stringify(done.with ?? "");
    if (done.does === "goto") {
      const address = "`${baseURL}" + madeBySetup(String(done.with), setup) + "`";
      // Gone to where an action led already, it's there; gone to directly, it goes.
      return `    await page.waitForURL(${address}, { timeout: 3000 }).catch(() => page.goto(${address}));`;
    }
    if (done.does === "fill") return `    await page.${at}.fill(${given});${what}`;
    // Keys on what has no role go where the focus is, as they went: focusing words that can't take it would let it go.
    const keyboard = !done.role || done.on === "body";
    if (done.does === "type") return keyboard ? `    await page.keyboard.type(${given});` : `    await page.${at}.pressSequentially(${given});`;
    if (done.does === "selectOption") return `    await page.${at}.selectOption(${given});${what}`;
    if (done.does === "press") return keyboard ? `    await page.keyboard.press(${given});` : `    await page.${at}.press(${given});`;
    return `    await page.${at}.click(${done.button ? `{ button: ${JSON.stringify(done.button)} }` : ""});${what}`;
  });
  // Scrolled where the agent had scrolled before each thing done there: on the way, at once; in what the moment shows, as
  // a person scrolls. A page loaded starts at its top.
  const xy = ({ x, y }: { x: number; y: number }) => `[${Math.round(x)}, ${Math.round(y)}]`;
  let at = { x: 0, y: 0 };
  const before = did.map((done, i) => {
    if (done.does === "goto") return void (at = { x: 0, y: 0 });
    const there = done.scrolled;
    if (!there || (Math.abs(there.x - at.x) < 2 && Math.abs(there.y - at.y) < 2)) return;
    at = there;
    return i <= from ? `    await page.evaluate(([x, y]) => window.scrollTo(x, y), ${xy(there)});` : `    await page.evaluate(([x, y]) => window.scrollTo({ left: x, top: y, behavior: "smooth" }), ${xy(there)});`;
  });
  const lines = written.flatMap((line, i) => (before[i] ? [before[i]!, line] : [line]));
  const placed = written.slice(0, from).reduce((count, _, i) => count + (before[i] ? 2 : 1), 0) + (before[from] ? 1 : 0);
  // Where the agent is at the end: gone there by itself (a smooth scroll still under way), or else scrolled there.
  const scrolling = scrolled && (Math.abs(scrolled.x - at.x) >= 2 || Math.abs(scrolled.y - at.y) >= 2) ? [`    await page.waitForFunction(([x, y]) => Math.abs(scrollX - x) < 2 && Math.abs(scrollY - y) < 2, ${xy(scrolled)}, { timeout: 3000 }).catch(() => page.evaluate(([x, y]) => window.scrollTo(x, y), ${xy(scrolled)}));`] : [];
  const which = about?.nth !== undefined ? `.nth(${about.nth})` : "";
  const thing = about && (about.role === "text" ? `page.getByText(${JSON.stringify(about.name)}, { exact: true })${which}` : `page.getByRole(${JSON.stringify(about.role)}, { name: ${JSON.stringify(about.name)}, exact: true })${which}`);
  const checks = !about
    ? []
    : about.role === "text"
      ? [`    await expect(${thing}).toBeVisible();`]
    : [
        `    await expect(${thing}).toBeVisible();`,
        ...(about.value !== undefined ? [`    await expect(${thing}).toHaveValue(${JSON.stringify(about.value)});`] : []),
        ...(about.value !== undefined || ["button", "checkbox", "radio", "switch", "combobox", "textbox"].includes(about.role)
          ? [about.disabled ? `    await expect(${thing}).${about.value !== undefined ? "not.toBeEditable" : "toBeDisabled"}();` : `    await expect(${thing}).toBeEnabled();`]
          : []),
        ...(about.checked !== undefined ? [`    await expect(${thing}).toBeChecked({ checked: ${about.checked} });`] : []),
      ];
  // The way ends scrolled where the moment's first thing was done, or for a still, where the agent is: its first frame is
  // there. What the moment shows ends where the agent is.
  const still = from >= did.length && from > 0 && scrolled && (scrolled.x || scrolled.y) ? [`    await page.evaluate(([x, y]) => window.scrollTo(x, y), ${xy(scrolled)});`] : [];
  const comfortable = thing ? [`    await test.inView(${thing});`] : [];
  // A still's first frame is its only one: what it's about is brought into view on the way.
  const isStill = from >= did.length && from > 0;
  // The moment's first frame has what it does first, or for a still what it's about, comfortably in view.
  const first = did[from];
  const firstInView = first && first.does !== "goto" && first.on !== "body" && (first.role || first.text) ? [`    await test.inView(page.${locatorOf(first)}, { offScreen: true });`] : [];
  const way = [...lines.slice(0, placed), ...still, ...(isStill ? comfortable : firstInView)].map((line) => line.slice(2));
  const shown = lines.slice(placed);
  return `${tried ? `import { writeFileSync } from "node:fs";\n` : ""}import { expect, test } from "playthrough/test";

test.use({ person: ${JSON.stringify(person)} });

test(${JSON.stringify(words)}, async ({ page, setup, baseURL }) => {
${way.map((line) => `${line}\n`).join("")}  await test.step(${JSON.stringify(words)}, async () => {
${[...shown, ...(still.length ? [] : scrolling), ...(isStill ? [] : comfortable), ...checks].join("\n")}
  });${tried ? `\n  writeFileSync(new URL("./${ENDED}", import.meta.url), JSON.stringify({ url: page.url() }));` : ""}
});
`;
}
export const ENDED = "ended.json";

// Whether a moment's file does its way there before its step, as every one marked since moments had a start does (a page
// is always arrived at first); one kept before does everything in its step.
export function wayBefore(file: string): boolean {
  const lines = file.split("\n");
  const from = lines.findIndex((line) => line.startsWith("test("));
  return lines.findIndex((line) => line.includes("await test.step(")) > from + 1;
}

// What a thing was done on, as getByRole finds it, by its words where it has no role, by its path where it has neither.
function locatorOf(done: Done): string {
  const nth = done.nth !== undefined ? `.nth(${done.nth})` : "";
  if (done.role && done.name) return `getByRole(${JSON.stringify(done.role)}, { name: ${JSON.stringify(done.name)}, exact: true })${nth}`;
  if (done.role) return `getByRole(${JSON.stringify(done.role)})${nth}`;
  if (done.text) return `getByText(${JSON.stringify(done.text)}, { exact: true })${nth}`;
  return `locator(${JSON.stringify(done.on)})`;
}

// The way there of a moment's file, and what the moment does, without what it checks: for going there by hand, not for
// proving it.
export function wayIn(file: string): string {
  const lines = file.split("\n");
  const from = lines.findIndex((line) => line.startsWith("test("));
  const until = lines.findIndex((line, i) => i > from && line === "  });");
  return lines
    .slice(from + 1, until)
    .filter((line) => !line.trim().startsWith("await expect(") && !line.includes("await test.step(") && !line.includes("await test.inView("))
    .join("\n");
}

// An address with what setup made written as setup's: the board made for this run is the board made for that one.
function madeBySetup(address: string, setup: Record<string, unknown>) {
  let out = address;
  for (const [key, value] of Object.entries(setup)) if (typeof value === "string" && value.length > 6) out = out.split(value).join(`\${setup.${key}}`);
  return out;
}

// Two addresses, part by part, with the ids in them set aside: where they differ, a part that's a number in both, or
// letters and digits of one length, as Kan's ids are (qiaa4o4hklar, galeikvcthwn), is an id each run made for itself.
// Said as the address with those parts as "…", or nothing where they aren't the same.
export function sameAddress(here: string, again: string): string | undefined {
  const [these, those] = [new URL(here).pathname.split("/"), new URL(again).pathname.split("/")];
  if (these.length !== those.length) return undefined;
  const id = (one: string, other: string) => /^\d+$/.test(one + other) || (one.length === other.length && one.length >= 8 && /^[a-z0-9_-]+$/i.test(one + other));
  const parts = these.map((part, i) => (part === those[i] ? part : id(part, those[i]!) ? "…" : undefined));
  return parts.includes(undefined) ? undefined : parts.join("/");
}

// Where the agent was, and where running the way again ended: what differs, each in a line, and what was left out as a
// message that comes and goes by itself, as a toast, there or not by how long ago it came. Nothing differs: it landed.
// What's out of sight where the moment ends, as a page's top is from its footer, isn't what's there: a pin that drops a
// while after the page lands, up out of sight, doesn't keep a moment at its footer from landing.
export function whatDiffers(here: { url: string; reading: Reading }, again: { url: string; reading: Reading }): { differ: string[]; passing: string[]; timely: string[]; address?: string } {
  const inSight = ({ box }: Thing, { width, height }: Reading["screen"]) => box.y + box.height > 0 && box.y < height && box.x + box.width > 0 && box.x < width;
  // Playthrough scrolls what's shown into view itself, so the same place is the same things saying the same, wherever
  // they sit on the screen: something moved isn't somewhere else.
  const all = differences(here.reading, again.reading).differences.filter(
    (one) => one.what !== "moved" && (("then" in one && inSight(one.then, here.reading.screen)) || ("now" in one && inSight(one.now, again.reading.screen))),
  );
  // Words that say a time, reworded only in their numbers (“Synced 3 s ago”, “12:04”), change with time, not with the work.
  const timely = (one: (typeof all)[number]) =>
    one.what === "reworded" && one.then.name.replace(/\d+/g, "#") === one.now.name.replace(/\d+/g, "#") && TIMED.test(one.now.name);
  const passes = (one: (typeof all)[number]) => ("now" in one ? one.now : one.then).live || timely(one);
  const address = sameAddress(here.url, again.url);
  return {
    differ: [
      ...all.filter((one) => !passes(one)).slice(0, 12).map(said),
      ...(address === undefined ? [`the address: ${new URL(here.url).pathname} where you are, ${new URL(again.url).pathname} run again`] : []),
    ],
    passing: all.filter(passes).map(said),
    timely: all.filter(timely).map((one) => ("now" in one ? one.now.name : "")),
    ...(address !== undefined && { address }),
  };
}

export const TIMED = /\d\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|weeks?)\b|\bago\b|\d{1,2}:\d{2}/i;

const said = (one: ReturnType<typeof differences>["differences"][number]) =>
  "now" in one && "then" in one ? `${one.what}: ${one.then.role} ${quote(one.then.name)} → ${quote(one.now.name)}` : one.what === "new" ? `only run again: ${one.now.role} ${quote(one.now.name)}` : `only where you are: ${one.then.role} ${quote(one.then.name)}`;

export const aboutSaid = (about: About) =>
  `${about.role === "text" ? "words" : about.role} ${quote(about.name)}${about.value !== undefined ? `, saying ${quote(about.value)}` : ""}${about.disabled ? ", which can't be changed" : ""}${about.checked !== undefined ? (about.checked ? ", checked" : ", not checked") : ""}`;
