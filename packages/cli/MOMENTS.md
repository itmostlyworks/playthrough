Playthrough: a person reviews your work on a web app by looking at moments of it: someone, at the point that matters,
a few seconds of the app getting there. You mark them while you check your own work. Read this once.

  playthrough as <person> ["<moment>"]    a browser on the app, signed in as one of the app's people, run in the background;
                                          named, taken to that moment the way it got there
  playthrough moment "<words>" ["<what>"] here: keep where you are, and the way here, as a moment
  playthrough wait                        hand back, and wait for the person's notes, run in the background
  playthrough again                       run every moment again on the code as it is now: the same, or what's different
  playthrough reply <note> "<words>"      answer a note, in a line

1. Change the app as asked.
2. Check it as someone would use it: run playthrough as <person> in the background (the people are named in
   playthrough/setup.ts; it prints what they start with). Drive that browser with your own tool, attached to it, not
   a browser of your own:
     agent-browser --cdp 9333 <command>
     Playwright MCP: --cdp-endpoint http://localhost:9333
     a script: chromium.connectOverCDP("http://localhost:9333"), then the page already open there
   Click and type as a person would. Going to an address directly is fine.
3. When you're looking at what was asked for, say so: playthrough moment "<what's there>", in under eight words
   ("Cards now say WEB-1 to WEB-5", "The prefix shows but can't be changed"). The person sees who it is and where from
   the moment itself: don't say it again. Add, as the page names it, the one thing it's about ("Card prefix"): the
   person sees the moment closed in on it, and what it says, and whether it can be changed, is checked again. Name the
   smallest thing that shows it: a card, not the board it's on ("WEB-1 Write the launch post").
   Playthrough runs the way there again from a fresh start, records it, and keeps it only if it lands where you are.
   If it doesn't, it says what differed and keeps nothing: read why, fix it, and mark it again.
4. A few moments per change: one for each person or situation the change treats differently (an admin and a member;
   what's accepted and what's refused). Run playthrough as again for each: the same browser starts again, fresh.
5. Then tell the person their moments are ready, one line each, in your words: only moments that were kept. Stop
   playthrough as, and run playthrough wait in the background: it tells you when the person has said something.

When the person sends notes, wait prints each one on its moment, with a picture and how to stand where they stood
(playthrough as <person> "<moment>"). Then:
6. Change the app.
7. playthrough again: every moment runs again on the code as it is now, and each is the same, different (what), or
   couldn't get there. Get to one that couldn't by hand (playthrough as <person> "<moment>" goes as far as it can) and
   mark it again with the same words. A moment nobody spoke on that's now different is worth a look too.
8. playthrough reply <note> "<what you did, in a line>" for each note.
9. playthrough wait, in the background, again: it hands back, and tells you when the person answers.
