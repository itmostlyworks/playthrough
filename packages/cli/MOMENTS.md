Playthrough: a person reviews your work on a web app by looking at moments of it: someone, at the point that matters,
a few seconds of the app getting there. You mark them while you check your own work. Read this once.

  playthrough as <person>                 a browser on the app, signed in as one of the app's people, run in the background
  playthrough moment "<words>" ["<what>"] here: keep where you are, and the way here, as a moment

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
   person sees the moment closed in on it, and what it says, and whether it can be changed, is checked again.
   Playthrough runs the way there again from a fresh start, records it, and keeps it only if it lands where you are.
   If it doesn't, it says what differed and keeps nothing: read why, fix it, and mark it again.
4. A few moments per change: one for each person or situation the change treats differently (an admin and a member;
   what's accepted and what's refused). Run playthrough as again for each: the same browser starts again, fresh.
5. Then tell the person their moments are ready, one line each, in your words: only moments that were kept. Stop
   playthrough as.
