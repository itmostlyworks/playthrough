# Vantage

Review an AI agent's work on a web app by watching recordings of it, saying what's right and what isn't, and judging the next round, without rebuilding the situation by hand.

Early work. What's here so far:

- **`packages/review`**: what a review is, and the store that keeps it. A review is rounds the agent records and sends people make, each with one writer. The store takes the loop's steps (start, save a round, take the notes, finish, send, accept, wait) and refuses anything that breaks a rule, saying what's wrong in plain words. It keeps reviews in memory or in a folder. Several people can review, and each person's judgement is their own: what's new to you, which notes wait for you, and whether a flow is good for you are worked out for each person, never kept.
- **`packages/cli`**: the commands an agent runs, over the store, with reviews kept in `.vantage/` in the app's repo. It records each flow, reads the page each step leaves, and compares each round with every round before it.
- **`packages/viewer`**: the page a person reviews in. Bare so far: a round's flows, Before among the rounds, a recording that stops at each answer waiting for you, notes on a moment, a flow or the work, Looks good or Not quite on each answer and Looks good on each flow, each shown with whose it is, send and accept. What changed between rounds is worked out but not shown yet: it comes with the viewer's rebuild.
- **`example`**: a small invoices app to try it on.

## The loop

```bash
vantage start <review> "<title>"   # what was asked, in the person's words
vantage start <review>             # once its flows are written: Before, the app as it is
vantage record <review>            # records every flow, the way a person would use it
vantage wait <review>              # hands the round over, then waits for the notes to answer
vantage open [<review>]            # the viewer, on this machine
```

1. The agent starts a review and writes its flows in `.vantage/<review>/flows/` before it changes anything. They show what was asked, so they're written from the task, not the code: by a fresh subagent given the task and what the screens look like, where the agent can start one. Each flow is one Playwright test for each thing a person does, with a `test.step` for each part of it, importing `test` and `expect` from `@vantage/cli/test`. The test's name is the flow's.
2. `vantage start <review>` again records Before: each flow on the app as it is, as far as the app can take it. What a flow expects of the finished work only waits a moment there, and a flow stops only where the app can't do a step, kept up to that step. A flow the browser stopped, not the app (a page that crashed), fails instead, and running it again tries again. Before is recorded once, and what it was recorded from is kept as a commit, with whatever wasn't committed yet.
3. The agent changes the app. `vantage record` starts it as `vantage/app.json` says (`{ "start": "<command>", "url": "<address>" }`), runs each flow with rrweb in every page, the pointer gliding to what it acts on and a beat after each action, and keeps each recording with where its steps start. Each step ends once the page is at rest, and the page it left is read there as the app shows it, not as the pointer hovers it: everything a person would name, with its box and its look, and a picture. A flow that fails records nothing, and `record` names it and the step it failed at.
4. A flow added since Before is recorded on Before too, as far as the app as it was can take it. That happens in the agent's own working copy, where its env files and packages are: the work is set aside with git stash, Before is checked out, and the work is put back after, even when recording fails. Stopped halfway, Vantage puts it back before it ends, or the next command does, or it says the two git commands that do. A flow the app as it was can't start has no Before, and isn't tried again.
5. Then `record` compares the round with Before and with every round before it, flow by flow, steps matched by title. A change is a thing and what happened to it, in Vantage's own words, never the agent's: “Export button is new, and moved the Show choice left”, “Status column looks different” where only the pictures differ, “New steps: “Export them”” where a flow takes steps it didn't. The same change in several flows is one change. `record` lists each change since the round before, by its id.
6. The agent says why each of them is there in the round's file, `.vantage/<review>/rounds/<n>/round.json`, under `accounts` by the change's id: its line, the note it was made for, or why nothing really changed. It answers each note there too, where `record` left a reply for each with empty words. A flow that's new to the reviewer can have a `line` at its start: what it starts from, or the choice it shows. Recording again keeps what it wrote.
7. Each round says which agent recorded it. Claude Code, Codex, Cursor and Gemini CLI are known from their shell; any other agent writes its name in the round as `by`, and `record` asks it to until it does.
8. `vantage wait` hands the round over, which the rules allow once every note has an answer and every change since the round before has its account; if one hasn't, it says which. Then it waits for a send that asks for something and prints each note to answer, with its conversation so far and whose each verdict is.
9. In the viewer, each person watches, leaves notes, says Looks good or Not quite to each answer and Looks good to each flow, and sends. A Not quite from anyone sends a note back to the agent. Anyone can accept once every flow is good for them and nothing waits for the agent, and `wait` says the review is done.

## Trying it

```bash
npm install
npx playwright install chromium
npm run build                      # the viewer
cd example
npx vantage start overdue "Show only the overdue invoices"
# write its flows in .vantage/overdue/flows/, then record Before:
npx vantage start overdue
# change the app, then:
npx vantage record overdue
npx vantage wait overdue
npx vantage open overdue           # in another terminal
```

`npm test` holds the review model, the comparison, the command line and what the viewer shows each person to their promises. The comparison's rules are each tested on two small pages, and the command line is run for real in Chromium, in a copy of the example made a git repo. `npm run check` checks the types. While working on the viewer, `npm run dev --workspace @vantage/viewer` serves it with instant reloads beside a running `vantage open`.

Needs Node 24 or later, which runs the TypeScript as it is.
