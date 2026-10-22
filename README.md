# Vantage

Review an AI agent's work on a web app by watching recordings of it, saying what's right and what isn't, and judging the next round, without rebuilding the situation by hand.

Early work. What's here so far:

- **`packages/review`**: what a review is, and the store that keeps it. A review is rounds the agent records and sends people make, each with one writer. The store takes the loop's steps (start, save a round, take the notes, finish, send, accept, wait) and refuses anything that breaks a rule, saying what's wrong in plain words. It keeps reviews in memory or in a folder.

```bash
npm install
npm test
```

Needs Node 24 or later, which runs the TypeScript as it is.
