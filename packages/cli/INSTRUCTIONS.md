Playthrough: a person reviews your work on a web app by watching recordings of it, round after round. Read this once,
to its end; each command then says what's next.

  playthrough start <review> "<title>" "<what was asked>"
                                     start a review: a title for the change, and what was asked, in the person's words
  playthrough start <review>             once its flows are written, try the setup and keep Before: the app as it is
  playthrough record <review>            record the round being worked on, every flow, the way a person would use it
  playthrough wait <review>              hand the round over, then wait for the notes to answer
  playthrough walk <review>              walk the person's steps in the app again, on the app as it is now
  playthrough open [<review>]            open the viewer on this machine

THE LOOP

1. Start a review with a title, as you'd title its pull request, and what was asked, word for word: it's what the person
   judges each round against. Before you change anything, write its flows, one for each thing a person does that the
   task touches, from the task, not from the code.
2. Run playthrough start <review> again. It tries the app's setup, then keeps the app as it is as Before, for the person
   to compare each round with. Nothing's recorded yet: the flows are written for the work.
3. Change the app. Keep each flow's name, and each step's while it does the same job: they're matched across rounds by
   name. Once the work is done, add a flow for each choice you made that the person can see and didn't ask for.
4. playthrough record <review> records the round, and each flow new to the review on Before too, doing what the round
   does as far as the app as it was can, then compares the round with every round before it. In the round's round.json,
   say why each change since the round before is there, under "accounts" by its id: { "line": "<why, in your words>" },
   { "note": "<the id of the note it was made for>" }, or { "notReal": "<why nothing really changed>" }.
5. playthrough wait <review> hands the round over and waits for the notes, which can take hours: run it in the
   background, so you're told when it ends. Each note comes with a picture of what it's on, or what the person did in
   the app. Change the app, record the next round, and answer each note in its round.json, under "replies", in its
   "words": its "on" is where Playthrough found the note's thing on this round, so leave it. Where the answer moves,
   like an animation, add "watch": "<the title of the step it's seen in>". For a note made in the app, record walks the
   person's steps again and puts your answer where they lead: answer it in words, not with a new flow, and check your
   fix with playthrough walk <review>. Where their steps stop short, fix that, or say why they changed.

The person can only judge what the flows show, so keep them true to how a person uses the app.

THE APP

playthrough/app.json says how to start the app, and is committed so every review uses it:

  { "start": "npm run dev", "url": "http://localhost:3000" }

Flows run several at once. Where a page shows what every run made, as a blog's index lists every post, add
"oneAtATime": true. Every round is recorded on whatever serves that url, and Playthrough starts the app only when nothing
does: leave a server you didn't start running, and let it follow the working copy, as a dev server does. Recording on
Before sets your work aside with git stash for a minute, puts the app as it was in its place, with playthrough/ as it is
now, and puts your work back after, even when Playthrough is stopped.

FLOWS

Each flow is a Playwright test in a .ts file in .playthrough/<review>/flows/, with a step for each part of it. The test's
name is the flow's:

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
the page once it rests after each step. A dialog the browser shows is recorded, and answered No unless the flow says Yes
first: page.once("dialog", (dialog) => dialog.accept()). A flow that fails stops the round: record names it and the
step, and keeps the page it failed on in .playthrough/<review>/failed/.

While the person watches, Playthrough runs the flow again in the background, so taking it over is quick. If its steps do
something outside the app that mustn't happen again, like sending an email, say so, and it runs only when taken over:

  test("Invite Sam", { annotation: { type: "reaches outside", description: "sends Sam an email" } }, async ({ page }) => {

WHAT EVERY FLOW STARTS FROM

A flow has to start from the same place every round, or the comparison finds changes nobody made. Playthrough starts
each on the day the review started, at the time of day it's recorded, in English and UTC, with the page's random numbers
from a fixed seed. The rest is made in playthrough/setup.ts, committed. Its default export runs before each flow, given
the page, Playwright's request and the app's address as baseURL, and returns the flow's setup; after, if exported, gives
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
request: it shares the page's cookies, so a person who takes the flow over is signed in too. Dates the server works out
don't follow the page's clock: fix them through the app's own test hook if it has one.

Whenever app.json or setup.ts changes, Playthrough tries the setup by itself first, twice for each of the app's people,
and shows a picture of where each starts. Fix what the pictures show and run the command again. It's the person's app:
tell them how flows get into it, and ask before you change it for Playthrough's sake, without waiting for their answer.
Each new flow is recorded twice: what changes by itself, like a time the server stamps, is left out of every comparison.

WHO DOES A FLOW

Every flow is done by someone: their name is on the pointer the person watches, and taking the flow over, the person is
them. Once the app has more than one kind of person, name them in setup.ts as the team does, each with a line for you;
the first does every flow that names no one. Add one when a change first needs them:

  export const people = {
    "the owner": "Runs the studio: sends the invoices. On a laptop.",
    "a customer": "Pays from the link in a reminder, on their phone.",
  };

Setup's default export is told who the flow is done as (person); signIn, if exported, signs a page in as one of them:
({ page, person, setup }) => …. A flow names who it's done as at the top of its file, with their screen when it isn't a
laptop's (phone and tablet come from playthrough/test):

  test.use({ person: "a customer", ...phone });

Another person earns a flow only when they'd see something different, named for it: "A member can't delete a board".
When the task passes from one person to another, hand the flow on: they carry on on their own page in the same world,
and the recording follows, so what lands on their page is what the first person really did.

  const customer = await handTo("a customer", phone);
  await test.step("Open the link in the reminder", () => customer.goto(link));

That's all. Start with playthrough start <review> "<title>" "<what was asked>".
