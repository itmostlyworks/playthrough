# <img src="https://raw.githubusercontent.com/itmostlyworks/playthrough/main/packages/viewer/public/logo.svg" alt="" height="28"> Playthrough

The agent says it's done. You decide if it's good.

Your coding agent shows you its change to your web app as moments: a few seconds of someone using it, each one thing happening, recorded in the real app. You watch them, point at what's off, step into the real app at any moment, and the agent answers with the next ones.

It runs on your machine, with any coding agent that has a shell. Keep your code review: it reads the code; Playthrough shows what the change does.

## Try it

Ask your agent for a change in your web app, as you would anyway, and add:

> Show me this change with `npx playthrough`.

The agent does the rest. The first time, it adds Playthrough to your app and writes down how to start it and who its people are, for you to commit. Then it makes the change, checks it in a browser as one of those people, and marks each moment that shows it. When it's done, it gives you a link. If the page isn't open yet:

```bash
npx playthrough open
```

Everything stays in `.playthrough/` in your app's folder; nothing is uploaded. Playthrough needs Node 22.18 or later.

To teach your agent Playthrough once, so “Show me this change” is enough from then on:

```bash
npx skills add itmostlyworks/playthrough
```

In Claude Code, it's a plugin too: `/plugin install playthrough --marketplace itmostlyworks/playthrough`.

To try it without an app of your own, clone this repo, run `npm install` and `npm run build`, and ask your agent for a change to the small invoices app in `example/`.

## What you see

One page lists what's waiting on you from every app and agent on your machine: each change by its title, with its moments as pictures. Open one to watch it.

| | |
|---|---|
| Space, or a click | Play and pause |
| T | Step in: the real app at this moment, as that person |
| N | Note: click what it's about, say what's off |
| C | Compare with how it was when you last saw it |
| ↑ ↓ | The moment before, the next one |
| Escape | Back |

Send your notes, and the agent answers each with what it did and the moments as they are now. When every moment looks good, say Done.

## More

- [How Playthrough works](docs/how-it-works.md): everything it does, in detail.
- [What the agent reads](packages/cli/MOMENTS.md): everything `playthrough` tells an agent, printed when it runs bare.

## Licence

[Apache 2.0](LICENSE). Copyright 2026 Ludwig Bäcklund.
