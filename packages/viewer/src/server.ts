// `playthrough open` as the viewer's source: the page it serves asks it at /api, on the same machine.

import type { AskedVideo, Listed, Source } from "./api.ts";

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
  video,
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
    return { plainly: said.plainly ?? "Something went wrong getting there.", why: said.problems?.join(" ") ?? `Playthrough answered the step in with ${answer.status}.` };
  } catch (error) {
    if ((error as Error)?.name === "TimeoutError")
      return { plainly: "Playthrough stopped answering.", why: `Playthrough hadn't answered the step in after ${ANSWERED / 1000} seconds, when it always does within a minute: playthrough open may be stuck.` };
    return { plainly: "Playthrough isn't running any more.", why: "Playthrough wasn't running when they pressed it: playthrough open had stopped." };
  }
}

// Told a line at a time as it's made: how long it has left, then the video, or what went wrong.
async function video(change: string, asked: AskedVideo, onLeft: (seconds: number) => void): Promise<Blob | string[]> {
  try {
    const answer = await fetch(`${of(change)}/video`, { method: "POST", headers: JSON_BODY, body: JSON.stringify(asked) });
    if (!answer.ok || !answer.body) return (await answer.json()).problems ?? [`It wasn't made (${answer.status}).`];
    let said = "";
    for await (const part of answer.body.pipeThrough(new TextDecoderStream())) {
      const lines = (said += part).split("\n");
      said = lines.pop()!;
      for (const line of lines) {
        const told: { left?: number; video?: string; problems?: string[] } = JSON.parse(line);
        if (told.left !== undefined) onLeft(told.left);
        if (told.problems) return told.problems;
        if (told.video) return (await fetch(`data:video/mp4;base64,${told.video}`)).blob();
      }
    }
    return ["The video stopped before it was made. Try again."];
  } catch {
    return ["Playthrough isn't running here any more. Start it again with playthrough open, then try again."];
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
