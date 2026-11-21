// The viewer is one page, built into the command's viewer/ for `playthrough open` to serve, in a checkout as in the
// package published. While working on it, `npm run dev` serves it with instant reloads and passes the changes through
// from a `playthrough open` running beside it. Built `--mode show`, it's the viewer for another page to show
// (src/show.tsx), into the command's show/: one module and its styles, with everything it needs inside.

import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwind()],
  build:
    mode === "show"
      ? { outDir: "../cli/show", emptyOutDir: true, copyPublicDir: false, lib: { entry: "src/show.tsx", formats: ["es"], fileName: () => "viewer.js", cssFileName: "viewer" }, rolldownOptions: { output: { minify: true } } }
      : { outDir: "../cli/viewer", emptyOutDir: true },
  // As the page's own build does, the libraries' asking after Node's process is answered for a browser.
  define: mode === "show" ? { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" } : {},
  // Asked for by the page's own address, as Playthrough only answers its own page: the shorthand would say it's asked at
  // the page's port, and every send would be refused.
  server: { proxy: { "/api": { target: "http://localhost:5790" } } },
}));
