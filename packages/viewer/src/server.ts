// `playthrough open` as the viewer's source: the page it serves asks it at /api, on the same machine.

import type { Listed, Source } from "./api.ts";

const of = (change: string) => `/api/changes/${encodeURIComponent(change)}`;

// Playthrough answers a step in within a minute, made or with why not (following.ts); past this, it isn't going to.
const ANSWERED = 70_000;

export const server: Source = {
  you: () => get<{ name: string }>("/api/you").then(({ name }) => name),
  changes: listen,
  file: (change, handBack, name) => `/api/changes/${change}/hand-backs/${handBack}/files/${name}`,
  send: (change, send) => posted(`${of(change)}/sends`, send).then((done) => ("problems" in done ? done.problems : [])),
  seen: (change, by, moments) => posted(`${of(change)}/seen`, { by, moments }).then((done) => ("problems" in done ? done.problems : [])),
  readyIn: (change, moment, after, asked) =>
    fetch(`${of(change)}/ready-in`, { method: "POST", headers: JSON_BODY, body: JSON.stringify({ moment, after }), signal: asked })
      .then((answer) => (answer.ok ? answer.json() : Promise.reject()))
      .then((said) => ({ in: said.in ?? undefined, starting: said.starting === true }), () => undefined),
  keepReady: (change, moment, after) => void fetch(`${of(change)}/keep-ready`, { method: "POST", headers: JSON_BODY, body: JSON.stringify({ moment, after }) }).catch(() => {}),
  stepIn,
  keepBranch: (change, branch) => posted<{ length: number }>(`${of(change)}/branches`, branch).then((done) => ("problems" in done ? done.problems : done.answer.length)),
  frame: (change, note, framed) => posted<{ picture: string; screen: { width: number; height: number } }>(`${of(change)}/frames`, { note, ...framed }).then((done) => ("problems" in done ? undefined : done.answer)),
  still: (change, still) => posted<{ picture: string }>(`${of(change)}/stills`, still).then((done) => ("problems" in done ? undefined : done.answer.picture)),
  // The browser's own, asked for only when used: a browser that refuses them throws there, where it's caught.
  get kept() {
    return localStorage;
  },
  get keptForTheTab() {
    return sessionStorage;
  },
};
const JSON_BODY = { "content-type": "application/json" };

// Every change on this machine, from every app and every copy of each, arriving again whenever any of them changes. One
// stream, while the page is in sight: a browser lets six requests at a time go to one address, from all its tabs
// together. Out of sight, they are asked for now and then instead, so the tab's title still says what's waiting.
function listen(told: (changes: Listed[]) => void) {
  let live: EventSource | undefined;
  let every = 0;
  let last = "";
  const take = (data: string) => data !== last && told(JSON.parse((last = data)));
  const ask = () => fetch("/api/changes").then((answer) => (answer.ok ? answer.text() : undefined), () => undefined).then((data) => data && take(data));
  const again = () => {
    clearInterval(every);
    if (document.hidden) return void (live?.close(), (live = undefined), (every = window.setInterval(ask, 5000)));
    if (live && live.readyState !== EventSource.CLOSED) return;
    live = new EventSource("/api/changes?live");
    live.onmessage = ({ data }) => take(data);
  };
  again();
  document.addEventListener("visibilitychange", again);
  return () => (document.removeEventListener("visibilitychange", again), clearInterval(every), live?.close());
}

// The app at that moment is through Playthrough, on the same machine name the viewer was reached by.
async function stepIn(change: string, moment: string, after: number | undefined, asked: AbortSignal) {
  try {
    const answer = await fetch(`${of(change)}/step-in`, { method: "POST", headers: JSON_BODY, body: JSON.stringify({ moment, after }), signal: AbortSignal.any([asked, AbortSignal.timeout(ANSWERED)]) });
    const said = await answer.json().catch(() => ({}));
    if (answer.ok) return { address: `${location.protocol}//${location.hostname}:${said.port}/step-in/${said.name}`, setup: said.setup ?? {}, checked: said.checked };
    return { problems: said.problems ?? [`Playthrough couldn't open the app here: it answered ${answer.status}. Step in again; if it says so again, start Playthrough again with playthrough open.`] };
  } catch (error) {
    if ((error as Error)?.name === "TimeoutError")
      return { problems: [`Playthrough hasn't answered in ${ANSWERED / 1000} seconds, when it always says within a minute. Look at where playthrough open runs: if it's stuck there, start it again, then step in again.`] };
    return { problems: ["Playthrough isn't running here any more. Start it again with playthrough open, then step in again."] };
  }
}

async function get<T>(path: string): Promise<T> {
  const answer = await fetch(path);
  if (!answer.ok) throw new Error(`${path}: ${answer.status}`);
  return answer.json();
}

// What it answered, or what's wrong in plain words.
async function posted<T>(path: string, body: unknown): Promise<{ answer: T } | { problems: string[] }> {
  try {
    const answer = await fetch(path, { method: "POST", headers: JSON_BODY, body: JSON.stringify(body) });
    return answer.ok ? { answer: await answer.json() } : { problems: (await answer.json()).problems ?? [`It wasn't kept (${answer.status}).`] };
  } catch {
    return { problems: ["Playthrough isn't running here any more. Start it again with playthrough open, then try again."] };
  }
}
