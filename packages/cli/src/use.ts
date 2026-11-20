// How every page of the app is opened, as playthrough/setup.ts's use says, and a moment's own test.use under it: each of
// the options Playwright opens a browser with, and what becomes of it. One rule for the recording, the agent's browser
// and taking over, so an option can't be honoured by one and dropped by another without being said: it's every option
// Playwright has, so one it adds can't be used until it's said here what becomes of it.
//
// - Playthrough's: kept the same everywhere, like the screen; use is refused it.
// - On the way to the app: how the browser talks to the app. Taking over, it's added on this computer to what goes to
//   the app's own address, and nowhere else: never told to the browser, which only uses it.
// - Handed over: what the page starts with, which is in the page the run hands over.
// - Playwright's: about running a moment, nothing the app sees.
// - The browser's own: what a person's browser can't be made to be. Said, where it's anything but what any browser is,
//   in what it did, for the person to read before they're in.

import type { BrowserContextOptions } from "@playwright/test";
import type { IncomingHttpHeaders } from "node:http";
import { list } from "@playthrough/change";

type Use = BrowserContextOptions;
type Option = keyof Use;
type Becomes = "Playthrough's" | "on the way to the app" | "handed over" | "Playwright's" | ((value: any) => string | undefined);

const OPTIONS: { [option in Option]-?: Becomes } = {
  baseURL: "Playthrough's",
  viewport: "Playthrough's",
  screen: "Playthrough's",
  isMobile: "Playthrough's",
  hasTouch: "Playthrough's",
  deviceScaleFactor: "Playthrough's",
  locale: "Playthrough's",
  timezoneId: "Playthrough's",
  colorScheme: "Playthrough's",
  reducedMotion: "Playthrough's",
  forcedColors: "Playthrough's",
  contrast: "Playthrough's",
  extraHTTPHeaders: "on the way to the app",
  httpCredentials: "on the way to the app",
  userAgent: "on the way to the app",
  storageState: "handed over",
  acceptDownloads: "Playwright's",
  logger: "Playwright's",
  recordHar: "Playwright's",
  recordVideo: "Playwright's",
  strictSelectors: "Playwright's",
  geolocation: (where) => where && "was told where it is",
  permissions: (allowed: string[]) => (allowed?.length ? `was allowed ${list(allowed)}` : undefined),
  offline: (offline) => (offline ? "was offline" : undefined),
  javaScriptEnabled: (enabled) => (enabled === false ? "ran no scripts" : undefined),
  bypassCSP: (bypassed) => (bypassed ? "ignored the app's content security policy" : undefined),
  serviceWorkers: (workers) => (workers === "block" ? "ran no service workers" : undefined),
  proxy: (proxy) => proxy && "went through a proxy",
  clientCertificates: (certificates: unknown[]) => (certificates?.length ? "showed the app a certificate" : undefined),
  ignoreHTTPSErrors: (ignored) => (ignored ? "overlooked certificate errors" : undefined),
};

const set = (use: Use | undefined) => Object.entries(use ?? {}).filter(([option, value]) => option in OPTIONS && value !== undefined) as [Option, any][];

// What use sets that's Playthrough's to keep the same everywhere.
export const playthroughs = (use: Use | undefined) => set(use).flatMap(([option]) => (OPTIONS[option] === "Playthrough's" ? [option] : []));

// What the recording's browser was that a person's can't be, in a sentence, or nothing where theirs can be the same.
// Never a value: a proxy's address or a place is only said to have been there.
export function unlike(use: Use | undefined): string | undefined {
  const did = set(use).flatMap(([option, value]) => {
    const becomes = OPTIONS[option];
    return typeof becomes === "function" ? [becomes(value)].filter((said): said is string => !!said) : [];
  });
  if (did.length) return `Your browser can't be as the recording's was, which ${list(did)}, so the app may not be as it was there.`;
}

// What goes to the app, with what use adds to every request on the way to it, as the run's browser added it: its
// headers over the browser's own, as Playwright puts them, the run's being what the recording had; its user agent; and
// its sign-in for the server, where it's for the app's address, unless the request carries one of its own, as the
// browser answers a server's ask for one only on a request without it. Only for the app at `origin`: to be used on what
// goes there and nowhere else.
export function onTheWay(use: Use | undefined, origin: string): (headers: IncomingHttpHeaders) => IncomingHttpHeaders {
  const added: Record<string, string> = {};
  for (const [name, value] of Object.entries(use?.extraHTTPHeaders ?? {})) if (name.toLowerCase() !== "host") added[name.toLowerCase()] = String(value);
  if (use?.userAgent) added["user-agent"] = use.userAgent;
  const signIn = [use?.httpCredentials ?? []].flat().find((one) => !one.origin || sameOrigin(one.origin, origin));
  const authorization = signIn && `Basic ${Buffer.from(`${signIn.username}:${signIn.password}`).toString("base64")}`;
  return (headers) => ({ ...(authorization && { authorization }), ...headers, ...added });
}

const sameOrigin = (one: string, other: string) => URL.canParse(one) && new URL(one).origin === new URL(other).origin;
