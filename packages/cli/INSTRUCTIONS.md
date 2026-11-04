Playthrough: a person reviews your work on a web app by watching recordings of it, round after round. Read this once,
to its end; each command then says what's next.

  playthrough start <review> "<title>" "<what was asked>"
                                     start a review: a title for the change, and what was asked, in the person's words
  playthrough start <review>             once its scenes are written, try the setup and keep Before: the app as it is
  playthrough record <review>            record the round being worked on, every scene, the way a person would use it
  playthrough wait <review>              hand the round over, then wait for the notes to answer
  playthrough forks <review>             run each fork of a note made in the app, on the app as it is now
  playthrough open [<review>]            open the viewer on this machine

THE LOOP

1. Start a review with a title, as you'd title its pull request, and what was asked, word for word: it's what the person
   judges each round against. Before you change anything, write its scenes, one for each situation the change meets
   (SCENES, below), from the task, not from the code.
2. Run playthrough start <review> again. It tries the app's setup, then keeps the app as it is as Before, for the person
   to compare each round with. Nothing's recorded yet: the scenes are written for the work.
3. Change the app. Keep each scene's name, and each step's while it does the same job: they're matched across rounds by
   name. Once the work is done, see that the scenes show all of it a person would see. Playthrough finds what changed
   in what they show, your own choices too, so a choice needs a step where no scene shows it yet, not a scene of its own.
4. playthrough record <review> records the round, and each scene new to the review on Before too, doing what the round
   does as far as the app as it was can, then compares the round with every round before it. In the round's round.json,
   say why each step changed since the round before (in a scene new to the review, since Before), once for all that
   changed there, under "accounts" by the id record gives it: { "line": "<why, in your words>" },
   { "note": "<the id of the note it was made for>" }, or { "notReal": "<why nothing really changed>" }. What only the
   pictures show is the person's to look at, and asks nothing of you, unless you made it for a note: then say so. The
   person sees what changed, marked where it is: a line says only why, in a short sentence.
5. playthrough wait <review> hands the round over and waits for the notes, which can take hours: run it in the
   background, so you're told when it ends. Each note comes with a picture of what it's on, or what the person did in
   the app. Change the app, record the next round, and answer each note in its round.json, under "replies", in its
   "words": its "on" is where Playthrough found the note's thing on this round, so leave it. Where the answer moves,
   like an animation, add "watch": "<the title of the step it's seen in>". A note made in the app comes with what the
   person did there: write that as a fork of the scene they took over (FORKS, below), and record puts your answer on it.

The person can only judge what the scenes show, so keep them true to how a person uses the app.

A bug you can't make happen is still a round to hand over: record the scene that does what the report says, give it a
"line" in round.json saying you couldn't make it happen and how you tried, and hand it over. The person can take the
scene over where it goes wrong and show you: what they do there comes back as a note made in the app, and its fork, run
every round, shows you the bug and them your fix.

THE APP

The first time, add playthrough to the app's devDependencies with the app's own package manager, and run
npx playwright install chromium: scenes import from it, and record in that browser.

playthrough/app.json says how to start the app, and is committed so every review uses it. Where the command can be
given a port, say {port} in both, and Playthrough starts this copy of the app on a port of its own each time it records
or the person takes a scene over, beside the person's own and any other worktree's:

  { "start": "npm run dev -- --port {port}", "url": "http://localhost:{port}" }

Where it can't, as when another part of the app expects it at one address, give the address it always has:

  { "start": "npm run dev", "url": "http://localhost:3000" }

There, every round is recorded on whatever serves that url, and Playthrough starts the app only when nothing does: leave
a server you didn't start running, and let it follow the working copy, as a dev server does. In a worktree, what serves
it could be another copy, so Playthrough needs the address free, and says so. An app of several servers, one calling
another at its address, takes the address it always has, or a copy on a port of its own would call the person's.

Scenes run several at once. Where a page shows what every run made, as a blog's index lists every post, add
"oneAtATime": true. Recording on Before sets your work aside with git stash for a minute, puts the app as it was in its
place, with playthrough/ as it is now, and puts your work back after, even when Playthrough is stopped; anything saved
meanwhile is kept in a stash of its own.

SCENES

A scene is one situation the change meets: someone, with what they'd really have, there to do one thing, shown as far as
the change reaches. Show it as you would to someone beside you, going through once and stopping on each part worth
looking at: those are its steps, not scenes of their own. Another scene is another situation: someone the change treats
differently (WHO DOES A SCENE, below), things that make it look or work differently, like a long list and an empty one,
or another reason to be there. The person watches every scene from its start, so two by the same person, on the same
things, going the same way, are one.

Each scene is a Playwright test in a .ts file in .playthrough/<review>/scenes/, with a step for each part of it. The test's
name is the scene's:

  import { test, expect } from "playthrough/test";

  test("Export a quarter", async ({ page, setup }) => {
    await test.step("Open the invoices", async () => {
      await page.goto(`/accounts/${setup.account}/invoices`);
    });
    await test.step("Export the third quarter", async () => {
      await page.getByRole("button", { name: "Export" }).click();
      await expect(page.getByText("Exported")).toBeVisible();
    });
  });

