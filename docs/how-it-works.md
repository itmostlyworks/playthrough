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
*Taking over* opens the real app at a moment, as that person. *Done* is the person saying every moment looks good.

## The agent's side

`playthrough` alone prints `packages/cli/MOMENTS.md`, all a fresh agent is told; each command then says what's next.

```bash
playthrough change "<title>" "<what was asked>"   # names the change; every command in this copy means it until another is named
playthrough as <person> ["<moment>" or <note>]    # the app, and a browser as them, for the agent's own tool
playthrough stop                                   # stops that browser
playthrough moment "<what's there>" ["<thing>"] [--last N]   # keeps what was just done as a moment
playthrough again                                  # every moment again, on the code as it is now
playthrough answer <note> "<words>"                # answers a note
playthrough drop "<moment>"                        # leaves a moment out
playthrough wait                                   # hands back, then waits for what the person says
playthrough open                                   # the page, for the person, open until it's closed
playthrough close                                  # closes it
playthrough --version                              # the version, and nothing else
```

The version is the package's own `package.json`'s, beside the command in the checkout and in the package, which the
release sets: one place, as an agent on 0.7.2, asked which it ran, had to read the installed package and its processes
to know.

**The first time in an app**, the agent adds `playthrough/app.json`, how to start it, and `playthrough/setup.ts`, what
everyone starts from; both are committed with the app, and the agent asks before committing them. Nothing is added to
the app's packages to try it: `npx playthrough` runs it, `npx -p playthrough playwright install chromium` gets its own
Playwright's browser, and `playthrough/test`, as a moment or `setup.ts` imports it, is always the running Playthrough's
(`own.ts`, a resolve hook in Playwright's runner, through its config, and in Playthrough itself), so the app's manifest,
lockfile and workspace settings stay as they are; the agent asks whether to add it to the devDependencies only once the
person keeps `playthrough/`, so everyone runs the same version (a real run on 0.7.1 was left with all three changed and
uncommitted, just to try it). Where the app's
command takes a port, `{port}` in both (`{ "start": "npm run dev -- --port {port}", "url": "http://localhost:{port}" }`)
gives each copy a free port of its own (kept in `.playthrough/port.json`), so a worktree's copy runs beside the
person's. An app already running from the copy's folder is that copy's app, wherever it answers, and is used there,
never started again (see One app per copy). The `url` is where the app is and nothing more: one with a page in it (a path, query or hash) is
refused, saying which to go to in the browser instead, as a moment keeps the pages it goes to and would go to them
inside that one (a real run, 0.7.1). `"oneAtATime": true` runs moments one after another, for an app with a page that shows what every
run made. `setup.ts`'s default export is given the page, a request of its own, the app's address and who it's for, and
what it returns is that run's setup; `after`, if it exports one, is given that and takes it away; `people` names who a
moment can be done as; `signIn` signs a page in; `use` is how every page of the app is opened, as Playwright's
`test.use` would be, but never what Playthrough keeps the same everywhere (the screen, language and time zone, light or
dark, motion), which it refuses, naming it. What becomes of each of Playwright's options there, a moment's own
`test.use` under it, is one table (`use.ts`), typed over every option Playwright has, so one it adds can't be used
until it's said there: Playthrough's (refused); on the way to the app (headers, a sign-in for the server, the user
agent), which taking over adds on this computer; handed over (a storage state, in the page the run hands over);
Playwright's own (downloads, HAR, video, its logger, strict selectors), nothing the app sees; and the browser's own
(where it is, permissions, offline, scripts off, CSP bypassed, service workers blocked, a proxy, a client certificate,
certificate errors overlooked), which a person's browser can't be made to be, said before they take over. MOMENTS.md
tells the agent that what every request needs goes in `use`: added on the page instead, as a real review on 0.7.2's
routing header was, it's invisible to Playthrough, as the run's window is closed once it has handed over. Each run makes its own world and gives it back when it's over;
until then it's written down in `.playthrough/borrowed/` under the process it was made for, so what a stopped command
left, the next one gives back.

**`change`** (`change.ts`) names it, and refuses a title whose name is a folder Playthrough keeps for itself, or makes
the name of another change here with a different title, saying which; the same title again goes back on it. It keeps
only the title, what was asked and when (the day each run's clock is set to), nothing of the app, so a change named
after it's made is the same change, and MOMENTS.md says so at step 1: an agent asked "When you're done, show me with npx
playthrough" made its change first, and had to work out alone that step 2 was behind it.

**`as <person>`** (`as.ts`) starts the app if nobody has, and a Chromium as them (1280 by 800, English, UTC), saying
only what it knows of who that is: signed in by `setup.ts`'s `signIn` where it has one, and otherwise just open as
them, with no line on what didn't sign them in (`opened`: a real run on a fixture with no sign-in was told "signed in
as" its person, 0.7.1; then, on 18 Nov, every app without `signIn`, signing in or not, was told what hadn't). It's on a debugging port from 9333 that the agent's own browser tool attaches to, and keeps everything done there as it's
done: each thing by its role and name (a switch, checkbox, radio or slider with no name by its role and which it is), or
by its words where nothing names it, both read as the page shows them with nothing hovered and as they're written, not
as the page's style cases them (`asWritten`: a fold upper-cased by CSS is "My boards", which is what getByRole and
getByText find again, never "MY BOARDS"), a right click as one, words typed where the caret was put as typed, keys
that move the caret too; the field words go into is found as it was before them, once for each run of typing, and a
rich-text editor (Kan's comment box) never by its words, which are what's typed: by its role and name if the page gives
it one, else by its place, and said by what it asks for ("Add comment…"); each with the address it was done at and
where the page was scrolled, and each part of it that scrolls by itself (a panel, a long list, a dialog's body) once
it's been scrolled from its start since the page loaded, so one scrolled back is put back too, found as what's done is,
by its role and name, else its place (`scrolled`, `Scrolled` in `way.ts`); and each page loaded with whether something
done before led there. One left at once for another is kept without its query and hash (`passed.ts`), as a moment's
recording keeps a page left before anything was clicked or typed there, and a take-over's too: a sign-in's redirect, an
OAuth callback's `state`, `nonce` or `code`, on any origin, which nothing goes back to, never reaches what can be
committed and shown (a real run on 0.7.1 kept them). Where something was done, or a moment rests, the address is kept
whole, as it's gone back to. A drag is kept only to be said, never done again: a press carried more than 10px and let go, with the page taking the moves for itself on the
way (`defaultPrevented` on a move, as a drag-and-drop library does once something is picked up: dnd-kit on Kan's
board); selecting words, a slider and a press that wobbled leave the moves be, and the click that ends a drag is the
drag's. Pointing at something is kept as `hover`, done again as pointing at it: the pointer moved onto something named or
with words of its own, no button held. Pressed straight after, it was only the hand on its way there, and the press
takes its place (`keep`); pointed at again, it's the one pointing. What comes under a pointer that hasn't moved, as the
page scrolls or redraws beneath it, isn't pointed at, and nor is moving onto nothing named. Until 19 Nov nothing pointed
at was kept, so a chart a button previewed while pointed at was never there run again, and the moment was "Not kept".
Chrome calls a picture an "image" where getByRole knows it as "img", so it's kept as an img. (The agent's browser is
headless, which hides scrollbars.) Run again, the browser open already starts again,
fresh, as whoever is named; given a moment, it goes that moment's way there first. Given a note, by its id as
`answer` takes it (`placeNamed`), it goes its moment's way and stops after as many of the things the moment shows as had
been done when the note was written (`doneBy`, counted on the hand-back it was written on; `wayIn` cuts the file's step
there), so a note on an open picker is stood at with the picker open, not at the moment's end where it closed. A note on
the moment's end, or made in the app, goes the whole way. Where the moment was marked again since with other things
done, it stops after as many of the new ones.

`as` comes back once the browser is ready (`startBehind`, `behind.ts`, as `open` does too): the browser is a process of its own, the same command
started detached with an IPC channel (which is how it knows it's the one behind), its output in `.playthrough/browser.log`;
it says ready over the channel, and `as` prints what it said and returns, or, where it ended first, refuses with it.
Stopped before then, `as` stops it too. The browser runs until `wait` hands back, `playthrough stop`, or 15 minutes
(`UNUSED`, the app's own) with nothing done in it and no start again, when it stops itself as Ctrl+C does, giving back
what setup made; then the app's own rule lets the app go. From 15 Nov's user testing: `as` never returned, every agent
slept 40–60 s after it every round, and two ended it with `pkill -f "playthrough as"`, machine-wide.

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
words are ten at most and never name a person, as the page already says who, unless that name is in what the moment
types, fills or picks ("Typing sam…" in a search; 15 Nov). Before anything runs, it isn't kept where all of what it's
about is past an edge of the agent's browser, which is the picture: `Not kept: the button “Lane 8” is past the right
edge of your browser, so the moment's picture wouldn't show it. Bring it into view, then mark it again.` Nor where it's
scrolled out of sight inside a part of the page that scrolls by itself (`partsAround`, in `packages/page`: of the parts
around it, the innermost first, the one where none of it is left in sight), which is said first, as that part is what
brings it into view, naming it by its name, or else as "the part of the page around it that scrolls by itself": `Not kept: the heading “Compare curve” is scrolled out of sight
inside “Results”, so the moment's picture wouldn't show it. Bring it into view, then mark it again.` A thing bigger than
the browser, or than its part, always shows some of itself, so a long list is never refused. From 18 Nov: an agent on
0.7.1 scrolled a Results panel to a compare curve, the moment played with the panel at its top, and it dropped the
moment rather than hand back a recording with the curve out of view. Of several alike, the one in view is
already the one chosen, so on 15 Nov's board ("List name", which every list has) this wouldn't have spoken: the empty
list cut off at the right was what was new, not what was named. A moment showing a drag isn't kept (`Not kept: the
last thing done here was a drag, and a moment can't hold a drag.`, or "one of the things done here is a drag"); one
on the way there is left out of the way and of `before`, and said only where the moment doesn't land (`A drag was done
on the way here, and a moment can't hold a drag.`). Named as about the very thing it last clicked (the same role, name
and which of those alike, `whatCameOfIt`), it isn't kept yet, as what came of pressing something is usually elsewhere
and the player outlines what a moment is about: `“Overdue” is what you pressed. Name what shows what came of it (the
list, a total, a message), or say it again if the thing you pressed is itself what changed: playthrough moment "…"
"Overdue"`. Said again straight after (the same words and thing, nothing done in the browser since, remembered in
`browser-asked.json`), it's kept, as a toggle that changes its own label is what came of it. Typing, pointing, a still,
or a moment named nothing or something else, is never asked. Marked again with the same words, it
replaces that moment, whatever file it was in. In the way, an address the agent went to directly is gone to at once; one
it was led to is waited for, then gone to; one left at once for another (Kan's sign-in page before its board) isn't gone
to at all; and the page before each thing done is taken as it is, not after waiting for it to rest. The way scrolls at
once to where the moment's first thing was done (or, for a still, where the agent is), so the first frame is where the
agent was looking; between the moment's things it scrolls smoothly, as a person would; and it ends where the agent is
(`test.scrollPage(page, [0, 1200], { smooth: true })`, `scrollPage` in `way.ts`). Each part that scrolls by itself is
put where it was in the same manner (`test.scrollPart`, `scrollPart`), and a way that stops partway (`wayIn`) puts them
there too. Moment files kept before 18 Nov scroll the page with `page.evaluate(… scrollTo …)`, which still runs, with
nothing waiting for it. Each scroll, the page's or a part's, waits until it's there (`scrolled`), for up to three seconds,
going on from where it stopped short, as a list that draws its rows only as they come into view gets that far only as it
draws them; a part not found within five seconds, or the page or a part not getting that far, stops the way and says so
as the way says what else it couldn't do (`no region “Results” was there to scroll where you had it`, `list “Runs” could
be scrolled only 200px down, not the 900px where you had it`, `the page could be scrolled only 1400px down, …`). It lands only if what the moment is about, in sight where the agent is, is
in sight run again too: the way, tried, says which part around it has it scrolled out of sight (`Ended`), and that
differs as `heading “Compare curve” is in sight where you are, scrolled out of sight inside “Results” run again`. The
recording needed nothing more: it starts with the way, and rrweb keeps each scroll of a part as it keeps the page's, so
the page's player, the moment's still and its pictures show the part as the agent had it from the first frame.

**The read-back.** Kept, `moment` says its length (or that it's a still) and what it's about; `shows`, the things done,
in plain words (`type “BS-WEB” in Card prefix → click Update`); `before`, the last of the way (kept, never shown); the
paths of its first and last frames; how to mark it again with `--last N`; and, last, what to do before handing back,
said again at the end of `again` and in `MOMENTS.md` (steps 6 and 10): read the whole change once more beside the ask,
put back anything that worked before and now works differently or is gone without the ask calling for it, and where the
ask does need it, set the app up so it shows and mark it as a moment of its own. From 15 Nov's user testing: asked for
boards in alphabetical order, an agent also took away starred boards coming first, said so only in its chat, and the
person, with none starred, accepted. What was taken away arrives as an ordinary moment, nothing marked as unasked. Its frames (`first`, `a-beat-later` with
nothing done, `after-1`… after each thing done and each scroll settled, the last, `held` once the end has held) are pictures the page took of
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
get there by hand and mark it again or drop it.

**A note followed through** (`followed.ts`). A moment is known by where it ends, and people note on what happens along
the way, so "the same" says nothing about a note. After the moments, `again` says, for each note waiting on the agent
that's on a thing, where that thing shows in what's about to be handed back and how it looks against the frame the note
was written on, as a fact; `answer` says the same back for the note it answers, after taking the answer, and refuses
nothing more for it (a note can be a question, and "I left it, because…" is an answer):

    Note n2, the text “Oct 5, 2026” on “Pick a range”: shown after clicking the button “Pick dates”, and looks different from when the note was written: <what's different>.
    Note n2, …: shown after clicking the button “Pick dates”, and looks the same as when the note was written.
    Note n2, …: shown in “A range across two months” at its end, …
    Note n2, …: isn't in sight in that moment or any marked since the note was written. Fine if the note asked for it to go; otherwise the person has your answer and nothing to look at, so mark a moment that shows what you did.

Not being there is the fact, said with both its readings, in the voice of `Nothing you can see changed in it. Fine if
that's the point`: a note asking for the thing to be taken away is answered by its absence (18 Nov: "Open the calendar
straight away, without this button" was told to mark a moment that shows it).

It uses only what each hand-back keeps, never another run: a moment's frames (`framesOf`: its glimpses from where its
step begins, named as they were pictured, `first`, `after-1`…, each with how many things had been done by then and since
when its page was there, and its end, read once it rested). A moment is glimpsed and pictured after each thing done, and
also once a scroll it makes in what it shows has settled (`test.scrollPage`, `test.scrollPart`, and Playthrough's own
`inView` bringing what's done next into view; `glimpsedThere` in `test.ts`), which adds a reading and a picture, a few
tenths of a second, to each such scroll, and a thing shown there is said to be shown `after clicking the button “Pick
dates” and the scroll after it`, or `once it has scrolled, before anything is done`. Waiting for the page's scroll
costs little more, as what's done next waited for the page to stop moving anyway: 18 Nov, a moment that scrolled the page
1500px between two clicks reached its last click at 5.9 s either way. A page scroll in a moment file kept
before 18 Nov (`page.evaluate(… scrollTo …)`) isn't, as nothing waits for it to end. The note's frame is the one whose page was there at its time (after the thing done before
it, or for a scroll's frame, from when the scroll began, which its glimpse keeps as `scrolled`, so a note written as a
scroll ran is on the page scrolled where it went), else the one nearest its time, with its element (`writtenOn`). A thing scrolled out of sight inside a part of the
page that scrolls by itself is read so (`outOfSight`, by `partsAround`) and, as one off the screen, is never outlined or
ringed: not in the agent's picture of the note, its strip, or the person's page (`markOf`, `named` in `replay.ts`). 18
Nov: a note on a day in a calendar that had scrolled to it was pictured with the calendar unscrolled and the day's
outline drawn under it. Then, on its own
moment, the frame lined up with it (after the same things done, where they're the same, and as many frames on), and
there the thing it became, as comparing pairs them (`differences`), or the first frame after that where it's in sight;
else the first frame of its own moment with something of its role and name in sight; else, the same way, the first
moment new since the note. A frame where the thing is off the screen or scrolled out of sight inside a part (`inSight`
in `reading.ts`) doesn't show it, so it's passed over as if the thing weren't there: 18 Nov, a day in a calendar
scrolled out of sight was said to be `shown … as it begins`. Where it was out of sight on the note's own frame, nothing
is said about how it looks. It looks the same where `looksAsItWas` says so; else different, with what comparing would say of that thing there (`findingsAt`, kept to the
findings on it), or nothing more where comparing says nothing of it. A note made in the app, where no reading of its
frame is kept, gets where it's shown and nothing on how it looks. A note on no thing (a moment as a whole, a spot, the
change) gets no line. From a real run with 0.7.1: three notes on a date picker, every moment "the same", the moment
ending with the picker closed, and the agent took that as proof and answered in words; the person had nothing to look at.

When `wait` hands back, each answer keeps where its note's thing was followed to (`shown` on the reply: the moment, the
frame's time and name, and the thing there), which the person's page opens the note on (below).

**`drop`** on a moment a note is waiting on, and **`answer`** to a note
whose moment won't be handed back, refuse until a moment has been marked since the note reached the agent: the person
sees what was done in a moment, not only in words. That's where such a note is then (`shownOn`, `standing.ts`): where
its answer says its thing shows, else on the first moment of the hand-back that's new since the note was made, else the
last, with its answer, its pin on its thing
there as it is now, and "As it was" the frame it was written on; a note the person sent is never
left with no moment to be on (15 Nov: Lena's "This isn't what I meant" was answered, its moment dropped, and the page
showed it nowhere). A note can be a question: what's printed after the notes says a note asking for a change wants the
app changed and every moment run again, and one that only asks wants an answer, nothing changed ("<what you did, or your
answer, in a line>"; 16 Nov: two agents spent four and six minutes recording something for a question that needed a
sentence). **`answer`** with no hand-back begun (no `again` since the person spoke) goes through where nothing in the
app has changed since the moments the person saw were run (`changedSince`: every file git lists for the app, its own
and new ones it doesn't ignore, against the first of that hand-back's recordings; outside git, the app is taken as
changed): those moments go on into the next hand-back as they are, with their files, unrun (`unchangedOn`), and the
person sees them as seen before (on a phone, "Unchanged" in Compare's place), with the answer ("Read 1 answer" on its card). Anything changed, it refuses, naming the file: "Run playthrough again
first: list.tsx has changed since the moments were run, and the answer goes with the moments as they are now." **`wait`**
refuses while a note has no answer or a moment hasn't been run again, or, for moments that went on unrun, while anything
has changed since they ran; otherwise it hands back, stops the `as` browser, gives the address of the change's own page, and waits. While
it waits it keeps a file named by its process in the change's `waiting/`, saying which start of the machine it's on, so
the page knows an agent is listening. When the person sends, it prints each note on its moment (one written at the
last stop by earlier versions "on the change as a whole", with no picture and no way to stand there; one on the whole
moment on its moment, with the picture of its end and the way to stand there), with its conversation,
a picture of what they saw with the thing outlined (`noted.ts`: the frame of the moment it was written on, as the
hand-back pictured it, `writtenOn` in `followed.ts`, so a note on a picker open partway through shows the picker; until
18 Nov only the page the moment left was looked in, and such a note went without; or for a note made in the
app, the frame the person's page drew of it), how to stand there (`playthrough as <person> "<moment>"`, or for a note
written partway through its moment, `playthrough as <person> <note>`, which stops where it was written, after the
scroll that came before it where it was written once that had settled: `scrolledAt`, `wayIn`), and for one
made in the app what they did there and where the app was when they wrote it (`The app was at /boards/undefined when
they wrote it.`: its path, query and hash, kept on the note as `address` when it's made, as what went wrong is often
the address itself, gone by the time the agent looks). The ids the person's take-over made are their run's own, so the
address is kept with what that run's setup made written as setup's (`madeBySetup`, in `@playthrough/change`, as a
moment's way writes them; the take-over's answer carries its setup to the viewer): `The app was at /boards/${setup.board}
when they wrote it, setup being what playthrough/setup.ts made for the run, as playthrough as prints it.` A note made
with Tell the agent, where Take over didn't work, says under its words why, whole, as Playthrough said it then: `They
pressed Take over on this moment and it didn't work: playthrough/moments/a-reminder.ts couldn't be loaded, because Node
says “Cannot find package …”.` A note on a recording says no address: a recording knows only
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

**An agent that took the notes and ended** leaves them to the next. When notes are said to an agent, the wait that
says them keeps who the agent is in `working.json` (`saidTo`): the wait ends there, so what's kept is the process that
ran it and goes on (`agentOf`, `command.ts`), the nearest above it outside its session (an agent starts one for each
command, as Claude Code does) that isn't a shell given the command (`bash -c`) or a package runner (`npx`); with its
start, so another process given its number later isn't taken for it, and the start of the machine. On the machine
here, each of three agents running `npx playthrough wait` came out as its own `claude` process. The page's re-listing
every two seconds asks whether it still runs (`agentGone`); once it doesn't, "Agent working" becomes "No agent
listening" with the line to tell yours, everywhere it shows (`agentOn`, `step.ts`), and the notes it hadn't answered
are unheard (`unheard`) as if never taken: said first to whatever an agent runs, given by `wait`, and the agent they're
said to is the one working on them. Wherever it can't be known it keeps nothing, and the page goes on saying "Agent
working": on macOS and Windows (no `/proc`), and for notes taken before this (no `working.json`). An agent that runs
its commands in its own session is passed by for what started it, which ends later if at all: the page is late to
say it's gone, never early. An agent still running but stuck isn't noticed.

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
with the app gone; it plays light or dark, still or moving, as its browser was (`page/src/scheme.ts`), and a page that
paints no background is played on the browser's own canvas for the scheme it asks, as a real browser draws it, so nothing
behind the recording ever shows through it (`replay.ts`'s `#onCanvas`). Each thing done named
as it's done (its `what`: `click button “Update”`, `type textbox “Card prefix”`, never the words) is how two
recordings of a moment are lined up. The page at the step's end is read once it rests (`rest.ts`: nothing it asked for
on its way, and nothing changing for 300 ms of the frames it draws), as the app shows it, not as the pointer hovers it,
with a picture; after each action it's glimpsed too, read without a picture. One rule says what the pointer counts for
(`asShown`, `read.ts`): its `:hover` look is set aside, as it only rests where the last thing done left it, unless the
last thing done was pointing at something, when what it lights up is what's there (a chart previewed while its button
is pointed at). Whatever does things in a page says so there (`pointing`: the agent's browser as it keeps each thing,
a recording as it does each), and everything that reads where a moment is or ends goes by it: the agent's browser
where it's marked and what it's about, each reading and picture of the step, its first frames and the end held, so
both sides of Compare.

## What's different

Each `again` compares the hand-back it makes with every one before it (`compare.ts`, `findings.ts`, `pictures.ts`), moment
by moment: the two readings of its end pair thing by thing, and what changed is said in Playthrough's own words, never the
agent's: “Export button is new”, “Status column looks different” where only the pictures differ, “Clear completed
button now says “Clear 2 completed””. What only follows from another is told with it (what was pushed along by
something new above it); things that swapped places, rows in a new order (the fewest that moved: “moved down 2
places”), and alike things changed alike are one change each; a row, a list's item or a card is read as one thing, so
one new or gone is one change and the same change in each is one change, in as many places. Past five changes inside one
table or list, they're one change to it, counted (“Table: 8 things changed inside”), kept on the table with each thing
counted, by its role and name, which finds it on whichever hand-back has it (`inside`, `findings.ts`); what was only made
wider, narrower or moved, columns making room for longer words, is counted but kept only when it's all there is. Where the pictures differ
with nothing the reading found there, that's a change of its own, named by what it's on; the agent isn't asked about
those, as it can't see more of them than Playthrough did (`toAccountFor`). What changes by itself is left out. A
hand-back can be handed back only once it's compared with every one before it (`problemsFinishing`). The agent reads the
comparison with the last hand-back; the page reads that one (a moment different since you saw it asks to be seen again) and the one with
the hand-back you last opened each moment on (Compare).

## The person's side

`playthrough open` serves the page (`packages/viewer`, built into `packages/cli/viewer`). There is no list page: `/` is
what's next, and a moment opens at `/moments/<copy>/<change>/<n>`, with `?note=<id>` opening one of its notes
(`Moments.tsx`); any other address is what's next.

The page asks one source for everything (`Source`, `api.ts`): who you are, every change as it's told again, where a
hand-back's files are, and what it says (what's sent and seen, taking over and its branches, a note's frame and a fine
still drawn, and a video made, which only `playthrough open` can), and where what it holds between visits and for the tab is kept (`kept` and `keptForTheTab`, read and
written only in `kept.ts`). `playthrough open` is that source (`server.ts`, at `/api`). Another page can show the viewer on an element
of its own with a source of its own (`show(element, source)`, `show.tsx`), built beside the page into
`packages/cli/show/` as `viewer.js`, one module with everything inside it, and `viewer.css`, and published as
`playthrough/show/viewer.js` and `playthrough/show/viewer.css`. Shown so, it asks for nothing by an address of its own,
and where you are is after the page's `#` (`#/moments/<copy>/<change>/<n>`), so it works from any folder of a plain
static host, which answers only the page itself. **Shown by another page** (handed a source of its own,
`shownByAnotherPage`, `api.ts`: the one fact all of this follows from), a change is shown on its own, with nothing of
the list of changes: no header (no mark, nothing saying how many wait, no Next), the recording taking the header's room;
no change's title, that page saying what the change is, and no room kept for it over the recording (`inItsRoom` keeps
the moment's two lines alone); no sheet of every change (W does nothing); the tab's
title left as the page has it; after Done, it stays where it was; and what it keeps is where that source
says, or, where it says nothing, in memory for as long as the page is open, never in the page's own storage unasked.
`playthrough open`'s keeps it in the browser's `localStorage` and `sessionStorage`. What the app's own frame carries
across a load after taking over (`playthrough:taken-over`, `:yours`, `:scroll` and the rest, `take-over.ts`) is the app's
side, in the app's own origin, and isn't the viewer's to keep.

**Inside another page's frame** (`inside.ts`), shown by another page and in a frame, the viewer keeps to its own: the
picture's window stays whole, so the wheel, a drag and a swipe over it are the page around's; a scroll that has run
out at an edge goes on out to it; a note's field takes the keys only once they're already
in the frame, as after a press in it; and going anywhere, into a change from its card included, replaces the address
rather than adding to it, so the page's Back leaves that page instead of stepping back through the change. On its
own, or at `playthrough open`'s in a frame (an editor's browser), none of this applies.

What another page may find the viewer's parts by is `data-part`, never their words or looks: the bar's `play`,
`take-over` (`back` once in the app), `note`, and noting's `whole-moment`; the step's box at the Moments side's foot, `step`; in the
recording's `corner`, `compare` and, while a note from an earlier hand-back is open, the switch `shown` with its
`as-it-was` and `now`, the one shown pressed (`aria-pressed`) (on a phone these are in the bar); the arrows by Play,
`frame-before` and `next-frame`, and every key drawn on a button, `key` (Back's "Esc ×2" is one); a note's `pin` and
`note-card`; the rounded box the recording sits in, `picture`, always, where `data-picture` is there only while the
picture can be moved; `share` top right; the change's `title` over the recording (in the header on a phone; not drawn when shown by another page); the edges, `moments` and `notes`; each
of the moments' cards, `moment`.
Nothing in the viewer reads them.

**What's next** (`Moments.tsx`, `Opening.tsx`, `step.ts`). `/` opens on the next change waiting on you, its opening card:
its title, what you asked, the app and when it came back, over the first moment you haven't seen, its picture softened
where the recording will be. Nothing plays. The whole card is one press, as its look says on hover ("See 3 moments",
"See 1 more moment", "Read 1 answer"): it, Space, ↓ or Next go in, to the first moment with something you haven't seen,
else the first. The next change is one with something you haven't seen or read, then one seen through with something
unsent, then one seen through with nothing said, each longest waiting first (`waitingInOrder`); one you've finished here
stays finished as it was handed back, so the next card comes at once. In a change, its moments go one by one with Next;
past the last there's nothing further. **The step left** for the change (`StepLeft.tsx`) is on every moment, in a box of
its own at the foot of the Moments side (`StepBox`, on desktop): pinned under a hairline while the list of moments scrolls
above it, flat (its surface and hairline edge, no shadow, 40px, its corners, 13px) as wide as the side, and so the bar
holds only this moment's actions. It stays while a recording plays; while the app is yours it goes with the side, so Send
and Done wait until you're back. It's one slot that changes
in place, every face laid in it and all but one unseen, so it's as wide as its widest and nothing moves as it turns:
"Send 2 notes" while something's unsent, its words in full ink; "Sending…"; "✓ Sent"; "● Agent working" once an agent
has taken them; "Done" while it waits on you with nothing unsent; "Done anyway"; "✓ Done"; and for a guest with
nothing to send, "No notes yet", resting. Pointed at, a tint lies over its surface, never in its place. A note saved
lights it amber where it stands, fading over 700 ms, as its words take one more (with reduced motion, lit then unlit;
`lightSend`, `Moment.tsx`). Pressed, or Ctrl+Enter from anywhere while something's unsent: Send sends at once and you
stay where you are, the notes' cards turning from "not sent" to "sent"; Done ends the change and, after a pause
(`SAID`), goes on to `/`. With moments not watched or answers not opened, Done's first press says so instead: the box
turns to "Done anyway" and the line over the box says what's left ("2 moments not watched", "1 answer not opened", each
pressed going to the first of them, by the same count the Moments edge shows, `unseenOf`, `unreadOf`); the second press
ends the change, and going to another moment asks again. What the box can't hold is the step's notice (`StepNotice`),
a quiet line directly over the box at the Moments side's foot, wrapping in the side's width, on every moment while it's
true, fading while a recording plays as everything over it but the bar does: what's left before Done (above); sent with no agent on the change (`agentOn`: none listening, and none on notes it took
before), "No agent listening. Kept for when one is." in amber, and under it, while what you sent waits for one
(`tellOf`), "Tell yours:" and the words with Copy beside them; "Not sent: …" in amber where a send
didn't go. Sent, the agent working and Done are the box's alone, said once. On a phone the box is a row of its own under the bar, the whole width, and the notice a line in the page under
it, so neither covers the other. Nothing
else says anything to the agent: ↓ never does, and Space is never a press (`useSpaceStays`). `/` when the next change
is seen all through (`seenThrough`) opens on its last moment, and an address from before, `/…/end`, lands there too.
(Until 21 Nov there was a last stop after the last moment, a sheet of your side of the change where Send and Done
were, reached by a last card on the Moments edge; the box took its place: the card was an action listed among
places, scrolling out of view on a long change.) Notes on the whole change, which the last stop kept with no `on`, are
on the last moment (`shownOn`) as a note on the whole moment is (**A note**, below): on its Notes edge with no pin,
reached by Shift ↑ ↓, their answers counted in "1 answer not opened" and read by seeing the last moment (a hand-back
seen as a whole, as the last stop was, reads nothing now). They reach the agent as they always did. With nothing waiting,
the page rests: in the middle of the window, Playthrough's mark quietly, with a green tick where the note would be (it
lands once, as the page arrives), and "You're all caught up." (Before any agent's work has come: the mark with nothing
in it, and "Nothing here yet.") Under it, what your agents are on ("Your agents are on:", each with its words) and apart
under "No agent listening:" what nobody is on, each with the line to tell yours; a heading shows only over a change it's
true of. With neither list, how to bring an agent's work here instead: "To see an agent's work here, tell it:" and
under it the words to say, with Copy beside them, as "Tell yours" shows its own (below). The
every-change sheet says the same words under "Waiting on you". The
mark and first line stay put as a change moves between the lists when an agent arrives: the rest grows and shrinks
under them, rather than the whole being centred.

