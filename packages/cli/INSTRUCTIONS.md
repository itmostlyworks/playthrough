Vantage: a person reviews your work on a web app by watching recordings of it, round after round. Read this once; each
command then says what's next.

  vantage start <review> "<title>"   start a review of what was asked, in the person's words
  vantage start <review>             once its flows are written, record Before: the app as it is
  vantage record <review>            record the round being worked on, every flow, the way a person would use it
  vantage wait <review>              hand the round over, then wait for the notes to answer
  vantage open [<review>]            open the viewer on this machine

THE LOOP

1. Start a review with what was asked, in the person's words. Before you change anything, write its flows: one for each
   thing a person does that the task touches. They show the task as the person put it, so write them from the task, not
   from the code: if you can start a fresh subagent, give it the task and what the screens look like, never the code.
2. Run vantage start <review> again. It records Before: each flow on the app as it is, as far as the app can take it.
3. Change the app. Keep each flow's name, and each step's while it does the same job: they're matched across rounds by
   name. Once the work is done, add a flow for each choice you made that the person can see and didn't ask for.
4. vantage record <review> records the round and compares it with every round before it. In the round's round.json, say
   why each change since the round before is there, under "accounts" by its id: { "line": "<why, in your words>" },
   { "note": "<the note it was made for>" }, or { "notReal": "<why nothing really changed>" }.
5. vantage wait <review> hands the round over and waits. When notes come, it prints each with a picture of what it's on.
   Change the app and record the next round, then answer each note in its round.json, under "replies".

The person can only judge what the flows show, so keep them true to how a person uses the app.

THE APP

vantage/app.json says how to start the app, and is committed so every review uses it:

  { "start": "npm run dev", "url": "http://localhost:3000" }

FLOWS

Each flow is a Playwright test in .vantage/<review>/flows/, in a file of its own named after it, with a step for each
part of it. The test's name is the flow's, so "Export a quarter" is in export-a-quarter.ts:

  import { test, expect } from "@mostlyworks/vantage/test";

  test("Export a quarter", async ({ page, setup }) => {
    await test.step("Open the invoices", async () => {
      await page.goto(`/accounts/${setup.account}/invoices`);
    });
    await test.step("Export the third quarter", async () => {
      await page.getByRole("button", { name: "Export" }).click();
      await expect(page.getByText("Exported")).toBeVisible();
    });
  });

Act on the page as a person would, by role and label. Vantage glides the pointer, waits for the page to rest after each
step, and reads what's on it there.

The app's flows, kept from reviews accepted before, are in the folder from the start: keep them as they are unless your
work changes what one does. When the work is accepted, the person chooses which of your new flows join them. Ask for
each that's a journey a person would name and finish in one sitting, like "Export a quarter", not a check of this work
alone, by tagging its test:

  test("Export a quarter", { tag: "@keep" }, async ({ page, setup }) => { … });

WHAT EVERY FLOW STARTS FROM

A flow has to start from the same place every round, or the comparison finds changes nobody made. Vantage starts every
flow at noon on the day the review started, in English and UTC, with the page's random numbers from a fixed seed. The
rest is the app's: who's signed in, the data a flow needs, the outside services it calls. Make that in vantage/setup.ts,
written once for the app and committed, so every review uses it. Its default export runs before each flow, given the
page, Playwright's request and the app's address as baseURL, and what it returns is the flow's setup:

  import type { APIRequestContext, Page } from "@playwright/test";

  export default async function ({ page, request }: { page: Page; request: APIRequestContext; baseURL?: string }) {
    const account = await (await request.post("/api/test/accounts", { data: { name: "Lake trip" } })).json();
    await page.route("https://api.exchangerate.host/**", (route) => route.fulfill({ json: { rate: 1.1 } }));
    await page.addInitScript(() => localStorage.setItem("signedIn", "ana"));
    return { account: account.id };
  }

Use what the project has (a test account, seed data, a reset hook), make data through the app's API or database rather
than on screen, and stub what you can't control at the network. Sign in with page.request, not request: it shares the
page's cookies, so the page is signed in, and so is a person who takes the flow over. If the flow acts as someone,
return their name as person ({ person: "Ana", ... }): it's the name on the pointer the reviewer watches. Dates the server works out don't follow the page's
clock: fix them through the app's own test hook if it has one.

Each new flow is recorded twice. What changes by itself between the two, like a time the server stamps, is left out of
every comparison of that flow, and Vantage says what it is: steady it in vantage/setup.ts if you can, because a real
change to it won't be seen.
