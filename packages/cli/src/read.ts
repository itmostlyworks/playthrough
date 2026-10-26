// The page a step left, read in the browser running the flow: everything a person would name on it, with where it is,
// how it looks and what holds it. The comparison compares two readings of the same moment in two rounds, so this is
// everything it can tell apart.

import type { Page } from "@playwright/test";
import type { Reading, Thing } from "@mostlyworks/vantage-page";

export function readPage(page: Page): Promise<{ screen: Reading["screen"]; things: Thing[] }> {
  return page.evaluate(read);
}

// The page as the app shows it, not as the pointer happens to rest on it: its :hover rules are set aside while it's read
// and pictured, and put back. Moved by a change, the pointer rests on something else, which lit up only for it. What the
// app does on hovering itself, a tooltip it opens, stays. rrweb doesn't record a rule's selector changing.
export async function unhovered<T>(page: Page, look: () => Promise<T>): Promise<T> {
  await page.evaluate(hovering, false);
  try {
    return await look();
  } finally {
    await page.evaluate(hovering, true);
  }
}

function hovering(on: boolean) {
  const kept = window as unknown as { __vantageHover?: [CSSStyleRule, string][] };
  if (on) {
    for (const [rule, selector] of kept.__vantageHover ?? []) rule.selectorText = selector;
    kept.__vantageHover = [];
    return;
  }
  const set: [CSSStyleRule, string][] = (kept.__vantageHover = []);
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      // Nothing matches :not(*), so it reads as nothing hovered, and :not(:hover) as everything not.
      if (rule instanceof CSSStyleRule && rule.selectorText.includes(":hover")) {
        set.push([rule, rule.selectorText]);
        rule.selectorText = rule.selectorText.replaceAll(":hover", ":not(*)");
      }
      if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets])
    try {
      visit(sheet.cssRules);
    } catch {
      // another site's stylesheet can't be read
    }
  // What it eases back from, it's at already.
  getComputedStyle(document.body).color;
  for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish();
}

