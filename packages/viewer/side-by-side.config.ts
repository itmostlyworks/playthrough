// Not kept: serves this branch's built viewer beside the moments one, asking the `playthrough open` that's already
// running for the review, so both look at the same review and its notes.
import { defineConfig } from "vite";

const backend = `http://localhost:${process.env.BACKEND}`;

export default defineConfig({
  build: { outDir: "../cli/viewer" },
  preview: {
    port: Number(process.env.PORT),
    strictPort: true,
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
        configure: (proxy) => proxy.on("proxyReq", (request) => request.getHeader("origin") && request.setHeader("origin", backend)),
      },
    },
  },
});
