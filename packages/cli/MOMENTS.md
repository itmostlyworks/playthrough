Playthrough: a person reviews your work on a web app by looking at moments of it: one thing happening in the app, as
someone, and nothing more; or a still. You mark them while you check your own work, in a browser Playthrough gives you.
Read this once, to its end.

  playthrough change "<title>" "<what was asked>"   name the change you're making, once: a title, as a pull request's,
                                                     and what you were asked, in the person's words
  playthrough as <person> ["<moment>" or <note>]    a browser on the app as one of its people, back once
                                                     it's ready; given a moment, it goes there the way the moment did;
                                                     given a note, as far as where it was written
  playthrough stop                                   stop that browser
  playthrough moment "<what's there>" ["<thing>"]   keep what you just did here as a moment, and read back what it shows
  playthrough wait                                   hand back, and wait for what the person says, run in the background
  playthrough again                                  every moment again on the code as it is now: the same, or what's different
  playthrough answer <note> "<words>"               answer one of the person's notes, in a line
  playthrough drop "<moment>"                        leave a moment out
  playthrough --version                              the version running here

THE FIRST TIME IN AN APP

If the app has no playthrough/ folder, set it up. It's the person's app: tell them what you added, and commit it only
if they say so.
- Nothing needs adding to the app's packages: npx playthrough runs it, and npx -p playthrough playwright install chromium
  gets the browser it uses, once. Leave the app's package.json, lockfile and workspace settings as they are. If the
  person keeps playthrough/ with the app, ask them too whether to add playthrough to its devDependencies, with its own
  package manager, so everyone runs the same version.
- playthrough/app.json says how to start the app. Where its command takes a port, say {port} in both, and each copy of
  the app gets its own: { "start": "npm run dev -- --port {port}", "url": "http://localhost:{port}" }. Where it can't,
  give the address it always has: { "start": "npm run dev", "url": "http://localhost:3000" }. The url is only where the
  app is, no page in it: go to a page in the browser.
- playthrough/setup.ts makes what everyone starts from, fresh for each browser, and gives it back after. The same
  things every time (names, titles), and what the app needs unique (an email) unique, so a moment's way there, run
  again from a fresh start, lands in the same place. Make things through the app's API or database, not on screen;
  check each answer, so one that fails says so. Import only types from @playwright/test.

    import type { APIRequestContext, Page } from "@playwright/test";

    // The app's people, who a moment can be signed in as, and who each is, in a few words.
    export const people = { Maja: "the owner", Sam: "a member" };

    // Given the page, a request of its own, the app's address and who it's for; what it returns is the moment's setup.
    export default async function ({ request, person }: { page: Page; request: APIRequestContext; baseURL?: string; person?: string }) {
      const email = `${person!.toLowerCase()}.${Date.now().toString(36)}@example.com`;
      const signedUp = await request.post("/api/sign-up", { data: { email, password: "launch-week", name: person } });
      if (!signedUp.ok()) throw new Error(`Sign-up: ${await signedUp.text()}`);
      const board = await (await request.post("/api/boards", { data: { name: "Website launch" } })).json();
      return { board: board.id, email };
    }

    // Signs the page in as them, where the app has signing in: only then is the browser said to be signed in.
    // page.request shares the page's cookies.
    export async function signIn({ page, setup }: { page: Page; person: string; setup: Record<string, any> }) {
      const signedIn = await page.request.post("/api/sign-in", { data: { email: setup.email, password: "launch-week" } });
      if (!signedIn.ok()) throw new Error(`Sign-in: ${await signedIn.text()}`);
    }

    // Takes away what was made, once it's done with: told what the default export returned.
    export async function after({ request, setup }: { request: APIRequestContext; baseURL: string; setup: Record<string, any> }) {
      const gone = await request.delete(`/api/boards/${setup.board}`);
      if (!gone.ok() && gone.status() !== 404) throw new Error(`Removing the board: ${gone.status()}`);
    }

  Someone who joins another's things (a member of an owner's workspace) is made with them: the owner first, on
  request, then the member on page.request. Stub what's outside the app at the network: page.route(…).

  What every request to the app needs, a header that routes it to another backend or a password the server asks for,
  goes in use, as Playwright's test.use, and nowhere else:

    export const use = { extraHTTPHeaders: { "x-backend": "staging" }, httpCredentials: { username: "staging", password: "…" } };

  Taking over, the person's browser talks to the app with it too, without being able to read it. Added on the page
  instead (page.setExtraHTTPHeaders, or a page.route that adds it), it's in your moments but not in their browser.
