// A label whose characters roll over like an odometer when it changes: only the ones that differ turn over, one after
// another from the right, downwards going back and upwards going forward, so going back a round turns over only its
// number. Each character has a window of its own that eases between the old and new widths, so a wide character is
// never cut off by a narrow one and the label never jumps. When what it says changes shape ("Round 4" to "Round 2 → 4"),
// the whole label turns over at once, in place, rather than its parts sliding across each other.

// A word turns over whole; anything else character by character. A part rolls against the part with the same key.
export type Part = { text: string; key: string; soft?: boolean; word?: boolean };

const shown = new WeakMap<HTMLElement, { parts: Part[]; html: string }>();
const curve = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export function roll(label: HTMLElement, parts: Part[], direction: 1 | -1) {
  const old = shown.get(label);
  const same = (a: Part[], b: Part[]) => a.map((part) => `${part.key}:${part.text}`).join("|") === b.map((part) => `${part.key}:${part.text}`).join("|");
  // Saying the same again leaves it alone, so a redraw never cuts a roll short.
  if (old && same(old.parts, parts)) return;
  const html = parts.flatMap((part) => cells(part).map((c) => cell(c, part.soft))).join("");
  shown.set(label, { parts, html });
  if (!old || matchMedia("(prefers-reduced-motion: reduce)").matches) return void (label.innerHTML = html);
  const turn = { duration: 240, easing: curve, fill: "both" } as const;

  if (old.parts.map((part) => part.key).join() !== parts.map((part) => part.key).join()) {
    label.innerHTML = `<span class="inline-grid overflow-hidden align-top"><span data-new class="[grid-area:1/1] justify-self-center whitespace-nowrap">${html}</span><span data-old aria-hidden="true" class="[grid-area:1/1] justify-self-center whitespace-nowrap">${old.html}</span></span>`;
    const whole = { ...turn, duration: 260 };
    label.querySelector("[data-new]")!.animate([{ transform: `translateY(${direction * 100}%)` }, { transform: "none" }], whole);
    const leaving = label.querySelector("[data-old]")!;
    leaving.animate([{ transform: "none" }, { transform: `translateY(${-direction * 100}%)` }], whole).onfinish = () => leaving.remove();
    return;
  }

  // Lined up from the right, part by part: what each cell shows now, what it showed, and whether it's leaving.
  type Cell = { now?: string; was?: string; soft?: boolean; leaving?: boolean; group?: string };
  const all: Cell[] = [];
  for (const part of parts) {
    const now = cells(part);
    const was = cells(old.parts.find((other) => other.key === part.key)!);
    const longer = now.length - was.length;
    for (let i = 0; i < -longer; i++) all.push({ was: was[i], soft: part.soft, leaving: true, group: `trim ${part.key}` });
    now.forEach((c, j) => all.push({ now: c, was: was[j - longer], soft: part.soft, group: j - longer < 0 ? `grow ${part.key}` : undefined }));
  }
  label.innerHTML = all.map((c) => cell((c.leaving ? c.was : c.now)!, c.soft)).join("");
  const elements = [...label.children] as HTMLElement[];
  let order = -1;
  let group: string | undefined;
  for (let i = all.length - 1; i >= 0; i--) {
    const c = all[i]!;
    const element = elements[i]!;
    const face = element.firstElementChild!;
    if (!c.leaving && c.was === c.now) continue;
    // A part arriving or leaving moves as one; the characters that change inside a part turn over one after another.
    if (!c.group || c.group !== group) order++;
    group = c.group;
    const timing = { ...turn, delay: order * 28 };
    const width = element.offsetWidth;
    if (c.leaving) {
      face.animate([{ transform: "none" }, { transform: `translateY(${-direction * 100}%)` }], timing);
      element.animate([{ width: `${width}px` }, { width: "0px" }], timing).onfinish = () => element.remove();
      continue;
    }
    face.animate([{ transform: `translateY(${direction * 100}%)` }, { transform: "none" }], timing);
    let from = 0;
    if (c.was !== undefined) {
      const ghost = document.createElement("i");
      ghost.className = "absolute top-0 left-0 not-italic";
      ghost.innerHTML = character(c.was);
      element.append(ghost);
      from = ghost.offsetWidth;
      ghost.animate([{ transform: "none" }, { transform: `translateY(${-direction * 100}%)` }], timing).onfinish = () => ghost.remove();
    }
    if (from !== width) element.animate([{ width: `${from}px` }, { width: `${width}px` }], { ...timing, fill: "backwards" });
  }
}

const cells = (part: Part) => (part.word ? [part.text] : [...part.text]);
const character = (c: string) => (c === " " ? "&nbsp;" : c.replace(/[&<>"]/g, (s) => `&#${s.charCodeAt(0)};`));
// The quiet parts (an arrow, "is in", a round before the latest) are said fainter.
const cell = (c: string, soft?: boolean) => `<span class="relative inline-block overflow-hidden align-top${soft ? " text-faint" : ""}"><i class="inline-block not-italic">${character(c)}</i></span>`;