// Runs in the page, so everything it uses is inside it.
function read() {
  const ROLES = /^(button|link|dialog|alertdialog|group|radiogroup|table|grid|treegrid|heading|status|alert|textbox|searchbox|combobox|checkbox|radio|switch|slider|listbox|option|tab|menu|menuitem|img)$/;
  const HOLDERS = /^(dialog|alertdialog|status|alert|group|radiogroup|table|grid|treegrid|listbox|menu|box)$/;
  const NAMED_BY_WORDS = /^(button|link|heading|option|tab|menuitem|radio|checkbox|switch)$/;
  const MARKED = /^(B|STRONG|I|EM|U|S|MARK|SMALL|CODE|KBD|SPAN|ABBR|TIME|SUB|SUP|Q|DATA|VAR|DEL|INS|BDI|CITE|DFN)$/;
  const INPUTS: Record<string, string> = { checkbox: "checkbox", radio: "radio", range: "slider", button: "button", submit: "button", reset: "button", search: "searchbox" };
  const TAGS: Record<string, string> = {
    BUTTON: "button", SUMMARY: "button", DIALOG: "dialog", TABLE: "table", SELECT: "combobox", TEXTAREA: "textbox", OUTPUT: "status", FIELDSET: "group", IMG: "img",
    H1: "heading", H2: "heading", H3: "heading", H4: "heading", H5: "heading", H6: "heading",
  };
  const TABLES = "table, [role=table], [role=grid], [role=treegrid]";
  const mirror = (window as any).rrwebRecord?.record?.mirror;
  const plain = (words: string) => words.replace(/\s+/g, " ").trim();
  const cut = (words: string, most: number) => (words.length > most ? words.slice(0, most - 1).trimEnd() + "…" : words);
  const style = (element: Element) => getComputedStyle(element);

  function roleOf(element: Element): string | undefined {
    const given = element.getAttribute("role")?.trim().split(/\s+/)[0];
    if (given) return given;
    if (element.tagName === "A") return element.hasAttribute("href") ? "link" : undefined;
    if (element.tagName === "INPUT") {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      return type === "hidden" ? undefined : (INPUTS[type] ?? "textbox");
    }
    return TAGS[element.tagName];
  }

  // A space between words laid out apart: on lines of their own, or with room between them.
  const apart = (element: Element, side: "Left" | "Right") => {
    const looks = style(element);
    return !looks.display.startsWith("inline") || parseFloat(looks[`margin${side}`]) + parseFloat(looks[`padding${side}`]) > 0 ? " " : "";
  };

  // Words as a person reads them: a space between words laid out apart, where the page's own text may run them together
  // (Actual's “HSBC7,810.00” is “HSBC 7,810.00”).
  function spoken(element: Element): string {
    let words = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) words += node.textContent;
      else if (node instanceof HTMLBRElement) words += " ";
      else if (node instanceof Element) words += apart(node, "Left") + spoken(node) + apart(node, "Right");
    }
    return words;
  }

  // What it says itself, with words marked inside it as part of it.
  function ownWords(element: Element): string {
    let words = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) words += node.textContent;
      else if (node instanceof Element && MARKED.test(node.tagName) && !called(node) && !panel(node)) {
        const looks = style(node);
        if (looks.display === "none" || looks.visibility === "hidden") continue;
        words += apart(node, "Left") + ownWords(node) + apart(node, "Right");
      }
    }
    return plain(words);
  }

  const labelOf = (element: Element) => {
    const by = element.getAttribute("aria-labelledby");
    return plain(by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") : (element.getAttribute("aria-label") ?? ""));
  };

  function nameOf(element: Element, role: string): string {
    let name = labelOf(element);
    if (!name && NAMED_BY_WORDS.test(role)) name = plain(spoken(element));
    if (!name && "labels" in element) name = plain([...((element as HTMLInputElement).labels ?? [])].map((label) => label.textContent).join(" "));
    if (!name) name = element.getAttribute("alt") ?? element.getAttribute("title") ?? element.getAttribute("placeholder") ?? "";
    return cut(plain(name), 120);
  }

  // A control or a part of the page with a role a person would name it by. A group with no name is only a wrapper.
  function called(element: Element): { role: string; name: string } | undefined {
    const role = roleOf(element);
    if (!role || !ROLES.test(role)) return undefined;
    const name = nameOf(element, role);
    return /group$/.test(role) && !name ? undefined : { role, name };
  }

  // A part of the page that names itself, a section or side panel with a label of its own, drawn or not (Spliit's “Who
  // owes whom”).
  const labelledPart = (element: Element) =>
    (/^(SECTION|ASIDE|NAV|FORM|ARTICLE)$/.test(element.tagName) || /^(region|form|navigation|complementary|search|article)$/.test(element.getAttribute("role") ?? "")) && !!labelOf(element);

  // A panel or bar: something with a background, shadow or border of its own, or a part of the page that names itself.
  // What changes inside it is a change to it.
  function panel(element: Element): boolean {
    const box = element.getBoundingClientRect();
    if (box.width < 12 || box.height < 12 || box.width * box.height > 0.9 * innerWidth * innerHeight) return false;
    if (/^(HTML|BODY|MAIN|TR|TBODY|THEAD|TD|TH)$/.test(element.tagName)) return false;
    if (labelledPart(element)) return true;
    const looks = style(element);
    const background = looks.backgroundColor;
    const around = element.parentElement && style(element.parentElement).backgroundColor;
    if (!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(background) && background !== around) return true;
    if (looks.boxShadow !== "none") return true;
    const sides = ["Top", "Right", "Bottom", "Left"] as const;
    return sides.filter((side) => parseFloat(looks[`border${side}Width`]) > 0 && looks[`border${side}Style`] !== "none").length >= 3;
  }

  const firstWords = (element: Element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node: Node | null; (node = walker.nextNode()); ) if (plain(node.textContent ?? "")) return plain(node.textContent ?? "");
    return "";
  };
  const allWords = (element: Element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const words: string[] = [];
    for (let node: Node | null; (node = walker.nextNode()); ) words.push(node.textContent ?? "");
    return plain(words.join(" "));
  };

  // A table the page marks as one, with heading cells: where each column runs, so what's under a heading is that column.
  // Nothing laid out like a table counts unless the page says it is one.
  type Heading = { name: string; from: number; to: number; bottom: number };
  function headingsOf(table: Element): Heading[] | undefined {
    const cells = [...table.querySelectorAll("th, [role=columnheader]")].filter((cell) => cell.closest(TABLES) === table);
    const row = cells[0]?.parentElement;
    const headings = cells
      .filter((cell) => cell.parentElement === row)
      .map((cell) => {
        const box = cell.getBoundingClientRect();
        return { name: cut(plain(spoken(cell)), 120), from: box.left, to: box.right, bottom: box.bottom };
      })
      .filter((heading) => heading.name && heading.to > heading.from);
    return headings.length ? headings : undefined;
  }

  const things: any[] = [];
  function walk(element: Element, holder: number | undefined, parent: number | undefined, headings: Heading[] | undefined) {
    for (const child of element.children) {
      const looks = style(child);
      if (looks.display === "none" || looks.visibility === "hidden" || Number(looks.opacity) === 0) continue;
      const box = child.getBoundingClientRect();
      const table = child.matches(TABLES);
      const under = table ? headingsOf(child) : headings;
      const own = plain([...child.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(" "));
      let known = called(child);
      if (!known && !own && panel(child)) {
        const name = labelOf(child) || firstWords(child);
        if (name) known = { role: "box", name: cut(name, 120) };
      }

      let inside = holder;
      let readParent = parent;
      // Below the fold still counts: pushed off the bottom is moved, not gone.
      if ((known || own) && box.width >= 1 && box.height >= 1) {
        const middle = box.left + box.width / 2;
        const column = headings?.find((heading) => middle >= heading.from && middle < heading.to && box.top >= heading.bottom - 2)?.name;
        const node = mirror?.getId(child);
        const words = cut(own ? ownWords(child) : "", 300);
        const wordsInside = known && /^(box|menu)$/.test(known.role) ? cut(allWords(child), 300) : undefined;
        things.push({
          role: known?.role ?? "text",
          name: known?.name ?? cut(words, 120),
          words,
          ...(wordsInside && wordsInside !== words && { wordsInside }),
          box: { x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) },
          page: { x: Math.round(box.left + scrollX), y: Math.round(box.top + scrollY) },
          look: { color: looks.color, background: looks.backgroundColor, size: looks.fontSize, weight: looks.fontWeight, border: parseFloat(looks.borderTopWidth) && looks.borderTopStyle !== "none" ? `${looks.borderTopWidth} ${looks.borderTopStyle} ${looks.borderTopColor}` : "none" },
          ...(holder !== undefined && { holder }),
          ...(parent !== undefined && { parent }),
          ...(column && { column }),
          ...(known?.role === "box" && labelOf(child) && { labelled: true }),
          ...(node !== undefined && node >= 0 && { node }),
        });
        if (known && HOLDERS.test(known.role)) inside = things.length - 1;
        readParent = things.length - 1;
      }
      walk(child, inside, readParent, under);
    }
  }
  walk(document.body, undefined, undefined, undefined);
  return { screen: { width: innerWidth, height: innerHeight }, things };
}
