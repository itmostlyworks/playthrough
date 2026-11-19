// `playthrough open` as the viewer's source: the page it serves asks it at /api, on the same machine; and a guest's, at
// a shared change's link, asks it there, of that change alone (share.ts).

import type { AskedVideo, Listed, Shared, Source } from "./api.ts";

// Playthrough answers a step in within a minute, made or with why not (following.ts); past this, it isn't going to.
const ANSWERED = 70_000;

// Where it's asked: for every change, for one, and where a step in's app is, as Playthrough answers it; and whether
// the changes can come as a stream, which a tunnel holds back until it ends; and what's true once nothing answers, in
// words for whoever's asking.
type Asked = { changes: string; of: (change: string) => string; app: (said: { port: number; name: string }) => string; streamed: boolean; gone: Gone };
// `said` where what was sent isn't kept, `plainly` and `why` where a step in couldn't be, as `CantStepIn` has them.
type Gone = { said: string; plainly: string; why: string };

// What's asked of `playthrough open` the same way by the person and a guest.
const askedAt = ({ changes, of, app, streamed, gone }: Asked) =>
  ({
    changes: (told) => listen(changes, streamed, told),
    file: (change, handBack, name) => `${of(change)}/hand-backs/${handBack}/files/${name}`,
    send: (change, send) => posted(`${of(change)}/sends`, send, gone).then((done) => ("problems" in done ? done.problems : [])),
    seen: (change, by, moments) => posted(`${of(change)}/seen`, { by, moments }, gone).then((done) => ("problems" in done ? done.problems : [])),
    readyIn: (change, moment, after, asked) =>
      fetch(`${of(change)}/ready-in`, { method: "POST", headers: JSON_BODY, body: JSON.stringify({ moment, after }), signal: asked })
        .then((answer) => (answer.ok ? answer.json() : Promise.reject()))
        .then((said) => ({ in: said.in ?? undefined, starting: said.starting === true }), () => undefined),
    keepReady: (change, moment, after) => void fetch(`${of(change)}/keep-ready`, { method: "POST", headers: JSON_BODY, body: JSON.stringify({ moment, after }) }).catch(() => {}),
    stepIn: (change, moment, after, asked) => stepIn(of(change), app, gone, moment, after, asked),
    keepBranch: (change, branch) => posted<{ length: number }>(`${of(change)}/branches`, branch, gone).then((done) => ("problems" in done ? done.problems : done.answer.length)),
    frame: (change, note, framed) => posted<{ picture: string; screen: { width: number; height: number } }>(`${of(change)}/frames`, { note, ...framed }, gone).then((done) => ("problems" in done ? undefined : done.answer)),
    still: (change, still) => posted<{ picture: string }>(`${of(change)}/stills`, still, gone).then((done) => ("problems" in done ? undefined : done.answer.picture)),
    // The browser's own, asked for only when used: a browser that refuses them throws there, where it's caught.
    get kept() {
      return localStorage;
    },
    get keptForTheTab() {
      return sessionStorage;
    },
  }) satisfies Omit<Source, "you">;

// A change by its address, as `playthrough open` lists it.
const of = (change: string) => `/api/changes/${change.split("/").map(encodeURIComponent).join("/")}`;

// Added to, not spread: the storage is asked for only when it's used.
export const server: Source = Object.assign(askedAt({ changes: "/api/changes", of, app: ({ port, name }) => `${location.protocol}//${location.hostname}:${port}/step-in/${name}`, streamed: true, gone: {
    said: "Playthrough isn't running here any more. Start it again with playthrough open, then try again.",
    plainly: "Playthrough isn't running any more.",
    why: "Playthrough wasn't running when they pressed it: playthrough open had stopped.",
  } }), {
  you: () => get<{ name: string }>("/api/you").then(({ name }) => name),
  share: {
    of: (change: string) => shared(change, "GET"),
    start: (change: string) => shared(change, "POST"),
    stop: (change: string) => shared(change, "DELETE"),
  },
  video,
});

