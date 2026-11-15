// What a click is on, as a person would name it: something you can press or type into, or else the nearest thing with
// words of its own, never a part of the page that only holds others' (Kan's board, holding its toolbar's "Visibility"
// and "New list", is no more what was clicked than the page is). Something you press that holds others isn't one control
// but what holds them, as Kan's list is one you drag, with its name field, its + and its cards in it; a box you write in
// that an editor draws, as Kan's comment box, is one too. Nothing, where it's on none of these. Written for the page it
// runs in, as the agent's browser (as.ts) and stepping in (step-in.ts) put it in the app's.
export function clicked(target: Element): Element | undefined {
  const pressable = "a, button, input, select, textarea, label, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [role=combobox], [role=textbox], [contenteditable=''], [contenteditable=true]";
  const pressed = target.closest?.(pressable) ?? undefined;
  if (pressed && !pressed.querySelector(pressable)) return pressed;
  const ownWords = (element: Element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim()) || !!element.getAttribute("aria-label")?.trim();
  for (let at: Element | null = target; at && at !== (pressed ?? at.ownerDocument.body); at = at.parentElement) if (ownWords(at)) return at;
  return pressed;
}