Act on the page as a person would, by role and label. Playthrough glides the pointer, types a key at a time, and reads
the page once it rests after each step. A dialog the browser shows is recorded, and answered No unless the scene says Yes
first: page.once("dialog", (dialog) => dialog.accept()). A scene that fails stops the round: record names it and the
step, and keeps the page it failed on in .playthrough/<review>/failed/.

Steps go where a person goes, by what the app had before your work too, never to what you changed: the app as it was
doesn't have it, so Before stops short there and your change reads as new steps. Playthrough finds what changed, and
shows each change when the recording first has it on the screen. A page people read, like a landing page or docs, is a
scene of reading it, top to bottom: a step for each screen, scrolled with page.mouse.wheel(0, 600), which Playthrough scrolls as a person does, as
many as the longer page needs.

While the person watches, Playthrough runs the scene again in the background, so taking it over is quick. If its steps do
something outside the app that mustn't happen again, like sending an email, say so, and it runs only when taken over:

  test("Invite Sam", { annotation: { type: "reaches outside", description: "sends Sam an email" } }, async ({ page }) => {

FORKS

Where the person took a scene over in the app and made a note there, what they did is yours to write, as a fork of that
scene, in its file, after it: steps as a scene's, by role and label, for the notes it shows:

  test.fork("Remind Alder Dental", { notes: ["isikhse8"] }, async ({ page }) => {
    await test.step("Open the reminder", async () => {
      await page.getByRole("row", { name: /Alder Dental/ }).click();
      await page.getByRole("button", { name: "Write a reminder" }).click();
    });
  });

Record runs the scene to where they took it over, then the fork, and puts your answer on what the note is on, where the
fork first shows it. It's run every round until its notes are settled, and the person watches it as a fork off the scene,
not a scene of its own: keep it doing what they did, on the app as it is now. playthrough forks <review> runs it while you
work. A round whose note has no fork, or whose fork fails, isn't recorded.

WHAT EVERY SCENE STARTS FROM

A scene has to start from the same place every round, or the comparison finds changes nobody made. Playthrough starts
each on the day the review started, at the time of day it's recorded, in English and UTC, with the page's random numbers
from a fixed seed. The rest is made in playthrough/setup.ts, committed. Its default export runs before each scene, given
the page, Playwright's request and the app's address as baseURL, and returns the scene's setup; after, if exported, gives
back what was made once the run is over; use, if exported, opens every page as test.use would, like a user agent the app
tells tests by (the screen, language and time zone are Playthrough's):

  import type { APIRequestContext, Page } from "@playwright/test";

  export const use = { userAgent: "playwright" };

  export default async function ({ page, request }: { page: Page; request: APIRequestContext; baseURL?: string }) {
    const account = await (await request.post("/api/test/accounts", { data: { name: "Lake trip" } })).json();
    await page.route("https://api.exchangerate.host/**", (route) => route.fulfill({ json: { rate: 1.1 } }));
    return { account: account.id };
  }

  export async function after({ request, setup }: { request: APIRequestContext; baseURL: string; setup: Record<string, any> }) {
    const removed = await request.delete(`/api/test/accounts/${setup.account}`);
    if (!removed.ok() && removed.status() !== 404) throw new Error(`Removing the account failed: ${removed.status()}`);
  }

Each run makes its own: what the app needs unique, like an email, of its own, and what the page shows, like a name, the
same every run. Check what each request answers, so one that fails says so. An after that fails is tried again whole by
the next command, so it takes what's gone already as given back. Avoid what can't be given back, like an email sent:
test keys, a mail catcher. Use what the project has (a test account, seed data, its own fixtures), make data through the
API or database rather than on screen, and stub what you can't control at the network. Sign in with page.request, not
request: it shares the page's cookies, so a person who takes the scene over is signed in too. Dates the server works out
don't follow the page's clock: fix them through the app's own test hook if it has one.

Whenever app.json or setup.ts changes, Playthrough tries the setup by itself first, twice for each of the app's people,
and shows a picture of where each starts. Fix what the pictures show and run the command again. It's the person's app:
tell them how scenes get into it, and ask before you change it for Playthrough's sake, without waiting for their answer.
Each new scene is recorded twice: what changes by itself, like a time the server stamps, is left out of every comparison.

WHO DOES A SCENE

Every scene is done by someone: their name is on the pointer the person watches, and taking the scene over, the person is
them. It's who the change is for, as the person who asked would picture them, never an admin the change isn't for, so
the recording shows what they'd see. Once the app has more than one kind of person, name them in setup.ts as the team does, each with a line for you;
the first does every scene that names no one. Add one when a change first needs them:

  export const people = {
    "the owner": "Runs the studio: sends the invoices. On a laptop.",
    "a customer": "Pays from the link in a reminder, on their phone.",
  };

Setup's default export is told who the scene is done as (person); signIn, if exported, signs a page in as one of them:
({ page, person, setup }) => …. A scene names who it's done as at the top of its file, with their screen when it isn't a
laptop's (phone and tablet come from playthrough/test):

  test.use({ person: "a customer", ...phone });

Another person earns a scene only when they'd see something different, named for it: "A member can't delete a board".
When the task passes from one person to another, hand the scene on: they carry on on their own page in the same world,
and the recording follows, so what lands on their page is what the first person really did.

  const customer = await handTo("a customer", phone);
  await test.step("Open the link in the reminder", () => customer.goto(link));

That's all. Start with playthrough start <review> "<title>" "<what was asked>".
