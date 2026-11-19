// What you're watching as a video: a moment as it's shown, alone or beside how it was as Compare shows it, or the whole
// change, its moments in order. The viewer plays it in a browser of its own (`?video=`, Video.tsx), the app edge to edge
// as it was recorded, each moment's name in a small pill as it starts and Playthrough's in another at the close, and what
// it shows is filmed as it plays and made into an MP4 as it's filmed, by that browser's own H.264: nothing more to
// install.

import { chromium, type Page } from "@playwright/test";
import { recordedDark, shapeAt } from "./frames.ts";
import { mp4 } from "./mp4.ts";
import type { Repo } from "./repo.ts";

// What the page asks for: which moments of a hand-back, by their place from 1; and beside one, how it was on an earlier
// hand-back, opening framed on what changed. The video is always the whole app, light or dark as it was recorded, so
// where the person took the window and how their page is aren't asked.
export type Asked = {
  handBack: number;
  moments: number[];
  beside?: { handBack: number; framedOn: { changed: Box[]; done: Box[] } };
};
type Box = { left: number; top: number; width: number; height: number };
type Size = { width: number; height: number };

// As smooth as a screen shows it: "the point of playthrough is that we more accurately simulate what it feels in real
// life".
const FPS = 60;
// As wide as most places that show a video play it, and no taller than a phone's video is.
const WIDEST = 1920;
const TALLEST = 1920;
// Chromium films a page at the size of its screen, never its pixels, so the page draws itself at the size the video is,
// never more than twice its own. Drawn no larger than that, it keeps up with every frame as it plays.
const LARGEST = 2;
// The line between Compare's two sides, as the page draws it (Video.tsx).
const BETWEEN = 2;
// About how long a frame takes to go into the video here, for what's waiting to go in.
const PER_FRAME = 0.009;

// The video, as the largest screen any of its moments was recorded on, light or dark as the first was, saying as it's
// made how many seconds it has left, as best it knows by then.
export async function videoOf(repo: Repo, id: string, address: string, asked: Asked, port: number, onLeft: (seconds: number) => void): Promise<Uint8Array> {
  const change = await repo.changes.get(id);
  const momentsOf = (number: number) => change.handBacks.find((one) => one.number === number)?.moments ?? [];
  const filmed = asked.moments.map((n) => momentsOf(asked.handBack)[n - 1]);
  if (!filmed.length || filmed.some((moment) => !moment)) throw new Error(`Hand-back ${asked.handBack} of ${id} has no moments ${asked.moments.join(", ")}.`);
  const screens = await Promise.all(filmed.map((moment) => shapeAt(repo, id, { handBack: asked.handBack, recording: moment!.recording, at: moment!.length })));
  const shape = { width: Math.max(...screens.map((one) => one.width)), height: Math.max(...screens.map((one) => one.height)) };
  const dark = await recordedDark(repo, id, { handBack: asked.handBack, recording: filmed[0]!.recording });
  const { handBack, moments, beside } = asked;
  return film(port, address, { handBack, moments, beside }, sizeOf(shape, !!beside), dark, onLeft);
}

// How large a video of a screen this shape is, and how much larger than the screen it's drawn: as large as fits the
// widest and tallest a video is played, never more than twice, its sides even, as H.264 asks. Compared, it's two such
// screens side by side, a line between them, each filled by its app.
export function sizeOf(screen: Size, compared = false): Size & { larger: number } {
  const shape = compared ? { width: 2 * screen.width + BETWEEN, height: screen.height } : screen;
  const larger = Math.min(WIDEST / shape.width, TALLEST / shape.height, LARGEST);
  const even = (value: number) => 2 * Math.round(value / 2);
  return { width: even(larger * shape.width), height: even(larger * shape.height), larger };
}

async function film(port: number, address: string, shown: Asked, { larger, ...viewport }: Size & { larger: number }, dark: boolean, onLeft: (seconds: number) => void): Promise<Uint8Array> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, colorScheme: dark ? "dark" : "light" });
    await page.goto(`http://localhost:${port}/?video=${encodeURIComponent(JSON.stringify({ change: address, ...shown, larger }))}`);
    await page.waitForFunction(() => !!window.video, undefined, { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    // What the page's own images take to come in, once it's drawn.
    await page.waitForTimeout(600);
    const putting = await encoder(await browser.newPage(), viewport);
    // A page behind another draws nothing, so nothing of it is filmed.
    await page.bringToFront();
    return await filmed(page, putting, onLeft);
  } finally {
    await browser.close();
  }
}

