// The viewer is one page, built into the command's viewer/ for `playthrough open` to serve, in a checkout as in the
// package published. While working on it, `npm run dev` serves it with instant reloads and passes the reviews through
// from a `playthrough open` running beside it.

import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwind()],
  build: { outDir: "../cli/viewer", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:5790" } },
});
