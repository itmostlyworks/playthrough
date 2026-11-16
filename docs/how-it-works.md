# How Playthrough works

Everything Playthrough does, in detail. To start, read the [README](../README.md).

Its parts:

- **`packages/change`**: what a change is, and the store that keeps it. The agent keeps moments and answers notes; the
  person sends notes, replies and Done; each file has one writer. The store takes each step (start a change, keep a
  hand-back, finish it, take what was sent, send, mark what's been seen, wait) and refuses anything that breaks a rule,
  saying what's wrong in plain words (`rules.ts`). It keeps changes in memory (`memory.ts`, for tests) or in a folder
  (`folder.ts`). Where a moment's recording starts (`shown.ts`), how two recordings of one moment play together
  (`takings.ts`), when a change is done (`saidDone`, `rules.ts`) and where it stands for someone (`standingOf`) are each
  one rule here, which the commands and the page both call.
- **`packages/page`**: what's on a page, as a person would name it, and the same thing found again. A reading is the
  page as a moment left it, everything on it named in Playthrough's fixed words (`names.ts`); a field or switch the page
  gives no name is called by the nearest heading or label before it, else the nearest words, each read whole by what
  says it, however the page wrote it (Kan's card title is "BS-1", never the "1" its last piece says; `beside`,
  `read.ts`); two readings of one moment
  on two hand-backs pair thing by thing (`differences.ts`), which is how what's different is found and where a note's
  thing is in each. Also the path back to an element (`path.ts`) and a page's light or dark, still or moving, as
  recorded (`scheme.ts`).
- **`packages/cli`**: the commands an agent runs, over the store, with changes kept in `.playthrough/` in the app's repo;
  run from a folder inside the app, a command finds it by looking up from there, as far as the top of its git repo.
  Each of git's worktrees is a copy of the app with changes of its own, so an agent in a worktree never writes outside
  it. A word more than a command takes is refused, never ignored, and `--help` anywhere is the help. It runs each
  moment's way there and keeps it, reads and pictures the page, compares each hand-back with those before, pictures each
  note for the agent, and steps the person into the app. `playthrough open` serves the page for the whole machine.
- **`packages/viewer`**: where the person looks: what's next (`Moments.tsx`), a change's opening card (`Opening.tsx`),
  a moment's page (`Moment.tsx`) and every change in a sheet (`Waiting.tsx`, `Changes.tsx`), described below.
- **`example`**: a small invoices app to try it on (`node serve.ts`, at http://localhost:4400).

On npm it's one package, `playthrough`, which an app installs as a dev dependency so its moments can import
`playthrough/test`: what `playthrough` prints tells the agent to add it the first time, with Playwright's Chromium. The
repo is a skill too, `skills/playthrough/SKILL.md`, which says only when to reach for Playthrough and to run
`npx playthrough`, so what the agent reads stays in one place, matched to the version the app has:
`npx skills add itmostlyworks/playthrough` gives it to most coding agents, and in Claude Code the repo is a plugin as
well, from its own marketplace (`.claude-plugin/`).

## The words

A *change* is one piece of work an agent does in one copy of an app: a title, as a pull request's (a commit's `feat:`
left off), and what was asked, in the person's words. A *moment* is one thing happening in the app (typing and pressing
Update), and nothing more, or a *still*, where nothing does: a few words saying what's there, who it's done as, and the
one thing it's about. Cause and effect are two moments. A *person* is one of the app's people, named in
`playthrough/setup.ts` with who they are (`people = { Sam: "a member" }`). A *note* is what the person says on a moment,
and a *reply* the agent's answer, or the person's back. *Handing back* gives the person the moments as they are now.
*Stepping in* opens the real app at a moment, as that person. *Done* is the person saying every moment looks good.

## The agent's side

`playthrough` alone prints `packages/cli/MOMENTS.md`, all a fresh agent is told; each command then says what's next.

```bash
playthrough change "<title>" "<what was asked>"   # names the change; every command in this copy means it until another is named
playthrough as <person> ["<moment>"]              # the app, and a browser signed in as them, for the agent's own tool
playthrough moment "<what's there>" ["<thing>"] [--last N]   # keeps what was just done as a moment
playthrough again                                  # every moment again, on the code as it is now
playthrough answer <note> "<words>"                # answers a note
playthrough drop "<moment>"                        # leaves a moment out
playthrough wait                                   # hands back, then waits for what the person says
playthrough open                                   # the page, for the person
```

**The first time in an app**, the agent adds `playthrough/app.json`, how to start it, and `playthrough/setup.ts`, what
everyone starts from; both are committed with the app, and the agent asks before committing them. Where the app's
command takes a port, `{port}` in both (`{ "start": "npm run dev -- --port {port}", "url": "http://localhost:{port}" }`)
gives each copy a free port of its own (kept in `.playthrough/port.json`), so a worktree's copy runs beside the
person's; at the address the app always has, one already running there is used, except in a worktree, where it could
be another copy's. `"oneAtATime": true` runs moments one after another, for an app with a page that shows what every
run made. `setup.ts`'s default export is given the page, a request of its own, the app's address and who it's for, and
what it returns is that run's setup; `after`, if it exports one, is given that and takes it away; `people` names who a
moment can be done as; `signIn` signs a page in; `use` is how every page of the app is opened, as Playwright's
`test.use` would be, but never what Playthrough keeps the same everywhere (the screen, language and time zone, light or
dark, motion), which it refuses, naming it (`setup.ts`). Each run makes its own world and gives it back when it's over;
until then it's written down in `.playthrough/borrowed/` under the process it was made for, so what a stopped command
left, the next one gives back.

**`change`** (`change.ts`) names it, and refuses a title whose name is a folder Playthrough keeps for itself, or makes
the name of another change here with a different title, saying which; the same title again goes back on it.