// The page that puts the video together, at the filmed page's size.
async function encoder(page: Page, size: Size): Promise<{ page: Page; size: Size }> {
  await page.route("https://video.playthrough/", (route) => route.fulfill({ contentType: "text/html", body: "" }));
  await page.goto("https://video.playthrough/");
  await page.evaluate(start, { ...size, fps: FPS, bitrate: BITRATE, allAtOnce: ALL_AT_ONCE });
  return { page, size };
}

// The page as it plays, put together as it's filmed: each frame of the video is what the browser last drew by its
// moment, so what stays still is drawn again. How long it has left is the playing still to go, and the frames waiting
// to go in.
async function filmed(page: Page, { page: putting, size }: { page: Page; size: Size }, onLeft: (seconds: number) => void): Promise<Uint8Array> {
  const length = await page.evaluate(() => window.video!.length);
  const browser = await page.context().newCDPSession(page);
  let start = Infinity;
  let drawn: string | undefined;
  let last: string | undefined;
  let made = 0;
  let done = 0;
  let still = 0;
  let wholeAt = Infinity;
  let going = Promise.resolve();
  // Every frame of the video up to this moment, in its seconds, a whole one every two seconds, for a player to start
  // anywhere, and one once the page comes to rest or what the video draws over the app has.
  const upTo = (at: number) => {
    for (; made / FPS <= at; made++) {
      still = drawn === last ? still + 1 : 0;
      const settled = made / FPS >= wholeAt;
      if (settled) wholeAt = Infinity;
      const [jpeg, key] = [drawn === last ? undefined : drawn, made % (2 * FPS) === 0 || still === SETTLED || settled];
      last = drawn;
      going = going.then(() => putting.evaluate(add, { jpeg, key })).then(() => void done++);
    }
  };
  // Two frames on, once the browser has drawn it.
  await page.exposeFunction("settled", () => void (wholeAt = Math.min(wholeAt, Date.now() / 1000 - start + 2 / FPS)));
  let firstDrawn = () => {};
  browser.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    upTo((metadata.timestamp ?? Date.now() / 1000) - start);
    drawn = data;
    firstDrawn();
    void browser.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  // What's drawn before it plays is its first frame.
  await new Promise<void>((drew) => {
    firstDrawn = drew;
    void browser.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: page.viewportSize()!.width, maxHeight: page.viewportSize()!.height });
  });
  start = Date.now() / 1000;
  const telling = setInterval(() => onLeft(Math.max(0, start + length - Date.now() / 1000) + (made - done) * PER_FRAME), 250);
  try {
    await page.evaluate(() => window.video!.play());
    upTo(Date.now() / 1000 - start);
    await browser.send("Page.stopScreencast");
    await going;
  } finally {
    clearInterval(telling);
  }
  const finished = await putting.evaluate(finish);  const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
  return mp4({ ...size, fps: FPS, avcC: bytes(finished.avcC), frames: finished.frames.map((frame) => ({ data: bytes(frame.data), key: frame.key })) });
}

// What a second may take, at most: a page changing all at once, as rows going, takes many times what a still second
// does, and what stays still takes almost nothing whatever this is.
const BITRATE = 12_000_000;
// A frame made from the one before that takes more than this is a page that changed all at once. Made so, it leaves faint
// lines of what went (a table's edges, as its rows went), so the frame after it is made whole. (Encoded as what's on a
// screen, contentHint "text", leaves nothing behind, but takes five times as long a frame: a 16 second video came 40
// seconds after it was asked for.)
const ALL_AT_ONCE = 10_000;
// Frames with nothing new drawn after which the page has come to rest. Made from the one before, a pill fading out or
// the pointer moving on left a faint shape of itself where nothing changed after, until the next whole frame: so the
// frame the page rests on is made whole, and so is the one after what the video draws over the app has come to rest
// (Video.tsx), whatever the app is doing.
const SETTLED = 6;

// In the page that encodes, each run there on its own: the frames go in one at a time, the last one drawn again where
// nothing new was. Each picture goes in as HD video's own colours, BT.709 in the range a TV shows, which is what every
// player takes a video to be: left to the browser, a page's colours go in at full range, and a player that takes them
// as a TV's clips the lightest greys to white and the darkest to black ("blown out").
type Encoding = {
  encoder: VideoEncoder;
  canvas: OffscreenCanvas;
  fps: number;
  i: number;
  picture: Uint8Array;
  allAtOnce: number;
  warming?: boolean;
  wholeNext?: boolean;
  avcC?: string;
  frames: { data: string; key: boolean }[];
};

