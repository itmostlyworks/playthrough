Playthrough: a person reviews your work on a web app by looking at moments of it: someone, at the point that matters,
a few seconds of the app getting there. You mark them while you check your own work, in a browser Playthrough gives you.
Read this once, to its end.

  playthrough change "<title>" "<what was asked>"   name the change you're making, once: a title, as a pull request's,
                                                     and what you were asked, in the person's words
  playthrough as <person> ["<moment>"]              a browser on the app, signed in as one of its people, run in the
                                                     background; given a moment, it goes there the way the moment did
  playthrough moment "<what's there>" ["<thing>"]   here: keep where the browser is, and the way here, as a moment
  playthrough wait                                   hand back, and wait for what the person says, run in the background
  playthrough again                                  every moment again on the code as it is now: the same, or what's different
  playthrough reply <note> "<words>"                answer one of the person's notes, in a line
  playthrough drop "<moment>"                        leave a moment out

THE FIRST TIME IN AN APP

If the app has no playthrough/ folder, set it up. It's the person's app: tell them what you added, and commit it only
if they say so.
- Add playthrough to the app's devDependencies with its own package manager, then run npx playwright install chromium.
- playthrough/app.json says how to start the app. Where its command takes a port, say {port} in both, and each copy of
  the app gets its own: { "start": "npm run dev -- --port {port}", "url": "http://localhost:{port}" }. Where it can't,
  give the address it always has: { "start": "npm run dev", "url": "http://localhost:3000" }.
- playthrough/setup.ts makes what everyone starts from, fresh for each browser, and gives it back after. The same
  things every time (names, titles), and what the app needs unique (an email) unique, so a moment's way there, run
  again from a fresh start, lands in the same place. Make things through the app's API or database, not on screen;
  check each answer, so one that fails says so. Import only types from @playwright/test.

    import type { APIRequestContext, Page } from "@playwright/test";

    // The app's people, and who each is, in a few words: the person reviewing sees "Sam, a member".
    export const people = { Maja: "the owner", Sam: "a member" };

    // Given the page, a request of its own, the app's address and who it's for; what it returns is the moment's setup.
    // page.request shares the page's cookies, so signing up or in there signs the page in.
    export default async function ({ page, request, person }: { page: Page; request: APIRequestContext; baseURL?: string; person?: string }) {
      const email = `${person!.toLowerCase()}.${Date.now().toString(36)}@example.com`;
      const signedUp = await page.request.post("/api/sign-up", { data: { email, password: "launch-week", name: person } });
      if (!signedUp.ok()) throw new Error(`Sign-up: ${await signedUp.text()}`);
      const board = await (await page.request.post("/api/boards", { data: { name: "Website launch" } })).json();
      return { board: board.id, email };
    }

    // Takes away what was made, once it's done with: told what the default export returned.
    export async function after({ request, setup }: { request: APIRequestContext; baseURL: string; setup: Record<string, any> }) {
      const gone = await request.delete(`/api/boards/${setup.board}`);
      if (!gone.ok() && gone.status() !== 404) throw new Error(`Removing the board: ${gone.status()}`);
    }

  Someone who joins another's things (a member of an owner's workspace) is made with them: the owner first, on
  request, then the member on page.request. Stub what's outside the app at the network: page.route(…).
- Then try it: playthrough as <each person>, and look at what they see, before you change anything else.

EACH CHANGE

1. Name the change: playthrough change "<a title, as a pull request's>" "<what you were asked, word for word>". Every
   command after it means this change, until you name another.
2. Change the app as asked.
3. Check it as someone would use it: run playthrough as <person> in the background, and drive that browser with your
   own tool, attached to it, never a browser of your own, at the port it says (9333, unless another copy's browser
   has that):
     agent-browser --cdp 9333 <command>
     Playwright MCP: --cdp-endpoint http://localhost:9333
     a script: chromium.connectOverCDP("http://localhost:9333"), then the page already open there
   Click and type as a person would. Going to an address directly is fine.
4. When you're looking at what was asked for, say so: playthrough moment "<what's there>", in under eight words
   ("Cards now say WEB-1 to WEB-5", "The prefix shows but can't be changed"). The person sees who it is and where:
   don't say it. Add the one thing it's about, as the page names it ("Card prefix"), the smallest that shows it: a card,
   not the board it's on ("Write the launch post"). The person sees the moment closed in on it, and what it says, and
   whether it can be changed, is checked each time it's run again. Playthrough runs the way there again from a fresh
   start, and keeps the moment only if it lands where you are. If it doesn't, it says what differed: fix that, or get
   there another way, and mark it again.
5. A few moments per change: one for each person or situation the change treats differently (an owner and a member;
   what's accepted and what's refused). Run playthrough as again for each: the same browser starts again, fresh.
6. Hand back: playthrough wait, in the background. Then tell the person their moments are ready, one line each, in
   your words, and that playthrough open shows them. Stop playthrough as. Wait tells you when the person has spoken.

WHEN THE PERSON SPEAKS

Wait prints each note on its moment, with a picture of what they saw and how to stand there (playthrough as <person>
"<moment>"). Then:
7. Change the app.
8. playthrough again: every moment runs on the code as it is now, and each is the same, different (and how), or
   couldn't get there. Get to one that couldn't by hand and mark it again with the same words, or drop it. One nobody
   spoke on that's now different is worth a look too.
9. playthrough reply <note> "<what you did, in a line>" for each note: your answer is the only why the person sees.
10. playthrough wait, in the background, again. When the person says every moment looks good, it ends: the change is done.
