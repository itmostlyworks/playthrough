# <img src="https://raw.githubusercontent.com/itmostlyworks/playthrough/main/packages/viewer/public/logo.svg" alt="" height="28"> Playthrough

The agent says it's done. You decide if it's good.

<a href="https://playthrough.sh#gh-light-mode-only"><img src="https://raw.githubusercontent.com/itmostlyworks/playthrough/main/docs/viewer-light.png" alt="The viewer: the agent's recording of Send a reminder, paused on your note and the agent's answer, asking whether it fixes it, with Note, Compare and Take over on the bar"></a><a href="https://playthrough.sh#gh-dark-mode-only"><img src="https://raw.githubusercontent.com/itmostlyworks/playthrough/main/docs/viewer-dark.png" alt="The viewer: the agent's recording of Send a reminder, paused on your note and the agent's answer, asking whether it fixes it, with Note, Compare and Take over on the bar"></a>

Playthrough records your coding agent's change the way a person would use it, before and after, so you can watch it instead of setting it up by hand. Point at what's wrong, right on the recording, and the next round answers it there. Take over any moment and carry on in the real app. It runs on your machine, with any coding agent that has a shell.

To see a review before you install anything, play the one at [playthrough.sh](https://playthrough.sh).

## Try it

Ask your agent for a change in your app, as you would anyway, and add:

> Show me this change with `npx playthrough`.

The agent does the rest. The first time, it adds Playthrough to your app and writes down how to start it and sign in, to commit with your app. Each time, it records the change and hands it to you. Open it:

```bash
npx playthrough open
```

Reviews stay in `.playthrough/` in your app's repo, recordings and all; nothing is uploaded. Playthrough needs Node 24 or later.

You can teach your agent Playthrough once, so “Show me this change” is enough from then on:

```bash
npx skills add itmostlyworks/playthrough
```

In Claude Code, it's a plugin too: `/plugin install playthrough --marketplace itmostlyworks/playthrough`.

## How a review goes

1. You ask your agent for a change, and to show it to you with Playthrough.
2. Before it touches the code, the agent writes a flow for each thing a person does that the change touches, and Playthrough keeps the app as it is: Before.
3. The agent makes the change, and Playthrough records every flow, on the app as it is now and on Before, as far as the app went before. It finds what changed itself, including what the agent didn't mention, and the agent says why each change is there.
4. You watch. Leave a note on what's wrong, where it's wrong; compare with Before; take over and try it yourself. Then send.
5. The agent answers each note in the next round, on the spot the note is on. You check its answers, and accept once every flow looks good.

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
