# How Playthrough works

Everything Playthrough does, in detail. To start, read the [README](../README.md).

Its parts:

- **`packages/review`**: what a change is, and the store that keeps it. The agent keeps moments and answers notes; the
  person sends notes, replies and Done; each file has one writer. The store takes each step (start a change, keep a
  hand-back, finish it, take what was sent, send, mark what's been seen, wait) and refuses anything that breaks a rule,
  saying what's wrong in plain words (`rules.ts`). It keeps changes in memory (`memory.ts`, for tests) or in a folder
  (`folder.ts`). Where a moment's recording starts (`shown.ts`), how two recordings of one moment play together
  (`steps.ts`) and when a change is done (`saidDone`, `rules.ts`) are each one rule here, which the commands and the
  page both call.
- **`packages/page`**: what's on a page, as a person would name it, and the same thing found again. A reading is the
  page as a moment left it, everything on it named in Playthrough's fixed words (`names.ts`); two readings of one moment
  on two hand-backs pair thing by thing (`differences.ts`), which is how what's different is found and where a note's
  thing is in each. Also the path back to an element (`path.ts`) and a page's light or dark, still or moving, as
  recorded (`scheme.ts`).
- **`packages/cli`**: the commands an agent runs, over the store, with changes kept in `.playthrough/` in the app's repo;
  run from a folder inside the app, a command finds it by looking up from there, as far as the top of its git repo.
  Each of git's worktrees is a copy of the app with changes of its own, so an agent in a worktree never writes outside
  it. A word more than a command takes is refused, never ignored, and `--help` anywhere is the help. It runs each
  moment's way there and keeps it, reads and pictures the page, compares each hand-back with those before, pictures each
  note for the agent, and steps the person into the app. `playthrough open` serves the list for the whole machine.
- **`packages/viewer`**: where the person looks: the list (`List.tsx`) and a moment's page (`Moment.tsx`), described
  below.
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
playthrough reply <note> "<words>"                 # answers a note
playthrough drop "<moment>"                        # leaves a moment out
playthrough wait                                   # hands back, then waits for what the person says
playthrough open                                   # the list, for the person
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
done: each thing by its role and name (a switch, checkbox, radio or slider with no name by its role and which it is), a
right click as one, words typed where the caret was put as typed, keys that move the caret too, each with the address it
was done at and where the page was scrolled, and each page loaded with whether something done before led there. Run
again, the browser open already starts again, fresh, as whoever is named; given a moment, it goes that moment's way
there first.

**`moment`** (`moments.ts`, `way.ts`) reads where that browser is and what the moment is about (the thing named, as the
page names it, or else the thing its words name), works out where it starts (below), writes the way there as a scene
file, and runs it from a fresh start as the same person. It's kept only if it lands: the same page read, the same
address, and what it's about saying the same; else it says what differed, and words that tell the time, reworded only
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
said, with what to do (name what comes late as the moment's thing, which its check waits for).

**`again`** runs every moment on the code as it is now, keeps them as the next hand-back, compares it with the hand-backs
before (below), and says each is the same, different (in Playthrough's words), new, or couldn't get there, with how to
get there by hand and mark it again or drop it. **`drop`** on a moment a note is waiting on, and **`reply`** to a note
whose moment won't be handed back, refuse until a moment has been marked since the note reached the agent: the person
sees what was done in a moment, not only in words. **`wait`** refuses while a note has no reply or a moment hasn't been
run again; otherwise it hands back, stops the `as` browser, gives the address of the change's own page, and waits. While
it waits it keeps a file named by its process in the change's `waiting/`, saying which start of the machine it's on, so
the page knows an agent is listening. When the person sends, it prints each note on its moment, with its conversation,
a picture of what they saw with the thing outlined (`noted.ts`: the page the moment left, or for a note made in the
app, the frame the person's page drew of it), how to stand there (`playthrough as <person> "<moment>"`), and for one
made in the app what they did there. When the person says Done, it ends. Stopped before then, it's run again, and notes
it took already are said again.

Each hand-back says which agent made it: Claude Code, Codex, Cursor and Gemini CLI are known from their shell
(`agent.ts`); any other is "Agent".

## Where a moment starts

`startOf`, in `packages/review/src/shown.ts`. A moment's file does the way there first and then its one step, which is
what's shown: what was done since arriving on the page it ends on, or since the moment before in this browser if that
came later. A link followed or an address gone to is the way; a button that took you to a new page is doing something
and stays in. Nothing done since is a still. Where it can't tell, it isn't kept and lists the things done counting back
for `--last N`: over four (a moment is one thing happening), or a button that brought you here with nothing done since
(pressing it, or a still). The step begins once the page has settled (a second still, nothing loading, what moves by
itself left out), is pictured there (`first.png`), and holds a beat before the pointer moves; it ends once the page rests
after the last thing done, and an end that changed while it held (a late message, a debounced search) is read again once
it rests. A moment's `from` is its step's start, in seconds into its recording, set by `moment` and by `again`, so what's
shown survives every hand-back; read in one place, `shownFrom`, which starts a moment kept before `from` existed by the
same rule from what its recording says of each action, and a still where its end holds. Something changing every frame
for good (a bar slid along by a script) is learned as moving by itself once a rest has waited its longest, five seconds
(`rest.ts`), and left out from then on.

## Recording

Each moment is run as a Playwright test, its way there and its step, from `playthrough/test` (`test.ts`, the reporter
`reporter.ts`, run by `scenes.ts` with `playwright.config.ts`): a quarter as many at once as the machine has cores, or
one at a time where `app.json` says so, in Chromium at 1280 by 800, against the copy's app (`app.ts`). It runs on the day
the change was started, at the time of day it's run, the clock running on from there, in English and UTC, with the
page's random numbers from a fixed seed, so what the page works out from the day reads the same each time. rrweb is in
every page; the pointer glides to what it acts on, found before the hand sets off, and rests on it before acting; what's
filled into a field is typed a key at a time (60 ms apart, a long text in 1.5 s at most). The browser's own dialogs, which
rrweb never sees, are kept as moments of their own, held long enough to read (1.2 s and 40 ms a character, up to 4 s); a
dropdown's list is kept open 0.35 s before the pointer goes to its choice; what a script animates with `element.animate`
is written into the page as the CSS animation it is. The recording keeps the pointer, the text cursor and each key that
does something (Escape, Enter, Tab, arrows, shortcuts), never letters typed, and hides a dev server's own badge
(Next's), never touching the app; it and the agent's browser may write to the clipboard. The fonts, images and
stylesheets each page loads are kept with its recording, once each by what's in them (`assets.ts`), so it looks the same
with the app gone; it plays light or dark, still or moving, as its browser was (`page/src/scheme.ts`). Each action named
as it's done (`began` beside `actions`: `click button “Update”`, `type textbox “Card prefix”`, never the words) is how two
recordings of a moment are lined up. The page at the step's end is read once it rests (`rest.ts`: nothing it asked for
on its way, and nothing changing for 300 ms of the frames it draws), as the app shows it, not as the pointer hovers it,
with a picture; after each action it's glimpsed too, read without a picture.

## What's different

Each `again` compares the hand-back it makes with every one before it (`compare.ts`, `changes.ts`, `pictures.ts`), moment
by moment: the two readings of its end pair thing by thing, and what changed is said in Playthrough's own words, never the
agent's: “Export button is new”, “Status column looks different” where only the pictures differ, “Clear completed
button now says “Clear 2 completed””. What only follows from another is told with it (what was pushed along by
something new above it); things that swapped places, rows in a new order (the fewest that moved: “moved down 2
places”), and alike things changed alike are one change each; a row, a list's item or a card is read as one thing, so
one new or gone is one change and the same change in each is one change, in as many places. Where the pictures differ
with nothing the reading found there, that's a change of its own, named by what it's on; the agent isn't asked about
those, as it can't see more of them than Playthrough did (`toAccountFor`). What changes by itself is left out. A
hand-back can be handed back only once it's compared with every one before it (`problemsFinishing`). The agent reads the
comparison with the last hand-back; the page reads that one (Different since you saw it, on the list) and the one with
the hand-back you last opened each moment on (Compare).

## The person's side

`playthrough open` serves the page (`packages/viewer`, built into `packages/cli/viewer`); `/` is the list, and a moment
opens at `/moments/<copy>/<change>/<n>`, with `?note=<id>` opening one of its notes (`Moments.tsx`); any other address is
the list.

**The list** (`List.tsx`, `Still.tsx`, `standing.ts`). Waiting on you first: each change by its title, the app's name and
how long ago it came back, then its moments as stills, a picture each closed in on what it's about (or, naming nothing,
on the last thing done), with who and the moment's words under it, Different since you saw it where it is, and under
that each note on it in a line with where it stands ("not sent yet", "sent", "answered", "new answer"). Then With your
agents and Done, a quiet line each that opens to the same stills, Done's latest five and the rest under Earlier. Where a
change stands is said in words: "back 5 min ago, waiting on you", "2 notes sent 3 min ago · the agent is working",
"waiting for the agent", or "no agent is waiting, tell your agent", and "Done". Each waiting change has Send (once
something's said) or Done (once nothing's left to send); pressed, it says Sent or Done with a tick where it was pressed.
The list keeps itself current, but never moves what's under your pointer: one that arrives there says at once where it
stands and moves when the pointer leaves. It keeps its scroll.

**A moment's page** (`Moment.tsx`, the bar in `MomentBar.tsx`). A moment opens at rest on its end. **A moment is only
what it shows:** its recording plays from `from` to its end; one with nothing done from `from` on is a still, and where
Play would be, the bar says "A still". The recording sits in the middle, as large as the room beside its edges lets it be
(`SIDE`, 10vw, 104 to 160px each side), and never moves or changes size: not as an edge comes forward, a note opens or
the moment changes (its shape is kept until the next one's is known, and the one you were on stays under the new one
until it has faded in). The bar across its bottom edge: Play (Space), whose slim line along its own bottom edge fills as
it plays, there only once the moment has left its end; Step in (T); Note (N, on the recording or in the app); Compare
(C), or in its place "Unchanged" or "New", the bar the same width from one moment to the next. A click on the recording
plays and pauses it. Send stands top right, filled once something's unsent, and says Sent where it was pressed. After
the bar's buttons, Next, or Next answer while an answer you haven't opened waits, which opens those first; after the
last moment, To the list. What the page is doing is one value (`mode.ts`): resting, playing, a note open, pointing,
writing, comparing, getting there or the app yours; every press is an action on it, carrying where the recording has got
to, so whatever stops it playing stops it there, and one rule (`can`) says what may be pressed, which the keys and the
buttons alike ask. Keys: Space, T, N, C; ↑ ↓ (and K, J) the moment before and next; ← → this moment's notes, opening
each; Escape closes what's open, leaves Compare or noting, else goes back; Ctrl+Enter (⌘↵) sends. Reduced motion:
nothing slides or fades.

**The edges** (`Edge.tsx`). On the left, the change's moments; on the right, this moment's notes, sent then unsent, in
the order said. Each is a picture of one size (176 by 110), one after another, at rest beside the recording and never
over it, 16px from it, running past the screen's edge where the window is too narrow for them, fading out over its last
few pixels (never over pictures wholly on the screen). Pointed at (after 70 ms; going back after 220 ms), or reached with
Tab, an edge comes forward: it slides until its pictures are 16px from the screen's edge, a little over the recording,
its cards alone, each a little apart. A moment's card's words, who by name and its words, come up over its picture's
lower part. A note's card is the same at rest and forward: a slim strip of its picture over its latest words in two lines
and where it stands; a new answer's New mark shows at rest. A touch brings an edge forward first. Many scroll in their
own column, under the wheel, their cut end fading over 64px; the moment you're on, a note open or one arriving is
scrolled into view. A moment's picture is the list's still, the others' quieter than the one you're on, with its notes'
dots; pressed, the moment changes in place. A note's strip is cut for its own shape (`stripOf`, `Note.tsx`) around its
thing, its pin by the top right corner of what's shown of it (a line of words as wide as its words), beside it where
there's no room above, never on it: a small thing at the size it was recorded, with what's beside it; a wide line from
its start, a little smaller at most; something far larger than the strip closed in on what its moment is about where
that's inside it, else from its top left; a spot with no thing, around the spot; never larger than recorded, always
inside the screen. It's cut from a kept picture of the frame its thing is shown on, never a recording played
(`useFrames`): one made at a moment's end is that hand-back's own picture; any other is drawn once by `playthrough open`
in a browser of its own from the recording it was made on (`frames.ts`, the page's `?frame=` address, `Frame.tsx`) and
kept with what the person did (`branches/frames/<note>.png` and `.json`). A note's pin on the recording and its picture
are one thing: pointing at either lights both, the thing outlined only then or while open (`Pinned.tsx`). While you're in
the app the edges rest, quieter, and can't be pressed. **On a phone** (820px or less) there's no room beside the
recording: under the bar, the notes and then the moments are rows of the same pictures, words always under them,
scrolled sideways.

**A note** (`Note.tsx`) is words on a thing in a picture. N, then "Point at what it's about" on the bar with "Cancel
Esc": what a click would note is outlined and named as Playthrough names everything (`things.ts`, `pickAt`), and the
note box sits beside its thing, never on it, growing with its words. Its pin is on the recording at rest whenever its
thing is there: made on this hand-back, that very thing; made in the app or on an earlier hand-back, the same thing found
by its role and name, never whatever says the same words; on a spot, only on the hand-back it was made on. In the app,
its pin goes while its thing is gone and comes back with it. Opened (its picture, its pin, ← →, or `?note=`), the
recording cross-fades to that note's kept picture, on its thing as it is now where that thing is in the moment's picture
now, else on the frame it was made on, the bar saying "As it was" where that's from before the last hand-back; with its
pin and its card, and nothing more. Escape, its picture again, or a press anywhere but its card or the edges closes it;
Space, T and C act on the moment and close it first. An open note's thing is never under the bar: the bar moves along
the recording's edge, or down off it. A reply waits to be clicked into, so ← → go on through the notes. A note just saved
arrives at the foot of the edge, the edge forward with its words for 1.4 s; one made in the app joins the edge the same
way once you're back. An answer you haven't opened is new, on its picture and its line on the list, until you open it.
Notes and replies not yet sent are kept in this browser (`kept.ts`), by the change, until Send; what you've opened is
kept with the change, per moment as handed back (`seen.json`), so a moment handed back again is unseen again.

**Compare** (`compare.ts`, `view.ts`) is offered where you've opened this moment on an earlier hand-back and something
differs since: the moment as it is now beside how it was when you last saw it, both playing their shown parts together.
Play and the line drive both sides, at the same action at the same instant: `together`
(`packages/review/src/steps.ts`) lines two recordings up on the longest run both did in order, actions by name (one
recorded before actions were named knows each by its place only); each pair begins and ends together, each side scaled
to its own pace between, and what one did alone plays while the other holds before what's next. Each side is its half of
the recording's room at actual size, a window following now's pointer, both onto the same part of the page
(`following`), ending above the bar; at rest it moves the least that shows what the moment is about whole, with its
nearest words (`holding`).

**Send and Done.** Send carries every note and reply you haven't sent on the change, from the list or a moment's page, in
one send; it never locks. Done, on the list, sends that every moment as last handed back looks good, and nothing more.
Whether a change is done is one rule, `saidDone` (`packages/review/src/rules.ts`): the person's latest send, on the latest
hand-back, saying every moment of it looks good with no notes or replies; a note or reply after it, or a new hand-back,
opens the change again. The list places a change under Done by it, for you; the agent's `wait` ends by it.

## Stepping in

Step in (T) turns the recording into the real app at the moment it rests on, or where it has got to if it's playing, as
the moment's person, signed in, a fresh copy made the way every moment starts. Nothing is run before it's asked for, and
nothing is made ready in the background while you watch: each step in is the app made fresh, and its speed comes from
not doing work twice and not waiting on nothing.

**Where it stands is one count.** The page says how many of the things the moment shows are done where the recording
rests (`doneAt`, `packages/review/src/steps.ts`): none at its start, one after the first, nothing at all at its end or once
the last is done, or on a still; pressed while it plays, where it has got to. The run is handed over after that many
things done in the moment's step, its way there done whole before them (a file kept with its way inside its step counts
the way's too, `doneBefore`), or, with no count, once everything is done; never on a page with nothing loaded: a step
that starts on a blank page goes on to the first page it goes to (`reached`, `test.ts`). Done fewer things now than it
showed, it's handed over at its end.

**On the server** (`take-over.ts`, `following.ts`). The page POSTs `take-over` with the moment and its count, and asks
`ready-in` how long it should take: as long as the last run to that point took. The moment's file runs, in one headless
Chromium Playthrough keeps open while it runs, each run a window of its own with its own cookies and storage, to where
it's stepped into; what the way and the step did only in the page's memory (a
field typed into, a panel opened, a key pressed with nothing focused) is done again in your browser before it shows,
while what saved something or went to another address isn't done twice, and the page is scrolled where the recording
was. Each step in has an address of its own, `/take-over/<moment>`, a name nobody could guess, on a pass-through at
http://localhost:5830/ that hands your browser the run's page (its address, cookies and what the app kept in the browser)
and passes everything else on to the app, answering only this machine's names. What a step in makes is that step in's:
held by the app's pages while they're open, Back included, and given back 15 s after the last one goes (tab closed,
reload, another moment), or a minute after it was made if never opened; so two tabs, a reload or another moment never
hand one person the app another is using. Every Step in asks afresh, so Step in again on the same moment is the app made
again, never the world left behind; an address opened again (by hand) runs afresh too, never a missing page. **Every wait
ends in words.** A step in has a minute from its asking, the app's start included ("The app hadn't answered … it may still
be starting", "This moment didn't open within 60 seconds…"), each page load on the way 30 s, and it stops as soon as the
asking request closes, though a setup already making its world finishes first, so what it made is given back whole; a
moment that can't get there says where it stopped, in Playwright's words, and to say so in a note so the agent marks it
again; one whose check of how it ends doesn't hold on the code as it is now opens where it got to, with that said
(`checked`); an app that won't start says what it said last and to check `app.json`; a moment that's gone from the
change says to reload, or to wait for the agent to hand back; a page of a step in from before the list restarted says so
in the frame, and Escape. A page in the frame that never says it has loaded settles after ten seconds.

**One app per copy** (`app.ts`), shared by the person stepping in, the agent's browser and every moment run, each in a
world of its own, as the app always runs the working copy as it is now. Whoever wants it first starts it, on its own,
its output in `.playthrough/app.log`, and writes `.playthrough/running.json`; everyone using it writes
`.playthrough/using/<pid>`; two wanting it at once, one starts it and the other waits for it to answer (three minutes at
most, then it says so, pointing at `app.log`). Nobody stops it under anyone: once nobody is using it, it's stopped at
once, or with `playthrough open` running, which keeps every copy's app, once it's gone fifteen minutes unused; closing
`open` stops those nobody is using.

**In your browser** (`stepIn.ts`, `Portal.tsx`). While it's getting there, a line inside Step in fills as it goes, at
the pace of the last run where that's known, the picture's edge breathes and the recording's pointer waits. Escape, or
going to another moment, calls it off: the request ends, which stops the run, and a page of the app already opening
unseen goes with it; the bar is at rest at once. The page waits 70 s for the answer (the server always gives one within a
minute) and 30 s for the app's page to settle, then says so under the bar, with what to do; so does Playthrough no longer
running. Whatever stopped it is said under the bar in the server's words; in the app, so is a check at the end that
doesn't hold now. The app opens in the recording's place, at the same size,
and the recording's pointer comes to yours wherever yours has gone, and gives way to it. In the app the bar says "You,
as …" beside Back; Escape, in the app or out of it, goes back, but it's the app's first: if the app does something with
it, closing a menu or a dialog, that's all it does. A link out of it opens in a tab of your own. The app is drawn with
`will-change: transform`, so its words keep their spaces, and the clipboard is the page's, on the way there and in your
browser. In a moment recorded on a phone's screen, a mouse drag is a swipe. Note works there as on the recording: what you did in the app is
recorded from when it was handed to you and kept with the change (`branches/`, with the fonts, pictures and stylesheets
its pages named, `keepNamed`), and the note is on that recording, at its end.

## The list for the whole machine

`playthrough open` (`open.ts`) serves one list for the whole machine at http://localhost:5790/ (or the next free port),
and run again while it's open, says its address rather than opening another. It lists every change in every copy of
every app a `playthrough` command has run in (`machine.ts`: `~/.playthrough/apps.json`, or `PLAYTHROUGH_HOME`, and an
app gone from disk drops out), each read from the copy it's kept in; where two copies share an app's name, each says
which copy it's in. It arrives again whenever any copy's folder changes, and every two seconds besides, so a change handed
back from anywhere shows by itself, and whether an agent is listening is read from the files each time, so a list
restarted reads exactly what's on disk. It serves the page to this machine alone, and answers only the page itself: asked
by any name but localhost's, as a site that has made its own name lead here (DNS rebinding) would ask, or sent something
from another site's page, it refuses, as what's sent there reaches the agent in the person's name.

## What's kept where

Committed with the app: `playthrough/app.json` and `playthrough/setup.ts`. Out of git, in the app's copy,
`.playthrough/` (its own `.gitignore` says `*`): `change.json` (the change meant), `port.json` (the app's port),
`browser.json` (what `as` did; `browser-marked.json`, where the last moment was marked in it), `running.json`, `using/`
and `app.log` (the app), `borrowed/` (worlds not yet given back), and a folder per change: `review.json` (its title, what
was asked, when it started), `scenes/<words>.ts` (each moment's way there and its step), `rounds/<n>/` (each hand-back:
`round.json` with its moments and replies, `files/` with their recordings, readings and pictures, `since/<k>.json`
compared with hand-back k), `sends/<id>.json` (what the person sent, never written again), `taken.json` (what the agent
has taken of it), `seen.json` (what each person has opened), `branches/` (what the person did in the app, and notes'
frames), `waiting/<pid>` (an agent listening). On the machine: `~/.playthrough/apps.json` and `open.json` (the list
running).

Underneath, the code still uses older names: a change is kept as a review, a hand-back as a round, a moment as a scene
with one step, and stepping in is `take-over`. None of those words reach the agent or the person, and they're due to
change.

## Working on Playthrough

`npm run quick` (and `npm test`, the same today) holds the store, the comparison, the commands and what the page works
out to their promises (`packages/*/test`), the loop's in `review/test/loop.test.ts`. `npm run check` checks the types.
While working on the page, `npm run dev --workspace @playthrough/viewer` serves it with instant reloads beside a running
`playthrough open`.

`npm run build` builds the page, then the package in `packages/cli/release` (`packages/cli/build.ts`): Node runs
TypeScript from a checkout but not from inside an installed package, so there the command is JavaScript, with the review
and the page inside it, beside the page it serves, the types moments are written against and `MOMENTS.md`. Every push to
main is checked, tested and built (`check.yml`). It's released from GitHub: in the Actions tab, Release, Run workflow,
with the version (`release.yml`). That sets the version, the package's and the plugin's, checks, tests and builds it,
tries it installed in an empty app, publishes it as a trusted publisher (no token kept anywhere), and tags the version
on main with a release. It releases main as it is: a run re-run later, on the commit it started on, stops before
anything, saying to start a new one. The command's file is named without “./”, which npm would otherwise take out as it
publishes.

Working on it needs Node 24 or later, which runs the TypeScript as it is. The package runs on Node 22.18 or later, which
runs an app's setup and moments as the TypeScript they're written in, and says so on anything older (`node.ts`).