- Then try it: playthrough as <each person>, and look at what they see, before you go on.

EACH CHANGE

1. Name the change: playthrough change "<a title, as a pull request's>" "<what you were asked, word for word>". Every
   command after it means this change, until you name another. Named after it's made, it's the same change, and nothing
   is lost: Playthrough keeps nothing of the app from before. Then go on from 3.
2. Change the app as asked.
3. Check it as someone would use it: run playthrough as <person>, which comes back once its browser is ready, and drive
   that browser with your own tool, attached to it, never a browser of your own, at the port it says (9333, unless
   another copy's browser has that):
     agent-browser --cdp 9333 <command>
     Playwright MCP: --cdp-endpoint http://localhost:9333
     a script: chromium.connectOverCDP("http://localhost:9333"), then the page already open there
   Click, type and point at things as a person would. Pointing at something (a hover) is kept, and what it opens, as a
   preview, is there in the moment; moving the pointer off onto nothing isn't: point at something else. Going to an
   address directly is fine.
4. When you've just done what shows the change, say so: playthrough moment "<what's there>", in under eight words.
   Add the one thing it's about, as the page names it: the smallest that shows what came of it, not what you pressed
   ("Card prefix", not "Update"; where what you pressed is itself what changed, as a toggle's label, it asks once: say
   it again), and one whose name has no count or date in it, where there is one. The moment is what
   you did on this page since you arrived (or since your last moment), and nothing of the way here: typing in a field
   and pressing Update is a moment; a page you only looked at is a still, and a still is fine. Cause and effect are two
   moments: "The prefix changes to WEB", then, on the board, "Cards now say WEB-1 to WEB-5". So do the thing, mark it,
   then go and look at what it did, and mark that.
   Playthrough runs the way here again from a fresh start, keeps the moment only if it lands where you are, and reads
   back what it shows, what came before (kept, never shown) and pictures of its first and last frames. Read it, look at
   them: if it's not the moment you meant, mark it again with --last N, the last N things you did (0 is a still). If it
   wasn't kept, it says what differed: fix that, or get there another way. Never change the app to suit Playthrough: if
   a moment won't land after a couple of tries, tell the person so, rather than work round it.
5. A few moments per change: one for each person or situation the change treats differently (an owner and a member;
   what's accepted and what's refused). Run playthrough as again for each: the same browser starts again, fresh.
6. Before you hand back, read your whole change once more beside the ask. Anything that worked before and now works
   differently or is gone, and the ask didn't call for it: put it back. If the ask does need it, that's a moment of its
   own: set the app up so it shows, and mark it as it is now.
   Hand back: playthrough wait, in the background, with the longest time limit your shell allows. It stops the browser
   playthrough as keeps. Then tell the person their moments are ready, one line each, in your words, and give them the
   page wait prints for this change (playthrough open, if it isn't open yet: it comes back at once, and the page stays
   open until playthrough close): their change, not a list to find it in.
   Wait tells you when the person has spoken. If it's stopped before then, as a long wait can be, run it again: nothing
   is lost.

WHEN THE PERSON SPEAKS

Wait prints each note on its moment, with a picture of what they saw and how to stand there (playthrough as <person>
"<moment>", or <note> for one written partway, which stops where it was written), or on the change as a whole. Notes
sent while no agent was listening are the next agent's, whatever change you're on: every command says so, wait gets
them, and what you run means their change from then on. Then:
7. Where a note asks for a change, change the app. A note can be a question instead: it needs an answer, not a change,
   and if that's all there is, go straight to 9. Where you can, show the answer in a moment too, as the person can't
   check your word otherwise.
8. Once the app has changed, playthrough again: every moment runs on the code as it is now, and each is the same,
   different (and how), or couldn't get there. A moment the same says nothing about a note: for each note on a thing,
   it says where that thing shows in what you'd hand back and how it looks against when the note was written, or that
   it isn't in any, fine if the note asked for it to go. The person must see what you did: in the note's moment, run
   again, or in one you mark for it. One that couldn't get there because of your change, get to by hand and mark again
   with the same words, or mark what's there now. Drop a moment only when what it showed no longer exists and nobody
   spoke on it. One nobody spoke on that's now different is worth a look too.
9. playthrough answer <note> "<what you did, or your answer, in a line>" for each note: your answer is the only why the
   person sees. It says back where the note's thing shows, as again does. With nothing in the app changed since the
   person's moments ran, they go back as they are.
10. Read your change once more beside the ask, as in 6. Then playthrough wait, in the background, again. When the
    person says every moment looks good, it ends: the change is done.