// A guest at a shared change's link (`home`, its folder): the change alone, asked for there; the app stepped into at
// the same address, which is the app's to them, as the tunnel leads both here; and who they are as they said it, kept
// in this browser.
export function guest(home: string): Source {
  const asked = askedAt({ changes: `${home}api/change`, of: () => `${home}api/change`, app: ({ name }) => `${location.origin}/step-in/${name}`, streamed: false, gone: GONE });
  const listen = asked.changes;
  return Object.assign(asked, {
    // With no page around it to say what it is, the tab says it.
    changes: (told: (changes: Listed[]) => void) => listen((changes) => (changes[0] && (document.title = `${changes[0].change.title} · Playthrough`), told(changes))),
    you: async () => {
      try {
        return localStorage.getItem(NAME) ?? "";
      } catch {
        return "";
      }
    },
    name: (name: string) => {
      try {
        localStorage.setItem(NAME, name);
      } catch {}
    },
  });
}
const NAME = "playthrough:name";
// Nothing at the link answers: there's nothing for a guest to do here but ask for another.
const GONE: Gone = {
  said: "The person who shared this has stopped sharing, or their computer is off. Ask them for a new link.",
  plainly: "Sharing has stopped here. Ask for a new link.",
  why: "The link stopped answering when a guest pressed it: sharing had stopped, or playthrough open had.",
};

const JSON_BODY = { "content-type": "application/json" };

// Where sharing a change stands, as it's asked, started or stopped; asked of a Playthrough no longer running, that it
// isn't, in the words a failure has.
const shared = (change: string, method: string): Promise<Shared> =>
  fetch(`${of(change)}/share`, { method }).then(
    (answer) => answer.json(),
    () => ({ is: "failed", why: "Playthrough isn't running here any more. Start it again with playthrough open, then try again." }),
  );

// Every change on this machine, from every app and every copy of each, arriving again whenever any of them changes. One
// stream, while the page is in sight: a browser lets six requests at a time go to one address, from all its tabs
// together. Out of sight, they are asked for now and then instead, so the tab's title still says what's waiting; and
// where there's no stream, as through a tunnel, every two seconds in sight, as often as `playthrough open` looks.
function listen(changes: string, streamed: boolean, told: (changes: Listed[]) => void) {
  let live: EventSource | undefined;
  let every = 0;
  let last = "";
  const take = (data: string) => data !== last && told(JSON.parse((last = data)));
  const ask = () => fetch(changes).then((answer) => (answer.ok ? answer.text() : undefined), () => undefined).then((data) => data && take(data));
  const again = () => {
    clearInterval(every);
    if (document.hidden || !streamed) return void (live?.close(), (live = undefined), streamed || ask(), (every = window.setInterval(ask, document.hidden ? 5000 : 2000)));
    if (live && live.readyState !== EventSource.CLOSED) return;
    live = new EventSource(`${changes}?live`);
    live.onmessage = ({ data }) => take(data);
  };
  again();
  document.addEventListener("visibilitychange", again);
  return () => (document.removeEventListener("visibilitychange", again), clearInterval(every), live?.close());
}

// The app at that moment is through Playthrough, where Playthrough says it is.
async function stepIn(of: string, app: Asked["app"], gone: Gone, moment: string, after: number | undefined, asked: AbortSignal) {
  try {
    const answer = await fetch(`${of}/step-in`, { method: "POST", headers: JSON_BODY, body: JSON.stringify({ moment, after }), signal: AbortSignal.any([asked, AbortSignal.timeout(ANSWERED)]) });
    const said = await answer.json().catch(() => ({}));
    if (answer.ok) return { address: app(said), setup: said.setup ?? {}, checked: said.checked };
    // Answered with none of Playthrough's words, it's not Playthrough answering: through a tunnel, the tunnel's gone.
    if (!said.plainly && !said.problems) return { plainly: gone.plainly, why: `${gone.why} (${answer.status})` };
    return { plainly: said.plainly ?? "Something went wrong getting there.", why: said.problems?.join(" ") ?? `Playthrough answered the step in with ${answer.status}.` };
  } catch (error) {
    if ((error as Error)?.name === "TimeoutError")
      return { plainly: "Playthrough stopped answering.", why: `Playthrough hadn't answered the step in after ${ANSWERED / 1000} seconds, when it always does within a minute: playthrough open may be stuck.` };
    return { plainly: gone.plainly, why: gone.why };
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
async function posted<T>(path: string, body: unknown, gone: Gone): Promise<{ answer: T } | { problems: string[] }> {
  try {
    const answer = await fetch(path, { method: "POST", headers: JSON_BODY, body: JSON.stringify(body) });
    return answer.ok ? { answer: await answer.json() } : { problems: (await answer.json()).problems ?? [`It wasn't kept (${answer.status}).`] };
  } catch {
    return { problems: [gone.said] };
  }
}
