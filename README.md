# Vantage

Review an AI agent's work on a web app by watching recordings of it, saying what's right and what isn't, and judging the next round, without rebuilding the situation by hand.

Early work. What's here so far:

- **`packages/review`**: what a review is, and the store that keeps it. A review is rounds the agent records and sends people make, each with one writer. The store takes the loop's steps (start, save a round, take the notes, finish, send, accept, wait) and refuses anything that breaks a rule, saying what's wrong in plain words. It keeps reviews in memory or in a folder.
- **`packages/cli`**: the four commands an agent runs, over the store, with reviews kept in `.vantage/` in the app's repo.
- **`packages/viewer`**: the page a person reviews in. Bare so far: a round's flows, a recording playing, notes on a moment, a flow or the work, Looks good or Not quite on each answer, send and accept.
- **`example`**: a small invoices app to try it on.

## The loop

```bash
vantage start <review> "<title>"   # what was asked, in the person's words
vantage record <review>            # records every flow, the way a person would use it
vantage wait <review>              # hands the round over, then waits for the notes to answer
vantage open [<review>]            # the viewer, on this machine
```

1. The agent starts a review and writes its flows in `.vantage/<review>/flows/`: one Playwright test for each thing a person does, with a `test.step` for each part of it, importing `test` and `expect` from `@vantage/cli/test`. The test's name is the flow's.
2. `vantage record` starts the app as `vantage/app.json` says (`{ "start": "<command>", "url": "<address>" }`), runs each flow with rrweb in every page, the pointer gliding to what it acts on and a beat after each action, and keeps each recording with where its steps start. A flow that fails records nothing.
3. The agent answers each note by writing in the round's file, `.vantage/<review>/rounds/<n>/round.json`, where `record` left a reply for each with empty words. Recording again keeps what it wrote.
4. `vantage wait` hands the round over, which the rules allow once every note has an answer; if one hasn't, it says which. Then it waits for a send that asks for something and prints each note to answer, with its conversation so far.
5. In the viewer, the person watches, leaves notes, says Looks good or Not quite to each answer, and sends. When nothing's left, they accept the work, and `wait` says the review is done.

## Trying it

```bash
npm install
npx playwright install chromium
npm run build                      # the viewer
cd example
npx vantage start overdue "Show only the overdue invoices"
# write a flow in .vantage/overdue/flows/, then:
npx vantage record overdue
npx vantage wait overdue
npx vantage open overdue           # in another terminal
```

`npm test` holds the store and the command line to their promises; the command line's run for real in Chromium, in a copy of the example. `npm run check` checks the types. While working on the viewer, `npm run dev --workspace @vantage/viewer` serves it with instant reloads beside a running `vantage open`.

Needs Node 24 or later, which runs the TypeScript as it is.
