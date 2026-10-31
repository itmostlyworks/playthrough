Playthrough: a person reviews your work on a web app by watching recordings of it, round after round. Read this once; each
command then says what's next.

  playthrough start <review> "<title>" "<what was asked>"
                                     start a review: a title for the change, and what was asked, in the person's words
  playthrough start <review>             once its flows are written, record Before: the app as it is
  playthrough record <review>            record the round being worked on, every flow, the way a person would use it
  playthrough wait <review>              hand the round over, then wait for the notes to answer
  playthrough walk <review>              walk the person's steps in the app again, on the app as it is now
  playthrough open [<review>]            open the viewer on this machine

THE LOOP

1. Start a review with a title, a few words for the change as you'd title its pull request, and what was asked, word for
   word: it's what the person judges each round against. Before you change anything, write its flows: one for each
   thing a person does that the task touches. They show the task as the person put it, so write them from the task, not
   from the code: if you can start a fresh subagent, give it the task and what the screens look like, never the code.
2. Run playthrough start <review> again. It records Before: each flow on the app as it is, as far as the app can take it.
3. Change the app. Keep each flow's name, and each step's while it does the same job: they're matched across rounds by
   name. Once the work is done, add a flow for each choice you made that the person can see and didn't ask for.
4. playthrough record <review> records the round and compares it with every round before it. In the round's round.json, say
   why each change since the round before is there, under "accounts" by its id: { "line": "<why, in your words>" },
   { "note": "<the note it was made for>" }, or { "notReal": "<why nothing really changed>" }.
5. playthrough wait <review> hands the round over and waits for the notes, which can take hours: run it in the background,
   so you're told when it ends. When they come, it prints each with a picture of what it's on, or for one made in the
   app, what the person did there. Change the app and record the next round, then answer each note in its round.json,
   under "replies". Where your answer is something that moves, such as an animation, add
   "watch": "<the title of the step it's seen in>", and the note plays that step. For one made in the app, record walks
   the person's steps again on the new version and puts your answer where they lead, saying whether they still get
   there: answer it in words, not with a new flow, and check your fix with playthrough walk <review> while you work. Where
   their steps stop short, fix that, or say in your answer why they changed.

The person can only judge what the flows show, so keep them true to how a person uses the app.

THE APP

playthrough/app.json says how to start the app, and is committed so every review uses it:

  { "start": "npm run dev", "url": "http://localhost:3000" }

Each round, and Before, is recorded on whatever serves that url, and Playthrough starts the app itself only when nothing
does: leave a server you didn't start running. Recording a flow on Before later, when it's new or Before cut it short,
sets your work aside with git stash for a minute, unless nothing has changed since Before, puts the app as it was in its
place to record there too, and puts your work back after, even when Playthrough is stopped. A server already running
should follow the working copy, as a dev server does.

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

Act on the page as a person would, by role and label. Playthrough glides the pointer, types what you fill in a key at a time,
waits for the page to rest after each step, and reads what's on it there.