**`as <person>`** (`as.ts`) starts the app if nobody has, and a Chromium signed in as them (1280 by 800, English, UTC),
on a debugging port from 9333 that the agent's own browser tool attaches to, and keeps everything done there as it's
done: each thing by its role and name (a switch, checkbox, radio or slider with no name by its role and which it is), or
by its words where nothing names it, both read as the page shows them with nothing hovered and as they're written, not
as the page's style cases them (`asWritten`: a fold upper-cased by CSS is "My boards", which is what getByRole and
getByText find again, never "MY BOARDS"), a right click as one, words typed where the caret was put as typed, keys
that move the caret too; the field words go into is found as it was before them, once for each run of typing, and a
rich-text editor (Kan's comment box) never by its words, which are what's typed: by its role and name if the page gives
it one, else by its place, and said by what it asks for ("Add comment…"); each with the address it was done at and
where the page was scrolled, and each page loaded with whether something done before led there. Run again, the browser
open already starts again, fresh, as whoever is named; given a moment, it goes that moment's way there first.

**`moment`** (`moments.ts`, `way.ts`) reads where that browser is and what the moment is about (the thing named, as the
page names it, or else the field holding those words, as Kan's list names are fields, or else the words on the page
that say it; unnamed, the thing its words name), works out where it starts (below), writes the way there as the moment's
file, and runs it from a fresh start as the same person. It's kept only if it lands: the same page read, the same
address, and what it's about saying the same; else it says what differed (what it's about otherwise as what was looked
for and what was found: "no link “My cards” was to be seen", "button “Save” was disabled, not enabled"; a thing that looks different or is another size with what about it, on each
side: "button “Tiles” looks different: background rgb(37, 99, 235) where you are, rgba(0, 0, 0, 0) run again", where
it once said only its unchanged name twice), headed by where it ended ("it ended on /boards as you are, but not as it
is where you are", or "on another page", with both addresses first), in a dozen lines at most taken from each side in
turn and "and N more", so many things only run again never hide what's only where you are, and words that tell the time, reworded only
in their numbers, are left out of that and said. It's run a second time, and what differs between the two runs changes
by itself (a caret, a time the server stamps), so it's left out of every comparison from then on (`markUnsteady`). Its
words are ten at most and never name a person, as the page already says who. Marked again with the same words, it
replaces that moment, whatever file it was in. In the way, an address the agent went to directly is gone to at once; one
it was led to is waited for, then gone to; one left at once for another (Kan's sign-in page before its board) isn't gone
to at all; and the page before each thing done is taken as it is, not after waiting for it to rest. The way scrolls at
once to where the moment's first thing was done (or, for a still, where the agent is), so the first frame is where the
agent was looking; between the moment's things it scrolls smoothly, as a person would; and it ends where the agent is.

**The read-back.** Kept, `moment` says its length (or that it's a still) and what it's about; `shows`, the things done,
in plain words (`type “BS-WEB” in Card prefix → click Update`); `before`, the last of the way (kept, never shown); the
paths of its first and last frames; and how to mark it again with `--last N`. Its frames (`first`, `a-beat-later` with
nothing done, `after-1`… after each thing done, the last, `held` once the end has held) are pictures the page took of
itself, in both runs (`seen.ts`): where nothing changed from the first frame to any after it, in both runs, it says
`Nothing you can see changed in it. Fine if that's the point`, leaving out squares that change with nothing done, that
differ between the runs at either end, and where words tell the time, so a colour counts and a clock doesn't; what was
seen moving with nothing done is named (`Moves by itself, and isn't counted`); an end still changing once it held is
said, with what to do (name what comes late as the moment's thing, which its check waits for). Kept with a dialog still
open where the agent is (role dialog or alertdialog, or an open `<dialog>`: `openOn`), which the moment, having landed
there, ends with too, it says so in fixed words, by the dialog's name or else its heading (`This moment ends with “New
board” still open. If your change shows in what happens next, mark that too.`, or "a dialog" with neither): the help's
"cause and effect are two moments", said when it's so. It's kept all the same, and the person is told nothing. From 15
Nov's user testing: a moment ended in the New board dialog, Create board never pressed, and a board made that way came
out empty with nobody seeing.

**`again`** runs every moment on the code as it is now, keeps them as the next hand-back, compares it with the hand-backs
before (below), and says each is the same, different (in Playthrough's words), new, or couldn't get there, with which step
and why in Playthrough's words, never Playwright's (`whyStopped`, `reporter.ts`: "couldn't get there: no link “Settings”
was there to click", "got there, but not through what it shows: …", "got there, but no heading “INV-1043” was to be
seen"; anything else as it was said, in its first line), and how to
get there by hand and mark it again or drop it. **`drop`** on a moment a note is waiting on, and **`answer`** to a note
whose moment won't be handed back, refuse until a moment has been marked since the note reached the agent: the person
sees what was done in a moment, not only in words. That's where such a note is then (`shownOn`, `standing.ts`): on the
first moment of the hand-back that's new since the note was made, else the last, with its answer, its pin on its thing
there where it's found by role and name, and "As it was" the frame it was written on; a note the person sent is never
left with no moment to be on (15 Nov: Lena's "This isn't what I meant" was answered, its moment dropped, and the page
showed it nowhere). A note can be a question: what's printed after the notes says a note asking for a change wants the
app changed and every moment run again, and one that only asks wants an answer, nothing changed ("<what you did, or your
answer, in a line>"; 16 Nov: two agents spent four and six minutes recording something for a question that needed a
sentence). **`answer`** with no hand-back begun (no `again` since the person spoke) goes through where nothing in the
app has changed since the moments the person saw were run (`changedSince`: every file git lists for the app, its own
and new ones it doesn't ignore, against the first of that hand-back's recordings; outside git, the app is taken as
changed): those moments go on into the next hand-back as they are, with their files, unrun (`unchangedOn`), and the
person sees them as seen before, with the answer. Anything changed, it refuses, naming the file: "Run playthrough again
first: list.tsx has changed since the moments were run, and the answer goes with the moments as they are now." **`wait`**
refuses while a note has no answer or a moment hasn't been run again, or, for moments that went on unrun, while anything
has changed since they ran; otherwise it hands back, stops the `as` browser, gives the address of the change's own page, and waits. While
it waits it keeps a file named by its process in the change's `waiting/`, saying which start of the machine it's on, so
the page knows an agent is listening. When the person sends, it prints each note on its moment, with its conversation,
a picture of what they saw with the thing outlined (`noted.ts`: the page the moment left, or for a note made in the
app, the frame the person's page drew of it), how to stand there (`playthrough as <person> "<moment>"`), and for one
made in the app what they did there and where the app was when they wrote it (`The app was at /boards/undefined when
they wrote it.`: its path, query and hash, kept on the note as `address` when it's made, as what went wrong is often
the address itself, gone by the time the agent looks). The ids the person's step in made are their run's own, so the
address is kept with what that run's setup made written as setup's (`madeBySetup`, in `@playthrough/change`, as a
moment's way writes them; the step in's answer carries its setup to the viewer): `The app was at /boards/${setup.board}
when they wrote it, setup being what playthrough/setup.ts made for the run, as playthrough as prints it.` A note on a recording says no address: a recording knows only
the pages it loaded, not where the app's own links went since, and how to stand there takes the agent to it. What a
click there is on is decided as in the agent's browser (`clicked`, in `@playthrough/page`): what was pressed, or the
nearest words of their own, never a part of the page that only holds others' (Kan's board, holding its toolbar's
"Visibility New list"), and with neither, "click the page". When the person says Done, it ends. Stopped before then, it's run again, and notes
it took already are said again; `MOMENTS.md` tells the agent to give it the longest time limit its shell allows, since
a shell's own (Claude Code's background limit) stopped one at ten minutes.

**Notes nobody is listening for** (`unheard`, in `wait.ts`) are notes sent on any change in this copy that no agent has
taken and none is waiting for: the page's "No agent listening", whose line for the person to tell a new agent is "Pick up
my notes in Playthrough." Every command but `wait` and `open`, the help included, says them first, one line a change:
`Kit sent a note on “Total under the invoices table”, and no agent is listening for it. playthrough wait gets it,
whatever change you're on.` `wait` gets them whichever change is meant here, or with none named: it hands back the
change it's on if that's ready, then, rather than waiting, takes the longest-waiting of them and says them, and what's
run here means their change from then on (`These notes are on “…”: what you run here means it now.`). From 15 Nov's
user testing: the agent was stopped after handing back, the person sent a remark, and a new agent told exactly the
page's words read the help, named a change of its own, and waited on it; the remark sat for 25 minutes.

Each hand-back says which agent made it: Claude Code, Codex, Cursor and Gemini CLI are known from their shell
(`agent.ts`); any other is "Agent".

## Where a moment starts

`startOf`, in `packages/change/src/shown.ts`. A moment's file does the way there first and then its one step, which is
what's shown: what was done since arriving on the page it ends on, or since the moment before in this browser if that
came later. A link followed or an address gone to is the way; a button that took you to a new page is doing something
and stays in. Nothing done since is a still. Where it can't tell, it isn't kept and lists the things done counting back
for `--last N`: over four (a moment is one thing happening), or a button that brought you here with nothing done since
(pressing it, or a still). The step begins once the page has settled (a second still, nothing loading, what moves by
itself left out), is pictured there (`first.png`), and holds a beat before the pointer moves; it ends once the page rests
after the last thing done, and an end that changed while it held (a late message, a debounced search) is read again once
it rests. A moment's `from` is its step's start, in seconds into its recording, kept with every moment as the recorder reads it
(`reporter.ts`), with what it did there as one list (`actions`: each thing done, when it was done, and what it was and when it
began), by `moment` and by `again` alike, so what's shown survives every hand-back; everything that shows a
moment reads that one value (a still, `isStill` in `shown.ts`, is one with nothing done from it on). Something changing every frame
for good (a bar slid along by a script) is learned as moving by itself once a rest has waited its longest, five seconds
(`rest.ts`), and left out from then on.

## Recording

Each moment is run as a Playwright test, its way there and its step, from `playthrough/test` (`test.ts`, the reporter
`reporter.ts`, run by `run.ts` with `playwright.config.ts`): a quarter as many at once as the machine has cores, or
one at a time where `app.json` says so, in Chromium at 1280 by 800, against the copy's app (`app.ts`). It runs on the day
the change was started, at the time of day it's run, the clock running on from there, in English and UTC, with the
page's random numbers from a fixed seed, so what the page works out from the day reads the same each time, and so does
the agent's browser (`steady.ts`, put in each page as it loads). Only `Date` is moved, by whole days: Playwright's clock,
used until 16 Nov, moved `performance.now` and each animation frame's time too, counted from when it was set, so in the
agent's browser, open ten minutes, a page reloaded had its entrance animations timed ten minutes ahead, and Kan's boards,
faded in by framer-motion, stayed unseen: every moment marked there was "Not kept" for a dozen links "only run again". rrweb is in
every page; the pointer glides to what it acts on, found before the hand sets off, and rests on it before acting; what's
filled into a field is typed a key at a time (60 ms apart, a long text in 1.5 s at most). The browser's own dialogs, which
rrweb never sees, are kept as moments of their own, held long enough to read (1.2 s and 40 ms a character, up to 4 s); a
dropdown's list is kept open 0.35 s before the pointer goes to its choice; what a script animates with `element.animate`
is written into the page as the CSS animation it is. The recording keeps the pointer, the text cursor (said again once
what moved its field has stopped; the page places it from the field it's in, after as many letters as it was, even with
nothing typed yet, so one measured as a picker eased open stands at the field's start) and each key that does something (Escape, Enter, Tab, arrows, shortcuts), never letters typed, and hides a dev server's own badge
(Next's), never touching the app; it and the agent's browser may write to the clipboard. The fonts, images and
stylesheets each page loads are kept with its recording, once each by what's in them (`assets.ts`), so it looks the same
with the app gone; it plays light or dark, still or moving, as its browser was (`page/src/scheme.ts`). Each thing done named
as it's done (its `what`: `click button “Update”`, `type textbox “Card prefix”`, never the words) is how two
recordings of a moment are lined up. The page at the step's end is read once it rests (`rest.ts`: nothing it asked for
on its way, and nothing changing for 300 ms of the frames it draws), as the app shows it, not as the pointer hovers it,
with a picture; after each action it's glimpsed too, read without a picture.

## What's different

Each `again` compares the hand-back it makes with every one before it (`compare.ts`, `findings.ts`, `pictures.ts`), moment
by moment: the two readings of its end pair thing by thing, and what changed is said in Playthrough's own words, never the
agent's: “Export button is new”, “Status column looks different” where only the pictures differ, “Clear completed
button now says “Clear 2 completed””. What only follows from another is told with it (what was pushed along by
something new above it); things that swapped places, rows in a new order (the fewest that moved: “moved down 2
places”), and alike things changed alike are one change each; a row, a list's item or a card is read as one thing, so
one new or gone is one change and the same change in each is one change, in as many places. Where the pictures differ
with nothing the reading found there, that's a change of its own, named by what it's on; the agent isn't asked about
those, as it can't see more of them than Playthrough did (`toAccountFor`). What changes by itself is left out. A
hand-back can be handed back only once it's compared with every one before it (`problemsFinishing`). The agent reads the
comparison with the last hand-back; the page reads that one (a moment different since you saw it asks to be seen again) and the one with
the hand-back you last opened each moment on (Compare).

## The person's side

`playthrough open` serves the page (`packages/viewer`, built into `packages/cli/viewer`). There is no list page: `/` is
what's next, and a moment opens at `/moments/<copy>/<change>/<n>`, with `?note=<id>` opening one of its notes
(`Moments.tsx`); any other address is what's next.

**What's next** (`Moments.tsx`, `Opening.tsx`, `step.ts`). `/` opens on the next change waiting on you, its opening card:
its title, what you asked, the app and when it came back, over the first moment you haven't seen, its picture softened
where the recording will be. Nothing plays. The whole card is one press, as its look says on hover ("See 3 moments",
"See 1 more moment", "Read 1 answer"): it, Space, ↓ or Next go in, to the first moment with something you haven't seen,
else the first. The next change is one with something you haven't seen or read, then one seen through with something
unsent, then one seen through with nothing said, each longest waiting first (`waitingInOrder`); one you've finished here
stays finished as it was handed back, so the next card comes at once. In a change, its moments go one by one with Next,
and after the last, **the last stop** (`/moments/<copy>/<change>/end`; a reload stays there, Back and forward go as
between moments), where it's dimmed. The last stop is where the change ends in what you do. The recording's frame
holds a sheet of your side of the change (`LastStop.tsx`), what isn't already on the page (the moments stay on their
edge beside it), on Playthrough's own surface, fading in over the last moment and out again as going between moments
does. Over it, the change's title takes the moment's line, as the sheet's heading, and its own small place above
rests empty: both lines stay drawn, one faded out, so nothing moves (measured: the frame, both edges and both lines,
0 px through ↓ and ↑, from a one-line and a two-line last moment). In the sheet, one block centred in the frame's
height while it fits, else from the top, clear of the bar: "You asked" and your words, with nothing to send the sheet's
main thing, at 21px in a measure of 30em, whole while the frame has the height (else cut, whole on hover); with notes
to send, they are, and what you asked steps back to the moment line's 15px, three lines at most (whole on hover and to
the keyboard); nothing if you asked nothing. Under it, "Your notes": the
notes Send will send and only those (your notes not sent, and sent ones with your reply not sent), so they add up to
the button's count; sent and answered ones aren't here, they're settled on their moments. Each is its card as the
Notes edge has it forward (its dot, your words in full, its strip), with the moment it's on, quietly; pressed, it opens
on its moment. One card alone at 300 wide; several, two or three across at that width, tops aligned. Past what fits,
their part scrolls on its own (the wheel, touch, Tab; never ↑ ↓, which are the list's), ending clear of the bar and
fading at whichever edge has more beyond it, so no card is cut hard. Just sent, they stay, their dots slate, till the page goes on. Last, what's still to do, as
quiet lines you can press: "2 moments not watched" (to the first of them), "1 answer not opened" (to it); nothing when
there's nothing. Only your words: nothing the agent wrote. There you're on no moment: the Notes edge holds no cards, its word
staying while the change has notes. The bar's
place holds the one thing to do (`StepLeft.tsx`, `StepAction`): Send while something's unsent ("Send 2 notes ↵",
filled) or Done while it waits on you ("Done ↵"), with what it does by it ("Your agent starts on them."; "Says every
moment looks good, and the change is done."). Pressed, or Enter (or Ctrl+Enter from any moment while something's
unsent), it says Sending…, then Sent or Done with a tick in its place, what went drawn as sent at once, and after a
pause (`SAID`) goes on to `/`; not sent, "Not sent: …" in amber. A change already with your agents or done says so
there ("Sent" and "Agent working", or "No agent listening" with the line to tell yours; "Done", "Every moment looked
good."), with nothing to press. On the Moments edge the list's last card is the way there (`StepCard`), as a moment's
card is for a moment: one short line (40px), a moment's card in width, corners and gap, tucked and forward with the
rest, its words held 8px from the screen's edge at rest where the edge's fade leaves room ("Send 2" when "Send 2 notes"
doesn't fit there), quiet on every moment, and at the last stop full, with the line that says where you are, which
no moment's card has then; pressed, it goes there. Keys there: ↑, K or Escape back to the last moment; Enter the
step, on this card too when Tab and Enter brought you there by it; Shift ↑ the change's last note; W as anywhere; nothing else. `/` when the next change is seen all through
(`seenThrough`) opens at its last stop. Nothing else says anything to the agent: ↓ never does, and Space is never a
press (`useSpaceStays`). On a phone, the sheet is two pictures to a row in the frame, the step in the bar, and the
card under the Moments strip. With nothing waiting,
the page says so calmly, with what your agents are on.

**The top of every page** (`Header.tsx`) is its two corners: at the left Playthrough and what's waiting in it, the way
to every other change; at the right what's next (Next). Between them, nothing: what
this is stands on the recording's top. The left is one thing to press, the opener (`Waiting.tsx`): Playthrough's mark
(`Mark.tsx`, as `public/logo.svg`, in the page's colours) and name, then "6 changes waiting" (or "Every change") and its
key; on a phone the mark and "6 waiting" alone.

**What this is** is the recording's, not the header's, in one stack on its top, centred over it, 12px above its edge,
wherever the recording stands in its room: the change's title, quiet and small, and under it the moment's name, then
who it's done as, quieter ("Words typed at the start stay there as Maja, a workspace owner"), on the line the edges'
words are on. Those take two lines at most (three on a phone, at the left),
growing up into room kept over the recording (`inItsRoom`, three lines' worth, which the opening card's picture stands
in too, so going in moves nothing). The title, pointed at (after 70 ms) or reached with the keyboard, brings a small
card with what you asked in your own words and the app and when it came back: over the title where it fits under the
header, covering nothing of the moment, else under it. The opening card's page has no title: the card says it. On a
phone there's no room over the recording for it: the title, in full colour, takes the header's room between what's
waiting and Next, and there's no card for what you asked.

**Every change** (`Waiting.tsx`, `Changes.tsx`). Top left on every page, "6 changes waiting" (or "Every change") opens every
change as a sheet over the page, the page under it softened and inert. Pressed or from the keyboard, it stays until
Escape, a press beside it, or going somewhere. From the keyboard it's W, anywhere but in a box being typed into, its
key drawn on the opener, and W again closes it. Opened from the keyboard (W, or Enter on the opener), the keyboard is on
a change at once: the one you're on, or the first; ↑ and ↓ (and K, J) go from one change to the next, the sheet
scrolling as little as brings it in, and Enter goes in. A change with the keyboard on it is lit as one pointed at is,
with a quiet line round it, not the keyboard's amber ring. Coming, the sheet fades in over 200 ms; going, it fades where
it is over 140 ms, already inert, the page under it answering from the moment it's closed, so going somewhere from it
the sheet leaves over the page arriving. A mouse that moves onto the opener and rests there 80 ms opens it too, and then it
goes once the pointer has been outside it for 300 ms; coming back in time keeps it. A page that loads
or changes under a still pointer opens nothing, and once the sheet has closed, the pointer has to leave it before pointing
opens it again. In the sheet: Waiting on you, each change's title, what you asked in two lines, the app and when it came
back, and at its right its step's words and button (Done, or a filled Send while something's unsent); then With your
agents and Done, a quiet line each, Done's latest five and the rest under Earlier. Where a change stands is said in
words: "Agent working", "Sent", or "No agent listening" with what to tell yours. Pressed, a row goes to the first thing on
it you haven't seen. Under each waiting change, its moments in a line (`Strip`): each its still, 132 wide, with its
name over its foot in two lines at most, drawn as it is whether seen or not. Pressed, one goes straight to that moment,
and each is in the Tab order after the row's own step. More than fit go on sideways, fading at the side that has more,
with a small arrow there for a pointer that can't scroll sideways (not on a phone, where a finger does). Changes with
your agents and done ones have no pictures. A line with room either side of it sets each waiting change apart from the
one above: its pictures are the heaviest thing in the sheet, and with nothing between they read as the next change's. The sheet keeps itself current, but never moves what's under your
pointer: one that arrives there says at once where it stands and moves when the pointer leaves.

**A moment's page** (`Moment.tsx`, the bar in `MomentBar.tsx`). A moment opens at rest on its end. **A moment is only
what it shows:** its recording plays from `from` to its end; one with nothing done from `from` on is a still: Play and
its arrows rest there, dimmed where they always are, and Play says "A still: nothing to play" when pointed at. The recording sits in the middle, as large as the room beside its edges lets it be
(`SIDE`, 10vw, 104 to 160px each side), and never moves or changes size: not as an edge comes forward, a note opens or
the moment changes (its shape is kept until the next one's is known, and the one you were on stays under the new one,
drawn just as it was, never swapped for its picture, until the new one has faded in: two moments that look alike change
with nothing moving in what's the same). The bar across its bottom edge: Play (Space), whose slim line along its own bottom edge fills as
it plays, there only once the moment has left its end, with a small arrow either side, the frame before (←) and the
next frame (→), their words and keys coming up over them when pointed at a while; Step in (S); Note (N, on the
recording or in the app); Compare (C), or in its place "Unchanged" or "New", or while a note from an earlier hand-back is
open, its "As it was" and "Now" switch; Compare's place is as wide as the switch, and in the app who you are takes
Play's room and its arrows', so the bar is the same width from one moment to the next, in every state;
on a phone its buttons sit closer and Step in on its way says "Stepping…", so all of it fits 390 wide. A click on the recording
plays and pauses it. Send and Done are at the last stop (above); top right, Next: the next moment,
after the last, the last stop, and dimmed there. What the page is doing is one value (`mode.ts`): resting, playing, a note open, pointing,
writing, comparing, getting there or the app yours; every press is an action on it, carrying where the recording has got
to, so whatever stops it playing stops it there, and one rule (`can`) says what may be pressed, which the keys and the
buttons alike ask. **Stepping** (`stepping.ts`) goes by change, not by time: each press rests on the next instant the
screen changed, or the one before (a page loaded, the page changed, a click, typing, a scroll, or what Playthrough draws
for it, as the text cursor; changes within one frame, 1/60 s as the recording's browser drew them, are one; a field's
cursor hidden for a picture is none, nor is Next's badge, hidden in every recording, changing its colours), and while the page is still moving from a change with no other coming, one frame
of that motion at a time, until it's as good as there (97% of its eased way). Back from the first change is the
moment's start; on from the last, its end; none past either, where its arrow is quiet. Pressed while it plays, it stops
there and steps; held (`held.ts`), its key or its arrow under the pointer, it walks at the page's own pace, never the keyboard's
repeat: the first step at once, then after 280 ms one every 66 ms (a quarter of the speed it played at, where every
frame differs), and only to a step no more than a pause away (0.15 s of the recording), so through a fade or words being
typed and never over a wait to the next thing that happened: it stops by itself where the screen goes still, and let go
and pressed again it goes on; compared, both sides go there together; with a note open, as
Space does, it acts on the moment and closes the note first, as it was or now. At rest on a step the
page is that very frame, motion and all (`Replay.show`): rebuilt to just before the changes of the second before it and
those played back on one at a time, so a fade stepped back into is shown mid-way, not at its end, and what the page set
moving is placed by when its change was. A note made there keeps that picture. Keys: Space, S, N, C; ← → the frame before and
the next, along the moment, and never on into another; ↑ ↓ (and K, J) the moment before and next, ↓ on the last
going to the last stop; with Shift, ↑ ↓ the note before and the next through the whole change, opening each: this
moment's one after another, then on to the nearest moment that has one (its first going on, its last going back), and
nothing past the change's first or last; W what's waiting; Escape closes what's open, leaves Compare or noting, or
calls off a step in on its way; while the app is yours, Escape twice is Back; Ctrl+Enter (⌘↵) sends, wherever the
keyboard is. Noting, while the bar says "Point at what it's about", only N and Escape answer, so words typed before
pointing and the arrows run nothing; there's no key yet to point with. Reduced motion: nothing slides or fades.

**The edges** (`Edge.tsx`). On the left, the change's moments; on the right, this moment's notes, sent then unsent, in
the order said. Over each, what it holds, in a word, "Moments" and "Notes": at its pictures' outer side, or 24px
from the screen's edge, where the header's words stand, when they run past it; still as the edge comes forward, and
not there over notes while there are none. The Moments edge ends in a short card, the way to the last stop (above). By each word, on its inner side, the keys that go through what it holds:
↑ ↓ by Moments, Shift ↑ ↓ by Notes (not on a phone). Forward, a card has one border, its own, which says the moment
you're on or the one pointed at; the picture's own border is only there at rest. Each is a picture of one size (176 by 110), one after another, at rest beside the recording and never
over it, 16px from it, running past the screen's edge where the window is too narrow for them, fading out over its last
few pixels (never over pictures wholly on the screen). Pointed at (after 70 ms; going back after 220 ms), or reached with
Tab, an edge comes forward: it slides until its pictures are 16px from the screen's edge, a little over the recording,
its cards alone, each a little apart. A moment's card's words, its name and then as whom, by their name alone ("… as Maja"), come up over its picture's
lower part. A note's card is the same at rest and forward, and leads with what it is as a moment leads with its picture: its dot, its latest words in two lines
and where it stands, over a slim strip of its picture, set in; a new answer's New mark shows at rest. A touch brings an edge forward first. Many scroll in their
own column, under the wheel, their cut end fading over 64px; the moment you're on, a note open or one arriving is
scrolled into view. A moment's picture is its still, the others' quieter than the one you're on, with its notes'
dots; pressed, the moment changes in place. A note's strip is cut for its own shape (`stripOf`, `Note.tsx`) around its
thing (a line of words as wide as its words), with no pin on it, as its dot leads its words: a small thing at the size it was recorded, with what's beside it; a wide line from
its start, a little smaller at most; something far larger than the strip closed in on what its moment is about where
that's inside it, else from its top left; a spot with no thing, around the spot; never larger than recorded, always
inside the screen; one from an earlier hand-back is cut from the moment's picture now where its thing is found there, as it opens. It's cut from a kept picture of the frame its thing is shown on, never a recording played
(`useFrames`): one made at a moment's end is that hand-back's own picture; any other is drawn once by `playthrough open`
in a browser of its own from the recording it was made on (`frames.ts`, the page's `?frame=` address, `Frame.tsx`) and
kept with what the person did (`branches/frames/<note>.png` and `.json`). A note's pin on the recording and its picture
are one thing: pointing at either lights both, the thing outlined only then or while open (`Pinned.tsx`). While you're in
the app the edges rest, quieter, and can't be pressed or come forward, all but the moments' last card (Send, or Done),
which doesn't drive the recording: pressed, it leaves the app as Back does and goes on to the last stop in one move,
the app fading into it (`toLastStop`, `Moment.tsx`; `footAnswers`, `Edge.tsx`). It doesn't press Send or Done. **On a phone** (820px or less) there's no room beside the
recording: under the bar, the notes and then the moments are rows of the same pictures, words always under them,
scrolled sideways. The recording and its bar stay; what's under them scrolls, fading where there's more above or below,
as an edge's list does and a note's thread too long for its card (`useMore`, `Edge.tsx`).

**A note** (`Note.tsx`) is words on a thing in a picture. N, then "Point at what it's about" on the bar with "Cancel
Esc": what a click would note is outlined and named as Playthrough names everything (`things.ts`, `pickAt`), and the
note box sits beside its thing, never on it, growing with its words. Its pin is on the recording at rest whenever its
thing is there: made on this hand-back, that very thing; made in the app or on an earlier hand-back, the same thing found
by its role and name, never whatever says the same words; on a spot, only on the hand-back it was made on. In the app,
its pin goes while its thing is gone and comes back with it. Opened (its picture, its pin, ← →, or `?note=`), a note
made on the hand-back you're looking at shows the moment at its end where it was made there, else cross-fades to its kept
picture, the frame it was made on. Gone through quickly, the latest note wins: a frame comes in over the note's frame just
left, or over the moment alone, never over an older one, and off every frame the moment comes back in one fade that going on
through notes on the moment's end neither restarts nor undoes. **A note from an earlier hand-back opens on the moment as it is now**, at its
end, so what came of it is what you see, wherever its thing is found there by its role and name. How it was is one flip
away, in place: while it's open, Compare's place on the bar holds a two-part switch, "As it was" and "Now", Now chosen;
pressing it, or C, flips. Where its thing isn't in the moment now (the agent took it away, or you'd stepped in and gone
to another page before noting), there's no now to show it on: it opens as it was, on the frame it was made on, its
strip on the edge cut from that frame, and Now rests, saying "Not in this moment now" when the switch is pointed at; a
pin never stands on whatever is there instead. A flip is
a cross-fade in the same spot at the same size (at once with reduced motion), the pin going to its thing in the picture
shown, the card staying where it is. ← → to another note opens it on Now. With its pin and its card, and nothing more. Escape, its picture again, or a press anywhere but its card or the edges closes it;
Space, S and C act on the moment and close it first. An open note's thing is never under the bar: the bar moves along
the recording's edge, or down off it. A reply waits to be clicked into, so ← → go on through the notes. A note just saved
arrives at the foot of the edge, the edge forward with its words for 1.4 s; one made in the app joins the edge the same
way once you're back. An answer you haven't opened is new, on its picture, until you open it.
A note is kept in one of two places (`model.ts`): on a moment as handed back (its `handBack`, its `moment`,
`at` in its recording, and its thing: an element, a box or a spot), or made in the app after stepping in (`handBack` and
`moment` again, `steppedIn` where in the moment, `did`, the person's own `recording` and its `length`, `at` in that, and
its thing there); an element's number is only ever read against the one recording it was read from. Which moment a note
is on is its `moment`, either way. Notes and replies not yet sent are kept in this browser (`kept.ts`), by the change,
until Send; what you've opened is
kept with the change, per moment as handed back (`seen.json`), so a moment handed back again is unseen again.

**Compare** (`compare.ts`, `view.ts`) is offered where you've opened this moment on an earlier hand-back and something
differs since: the moment as it is now beside how it was when you last saw it, both playing their shown parts together.
Play and the line drive both sides, at the same action at the same instant: `together`
(`packages/change/src/takings.ts`) lines two recordings up on the longest run both did in order, actions by name (one
recorded before actions were named knows each by its place only); each pair begins and ends together, each side scaled
to its own pace between, and what one did alone plays while the other holds before what's next. Each side is its half of
the recording's room at actual size, a window following now's pointer, both onto the same part of the page
(`following`), ending above the bar; at rest it moves the least that shows what the moment is about whole, with its
nearest words (`holding`).

**Send and Done.** Send carries every note and reply you haven't sent on the change, from its row, its card or a
moment's page, in one send (`Send.tsx`); it never locks. Done, from the same places, sends Done (`done: true`): every moment as last handed back looks good, and
nothing more (a send saying Done with a note or a reply is refused). Whether a change is done is one rule, `saidDone`
(`packages/change/src/rules.ts`): the person's latest send, on the latest hand-back, says Done; a note or reply after it,
or a new hand-back, opens the change again. Where a change stands for you (waiting on you, with your agents, done) is one
rule beside it, `standingOf`, which every part of the page reads; the agent's `wait` ends by `saidDone`.

## Stepping in

Step in (S) turns the recording into the real app at the moment it rests on, or where it has got to if it's playing, as
the moment's person, signed in, a fresh copy made the way every moment starts. Nothing runs before your first step in on
a change: watching does nothing to the app, so the first is made while you wait. After it, Playthrough keeps the app
ready where the recording rests, so the next is quick. Each step in is still the app made fresh, never one left behind.

**Where it stands is one count.** The page says how many of the things the moment shows are done where the recording
rests (`doneAt`, `packages/change/src/takings.ts`): none at its start, one after the first, nothing at all at its end or once
the last is done, or on a still; pressed while it plays, where it has got to. The run is handed over after that many
things done in the moment's step, its way there done whole before them (a file kept with its way inside its step counts
the way's too, `doneBefore`), or, with no count, once everything is done; never on a page with nothing loaded: a step
that starts on a blank page goes on to the first page it goes to (`reached`, `test.ts`). Done fewer things now than it
showed, it's handed over at its end.

**On the server** (`step-in.ts`, `following.ts`). The page POSTs `step-in` with the moment and its count, and asks
`ready-in` how long it should take: as long as the last run to that point took. The moment's file runs, in one headless
Chromium Playthrough keeps open while it runs, each run a window of its own with its own cookies and storage, to where
it's stepped into, each thing it does waiting for the page to come to rest first, as when it was recorded (`acted`,
`test.ts`): done at once, Escape pressed on a Kan card still loading went back to a board that wasn't there, `/boards/undefined`.
That costs Kan's runs about 1.5 to 3.5 seconds more. What the way and the step did only in the page's memory (a
field typed into, a panel opened, a menu a right click opened, a key pressed with nothing focused) is done again in your
browser, as it was done, before it shows,
while what saved something or went to another address isn't done twice, and the page is scrolled where the recording
was. Each step in has an address of its own, `/step-in/<moment>`, a name nobody could guess, on a pass-through at
http://localhost:5830/ that hands your browser the run's page (its address, cookies and what the app kept in the browser)
and passes everything else on to the app, answering only this machine's names. What a step in makes is that step in's:
held by the app's pages while they're open, Back included, and given back 15 s after the last one goes (tab closed,
reload, another moment), or a minute after it was made if never opened; so two tabs, a reload or another moment never
hand one person the app another is using. Every Step in asks afresh, so Step in again on the same moment is the app made
again, never the world left behind; an address opened again (by hand) runs afresh too, never a missing page. **Kept
ready** (`keepReady`): once a tab has stepped in on a change (`kept.ts` remembers it for the tab's life), whenever the page
is somewhere Step in could be pressed, not playing, and has rested there 600 ms (so going through moments with the keys
doesn't start a run for each), it POSTs `keep-ready` with the place Step in would ask for there, once for each place, and
again once back from the app. The server makes one ahead for each change, the way any step in is made, within its own
minute. A step in to the same place, with the moments written as they were when it was made, takes it: it waits for it if
it's still on its way, within the step in's own minute, and runs afresh if it failed; taken, it's that step in's, as one
it ran itself. Asked for another place, the one before is stopped and given back; not taken within five minutes of last
being asked for, it's given back and lets go of the app, so the app's own time unused can start. A step in called off
while it waits leaves the one ahead where it was. Nothing of it shows on the page: one that can't be made is the step in's
to say why. **Every wait
ends in words.** A step in has a minute from its asking, the app's start included ("The app hadn't answered … it may still
be starting", "This moment didn't open within 60 seconds…"), each page load on the way 30 s, and it stops as soon as the
asking request closes, though a setup already making its world finishes first, so what it made is given back whole; a
moment that can't get there says where it stopped and why, in the same words as `again`, and to say so in a note so the agent marks it
again; one whose check of how it ends doesn't hold on the code as it is now opens where it got to, with that said
(`checked`); an app that won't start says what it said last and to check `app.json`; a moment that's gone from the
change says to reload, or to wait for the agent to hand back; a page of a step in from before the page's server restarted says so
in the frame, and Escape. A page in the frame that never says it has loaded settles after ten seconds.

**One app per copy** (`app.ts`), shared by the person stepping in, the agent's browser and every moment run, each in a
world of its own, as the app always runs the working copy as it is now. Whoever wants it first starts it, on its own,
its output in `.playthrough/app.log`, and writes `.playthrough/running.json`; everyone using it writes
`.playthrough/using/<pid>`; two wanting it at once, one starts it and the other waits for it to answer (three minutes at
most, then it says so, pointing at `app.log`). Nobody stops it under anyone: once nobody is using it, it's stopped at
once, or with `playthrough open` running, which keeps every copy's app, once it's gone fifteen minutes unused; closing
`open` stops those nobody is using.

**In your browser** (`stepIn.ts`, `Portal.tsx`). While it's getting there, a line inside Step in fills as it goes, at
the pace of the last run where that's known, the picture's edge breathes and the recording's pointer waits. Where the
app isn't running (stopped after fifteen minutes unused, say), `ready-in` says so, and over the bar it says "Starting
the app first, which can take a minute." until it's there, the line inside Step in not filling, as the last run's pace
says nothing of a start. Escape, or
going to another moment, calls it off: the request ends, which stops the run, and a page of the app already opening
unseen goes with it; the bar is at rest at once. The page waits 70 s for the answer (the server always gives one within a
minute) and 30 s for the app's page to settle, then says so just over the bar, beside Step in (under it, at a desktop size, it was off the
screen), with what to do; so does Playthrough no longer
running. Whatever stopped it is said there in the server's words; in the app, so is a check at the end that
doesn't hold now. The app opens in the recording's place, at the same size,
and the recording's pointer comes to yours wherever yours has gone, and gives way to it. In the app the bar says "You,
as …" beside Back, whose keys read Esc Esc. Back, the keyboard comes back to the page, and the app kept ready underneath
is inert until it's yours again, so Tab never walks an app nobody can see. A single Escape is the app's, whatever the app does with it, or nothing,
and Playthrough does nothing with it; Escape twice, the second within half a second of the first, is Back, and the app
never hears that second press (`escapedTwice`, `twice.ts` in `@playthrough/page`, the same rule in the app and on
Playthrough's page around it). A key held down is one press; with Note on, Escape is Playthrough's and turns it off,
without counting as a first press. A link out of it opens in a tab of your own. The app is drawn with
`will-change: transform`, so its words keep their spaces, and the clipboard is the page's, on the way there and in your
browser. In a moment recorded on a phone's screen, a mouse drag is a swipe. Note works there as on the recording: what you did in the app is
recorded from when it was handed to you (or from the note, made before the recording's pointer had come to yours) and kept with the change (`branches/`, with the fonts, pictures and stylesheets
its pages named, `keepNamed`), and the note is on that recording, at its end.

## The page for the whole machine

`playthrough open` (`open.ts`) serves one page for the whole machine at http://localhost:5790/ (or the next free port),
and run again while it's open, says its address rather than opening another. It lists every change in every copy of
every app a `playthrough` command has run in (`machine.ts`: `~/.playthrough/apps.json`, or `PLAYTHROUGH_HOME`, and an
app gone from disk drops out), each read from the copy it's kept in; where two copies share an app's name, each says
which copy it's in. It arrives again whenever any copy's folder changes, and every two seconds besides, so a change handed
back from anywhere shows by itself, and whether an agent is listening is read from the files each time, so one
restarted reads exactly what's on disk. It serves the page to this machine alone, and answers only the page itself: asked
by any name but localhost's, as a site that has made its own name lead here (DNS rebinding) would ask, or sent something
from another site's page, it refuses, as what's sent there reaches the agent in the person's name.

## What's kept where

Committed with the app: `playthrough/app.json` and `playthrough/setup.ts`. Out of git, in the app's copy,
`.playthrough/` (its own `.gitignore` says `*`, and a `README.md` tells an agent who looks there not to read or change the
files but to run `npx playthrough`, as on 15 Nov one told to pick up the notes "in Playthrough" read the note's file and
did it with nobody told): `working-on.json` (the change its commands mean), `port.json` (the app's port),
`browser.json` (what `as` did; `browser-marked.json`, where the last moment was marked in it), `running.json`, `using/`
and `app.log` (the app), `borrowed/` (worlds not yet given back), and a folder per change: `change.json` (its title, what
was asked, when it started, and the format it's kept in), `moments/<words>.ts` (each moment's way there, then its step),
`hand-backs/<n>/` (each hand-back: `hand-back.json` with its moments and replies, `files/` with their recordings, readings and pictures, `since/<k>.json`
compared with hand-back k), `sends/<id>.json` (what the person sent, never written again but once, to bring it to a newer format), `taken.json` (what the agent
has taken of it), `seen.json` (what each person has opened), `branches/` (what the person did in the app, and notes'
frames), `waiting/<pid>` (an agent listening). On the machine: `~/.playthrough/apps.json` and `open.json` (the page
running).

**Kept in an older format**, a change is brought along once, the first time this Playthrough reads it
(`packages/change/src/format.ts`, from the store's own queue): each file rewritten as it would have been kept now, by the
rule that showed it before, so it shows the same, each folder and file kept by an older name moved whole to its name
now, and `change.json`'s `format` last, so one stopped half-way is finished
the next time it's read and one already brought along is never touched; one kept by a newer Playthrough is refused,
saying to update. Format 2: every moment has its `from` (one kept without, or given 0 by an older `again`, gets where
it was shown from), and every way does its way there before its step (what was done before `from` moves out of the
step), so running it again starts it where its step does; a send that said Done by naming every moment of its hand-back as
looking good, and nothing more, says Done; and what nothing reads any more is left behind (an older hand-back's `accounts`, a
send's `verdicts` and `looksGood`); and each note sent says which of its two places it's in and on which hand-back
(the one it was sent on), as a note not yet sent in a browser says the latest when it's read there. Format 3: everything by its name in
moments' words, the same in the code: `review.json` is `change.json`, `rounds/<n>/round.json` is
`hand-backs/<n>/hand-back.json`, `scenes/` is `moments/`; a hand-back's `scenes` are its `moments`, what a moment did is
one list (`actions`, each `{ at, what, began }`, an older one's without the two it never knew), not one step titled with
its name; each `round` is `handBack` and each `scene` `moment`, in notes, sends, what's taken and seen, and where a
finding is seen; a comparison's `changes` are its `findings`. A copy's `.playthrough/change.json` is `working-on.json`,
moved the next time a command reads it.

## Working on Playthrough

`npm run quick` (and `npm test`, the same today) holds the store, the comparison, the commands and what the page works
out to their promises (`packages/*/test`), the loop's in `change/test/loop.test.ts`. `npm run check` checks the types.
While working on the page, `npm run dev --workspace @playthrough/viewer` serves it with instant reloads beside a running
`playthrough open`.

`npm run build` builds the page, then the package in `packages/cli/release` (`packages/cli/build.ts`): Node runs
TypeScript from a checkout but not from inside an installed package, so there the command is JavaScript, with the change
and the page inside it, beside the page it serves, the types moments are written against and `MOMENTS.md`. Every push to
main is checked, tested and built (`check.yml`). It's released from GitHub: in the Actions tab, Release, Run workflow,
with the version (`release.yml`). That sets the version, the package's and the plugin's, checks, tests and builds it,
tries it installed in an empty app, publishes it as a trusted publisher (no token kept anywhere), and tags the version
on main with a release. It releases main as it is: a run re-run later, on the commit it started on, stops before
anything, saying to start a new one. The command's file is named without “./”, which npm would otherwise take out as it
publishes.

Working on it needs Node 24 or later, which runs the TypeScript as it is. The package runs on Node 22.18 or later, which
runs an app's setup and moments as the TypeScript they're written in, and says so on anything older (`node.ts`).