async function start({ width, height, fps, bitrate, allAtOnce }: Size & { fps: number; bitrate: number; allAtOnce: number }) {
  const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  const state: Encoding = {
    encoder: new VideoEncoder({
      output: (chunk, metadata) => {
        const description = metadata?.decoderConfig?.description;
        if (description) state.avcC = base64(ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : new Uint8Array(description));
        if (state.warming) return;
        if (chunk.type === "delta" && chunk.byteLength > state.allAtOnce) state.wholeNext = true;
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        state.frames.push({ data: base64(data), key: chunk.type === "key" });
      },
      error: (error) => console.error(error),
    }),
    canvas: new OffscreenCanvas(width, height),
    fps,
    i: 0,
    allAtOnce,
    picture: new Uint8Array((width * height * 3) / 2),
    frames: [],
  };
  (window as unknown as { encoding: Encoding }).encoding = state;
  for (const codec of ["avc1.640033", "avc1.64002a", "avc1.640028"])
    if ((await VideoEncoder.isConfigSupported({ codec, width, height })).supported) {
      state.encoder.configure({ codec, width, height, bitrate, framerate: fps, avc: { format: "avc" } });
      return;
    }
  throw new Error(`This browser can't make an H.264 video ${width}×${height} wide.`);
}

async function add({ jpeg, key }: { jpeg?: string; key: boolean }) {
  const state = (window as unknown as { encoding: Encoding }).encoding;
  const { width, height } = state.canvas;
  if (jpeg) {
    const picture = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${jpeg}`)).blob());
    const draw = state.canvas.getContext("2d", { willReadFrequently: true })!;
    draw.imageSmoothingQuality = "high";
    draw.drawImage(picture, 0, 0, width, height);
    picture.close();
    // Brightness for each dot, and colour for each square of four, in sixty-fifths of a thousand: BT.709's weights,
    // brightness from 16 to 235 and colour from 16 to 240 around 128.
    const rgba = draw.getImageData(0, 0, width, height).data;
    const [brightness, blue, red] = [state.picture.subarray(0, width * height), state.picture.subarray(width * height, (width * height * 5) / 4), state.picture.subarray((width * height * 5) / 4)];
    for (let y = 0; y < height; y += 2)
      for (let x = 0; x < width; x += 2) {
        let [r, g, b] = [0, 0, 0];
        for (const at of [y * width + x, y * width + x + 1, (y + 1) * width + x, (y + 1) * width + x + 1]) {
          const [dotR, dotG, dotB] = [rgba[at * 4]!, rgba[at * 4 + 1]!, rgba[at * 4 + 2]!];
          brightness[at] = 16 + ((11966 * dotR + 40254 * dotG + 4064 * dotB + 32768) >> 16);
          r += dotR;
          g += dotG;
          b += dotB;
        }
        const square = (y / 2) * (width / 2) + x / 2;
        blue[square] = 128 + ((-6596 * r - 22189 * g + 28785 * b + 131072) >> 18);
        red[square] = 128 + ((28785 * r - 26145 * g - 2640 * b + 131072) >> 18);
      }
  }
  const frame = new VideoFrame(state.picture, {
    format: "I420",
    codedWidth: width,
    codedHeight: height,
    timestamp: (state.i * 1_000_000) / state.fps,
    duration: 1_000_000 / state.fps,
    colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false },
  });
  // The encoder learns what a frame of this page takes from the frames before it: the first, made before it has seen
  // any, came out a shade darker, and the page lightened two seconds in, at the next whole frame. So it sees the first a
  // few times, kept out of the video, before it's made.
  if (state.i === 0) {
    state.warming = true;
    for (let times = 0; times < 10; times++) state.encoder.encode(frame, { keyFrame: true });
    await state.encoder.flush();
    state.warming = false;
  }
  state.encoder.encode(frame, { keyFrame: key || !!state.wholeNext });
  state.wholeNext = false;
  frame.close();
  state.i++;
  while (state.encoder.encodeQueueSize > 8) await new Promise((done) => setTimeout(done, 5));
}

async function finish() {
  const state = (window as unknown as { encoding: Encoding }).encoding;
  await state.encoder.flush();
  return { avcC: state.avcC!, frames: state.frames };
}
