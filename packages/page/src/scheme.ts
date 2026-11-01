// A page's light or dark, and still or moving, as the browser a flow was recorded in answered them, whatever the browser
// it's shown in says. A page asks in its styles, its scripts and its colour-scheme, and each asking is answered before
// the page hears it: the app taken over is shown as it was recorded, and so is the recording played back, where the
// site's own `prefers-color-scheme` styles had played it dark in a dark viewer though it was recorded light.
//
// Both functions use nothing from outside them: they're put into the app's pages as they're written here.
export type Answered = { dark: boolean; still: boolean };

// Styles, a media query or an SVG's own, with each asking of light or dark, still or moving, answered: a condition that
// always holds, or never does. An SVG drawn as an image asks the browser it's shown in, whatever the page around it says.
export function asRecorded(text: string, recorded: Answered): string {
  const answers: Record<string, string> = { "prefers-color-scheme": recorded.dark ? "dark" : "light", "prefers-reduced-motion": recorded.still ? "reduce" : "no-preference" };
  return String(text).replace(/\(\s*(prefers-color-scheme|prefers-reduced-motion)\s*(?::\s*([a-z-]+)\s*)?\)/gi, (_, feature: string, value?: string) => {
    feature = feature.toLowerCase();
    const holds = value ? value.toLowerCase() === answers[feature] : feature === "prefers-color-scheme" || recorded.still;
    return holds ? "(min-width: 0px)" : "(max-width: 0px)";
  });
}

export function answerAs(view: Window & typeof globalThis, recorded: Answered) {
  const page = view.document;
  const as = (query: string) => asRecorded(query, recorded);
  const matching = view.matchMedia;
  view.matchMedia = (query: string) => matching.call(view, as(query));
  const sheet = view.CSSStyleSheet.prototype as unknown as Record<string, (text: string, ...rest: unknown[]) => unknown>;
  for (const name of ["insertRule", "replace", "replaceSync"]) {
    const real = sheet[name];
    if (real) sheet[name] = function (this: CSSStyleSheet, text: string, ...rest: unknown[]) { return real.call(this, as(text), ...rest); };
  }
  // light-dark(), system colours, form controls and scrollbars follow the page's colour-scheme, not a media query.
  const scheme = recorded.dark ? "dark" : "light";
  const inScheme = (value: string) => (/\blight\b/.test(value) && /\bdark\b/.test(value) ? scheme : value);
  const rewrite = (rules: CSSRuleList) => {
    for (const rule of rules as unknown as (CSSRule & { media?: MediaList; style?: CSSStyleDeclaration; styleSheet?: CSSStyleSheet; cssRules?: CSSRuleList })[]) {
      if (rule.media && as(rule.media.mediaText) !== rule.media.mediaText) rule.media.mediaText = as(rule.media.mediaText);
      if (rule.style?.colorScheme && inScheme(rule.style.colorScheme) !== rule.style.colorScheme) rule.style.colorScheme = inScheme(rule.style.colorScheme);
      if (rule.styleSheet) restyle(rule.styleSheet);
      if (rule.cssRules) rewrite(rule.cssRules);
    }
  };
  const restyle = (sheet: CSSStyleSheet) => {
    try {
      rewrite(sheet.cssRules);
    } catch {}
  };
  const restyleAll = () => {
    for (const sheet of page.styleSheets) restyle(sheet);
    for (const sheet of page.adoptedStyleSheets ?? []) restyle(sheet);
    for (const element of page.querySelectorAll("[media]")) {
      const media = element.getAttribute("media")!;
      if (as(media) !== media) element.setAttribute("media", as(media));
    }
    for (const meta of page.querySelectorAll('meta[name="color-scheme"]')) {
      const content = meta.getAttribute("content") ?? "";
      if (inScheme(content) !== content) meta.setAttribute("content", inScheme(content));
    }
  };
  const styling = (node: Node | null | undefined) => /^(style|link|source|meta)$/i.test(node?.nodeName ?? "");
  const bringsStyle = (node: Node) => styling(node) || !!(node as Element).querySelector?.("style, link, source, meta");
  new view.MutationObserver((changes) => changes.some((change) => styling(change.target) || styling(change.target.parentNode) || [...change.addedNodes].some(bringsStyle)) && restyleAll()).observe(page, {
    subtree: true,
    childList: true,
    characterData: true,
    attributeFilter: ["media", "content"],
  });
  page.addEventListener("load", (event) => styling(event.target as Node) && restyleAll(), true);
  restyleAll();
}
