# Playthrough

The agent says it's done. You decide if it's good.

Playthrough records your coding agent's change the way a person would use it, before and after, so you can watch it instead of setting it up by hand. Point at what's wrong, right on the recording, and the next round answers it there. Take over any moment and carry on in the real app. It runs on your machine, with any coding agent that has a shell.

## How a review goes

1. You ask your agent for a change, and to show it to you with Playthrough.
2. Before it touches the code, the agent writes a flow for each thing a person does that the change touches, and Playthrough records them on the app as it is: Before.
3. The agent makes the change, and Playthrough records every flow again. It finds what changed itself, including what the agent didn't mention, and the agent says why each change is there.
4. You watch. Leave a note on what's wrong, where it's wrong; compare with Before; take over and try it yourself. Then send.
5. The agent answers each note in the next round, on the spot the note is on. You check its answers, and accept once every flow looks good.

## Try it

Playthrough needs Node 24 or later. In your app's repo:

```bash
npm install --save-dev playthrough
npx playwright install chromium
```

Then ask your agent for a change, and to show it to you:

> Show only the overdue invoices. Use Playthrough to show me the change: run `npx playthrough` and follow what it says.

The agent starts a review, records it, and hands it to you with `playthrough wait`. Open it:

```bash
npx playthrough open
```

The first time, the agent writes `playthrough/app.json`, which says how to start your app, and `playthrough/setup.ts` if flows need something first: a signed-in user, an account with data in it, or the people who use the app. Both are committed with your app, so every review after uses them.

Reviews are kept in `.playthrough/` in your app's repo, recordings and all. Nothing is uploaded anywhere.

## On the example

`example/` in this repo is a small invoices app to try it on before your own. Clone the repo, run `npm install`, `npx playwright install chromium` and `npm run build`, and ask your agent for the same change from `example/`.

## In the viewer

You arrive at the round: what was asked, and a row for each flow. Choose one to watch it.

| | |
|---|---|
| Space, or a click | Play and pause |
| N | Note: click what's wrong |
| C | Compare: hold to see this moment as it was, press to see both side by side |
| T | Take over: the frame becomes the real app at this moment |
| Escape | Back: from the app to the recording, from a flow to every flow |
| Enter | The next step: play on, the next flow |

At the end of each flow, say whether it looks good. Send, and the agent starts on what you said while you watch the rest.

## More

- [How Playthrough works](docs/how-it-works.md): everything it does, in detail.
- [What the agent reads](packages/cli/INSTRUCTIONS.md): everything `playthrough` tells an agent, printed when it runs bare.
- Flows are [Playwright](https://playwright.dev) tests, so an agent already knows how to write them.
- Claude Code, Codex, Cursor and Gemini CLI are recognised by their shell. Any other agent gives its name.

## Licence

[Apache 2.0](LICENSE). Copyright 2026 Ludwig Bäcklund.
