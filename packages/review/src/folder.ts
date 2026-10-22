// Reviews kept in a folder on this machine, one folder per review.

import { watch as watchFiles } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Storage } from "./store.ts";

// File watching misses changes in some containers and cloud machines, so a slow look backs it up.
const LOOK_EVERY = 2000;

export function folder(root: string): Storage {
  return {
    async read(path) {
      try {
        return new Uint8Array(await readFile(join(root, path)));
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },
    async write(path, bytes) {
      const file = join(root, path);
      const unfinished = `${file}.${process.pid}.${Date.now()}.writing`;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(unfinished, bytes);
      await rename(unfinished, file);
    },
    async list(path) {
      try {
        return (await readdir(join(root, path))).filter((name) => !name.endsWith(".writing"));
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
    },
    watch(path, changed) {
      const look = setInterval(changed, LOOK_EVERY);
      let watcher: ReturnType<typeof watchFiles> | undefined;
      try {
        watcher = watchFiles(join(root, path), { recursive: true }, changed);
        watcher.on("error", () => watcher?.close());
      } catch {
        // the folder isn't there yet: the slow look still notices when it is
      }
      return () => {
        clearInterval(look);
        watcher?.close();
      };
    },
  };
}

const isMissing = (error: unknown) => (error as { code?: string }).code === "ENOENT";