While the reviewer watches, Playthrough runs the flow on the app in the background, so taking it over is quick: every pause
runs it again. If a flow's steps do something outside the app that running it again would do again, such as sending an
email, charging a card, calling a paid API or posting where others see it, say so, and it's run only when taken over:

  test("Invite Sam", { annotation: { type: "reaches outside", description: "sends Sam an email" } }, async ({ page }) => {

A flow that fails stops the round: record names it and the step it failed at, and keeps what the page held there, with
a picture, in .playthrough/<review>/failed/. Before keeps the page each flow stops on there too. Recording again runs the
flows that failed first, and stops there if one fails again, without waiting for the rest.

WHAT EVERY FLOW STARTS FROM

A flow has to start from the same place every round, or the comparison finds changes nobody made. Playthrough starts every
flow on the day the review started, at the time of day it's recorded, in English and UTC, with the page's random numbers
from a fixed seed, so a flow can count on the day but not on the time. The rest is the app's: who's signed in, the data a flow needs, the outside services it calls. Make that in playthrough/setup.ts,
written once for the app and committed, so every review uses it. Its default export runs before each flow, given the
page, Playwright's request and the app's address as baseURL, and what it returns is the flow's setup:

  import type { APIRequestContext, Page } from "@playwright/test";

  export default async function ({ page, request }: { page: Page; request: APIRequestContext; baseURL?: string }) {
    const account = await (await request.post("/api/test/accounts", { data: { name: "Lake trip" } })).json();
    await page.route("https://api.exchangerate.host/**", (route) => route.fulfill({ json: { rate: 1.1 } }));
    await page.addInitScript(() => localStorage.setItem("signedIn", "ana"));
    return { account: account.id };
  }

  export async function after({ request, setup }: { request: APIRequestContext; baseURL: string; setup: Record<string, any> }) {
    const removed = await request.delete(`/api/test/accounts/${setup.account}`);
    if (!removed.ok()) throw new Error(`Removing the account failed: ${removed.status()}`);
  }

Flows run several at once on the one app, so each run makes its own, with a name or an email of its own. Give it back:
after, if setup.ts exports it, runs once the run is over (a flow recorded, the app taken over and let go), given a
request of its own and what the default export returned, so return what's needed to find and remove it, and sign in
again there if removing it needs that. Check what each request answers, so one that fails says so rather than leaving it
behind. What a run made and didn't give back, because Playthrough was stopped, the next command gives back. What can't
be taken back, like an email sent, avoid instead: test keys, a mail catcher.

Use what the project has (a test account, seed data, a reset hook, its own test fixtures, imported rather than copied),
make data through the app's API or database rather than on screen, and stub what you can't control at the network. Sign
in with page.request, not request: it shares the page's cookies, so the page is signed in, and so is a person who takes
the flow over. Dates the server works out don't follow the page's clock: fix them through the app's own test hook if it
has one.

The first time flows run in an app, and whenever app.json or setup.ts changes, Playthrough tries them first, and records
nothing yet: it starts the app, makes what a flow starts from for each of the app's people twice, giving it back each
time, and says what it found, with a picture of where each starts. Look at the pictures, fix what they show, and run the
command again. It's the person's app, so tell them how flows get into it and what's missing, and ask before you change
it for Playthrough's sake, as with a route only for tests, or when only they have what's needed, like a test account;
the review doesn't wait for their answer.

Each new flow is recorded twice. What changes by itself between the two, like a time the server stamps, is left out of
every comparison, in every flow, and Playthrough says what it is: steady it in playthrough/setup.ts if you can, because a real
change to it won't be seen.

WHO DOES A FLOW

Every flow is done by someone the app knows: their name is on the pointer the reviewer watches, and taking the flow
over, the reviewer is them. Once the app has more than one kind of person, name them in playthrough/setup.ts, the way the
team talks about them, each with a line in the team's words for you to read; the first does every flow that names no
one. Add one the first time a change needs them, never all at once:

  export const people = {
    "the owner": "Runs the studio: sends the invoices. On a laptop.",
    "a customer": "Pays from the link in a reminder, on their phone.",
  };

Setup's default export is told who the flow is done as (person), and makes the world they all share; signIn, if setup
exports it, signs a page in as one of them: ({ page, person, setup }) => …. Keep what the screen shows of each the same
every run, as every review shares them. A flow names who it's done as, the person the task is about, at the top of its
file, with their screen when it isn't a laptop's (phone and tablet come from playthrough/test):

  test.use({ person: "a customer", ...phone });

Another person earns a flow only when they'd see something different, and it's named for the difference: "A member
can't delete a board". When the task passes from one person to another, hand the flow on rather than making what the
first did through the API: the person it's handed to carries on, on their own page in the same world, and the recording
carries on there, so what lands on their page is what the first person really did.

  const customer = await handTo("a customer", phone);
  await test.step("Open the link in the reminder", () => customer.goto(link));
