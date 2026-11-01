// A flow saved as a video. The viewer plays it in a browser of its own, alone or beside the round Compare shows, and
// what it shows is filmed as it plays and made into an MP4 as it's filmed, by that browser's own H.264: nothing more to
// install.

import { chromium, type Page } from "@playwright/test";
import { mp4 } from "./mp4.ts";

export type Filmed = { round: number; flow: string; beside?: number; dark: boolean };
type Size = { width: number; height: number };

// As smooth as a screen shows it.
const FPS = 60;
// As wide as most places that show a video play it.
const WIDEST = 1920;
// As the viewer lays the recordings out: room around them, the line over each, and the gap between two.
const ROOM = 32;
const CAPTION = 26;
const GAP = 20;

// No taller than a phone's video is.
const TALLEST = 1920;
// Chromium films a page at the size of its screen, never its pixels, so the page draws itself at the size the video is,
// never more than twice its own. Drawn no larger than that, it keeps up with every frame as it plays.
const LARGEST = 2;
// About how long a frame takes to go into the video here, for what's waiting to go in.
const PER_FRAME = 0.009;

// As it's made, it says how many seconds it has left, as best it knows by then.
export async function video(port: number, id: string, filmed: Filmed, shape: Size, onLeft: (seconds: number) => void): Promise<Uint8Array> {
  const beside = filmed.beside !== undefined;
  const room = { width: (beside ? 2 * shape.width + GAP : shape.width) + 2 * ROOM, height: shape.height + CAPTION + 2 * ROOM };
  const larger = Math.min(WIDEST / room.width, TALLEST / (room.height - (beside ? 0 : CAPTION)), LARGEST);
  const viewport = { width: Math.round(larger * room.width), height: Math.round(larger * room.height) };
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport, colorScheme: filmed.dark ? "dark" : "light" });
    const page = await context.newPage();
    const { dark, ...shown } = filmed;
    await page.goto(`http://localhost:${port}/${encodeURIComponent(id)}?video=${encodeURIComponent(JSON.stringify({ ...shown, larger }))}`);
    await page.waitForFunction((frames) => !!window.video && document.querySelectorAll("[data-frame]:not([hidden]) iframe").length >= frames, beside ? 2 : 1);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const crop = await page.evaluate(around, { room: larger * ROOM, caption: beside ? larger * CAPTION : 0 });
    return await film(page, await encoder(await browser.newPage(), crop), onLeft);
  } finally {
    await browser.close();
  }
}

// What's filmed: the recordings, and the line over each side by side, with the same room on every side.
function around({ room, caption }: { room: number; caption: number }) {
  const boxes = [...document.querySelectorAll("[data-frame]:not([hidden])")].map((frame) => frame.getBoundingClientRect());
  const left = Math.max(0, Math.min(...boxes.map((box) => box.left)) - room);
  const top = Math.max(0, Math.min(...boxes.map((box) => box.top)) - caption - room);
  const right = Math.min(innerWidth, Math.max(...boxes.map((box) => box.right)) + room);
  const bottom = Math.min(innerHeight, Math.max(...boxes.map((box) => box.bottom)) + room);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// The page that puts the video together, cut to what's filmed and no wider than a video's usually shown.
type Crop = { x: number; y: number; width: number; height: number };
async function encoder(page: Page, crop: Crop): Promise<{ page: Page; size: Size }> {
  const k = Math.min(1, WIDEST / crop.width);
  const even = (value: number) => 2 * Math.round(value / 2);
  const size = { width: even(crop.width * k), height: even(crop.height * k) };
  await page.route("https://video.playthrough/", (route) => route.fulfill({ contentType: "text/html", body: "" }));
  await page.goto("https://video.playthrough/");
  await page.evaluate(start, { ...size, fps: FPS, crop });
  return { page, size };
}

// The page as it plays, put together as it's filmed: each frame of the video is what the browser last drew by its
// moment, so what stays still is drawn again. How long it has left is the playing still to go, and the frames waiting
// to go in.
async function film(page: Page, { page: putting, size }: { page: Page; size: Size }, onLeft: (seconds: number) => void): Promise<Uint8Array> {
  const length = await page.evaluate(() => window.video!.length);
  const browser = await page.context().newCDPSession(page);
  let start = Infinity;
  let drawn: string | undefined;
  let last: string | undefined;
  let made = 0;
  let done = 0;
  let going = Promise.resolve();
  // Every frame of the video up to this moment, in its seconds.
  const upTo = (at: number) => {
    for (; made / FPS <= at; made++) {
      const [jpeg, key] = [drawn === last ? undefined : drawn, made % (2 * FPS) === 0];
      last = drawn;
      going = going.then(() => putting.evaluate(add, { jpeg, key })).then(() => void done++);
    }
  };
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
  const finished = await putting.evaluate(finish);
  const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
  return mp4({ ...size, fps: FPS, avcC: bytes(finished.avcC), frames: finished.frames.map((frame) => ({ data: bytes(frame.data), key: frame.key })) });
}

// In the page that encodes, each run there on its own: the frames go in one at a time, the last one drawn again where
// nothing new was. Each picture goes in as HD video's own colours, BT.709 in the range a TV shows, which is what every
// player takes a video to be: left to the browser, a page's colours go in at full range, and a player that takes them
// as a TV's clips the lightest greys to white and the darkest to black.
type Encoding = { encoder: VideoEncoder; canvas: OffscreenCanvas; crop: { x: number; y: number; width: number; height: number }; fps: number; i: number; picture: Uint8Array; avcC?: string; frames: { data: string; key: boolean }[] };

async function start({ width, height, fps, crop }: Size & { fps: number; crop: Encoding["crop"] }) {
  const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  const state: Encoding = {
    encoder: new VideoEncoder({
      output: (chunk, metadata) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        state.frames.push({ data: base64(data), key: chunk.type === "key" });
        const description = metadata?.decoderConfig?.description;
        if (description) state.avcC = base64(ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : new Uint8Array(description));
      },
      error: (error) => console.error(error),
    }),
    canvas: new OffscreenCanvas(width, height),
    crop,
    fps,
    i: 0,
    picture: new Uint8Array((width * height * 3) / 2),
    frames: [],
  };
  (window as unknown as { encoding: Encoding }).encoding = state;
  for (const codec of ["avc1.640033", "avc1.64002a", "avc1.640028"])
    if ((await VideoEncoder.isConfigSupported({ codec, width, height })).supported) {
      state.encoder.configure({ codec, width, height, bitrate: 6_000_000, framerate: fps, avc: { format: "avc" } });
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
    draw.drawImage(picture, state.crop.x, state.crop.y, state.crop.width, state.crop.height, 0, 0, width, height);
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
  state.encoder.encode(frame, { keyFrame: key });
  frame.close();
  state.i++;
  while (state.encoder.encodeQueueSize > 8) await new Promise((done) => setTimeout(done, 5));
}

async function finish() {
  const state = (window as unknown as { encoding: Encoding }).encoding;
  await state.encoder.flush();
  return { avcC: state.avcC!, frames: state.frames };
}
