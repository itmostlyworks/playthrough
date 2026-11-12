// The way to a moment: what the agent did in its browser, written as a scene Playthrough runs again from a fresh start,
// and whether running it again landed where the agent was.

import { differences, type Reading } from "@playthrough/page";
import { quote } from "@playthrough/review";

// What was done, as take-over keeps a person's, and what it was done on as getByRole finds it: its role and name, and
// which of those alike it was, where it isn't the only one. By its path only where it has no role and name.
export type Done = { does: string; on: string; with?: string; what?: string; role?: string; name?: string; nth?: number };

// What a moment is about, read where the agent is: one thing on the page, by its role and name, with what can be
// checked of it again.
export type About = { role: string; name: string; value?: string; disabled: boolean; checked?: boolean };

// A moment's file, by its words: the same words are the same moment, marked again in its place.
export const fileOf = (words: string) => `${words.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "moment"}.ts`;

// A moment's words, from its file.
export function wordsIn(file: string): string | undefined {
  const named = file.match(/^test\(("(?:[^"\\]|\\.)*")/m)?.[1];
  return named === undefined ? undefined : JSON.parse(named);
}

// The way there, written as a scene: each page gone to, and what was done on each, as getByRole finds it, or by its path
// where it has no role and name; then what it's about, as it was, checked again. Tried, it also writes where it ended,
// beside itself, as no reading says the address.
export function sceneOf({ words, person, did, setup, about, tried = false }: { words: string; person: string; did: Done[]; setup: Record<string, unknown>; about?: About; tried?: boolean }): string {
  const lines = did.map((done) => {
    const at = done.role && done.name ? `getByRole(${JSON.stringify(done.role)}, { name: ${JSON.stringify(done.name)}, exact: true })${done.nth !== undefined ? `.nth(${done.nth})` : ""}` : `locator(${JSON.stringify(done.on)})`;
    const what = done.what && !done.name ? ` // ${done.what.replace(/\n/g, " ")}` : "";
    const given = JSON.stringify(done.with ?? "");
    if (done.does === "goto") {
      const address = "`${baseURL}" + madeBySetup(String(done.with), setup) + "`";
      // Gone to where an action led already, it's there; gone to directly, it goes.
      return `    await page.waitForURL(${address}, { timeout: 3000 }).catch(() => page.goto(${address}));`;
    }
    if (done.does === "fill") return `    await page.${at}.fill(${given});${what}`;
    if (done.does === "selectOption") return `    await page.${at}.selectOption(${given});${what}`;
    if (done.does === "press") return done.on === "body" ? `    await page.keyboard.press(${given});` : `    await page.${at}.press(${given});${what}`;
    return `    await page.${at}.click();${what}`;
  });
  const thing = about && `page.getByRole(${JSON.stringify(about.role)}, { name: ${JSON.stringify(about.name)}, exact: true })`;
  const checks = !about
    ? []
    : [
        `    await expect(${thing}).toBeVisible();`,
        ...(about.value !== undefined ? [`    await expect(${thing}).toHaveValue(${JSON.stringify(about.value)});`] : []),
        ...(about.value !== undefined || ["button", "checkbox", "radio", "switch", "combobox", "textbox"].includes(about.role)
          ? [about.disabled ? `    await expect(${thing}).${about.value !== undefined ? "not.toBeEditable" : "toBeDisabled"}();` : `    await expect(${thing}).toBeEnabled();`]
          : []),
        ...(about.checked !== undefined ? [`    await expect(${thing}).toBeChecked({ checked: ${about.checked} });`] : []),
      ];
  return `${tried ? `import { writeFileSync } from "node:fs";\n` : ""}import { expect, test } from "playthrough/test";

test.use({ person: ${JSON.stringify(person)} });

test(${JSON.stringify(words)}, async ({ page, setup, baseURL }) => {
  await test.step(${JSON.stringify(words)}, async () => {
${[...lines, ...checks].join("\n")}
  });${tried ? `\n  writeFileSync(new URL("./${ENDED}", import.meta.url), JSON.stringify({ url: page.url() }));` : ""}
});
`;
}
export const ENDED = "ended.json";

// The way there of a moment's file, without what it checks: for going there by hand, not for proving it.
export function wayIn(file: string): string {
  const lines = file.split("\n");
  const from = lines.findIndex((line) => line.includes("await test.step("));
  const until = lines.findIndex((line, i) => i > from && line === "  });");
  return lines
    .slice(from + 1, until)
    .filter((line) => !line.trim().startsWith("await expect("))
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
export function whatDiffers(here: { url: string; reading: Reading }, again: { url: string; reading: Reading }): { differ: string[]; passing: string[]; address?: string } {
  const all = differences(here.reading, again.reading).differences;
  const passes = (one: (typeof all)[number]) => ("now" in one ? one.now : one.then).live;
  const address = sameAddress(here.url, again.url);
  return {
    differ: [
      ...all.filter((one) => !passes(one)).slice(0, 12).map(said),
      ...(address === undefined ? [`the address: ${new URL(here.url).pathname} where you are, ${new URL(again.url).pathname} run again`] : []),
    ],
    passing: all.filter(passes).map(said),
    ...(address !== undefined && { address }),
  };
}

const said = (one: ReturnType<typeof differences>["differences"][number]) =>
  "now" in one && "then" in one ? `${one.what}: ${one.then.role} ${quote(one.then.name)} → ${quote(one.now.name)}` : one.what === "new" ? `only run again: ${one.now.role} ${quote(one.now.name)}` : `only where you are: ${one.then.role} ${quote(one.then.name)}`;

export const aboutSaid = (about: About) =>
  `${about.role} ${quote(about.name)}${about.value !== undefined ? `, saying ${quote(about.value)}` : ""}${about.disabled ? ", which can't be changed" : ""}${about.checked !== undefined ? (about.checked ? ", checked" : ", not checked") : ""}`;