**Words to say to an agent** ("Tell yours:", and the resting page's "To see an agent's work here, tell it:") sit under
their lead in a box as the site's own prompt does (`Copyable`, `Changes.tsx`): the words plain and selectable, in mono,
and Copy beside them, a small solid button that says "Copied" for 1.4 s, as wide either way, so nothing moves. Where
it's narrow the words wrap and Copy goes under them at the right. A press or a selection in the box doesn't open the
row's change. Opened over plain http (a tailnet), where the browser gives no clipboard, it copies the older way;
failing that, it selects the words for Ctrl+C and doesn't say Copied.

**The top of every page** (`Header.tsx`) is its two corners: at the left Playthrough and what's waiting in it, the way
to every other change; at the right what to do with this one: Next on the opening card, Download video and Share on a
moment's page. Between them, nothing: what
this is stands on the recording's top. The left is one thing to press, the opener (`Waiting.tsx`): Playthrough's mark
(`Mark.tsx`, as `public/logo.svg`, in the page's colours) and name, then "6 changes waiting" (or "Every change") and its
key; on a phone the mark and "6 waiting" alone.

**What this is** is the recording's, not the header's, in one stack on its top, centred over it, 12px above its edge,
wherever the recording's place stands in its room (while the app is yours, it goes there, **Taking over**): the change's title, quiet and small, and under it the moment's name, on the line the
edges' words are on, and nothing more: whose hands are on the app is the pointer's to say (**Whose hands**, below). Those take two lines at most (three on a phone, at the left),
growing up into room kept over the recording (`inItsRoom`, three lines' worth, which the opening card's picture stands
in too, so going in moves nothing). The title, pointed at (after 70 ms) or reached with the keyboard, brings a small
card with what you asked in your own words and the app and when it came back: over the title where it fits under the
header, covering nothing of the moment, else under it. The opening card's page has no title: the card says it. On a
phone there's no room over the recording for it: the title, in full colour, takes the header's room between what's
waiting and the right corner, and there's no card for what you asked.

**Download video** (`DownloadVideo.tsx`), left of Share, makes what you're watching an MP4 your browser downloads. Pressed,
it asks where it is, in a small card hanging from it: **This moment** ("with Compare" when Compare is on: both
sides), or **The whole change**, its moments in order ("3
moments"); with one moment, there's nothing to choose. Then it says "Downloading…", counts down
the seconds left where the arrow was, filling as it goes (holding on 1 until it's there), and ends on a tick in the same
place, "Downloaded", for 2.5 s; one that couldn't be made says "Didn’t work", why when pointed at. Nothing in it moves
while it does (`DownloadVideo.tsx`, `WORDS`): its four words are held in one place, so it's as wide as "Download video"
in every state and the words always start at the same x; the arrow, the seconds (in digits of one width, centred
without widening the slot) and the tick share one 14px slot; what changes crossfades in 150 ms, and only the fill grows.
On a phone it's that slot alone, at one width, so the title beside it never moves. In the app it goes with Share, as
what this is does (**Taking over**), and on a phone, where it stays in sight, rests, as Share does, at the resting ink and
not to be pressed; it isn't there shown by another page, a guest's included. With Share it's
one pair, the same height, size and ink, 12px apart, each one width whatever it says, so neither moves the other;
either open shows on its button, both cards hang 8px under it, and opening either's card closes the other's.
`playthrough open` films it (`video.ts`): the viewer plays it in a browser of its own (`?video=`, `Video.tsx`) and what it
draws is filmed as it plays and put together by that browser's own H.264 (`mp4.ts`): nothing to install. The video is
the app and nothing else, edge to edge, exactly as it looked when it was recorded: the whole screen, wherever you'd
taken the window, light or dark as the recording's browser was (its first moment's), whatever your page is; the
recording as the moment's page plays it (the pointer, its clicks and keys), and none of Playthrough's page around it.
It's the recording's screen half as large again, as large as fits 1920 wide (or tall), never more than twice: a laptop's
1280×800 is 1920×1200 (`sizeOf`). Compare is the one exception, two apps not one: its two sides, "When you last saw it"
on the left and "Now" on the right, each the shape of the app's screen and filled by it, framed on what changed as
Compare opens, a 2px line between them, so 1920×600 for a laptop's. Over the app, only small pills, the same shape as
Compare's labels (the page's surface and ink, edged, so they read over any app, light or dark, in its scheme), at the
same size in every video: the moment's name at the bottom left, two lines at most, from its first frame for a second,
then fading over 0.3 s; Compare's labels at each side's top left throughout; and at the close, the last frame held
sharp for 1.6 s while a pill with the mark and playthrough.sh fades in at the bottom right. In the whole change, each
moment's end holds 0.8 s (a still, 1 s, as it has nothing to play) and the next comes in over it in 0.24 s as going to it
does, its name with it; the close is only at the very end (`filming.ts`: a 4 s moment is a 5.8 s video; three moments
playing 9 s, about 13 s). 60 frames a second ("the point of playthrough is that we more accurately simulate what it feels in
real life"); BT.709 at a TV's range, said in the file too, as full range looked "blown out" in players. A frame made from
the one before leaves a faint shape of what went where nothing changes after (a pill faded out, the pointer moved on), so
the frame the page comes to rest on is made whole, and so is the one after anything the video draws over the app has
settled (`settled`). It takes about as long as the video and a few seconds more to start (a 6 s moment, 8.5 s; 13 s of
three moments, 20 s); 0.6 MB for a 6 s moment, 2 MB for 13 s of three.

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

**A moment's page** (`Moment.tsx`, the bar in `MomentBar.tsx`). A moment opens at rest on its end, and at rest the
recording is just the recording: nothing is drawn on what the moment is about (until 20 Nov a grey outline was, at its
end). **A moment is only
what it shows:** its recording plays from `from` to its end; one with nothing done from `from` on is a still: Play and
its arrows rest there, dimmed where they always are, and Play says "A still: nothing to play" when pointed at. The recording sits in the middle, as large as the room beside its edges lets it be
(`SIDE`, 10vw, 148 to 160px each side), and never moves or changes size: not as an edge comes forward, a note opens or
the moment changes (its shape is kept until the next one's is known, and the one you were on stays under the new one,
drawn just as it was, never swapped for its picture, until the new one has faded in: two moments that look alike change
with nothing moving in what's the same). The bar across its bottom edge (on a phone, just under it, touching it, so it
covers none of the picture; Take over's few words then come under the bar, not over it): Play (Space), whose slim line along its own bottom edge fills as
it plays, there only once the moment has left its end, with a small arrow either side, the frame before (←) and the
next frame (→), their words and keys coming up over them when pointed at a while; Take over (T); Note (N, on the
recording or in the app). The bar is one width on every moment and in every state, the width its widest state needs:
noting's "Point at what it's about", "or the whole moment" and Cancel with its key, whole (measured unseen, `notingWide`),
the places spreading evenly across it at rest; in the app who you are takes Play's room and its arrows'. Beside it, at
its right, the step left (**What's next**, above). **Compare** (C) isn't on the bar: it sits in the recording's top
left (`corner`), on the bar's own material at the size of the sides' labels, shown while the pointer is over the
recording, fading in and out calmly, only on a moment that has something to compare. A small switch before its word
says off or on (its track filled and knob over when on, its word soft till then), so it reads at a glance; until 21 Nov
it was a bar-sized button filled in the ground's ink when on, too big over the recording and unclear which it was.
While Compare is on it stays shown without the pointer, so the way out is always in sight, and "When you last saw it"
stands just right of it, on the line "Now" stands on across the way. While a note from an earlier hand-back is open, its "As it was" and "Now" switch is
there beside Compare. Like everything over the recording but the bar, it fades while a recording plays, and it's gone
while the app is yours. With nothing to compare, the corner shows nothing (until 21 Nov "New" or "Unchanged" stood in
Compare's place on the bar). On a phone, where nothing hovers, Compare, the switch, or "Unchanged" or "New" (smaller,
in the soft ink, nothing to press) stay in the bar at Compare's width, as before. On a phone the keys go, Take over on its way says "Taking…", and the bar fits the room it's given under the picture
(`PHONE_BAR`): as wide as at 390, or the room where that's less, each place its words at their widest and a share of the
rest that's the air it has at 390, so narrower the air goes from every place together, no place moving as its words
change and no word cut, down to about 285 wide. A click on the recording
plays and pauses it. Send and Done are in the box at the Moments side's foot (above); top right, Share (below, **Sharing a
change**). The next moment is ↓ (J), its card on the Moments edge (a row under the recording on a phone), and after the
last, nothing; Next was top right until 19 Nov, when Share took its place. What the page is doing is one value (`mode.ts`): resting, playing, a note open, pointing,
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
moving is placed by when its change was. A note made there keeps that picture. Keys: Space, T, N, C; ← → the frame before and
the next, along the moment, and never on into another; ↑ ↓ (and K, J) the moment before and next, and nothing
past the first or the last; with Shift, ↑ ↓ the note before and the next through the whole change, opening each: this
moment's one after another, then on to the nearest moment that has one (its first going on, its last going back), and
nothing past the change's first or last; W what's waiting; Escape closes what's open, leaves Compare or noting, or
calls off a take-over on its way; while the app is yours, Escape twice is Back; Ctrl+Enter (⌘↵) sends, wherever the
keyboard is but in a note or reply being written: there Enter saves, with Ctrl or ⌘ too, Shift+Enter is a new line, and
neither reaches the page, so one key never both saves and sends. Noting, while the bar says "Point at what it's about" and, beside it, "or the whole moment", only N and Escape answer,
so words typed before pointing and the arrows run nothing; there's no key yet to point with. Reduced motion: nothing slides or fades.

**The picture is a canvas.** The wheel over it brings it closer, or further, about the point under the pointer, which
stays under it: from the whole screen up to three times closer (`CLOSEST`, `view.ts`), a notch about a sixth (`wheeled`:
Firefox counts a mouse's notch in lines, three, and others in pixels, 100, and both come to the same; a trackpad's
small turns go in proportion, and its pinch, which comes as the wheel with Ctrl, zooms the picture, never the page; a
two-finger swipe zooms it too). A notch doesn't jump: it says where the picture is heading, and the picture gets there
in about a tenth of a second (`SETTLES`, `view.ts`, 110 ms), fastest at once and slowing as it arrives, never past it
and never drifting on after (`approach`: each frame closes the same share of what's left, so it comes within half a
pixel of where it's heading in that time). Notches in quick succession add up to one place it carries on toward, and
the point under the pointer stays under it in every frame of the way, the pointer's place at each notch being the one
held. A trackpad's small turns go through the same ease and trail it by a few milliseconds, too little to feel. Each
frame of it is drawn, by every picture on the window and the pins and the open card over them, before the browser
shows that frame (`Together` is given React's `flushSync` for it), so nothing is a frame behind. The wheel and a drag
both act on where the picture is that instant, as `Together` holds it, never on where it was when they began: a drag
holds what's under the pointer, 1:1, each move from where the last one left it (`hold`), and a zoom on its way when a
drag moves, or turned during one, carries on about what the drag holds, so through both what's under the pointer stays
under it, as in a canvas tool. With reduced motion there's no ease. All the way out it's the whole screen again, just as before it was moved: the wheel is
the way back, with no button for it. Closer than the whole screen, **a drag moves the picture**, never past the screen's
own edges; whole, there's nowhere for it to go and a drag does what it always did. A press that moves less than 8px
(`SLOP`, `Player.tsx`) is a press, at any closeness (it plays or pauses, or with Note on places the note on what's
under it), and the click that ends a drag is the drag's, so only a press notes. While dragging the pointer is a closed
hand; nothing on the page is selected. Only what's inside the picture moves: its frame, the bar and the edges stay
put. Once moved, the view is yours: it stays put as the moment plays, and another moment starts afresh. Take over (or T)
takes the picture out to the whole screen at once, over 600 ms on a curve that sets off gently and lands softly (`STEPS_OUT`, `view.ts`; at once with
reduced motion), while "Taking over…" shows, in the same move as the recording takes the page (**Taking over**): the
app shows whole, so it comes in over the very picture it replaces,
with no jump (before, it opened whole over a picture still brought closer). Called off, the picture stays whole; Back
from the app is to the whole moment, let go of while the app still covers it. From Compare, Take over closes Compare and
the same holds. It's
one window, `Together` (`view.ts`), which every picture of the moment is drawn from (`Player.tsx`), the kept picture of
a note's own frame too, and which the wheel and a drag move; its pins and outlines go with it, a note's thing moved out
of view keeps its pin at the picture's nearest edge, as a spot out of it does, an open note's card stays by its pin, and
the bar still drops below the edge only for what's in view (`kept`, `Moment.tsx`). The recording's pointer is its true
size against the app: brought closer than actual size it grows with the picture, in the same frames, about its tip,
which stays on what it points at, as does a click's ring; at or below actual size (fitted, Compare at rest, a phone)
it stays a pointer's own 20px (`pointerScale`, `view.ts`, the rule and the floor in one line; in the app, the
stand-in pointer is drawn the same size).

**Whose hands** are said on the pointer and nowhere else (`tag.ts`, `PointerTag.tsx`; 20 Nov: in a user test it wasn't
clear who was acting when, and words for it beside the moment's name and in the bar, tried that day, were one more
thing to read). The recording's pointer wears a small tag just below and right of its tip, as a name on someone else's
pointer, in the look your pointer's "Note on this" has: "Your agent" ("The agent" to a guest, whose agent it isn't).
It's there only as play starts: it fades in as a moment starts playing, stays 1.8 s
(`TAGGED_WHILE_PLAYING`; a second was a beat too short, the owner said) and fades with everything else over the recording, and comes again each time play starts
(20 Nov, the owner: "Dont show "your agent" at rest after playing a moment, only when starting to play"). At rest, before
playing, paused or at the end, the pointer wears nothing; a key pressed as it plays stands where the tag would, so the key is shown
and the tag waits. It's one size at any closeness, as far from the tip as the pointer has grown, and turns to the left
of the tip or above it where the picture's right or bottom edge would cut it off (`besideTip`). Never on a still, where
nobody acts, nor with the pointer out of the picture, in Compare, while noting, on the moment fading
out as the next comes, or in a downloaded video. Who a moment is signed in as (`setup.ts`'s people, "Maja, the owner")
is kept with it and told to the agent, but not said on the page for now: nowhere showed it without crowding the moment
(the Moments edge's cards had "… as Maja", the moment's name "· Your agent, as Maja", the bar "You, as Maja"). Taking
over, the tag rolls to "You" (**Taking over**). The wheel over a note's pin or an
open card on the picture is the picture's too, Ctrl or not, never the page's (it was the page's zoom with Ctrl): it's
handed to the picture under it, and only a card's words that can still scroll that way take a plain turn first. The wheel over the bar, the edges or
the page around the picture does what it did before; in the app, the wheel and a drag are the app's.

**The edges** (`Edge.tsx`). On the left, the change's moments; on the right, this moment's notes, sent then unsent, in
the order said. Over each, what it holds, in a word, "Moments" and "Notes": at its pictures' outer side, or 24px
from the screen's edge, where the header's words stand, when they run past it; still as the edge comes forward, and
not there over notes while there are none. By each word, on its inner side, the keys that go through what it holds:
↑ ↓ by Moments, Shift ↑ ↓ by Notes (not on a phone). Forward, a card has one border, its own, which says the moment
you're on or the one pointed at; the picture's own border is only there at rest. Each is a picture of one size (176 by 110), one after another, at rest beside the recording and never
over it, 16px from it, running past the screen's edge where the window is too narrow for them, fading out over its last
few pixels (never over pictures wholly on the screen). At rest an edge sits back, each of its cards at 40%, its word
too, all alike, so the recording has your eye; the one you're on and an amber dot still tell apart from the rest
(`--resting`, `style.css`, the same value the app's resting uses, from that one place; not on a phone). What waits on
you stays at full: a note's card saying "new answer". Once it stops waiting (the answer opened) it settles back with
the rest, in the cards' own calm fade; nothing moves (`data-waiting`, `Tile`, dimmed by `Edge`). Pointed at (after 70
ms; going back after 220 ms), or reached with Tab, an edge comes forward, coming to full as it slides (300 ms, calm; with reduced motion, at once): it slides until its pictures are 16px from the screen's edge, a little over the recording,
its cards alone, each a little apart. Forward, the moments you've already watched stay softer, at about two thirds,
under a veil of the card's own ground (so the card stays whole over the recording), until one is pointed at itself;
those not yet watched, by the count Done uses (`unseenOf`), come to full, so what's left to see stands out only when you
look for it, never at rest (21 Nov: the edges sit back "to reduce the overwhelming feeling of seeing everything at once
at the same strength"). On first coming to a change every moment is unwatched, and forward is as it was. Not on a
phone. A moment's card's words, its name, come up over its picture's lower part. A note's card is the same at rest and forward, and leads with what it is as a moment leads with its picture: its dot, its latest words in two lines
and where it stands ("not sent", "sent", "answered" in soft ink, "new answer" in full ink and heavier: in faint they
were hard to read on a dark card; `NoteWords`, the same by its pin), over a slim strip of its picture, set in; a new answer's New mark shows at rest. A touch brings an edge forward first. Many scroll in their
own column, under the wheel, their cut end fading over 64px; the moment you're on, a note open or one arriving is
scrolled into view. A moment's picture is its still, the others' quieter than the one you're on, with its notes'
dots; pressed, the moment changes in place. A note's strip is cut for its own shape (`stripOf`, `Note.tsx`) around its
thing (a line of words as wide as its words), with no pin on it, as its dot leads its words: a small thing at the size it was recorded, with what's beside it; a wide line from
its start, a little smaller at most; something far larger than the strip closed in on what its moment is about where
that's inside it, else from its top left; a spot with no thing, around the spot; never larger than recorded, always
inside the screen; drawn wider than the edge's strip, the page at the same size as on the edge, so as much more of it round the same
middle shows (17 Nov: a wider one had been the same part blown up half again, "ks · Oct 3 · $4" across the card); one from an earlier hand-back is cut from the moment's picture now where its thing is found there, as it opens. It's cut from a kept picture of the frame its thing is shown on, never a recording played
(`useFrames`): one made at a moment's end is that hand-back's own picture; any other is drawn once by `playthrough open`
in a browser of its own from the recording it was made on (`frames.ts`, the page's `?frame=` address, `Frame.tsx`) and
kept with what the person did (`branches/frames/<note>.png` and `.json`). A note's pin on the recording and its picture
are one thing: pointing at either lights both, the thing outlined only then or while open (`Pinned.tsx`). While you're in
the app, or while it's getting there, the edges go where they stand, the recording taking their room (**Taking over**),
and come back as they were; nothing on them can be pressed meanwhile. On a phone, where they're rows under it, they rest
instead, quieter, each card at the same 40% rather than the row's and its own together. The notes can't be pressed. The
moments can, with the pointer:
each stays dimmed until it's pointed at, then comes to full, and pressed it leaves the app as Back does and goes to that
moment, at rest, in one move (a take-over on its way is called off as Escape does); the moment you're in the app on is
just Back (`leaving`, `Moment.tsx`; `answers`, `Edge.tsx`). Send and Done are the box's: at a desktop size it goes with the Moments side, so they're back when you are; on a phone
it stays under the bar. Writing a note in the app, none of them answer, as Back doesn't. The keys
are the app's all the while. The menu at the top left still opens what's waiting over the app. **On a phone** (820px or less) there's no room beside the
recording: under the bar, the notes and then the moments are rows of the same pictures, words always under them,
scrolled sideways. The recording and its bar stay; what's under them scrolls, fading where there's more above or below,
as an edge's list does and a note's thread too long for its card (`useMore`, `Edge.tsx`). The whole screen is too small to
read there, so the picture starts closed in on what the moment is about (`startOn`, `Still.tsx`): as close as its still,
at most three times the whole screen's size, and widened to the whole of the dialog or panel that holds it, the outermost
of what holds it that's no wider than three quarters of the page, so no line in it is cut in half; a wide one comes out
smaller. All of the panel where it fits, else from its top down to what the moment is about. Where nothing smaller than
the page holds it, as on a board, it starts as close as the still. A drag moves the picture from there, as the canvas
above (the picture doesn't scroll with the rows under it); two fingers are the browser's own pinch
(`touch-action: pinch-zoom`), not the picture's, since only taps note.

**A note** (`Note.tsx`) is words on a thing in a picture. N, then "Point at what it's about" on the bar with "Cancel
Esc": what a click would note is outlined and named as Playthrough names everything (`things.ts`, `pickAt`), and the
note box sits beside its thing, never on it, growing with its words. It grows upward, as a chat box does: its foot holds
still, so Save and the line being typed stay under the hand and the earlier lines move up; the same for a Reply. It's
placed by the height it came in at (`NoteCard`, `Note.tsx`) and placed again in the frame it grows in, so it's never
seen grown the wrong way first. Against the recording's top, with no room above, it grows down instead, the mirror of
its foot, where it's pushed up clear of the bar; a box under a thing too wide to stand beside grows down too, so it
stays off its thing. At any zoom it's placed the same way by its thing as the view moves. On a phone the box is in the
page under the bar and grows down as before. Beside "Point at what it's about", **"or the whole moment"** is the
other way: pressed, the box opens with nothing pointed at, over the bar's middle, as wide as a box (`overTheBar`,
`Moment.tsx`), the place a note on no thing takes, deliberately; saved, it's a note on the moment as a whole, kept as
its hand-back and moment alone, at no time and on no thing (`on` with neither, which the kept change has always read as
"the whole moment"), a card on the Notes edge like any other, its strip the moment's end now, and no pin. Opened, its
card stands in that same place over the bar. The agent's `wait` prints it on its moment, with the picture of the
moment's end and how to stand there (`noted.ts`). Its pin is on the recording at rest whenever its
thing is there: made on this hand-back, that very thing; made on an earlier hand-back, the thing it became, as the two
hand-backs' readings of its step tell when they're compared for what changed (`foundNow`, `found.ts`: the steps lined up
by what was done in them, as comparing does, its step gone from the moment meaning no now; worked out once for each two
readings, however often it's drawn), so words the agent
reworded as asked are still its thing and the same words standing elsewhere, there before as a thing of their own, never
are (17 Nov: a note on Alder Dental's "Overdue" badge, made to say "79 days late", stood on the overdue total's "Overdue"
label); made in the app, where no reading of the page it was made on is kept and no step of the moment reads that page
again, the same thing found by its role and name; nothing is drawn on a
thing until the earlier readings have come, so a pin never lands and then moves; on a spot, only on the hand-back it was made on. In the app,
its pin goes while its thing is gone and comes back with it. Opened (its picture, its pin, ← →, or `?note=`), a note
made on the hand-back you're looking at shows the moment at its end where it was made there, else cross-fades to its kept
picture, the frame it was made on. Gone through quickly, the latest note wins: a frame comes in over the note's frame just
left, or over the moment alone, never over an older one, and off every frame the moment comes back in one fade that going on
through notes on the moment's end neither restarts nor undoes. **A note from an earlier hand-back opens on the moment as it is now**, at its
end, so what came of it is what you see, wherever its thing is found there, as its pin is; where its answer keeps where
its thing was followed to (`shown`, from `wait`), on that moment, the moment resting at that frame, its pin on the thing
there (`shownIn`, `standing.ts`), and its strip on the edge cut from the picture the hand-back took of that frame
(`framePicture`): a note on an open date picker, in a moment that ends with it closed, opens with the picker open. It's
rested there before it's drawn, so the end never shows first. How it was is one flip
away, in place: while it's open, the recording's corner holds, beside Compare, a two-part switch (on a phone, in
Compare's place on the bar), "As it was" and "Now", Now chosen;
pressing it, or C, flips. Where its thing isn't in the moment now (the agent took it away, or you'd taken over and gone
to another page before noting), there's no now to show it on: it opens as it was, on the frame it was made on, its
strip on the edge cut from that frame, and Now rests, saying "Not in this moment now" when the switch is pointed at; a
pin never stands on whatever is there instead. As it was is the earlier recording played to that frame, drawn by your
browser with your fonts just as Now is, so a flip changes only what changed in the app. While the note is open on Now
it's already there, laid under the moment unseen, untouchable and unread, so it's drawn and its thing's place known
before you flip: only the open note's, gone when it closes, and only a recording played, never your app run. Its kept
picture, taken where it was recorded, is under it until it's drawn, and in its place if it can't be. A flip is
a cross-fade in the same spot at the same size (at once with reduced motion); the ring, the pin and the card go to its
thing in the picture coming in over the same time and curve, in step with it, the card open and whole all the way (a
reply being typed stays). Flipped before the recording there has said where its thing is, they hold where they stood
and go once, when it does; if it never does, to the kept picture's place after a settle's time. ← → to another note opens it on Now. With its pin and its card, and nothing more. Escape, its picture again, or a press anywhere but its card or the edges closes it;
Space, T and C act on the moment and close it first. An open note's thing is never under the bar: the bar moves along
the recording's edge, or down off it. In its thread each turn says who on a small line of its own, you by your dot,
the agent by its name, in soft ink (`Turns`, `Note.tsx`): in faint the names were hard to read on a dark card. A note
from an earlier hand-back whose thing looks different now (reworded, drawn or sized otherwise; only moved, it looks as it
did) shows that thing as it was when the note was written, small, under "You" and over your words, so they read as they
were meant: "How late is each one?" over the "Overdue" badge, while the ring is on "79 days late" (`NoteWas`,
`data-part="note-was"`). It's cut from the earlier hand-back's reading that showed the thing, that reading's picture and
the thing's box in it (`foundNow`, which pairs the thing then with the thing now, and `looksAsItWas`, both in
`packages/page`), with 8px of air on screen, rounded as the edge's strips. It's drawn at the scale the recording beside it
is drawn at right now (the picture's room over the screen, as `pageWindow.shownIn` gives it, brought closer or not, and
again as the window is resized), so the badge in the card is the size of the badge in the recording, even above the
app's real size, but at most 64px tall and the card's width; its size is known from the reading before the picture
comes, so the card holds still. Written on this hand-back,
looking the same now, not found now (it opens as it was), or made in the app (no reading of it is kept), there's
none and no room for one. It stays through the flip. A reply waits to be clicked into, so ← → go on through the notes. A thread too long
for its card comes in at its end, already there, so its newest answer is in view, what's before it fading above, the
Reply box under it where it always is; one that fits whole is as it was. On a phone, where the thread runs in the
page's flow, the rows holding it are scrolled instead, just enough to bring the newest in
clear of their fade. A note just saved
arrives at the foot of the edge, alone: its card comes out of the edge whole, as it is forward and clear of the
screen's edge's fade (`--clear`, `Edge.tsx`; 94px at 1440), holds 1.1 s and folds back into its place to sit back with
the rest, about 2.2 s in all; the edge, its word and the other cards hold still, and its place is taken from the first
frame. The list reaches that far over the recording so the card isn't cut as it comes, but only its cards answer the
pointer there. Coming forward while it's out takes it along to its forward place as the edge moves; with reduced
motion it's simply there. One made in the app joins the edge the same way once you're back. An answer you haven't opened is new, on its picture, until you open it.
A note is kept in one of two places (`model.ts`): on a moment as handed back (its `handBack`, its `moment`,
`at` in its recording, and its thing: an element, a box or a spot), or made in the app after taking over (`handBack` and
`moment` again, `steppedIn` where in the moment (the name it was kept under before this was called taking over, which files on disk still have), `did`, the person's own `recording` and its `length`, `at` in that, and
its thing there); an element's number is only ever read against the one recording it was read from. Which moment a note
is on is its `moment`, either way. Notes and replies not yet sent are kept where the source keeps things between visits
(`kept.ts`; this browser, at `playthrough open`'s), by the change, until Send; what you've opened is
kept with the change, per moment as handed back (`seen.json`), so a moment handed back again is unseen again.

**Compare** (`compare.ts`, `view.ts`) is offered where you've opened this moment on an earlier hand-back and something
differs since: the moment as it is now beside how it was when you last saw it, both playing their shown parts together.
Play and the line drive both sides, at the same action at the same instant: `together`
(`packages/change/src/takings.ts`) lines two recordings up on the longest run both did in order, actions by name (one
recorded before actions were named knows each by its place only); each pair begins and ends together, each side scaled
to its own pace between, and what one did alone plays while the other holds before what's next. Each side is its half of
the recording's room, ending above the bar (on a phone, at the picture's edge, the bar under it), both onto the same
part of the page. The two sides and the moment's own picture are on the moment's one window (`Together`, `view.ts`): the
wheel or a drag on any of them brings it closer or moves it, and once you have, it's yours. Compare on or off keeps
where you had it and how close, as near as the other's room allows (the same middle, no further out than the whole
screen), whether you moved it before Compare or in it ("if you have compare on it will zoom both and follow the same
screen area", 16 Nov). Not yet moved, or brought all the way out, it starts again (`compareTurned`): Compare framed, the
moment's own picture whole, so the wheel all the way out on the moment's own picture, then C, is the way back to what
changed. **Not yet moved, Compare opens framed** on what was done in the moment and what changed, together, so what differs
is in view on both sides from the first frame (before, each side opened on the app's top left, about half its width,
and the demo's one change, a Status column, was out of view on both). What was done is each click's and each typing's
place on either side (`doneIn`, `replay.ts`, where the click's ring is drawn) and the whole of the last thing done to
(`acted`, as each side's reading has it); what changed is each finding on the moment, by its thing and those changed
alike with it, in the reading of the side it's on, and, for a finding that's a whole part of the page ("Table: 8
things changed inside"), the things the hand-back counted inside it, on whichever side each is, whether the part is
kept by its name or its place, else, kept before those were, the part itself (`changedAt`, `compare.ts`). Until 21 Nov
a part kept by its name (the demo's Invoices table) lost what it counted on the way into the change, so Compare framed
the whole table, too wide to fit, from its top left, with the changed Status out of view on both sides. The rule is
one pure function, `framed` (`view.ts`): at actual size the view moves from the top left only as far as it takes for
all of it to be in with 24px of room around (in view already, nothing moves); where it doesn't fit, it's brought just
far enough out that it does, never further than `FARTHEST`, 0.6 of actual size, where an app's words stop reading;
past that, it opens on what changed, from its top left, and what was done is a drag away. A phone's sides are framed
by the same rule at their size. The sides are drawn once both readings and recordings are in, so they never open
anywhere else first, and they come in already framed: nothing glides. Whichever side is drawn first frames the window
for both (`seenThrough`, `view.ts`); from then on it follows nothing, playing too, and the wheel or a drag on either
brings both closer or moves both, onto the same part of the page, in the same frame, as close as the moment's own
picture goes and as far out as the whole screen in a side.

**Send and Done.** Send carries every note and reply you haven't sent on the change, from its row, its card or a
moment's page, in one send (`Send.tsx`); it never locks. Done, from the same places, sends Done (`done: true`): every moment as last handed back looks good, and
nothing more (a send saying Done with a note or a reply is refused). Whether a change is done is one rule, `saidDone`
(`packages/change/src/rules.ts`): the person's latest send, on the latest hand-back, says Done; a note or reply after it,
or a new hand-back, opens the change again. Where a change stands for you (waiting on you, with your agents, done) is one
rule beside it, `standingOf`, which every part of the page reads; the agent's `wait` ends by `saidDone`.

## Taking over

Take over (T) turns the recording into the real app at the moment it rests on, or where it has got to if it's playing, as
the moment's person (signed in where `setup.ts` has `signIn`), a fresh copy made the way every moment starts. Nothing runs before your first take-over on
a change: watching does nothing to the app, so the first is made while you wait. After it, Playthrough keeps the app
ready where the recording rests, so the next is quick. Each take-over is still the app made fresh, never one left behind. Until 20 Nov it was called Step in, on S,
which developers in a user test read as a debugger's step into, the next step, and which didn't say whose hands were on
the app; it had been Take over, on T, before. Everything Playthrough says now says take over, its code too, but for the
two fields notes already kept on disk have, `steppedIn` and `cantStepIn`.

**Where it stands is one count.** The page says how many of the things the moment shows are done where the recording
rests (`doneAt`, `packages/change/src/takings.ts`): none at its start, one after the first, nothing at all at its end or once
the last is done, or on a still; pressed while it plays, where it has got to. The run is handed over after that many
things done in the moment's step, its way there done whole before them (a file kept with its way inside its step counts
the way's too, `doneBefore`), or, with no count, once everything is done; never on a page with nothing loaded: a step
that starts on a blank page goes on to the first page it goes to (`reached`, `test.ts`). Done fewer things now than it
showed, it's handed over at its end.

**On the server** (`take-over.ts`, `following.ts`). The page POSTs `take-over` with the moment and its count, and asks
`ready-in` how long it should take: as long as the last run to that point took. The moment's file runs, in one headless
Chromium Playthrough keeps open while it runs, each run a window of its own with its own cookies and storage, to where
it's taken over, each thing it does waiting for the page to come to rest first, as when it was recorded (`acted`,
`test.ts`): done at once, Escape pressed on a Kan card still loading went back to a board that wasn't there, `/boards/undefined`.
That costs Kan's runs about 1.5 to 3.5 seconds more. What the way and the step did only in the page's memory (a
field typed into, a panel opened, a menu a right click opened, a key pressed with nothing focused, something pointed
at) is done again in your browser, as it was done, before it shows: pointing as a browser says a pointer came onto
something, `mouseenter` too, so a preview the page opens for it is open, and left what it was on before, so one pointed
away from is shut; a look only CSS `:hover` gives shows only where your own pointer is,
while what saved something or went to another address isn't done twice, and the page is scrolled where the recording
was. Each take-over has an address of its own, `/take-over/<moment>`, a name nobody could guess, on a pass-through at
http://localhost:5830/ that hands your browser the run's page (its address, cookies and what the app kept in the browser)
and passes everything else on to the app, answering only this machine's names. **It talks to the app as the run did:**
what the run's page was opened with on the way to the app (`use.ts`'s `onTheWay`, from the latest take-over on that copy
of the app) is added to every request and live connection it passes on, there and nowhere else: `use`'s headers over
the browser's own, as Playwright puts them (the recording had the run's), its user agent, and its sign-in for the
server where it's for the app's address and the request has none of its own. It's held in this process alone, never
handed to the browser, written down, logged or said in an error; a guest uses it as the person does, through the same
way through, and can't read it either, unless the app itself shows what it was sent. On 0.7.2 the pass-through
forwarded only the browser's own headers, so an app behind a routing header answered every take-over with its error
page (a real review). Into each page of the app it passes on,
it puts what tells the viewer where the pointer is, what's done and noted there and when it has settled, and rrweb's
recorder (`inApp`, `take-over.ts`); the package carries the same as `show/in-app.js`, for an app another page's source
opens by an address of its own to include itself. The source's answer to a take-over is that address
(`playthrough open`'s: the pass-through's, on the machine name the page was reached by). What a take-over makes is that take-over's:
held by the app's pages while they're open, Back included, and given back 15 s after the last one goes (tab closed,
reload, another moment), or a minute after it was made if never opened; so two tabs, a reload or another moment never
hand one person the app another is using. Every Take over asks afresh, so Take over again on the same moment is the app made
again, never the world left behind; an address opened again (by hand) runs afresh too, never a missing page. **Kept
ready** (`keepReady`): once a tab has taken over on a change (`kept.ts` remembers it for the tab's life), whenever the page
is somewhere Take over could be pressed, not playing, and has rested there 600 ms (so going through moments with the keys
doesn't start a run for each), it POSTs `keep-ready` with the place Take over would ask for there, once for each place, and
again once back from the app. The server makes one ahead for each change, the way any take-over is made, within its own
minute. A take-over to the same place, with the moments written as they were when it was made, takes it: it waits for it if
it's still on its way, within the take-over's own minute, and runs afresh if it failed; taken, it's that take-over's, as one
it ran itself. Asked for another place, the one before is stopped and given back; not taken within five minutes of last
being asked for, it's given back and lets go of the app, so the app's own time unused can start. A take-over called off
while it waits leaves the one ahead where it was. Nothing of it shows on the page: one that can't be made is the take-over's
to say why. **Every wait
ends in words.** A take-over has a minute from its asking, the app's start included ("The app hadn't answered … it may still
be starting", "This moment didn't open within 60 seconds…"), each page load on the way 30 s, and it stops as soon as the
asking request closes, though a setup already making its world finishes first, so what it made is given back whole. One
that can't happen says why twice, where it's known which reason it is (`CantTakeOver`, `cantTakeOver` in `following.ts`): a
line for the person (`plainly`) and the whole of it for the agent (`problems`). A moment's file, or `setup.ts`, that
can't be loaded: "This moment's steps couldn't be loaded." (the agent: the file, and Node's words); `app.json` amiss or
the app not answering within the minute: "The app didn't start." (the agent: what it said, and `app.log`); a moment that
stops on the way: Playthrough's own words for where, "On the way here, no link “Settings” was there to click." (the
agent: the step and why, in the same words as `again`), or, where it has none (`whyStopped`'s `asSaid`), "Something went
wrong getting there."; over the minute: "It took more than a minute getting there."; a moment gone from the change, or
not among the last handed back: "This moment has changed since it was handed back."; anything else: "Something went
wrong getting there." One whose check of how it ends doesn't hold on the code as it is now opens where it got to, with
that said (`checked`); a page of a take-over from before the page's server restarted says so in the frame, and Escape. A
page in the frame that never says it has loaded settles after ten seconds.

**One app per copy** (`app.ts`), shared by the person taking over, the agent's browser and every moment run, each in a
world of its own, as the app always runs the working copy as it is now. Whoever wants it first starts it, on its own,
its output in `.playthrough/app.log`, and writes `.playthrough/running.json`; everyone using it writes
`.playthrough/using/<pid>`; two wanting it at once, one starts it and the other waits for it to answer (three minutes at
most, then it says so, pointing at `app.log`). Nobody stops it under anyone: once nobody is using it, it's stopped at
once, or with `playthrough open` running, which keeps every copy's app, once it's gone fifteen minutes unused; closing
`open` stops those nobody is using.

Whether the copy's app is running already is the copy's folder's to say, not an address's (`repo.ts`, `servingHere`):
what's serving from that folder runs the work as it is now, as the app's own command would, so it's this copy's app,
whoever started it and however; and another copy's runs from another folder, which is how a worktree's is told from
the main one's, even inside it. Before starting it, Playthrough looks at what's listening on the machine as you, and
the folder each runs from (`serving.ts`: `lsof` and `ps` on macOS, `/proc` on Linux): something from this folder at
`app.json`'s address is the app; elsewhere, it is where it's the one thing from the folder serving pages (a page or a
redirect at `/`), so an API beside it isn't taken for it; Playthrough's own page and a browser opened for debugging
never are. Found, the app is used at its address, by every command and take-over, and never stopped: Playthrough stops
only the app it started. Where it was found is kept in `running.json` too, marked `found`, with no `app`, which is
what Playthrough stops, and with the process serving it: kept while that same process runs (its number, the machine's
start and when it started, asked as a command's is: `startOf`, `command.ts`) and still answers there, so the machine is looked over only when nothing is kept
(once for a whole run on a found app; twice where Playthrough starts it, by `as` and the browser it starts behind it),
and a server from another folder that later takes the port, a process of its own, never passes for it. The page asking
every second while the app starts reads only the file. Found app stopped while the agent's browser is open on it, the
next app is somewhere else, and `moment` says so and refuses, as what's in the browser is on an app that's gone:
`playthrough as` again opens it where the app is now. A real run on 0.7.2, knowing the app by its address, started a second dev server on the
copy's own port beside the one already running from the folder; the framework refused it, and the agent had to stop
the first. Windows says which process listens where but not the folder it runs from, so there nothing is found this
way: what answers at `app.json`'s address is used in the main folder and refused in a worktree, as before, and with
`{port}` the app is started on the copy's own port. Where the app
doesn't start, what it said last is said, without a terminal's colours, then what to do: where nothing can say which
folder a running app is from, that if it's already running whoever started it stops it; where several things serve
pages from the folder, which ones, as Playthrough can't tell which is the app; otherwise to check `app.json`.

**In your browser** (`takeOver.ts`, `Portal.tsx`). While it's getting there, a line inside Take over fills as it goes, at
the pace of the last run where that's known, the picture's edge breathes and the recording's pointer waits. Where the
app isn't running (stopped after fifteen minutes unused, say), `ready-in` says so, and over the bar it says "Starting
the app, which can take a minute.", the line inside Take over not filling, as the last run's pace says nothing of a
start. `ready-in` is asked again every second until the app answers, when the server goes on to redo the way there;
then the note's words swap, in the same place and size, to "Getting to this moment." until it's there (both lines are
drawn one over the other, so neither moves the note; a quick cross-fade, none with reduced motion). Unanswered, the
first line stays. No countdown. **What can't come along** is said as soon as Take over is pressed, from `ready-in`'s
answer (`unlikeAt`, `following.ts`), over the bar in amber, until you're back: "Your browser can't be as the
recording's was, which was told where it is and was allowed notifications, so the app may not be as it was there.",
each of the browser's own options named in what it did, never what it was set to; nothing where it's as any browser
is. It takes the place of the starting line, and in the app sits before a check that doesn't hold. Escape, or
going to another moment, calls it off: the request ends, which stops the run, and a page of the app already opening
unseen goes with it; the bar is at rest at once. The page waits 70 s for the answer (the server always gives one within a
minute: past that, "Playthrough stopped answering.") and 30 s for the app's page to settle ("The app's page didn't
finish loading."); Playthrough no longer running is "Playthrough isn't running any more." **Can't take over here.**
Whatever stopped it, it's said just over the bar, beside Take over (under it, at a desktop size, it was off the screen; on
a phone, under the bar), as a small sheet drawn as the note card is (`MomentBar.tsx`, `CantTakeOver`): "Can't take over
here", the reason's line under it, quiet, and one button, Tell the agent, filled. Its line has room for two lines, so
it's the same size for any reason; it stays, playing too, until Escape, a press anywhere else, or Take over again, which
is trying again. Until 18 Nov it was an amber box with the file's path and Node's words, telling the person to write a
note themselves ("This state is no bueno… give the user an easy thing to do"). Tell the agent saves a note on the
moment, at where Take over was pressed, as the person's own, exactly as one they wrote (not sent: it waits with their
other notes, Send counts it, and it lands on the Notes edge as any does): "Take over doesn't work on this moment.", with
the whole reason kept on it for the agent as `cantStepIn` (kept under its old name, as files on disk have it), never shown to the person; they can open it and add words.
With such a note on the moment not yet sent, the sheet says "Noted. It goes with your next Send." in the button's
place, at its size, and makes no second note. In the app, a check at the end that doesn't hold now is said just over
the bar, in amber, and so is a note made there that couldn't be kept.

**The app takes the page.** From Take over, while "Taking over…" shows and the app is yours, the Moments and Notes edges,
what this is over the recording and Download video and Share go where they stand, and the recording grows into their
room: one move, 600 ms on a curve that sets off gently and lands softly (`STEPS_OUT` and `STEPPING_OUT`), slow enough to
follow the recording growing and the sides going, the very one that takes the picture out to the whole screen, the fades
on it too. The recording is over the edges while the app is yours, so it grows over them as they go, never under
them. Back is the same move, what the recording grew over (the edges and what's over it) coming back in its last 40%,
once the recording's edge has passed (`STEPPING_BACK`); at once with reduced motion. The recording stands on its foot where it was, so the bar across it
doesn't move by a pixel, and the bar stays where it was dropped, if it was (`clear`, `Moment.tsx`). It grows as large as
the page lets it be, 24px from the screen's sides, where the header's words stand, and 12px under the header, and never
larger than the app's own size, so the app is drawn as large as fits and never past actual size; its window is the
moment's own, so its layout is the moment's. Already that large, it doesn't grow: the rest just goes. The rule is CSS on
two boxes (`inItsRoom` and `inTheAppsRoom`, `Moment.tsx`): the recording's place, which the edges and what this is stand
by and which never moves, and the recording, which fills its place, or while the app is yours stands on its foot at the
width the rule gives; the recording's picture, its pins and the app are drawn at each size in the frame it's laid out in
(`flushSync` from their resize observers), so nothing is a frame behind its edges. The pointer that stands in for the
recording's while the app is on its way and yours, and the circle the app opens and closes through, are drawn over the
app in its own pixels and scaled as it is (`Portal.tsx`), so through the move they stay on what they point at, both
ways (until 20 Nov they were placed in the picture's pixels as they were when Take over or Back was pressed, and the
pointer slid some 45px off its spot as the picture grew, then jumped back once the recording drew its own). Back, Escape twice, a take-over called
off or one that can't happen, all of it comes back in one move, the way in reversed, from wherever it has got to; after
it, every box on the page is where it was. Coming back, what this is over the recording waits for the recording's edge
to pass under it, fading in over the move's second half (until 20 Nov it came in with the move, and the edge ran
across its second line as it did). It goes on the press, not on the app's arrival: that keeps it one move with
the picture going whole, and calling off, a press of its own, is answered by the way back. The menu at the top left
stays, as it opens what's waiting over the app; who you are is the pointer's to say; a note made there is pinned in the app,
and its card is on the Notes edge once you're back. On a phone, with no edges beside it, nothing of this changes.

The app opens in the recording's place, at its size. With your pointer on the app, the recording's comes to yours
wherever yours has gone, and gives way to it. Anywhere else (on the bar, which hangs across the picture's foot, off the
picture, out of the window, not yet moved, or a touch screen), the recording's pointer fades where it stands as the app
opens from it, and yours is simply yours as it comes into the app: it's the app, not the box it's in, that counts, as
the topmost thing under your pointer (until 20 Nov the box counted, so with the pointer on Take over's upper half the
agent's pointer came to it, and on its lower half it stayed on the app until you moved). Coming back, your pointer, if
it's in the app, goes back to where the recording has it; if not, the recording's fades in there. **The pointer's tag
says the change of hands.** As the agent's pointer becomes yours, its tag rolls in place, upward, nothing moving
sideways, from "Your agent" to "You", one line at the same small size, in the amber the app's edge has while it's yours
with dark words, over the same 420 ms (`HANDING`, `Portal.tsx`); taken over at rest, where the pointer wears nothing,
"Your agent" comes in on it as it starts to roll, so "You" never simply pops. With your pointer on the app it goes with it; anywhere
else, or on a touch screen, it rolls where the agent's pointer stood, and goes with yours once yours comes in. It stays
a second once the app is yours, then fades, or goes at once at your first click or key in the app (the app tells the
page `key`, once a press). Coming back, the agent's pointer returns bare, as it is at rest. The tag is drawn once, by the pointer that wears it: the one standing in for the recording's takes its
place in the very frame the recording's goes, both ways, so the two are one tag (`worn`: taken over as it fades in or
out with playing, it carries on from as much of it as was seen). With reduced motion it doesn't roll: the words are
simply yours. While the app is yours, Play and its arrows rest greyed in their place, as Compare does, so Back and Note
never move. Back's key reads Esc ×2: one keycap and its count in the keycap's own small, quiet letters (two
keycaps side by side read as a bug, the user said), heard as "Back, Escape twice". Back, the keyboard comes back to the page, and the app kept ready underneath
is inert until it's yours again, so Tab never walks an app nobody can see. A single Escape is the app's, whatever the app does with it, or nothing,
and Playthrough does nothing with it; Escape twice, the second within half a second of the first, is Back, and the app
never hears that second press (`escapedTwice`, `twice.ts` in `@playthrough/page`, the same rule in the app and on
Playthrough's page around it). A first press that counts lights Back's Esc key in the pill's amber (×2 stays as it is), fading out
over exactly the half second in which a second would take you back (the app tells the page with `escaped once`); with
reduced motion it's lit, then unlit. Nothing in the bar changes size. A key held down is one press; with Note on,
Escape is Playthrough's and turns it off, without counting as a first press, and lights nothing. A link out of it opens in a tab of your own. The app is drawn with
`will-change: transform`, so its words keep their spaces, and the clipboard is the page's, on the way there and in your
browser. In a moment recorded on a phone's screen, a mouse drag is a swipe. Note works there as on the recording: what a
click would note is outlined, a thing the page's reading counts, named as it does (`notedAt`), and over anything else,
as blank space or an empty cell, nothing, as the click notes the spot (until 20 Nov any part of the page was outlined,
so a note on an empty cell promised the cell and landed on a spot). What you did in the app is
recorded from when it was handed to you (or from the note, made before the recording's pointer had come to yours) and kept with the change (`branches/`, with the fonts, pictures and stylesheets
its pages named, `keepNamed`), and the note is on that recording, at its end. Saved there, its pin stands on its thing
in the app at once, drawn as on the recording, a note's amber dot just out from the thing's top right corner (until 20
Nov an 18px amber disc with its number, which a dot isn't); it follows its thing as the app redraws it, goes while it's
gone. One on a spot stands on the spot, held by what's under it on the page, so it scrolls and moves with that and goes
while it's gone (until 20 Nov it stayed where it was in the frame as the page scrolled under it). The pins and the outline that shows what you're pointing at are drawn in a layer of their own (`playthrough-marks`, `take-over.ts`). An
app that zooms its whole page (`html { zoom }`, as the site's demo app does at 1.28) has both undone, as they're placed
where the page says its things are, already zoomed: until 20 Nov the outline and the pin stood that much further from
the page's top left corner than their thing, the pin off it altogether, so a note saved in the app ended with nothing
on screen where you'd acted.

## The page for the whole machine

`playthrough open` (`open.ts`) serves one page for the whole machine at http://localhost:5790/ (or the next free port;
`PLAYTHROUGH_PORT` for another, as a check beside the one in use takes), and run again while it's open, says its address
rather than opening another, as `open.json` says it. It's started behind the command as `as`'s browser is
(`startBehind`, `behind.ts`), its output in `~/.playthrough/open.log`: the command prints its address and returns, and
the page stays open until `playthrough close`, which stops it as Ctrl+C does (what its take-overs made given back, the
apps it kept that nobody is using stopped) and says so, or that it wasn't open. A page killed hard leaves `open.json`
behind, which is taken for open only while the process that wrote it is still at it (`stillAt`, `command.ts`: its
number, on this start of the machine, started when it was, and not ended), so neither command takes another process
that has its number since for the page, nor one ended and never reaped. When it started is read from `/proc` on Linux
and from `ps` on macOS, to the second; Windows doesn't say it without starting PowerShell, so there a process with the
page's number is taken for it. A page 0.7.1 left open wrote no port, so it
can't be said where it is: `open` closes it, saying so, and opens in its place; `close` closes it without an address. From a real run on 0.7.1: an agent ran
`open` in its shell with a time limit, and the page went with it. It lists every change in every copy of
every app a `playthrough` command has run in (`machine.ts`: `~/.playthrough/apps.json`, or `PLAYTHROUGH_HOME`, and an
app gone from disk drops out), each read from the copy it's kept in; where two copies share an app's name, each says
which copy it's in. It arrives again whenever any copy's folder changes, and every two seconds besides, so a change handed
back from anywhere shows by itself, and whether an agent is listening is read from the files each time, so one
restarted reads exactly what's on disk. It serves the page to this machine alone, and answers only the page itself: asked
by any name but localhost's, as a site that has made its own name lead here (DNS rebinding) would ask, or sent something
from another site's page, it refuses, as what's sent there reaches the agent in the person's name.

## Sharing a change

**Share** (`Share.tsx`), top right of a moment's page, gives a change to someone else by a link straight to this
computer. Pressed, a card opens under it, closed by Escape or a press elsewhere. It says what sharing does, in words that
stay put through every state: "Anyone with the link can watch this change, leave notes, and take over to use your app as
its moments do. It runs on this computer, for as long as it's on." Under them one step: Start sharing; while it starts,
the button says "Getting a link…" at its size, with "This takes a few seconds." beside it (about 5 s); then the link, in
a field that selects whole, Copy (Copied, with a tick, for 1.4 s, in its place) and, top right of the card, Stop
sharing. Failed, the words say why and what to do ("Sharing needs cloudflared, which isn't on this computer. Install it
with brew install cloudflared, or from Cloudflare's site, then try again."), and the button is Try again. The button
always says "Share", with a small light before it: gray and still while nothing is shared, through "Getting a link…"
and after a failure; green, with a faint ring of its own green slowly coming and going (`live`, 3.2 s, `style.css`),
while the link works; green and still under reduced motion. Only the light changes, so nothing moves. It's kept from
being taken for a note's dot, which means a note and nothing else: 6px, no white ring, and green, which no note ever
is (theirs are 7px, amber or slate, ringed in white); the green meets 3:1 on the page in light (3.8) and dark (8.6), and
the ring never dims it. In the app it goes, or on a phone rests, as Download video does. The page asks where it
stands as it opens, every 600 ms while starting and every 5 s while on, as a tunnel can end.

**Underneath** (`share.ts`): `playthrough open` (`POST`, `GET`, `DELETE` on `/api/changes/<address>/share`, answered
only at localhost, as everything there is) opens a door of its own for the change, a listener on 127.0.0.1 at a free
port, and runs `cloudflared tunnel --url` to it, the binary the shell finds, no account: a quick tunnel, a new
`https://….trycloudflare.com` each time. Stopped, or `open` ending however it ends, the tunnel and the door go. The
link is `<tunnel>/.playthrough/shared/<token>/`, the token 18 random bytes. **A guest is told from the person by the
door they came through,** never by anything in their request, and the door answers an allowlist and nothing else, the
same 404 for what's there and what isn't: under the link's folder, the page's own files (its `index.html` asking for
them from there, `serve`), and of the one change (`ASKS`): its list of one, its hand-backs' files, and `seen`, `sends`,
`take-over`, `ready-in`, `keep-ready`, `branches`, `frames` and `stills`, each answered by the same code as the person's
(`answerOn`, `open.ts`), the change found by its whole address alone (`only`), so a guest's request never reads another
change nor the machine's list of them. Never another change, who the person is, or sharing itself. What a guest may send
is one rule (`sends`, `share.ts`): notes and replies in a name of their own, never the person's ("Ludwig is the name of
the person who shared this. Say yours.") and never Done, which is the person's alone ("Done is for the person who
shared this to say. Send your notes instead.").
**A guest supplies only what they said and what they pointed at.** Each route reads the fields it names and nothing
else, each its kind (`Asked`, `model.ts`); the change is always the link's. Of a send, a guest gives its id, their name,
notes and replies; when it came, on which hand-back, and that it's a guest's are Playthrough's to say, so a guest can't
date a send to hide the person's Done. An id is what `newId` makes, for everyone: a letter, then lowercase letters and
digits, 8 to 24 in all (`ID`), so it's never an option, a sentence, a case-twin on a disk that doesn't tell case apart,
or too long for a file's name; it's checked on what's sent, and ids kept by an earlier Playthrough still read and can
be referred to. A command's word where it takes an id is that id, never an option (`playthrough.ts`). A guest's
recording is named as their page names it (`SHARED_RECORDING`). One send holds 50 notes and 50 replies at most, a note
made in the app 500 things done, and no more than 200 of a link's notes wait for the agent at once, each reserving
room in the link's count for the picture `wait` draws of it (`says`, `share.ts`). Anything that goes wrong for a
guest that isn't one of Playthrough's own refusals is one line, the same every time (`WENT_WRONG`, `open.ts`), and a
clean line of it is written to open.log; Take over's own pages say a fixed line too. A guest's still is theirs, under
`stills/shared/`. A name is never a key every object has ("__proto__"), and what's seen is read by its own keys.
That a send is a guest's is the door's to say (`guest: true`, kept with the send), never the send's own. **Every string
Playthrough keeps is one of two kinds** (`model.ts`), whoever writes it: a line (a name, a role, what was done, an
address, a reason in a line: one line, nothing unseen, every break a space, 1000 characters at most) or words (what
someone wrote: its lines kept, nothing unseen, 20000 at most), and the store keeps each as its kind keeps it
(`keptAs`, `store.ts`). **`wait` never puts a guest's string in a line of its own:** what Playthrough says of a guest's
note comes from the change (its id, its moment by the moment's own name, as whom, the picture, how to be there), and
everything of the guest's, their name, what their note is on, what they did in the app, where it was, why Take over
didn't work and their words, is printed by one function (`aGuests`, `wait.ts`) under "A guest, as they sent it:", each
line after "> ". `answer` and `again` say a guest's note is on "the thing they pointed at". A name, anyone's,
is one line of 60 characters at most (`problemsWithName`, `rules.ts`); a guest's is never the person's, an agent's in the
change or a well-known one's, "You" or "Playthrough", compared once folded (spaces, case, Unicode's look-alike forms:
`sameName`), and the page asks the link before it keeps one (`name`), saying under the field why one can't be theirs.
Words are 4000 characters at most, kept less what a keyboard doesn't type (`asWritten`, in `Changes.send`). The agent's
`wait` says a guest is one as a fact, after who said them ("Noor is a guest, who came by a shared link and isn't the
person who asked for this change.") and quotes their words line by line after "> " under "Noor, a guest:", so nothing
in them stands as a line of the person's or Playthrough's; every page shows a guest's name as "Noor (guest)" (`whose`).
What's sent to the door comes from the link's own page (its Origin is the address it was asked at), everything it
serves says `Referrer-Policy: no-referrer`, as the token is in the path, and a link asks no more than anyone reviewing
does (`allowance`, `share.ts`: so many of each a minute, two take-overs at once, 256 MB kept in all), refused in words.
Any body is 64 MB at most (`body`, `open.ts`), and what a guest's request writes, all of it (their sends, recordings,
the files kept with them, the pictures drawn), is counted as it's written (`countedFor`, `open.ts`). cloudflared is
given only `PATH` and `HOME`. **A kept file is never a document**, for anyone: it's kept only as one of the kinds
Playthrough keeps (`KEPT`, `rules.ts`: JSON, pictures, stylesheets, fonts; a recording is `.json`), served as that
kind and anything else on disk as bytes (`servedAs`), always with `nosniff` and a policy that leaves it inert if it's
opened by itself (`default-src 'none'; sandbox`); a guest's note pictures are drawn apart, under `frames/shared/`.

**What this machine fetches** for a recording is never an address found in it: what you or a guest did in the app is
kept with the fonts, pictures and stylesheets it names asked of the app alone, at its own address, by the path they were
named at, never following a redirect (`keepNamed`, `assets.ts`), with what `use` adds on the way to the app as stepping
in sends it (`onTheWayTo`, `take-over.ts`), so an app that answers only with it still gives them; one from elsewhere (a font service) isn't kept, and the
viewer's browser asks for it there. **The browser that draws a note's picture or a fine still** (for the person's page
or a guest's, the same rule) asks for nothing but the viewer's own page and its files and the files kept with that one
change, by path, and only reads them (`mayDraw`, `frames.ts`): never the list of changes, another change, who the
person is or sharing, nothing elsewhere, no live connection, no service worker; anything else is refused. A recording
someone made can name any of those, and the picture of it goes back to whoever asked. What a guest does in the app is
kept under `branches/shared/` and only there, never in place of another recording (`branch`, `open.ts`; `SHARED`).
Played in someone's own browser, a recording, a guest's included, asks that browser for what it names: what was kept
with it comes from Playthrough, and anything else from where it's named. Until 20 Nov the viewer put a policy on the
frame it plays in to stop that for a guest's recordings, but rrweb builds the page, and its pictures start loading,
before such a policy can take hold, so it held nothing and was taken out.

**Taking over, a guest** gets the owner's real app, run on this computer with the moment's setup, as the person does,
talked to as the run did (what `use` adds, a routing header or the server's sign-in, is added here, never sent to them):
the app and the guest's page are one address, the tunnel's, so the app's cookies, its sign-in among them, go with its
pages in the guest's browser (between two addresses, a frame's cookies wouldn't). Everything at the door outside the
link's folder is the app's, passed to Playthrough's way through to it (`take-over.ts`) as if asked at localhost, by its
name and from its address: `/take-over/<name>` and `/.playthrough/held/<name>` only for take-overs made at this link, and
the rest of the app only for a browser carrying the cookie the first of those left it (`playthrough-shared`, the token,
HttpOnly, never passed on to the app). What a guest can do there is what the app lets that person do: it is the app,
on this computer. A guest and the person taking over at once each have their own app, in their own browsers; one kept
ready per change, so they take turns at the quick one.

**The guest's page** is the viewer shown by another page (`guest`, `server.ts`; `main.tsx` knows it by the link's
folder): the change on its own, no header, its opening card first (their `/` is always the change shared, waiting on
them or not), the tab titled with the change. A tunnel holds a
stream back until it ends, so the change is asked for every two seconds instead (`listen`). Who a guest is: nobody
(`""`) until, the first time they say anything (a note's or a reply's Save, or Tell the agent where Take over couldn't
open the app), they're asked where they are, under what they said: "Your name, so they know who said it". Every way of
saying something goes through the one ask (`useSaying`, `Naming.tsx`), so no send of theirs lacks a name; it's kept in
their browser (`playthrough:name`) and told to the whole page (`nameYou`, `api.ts`). From then on their sends are in that name: the agent's `wait` says "Sam said:" and "Sam: …", and every
note on the change, anyone's, is on its Notes edge, someone else's saying whose before where it stands ("Sam · sent",
`noteSays`), and in its thread, by name.

**What a guest is told** is what they can use (`isGuest`, `api.ts`, the one rule: a source that asks your name). Done
is never offered: the step left is Send while something's unsent, and with nothing, "No notes yet" in the box, resting.
Sent, it's "✓ Sent", never whether one is listening nor what to tell one, which are the
person's to act on. When nothing at the link answers (sharing
stopped, `playthrough open` ended, the computer off), a send says "The person who shared this has stopped sharing, or
their computer is off. Ask them for a new link." and Take over "Sharing has stopped here. Ask for a new link." (`gone`,
`server.ts`), where the person is told to start `playthrough open` again. The frame's own words when the app doesn't
answer name no address of this machine's.

## What's kept where

Committed with the app: `playthrough/app.json` and `playthrough/setup.ts`. Out of git, in the app's copy,
`.playthrough/` (its own `.gitignore` says `*`, and a `README.md` tells an agent who looks there not to read or change the
files but to run `npx playthrough`, as on 15 Nov one told to pick up the notes "in Playthrough" read the note's file and
did it with nobody told): `working-on.json` (the change its commands mean), `port.json` (the app's port),
`browser.json` (what `as` did; `browser-marked.json`, where the last moment was marked in it; `browser-asked.json`, the moment last asked what came of it; `browser.log`, what its browser said), `running.json`, `using/`
and `app.log` (the app), `borrowed/` (worlds not yet given back), and a folder per change: `change.json` (its title, what
was asked, when it started, and the format it's kept in), `moments/<words>.ts` (each moment's way there, then its step),
`hand-backs/<n>/` (each hand-back: `hand-back.json` with its moments and replies, `files/` with their recordings, readings and pictures, `since/<k>.json`
compared with hand-back k), `sends/<id>.json` (what the person sent, never written again but once, to bring it to a newer format), `taken.json` (what the agent
has taken of it), `seen.json` (what each person has opened), `branches/` (what the person did in the app, and notes'
frames), `waiting/<pid>` (an agent listening), `working.json` (the agent the notes were last said to). On the machine: `~/.playthrough/apps.json`, `open.json` (the page
running, and its port) and `open.log` (what it said).

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

`npm run build` builds the page and the viewer for another page to show, then the package in `packages/cli/release` (`packages/cli/build.ts`): Node runs
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
