# Vantage core

**The code is Vantage too.** It should feel like the tool: delightful, elegant, plain, and useful because its foundational pieces are right.

- **Plain words.** Name things for what they are, in the words a reviewer uses: review, round, flow, note, send. No codes, abbreviations or internal names. A name that needs a comment is the wrong name.
- **One word, one meaning.** The same word for the same thing in the types, the files, the commands and the docs.
- **From first principles.** Start from the job to be done, not from how the prototype or another tool did it. Keep what real runs taught us and drop what was an accident.
- **The obvious solution.** If it needs explaining, look for a simpler one. No abstraction until a second real use asks for it, no option nobody asked for, no framework where a function will do.
- **One place for each job.** Each rule lives in one place, and everything that needs it calls it.
- **Small and quiet.** No runtime dependencies without a strong reason. Short files that read from top to bottom. Comments say why, never what.
- **Errors say what to do next,** naming the thing: "Round 3: the change 'Export moved' answers note 7, which doesn't exist."
- **Tests read as promises.** Someone should be able to read the test names and know what Vantage guarantees.
- **Polish is the product here too.** Inconsistent names, dead code and a half-finished idea are the code's version of a 2px mismatch.
