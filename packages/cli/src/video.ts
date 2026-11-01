// A flow saved as a video. The viewer plays it in a browser of its own, alone or beside the round Compare shows, and
// what it shows is filmed as it plays, then made into an MP4 by that browser's own H.264: nothing more to install.

import { chromium, type Page } from "@playwright/test";
import { mp4 } from "./mp4.ts";

export type Filmed = { round: number; flow: string; beside?: number; dark: boolean };
type Size = { width: number; height: number };

// Filmed at half speed, every moment is caught however busy the page is, and played back at full.
const SPEED = 0.5;
const FPS = 30;
// As wide as most places that show a video play it.
const WIDEST = 1920;
// As the viewer lays the recordings out: room around them, the line over each, and the gap between two.
const ROOM = 32;
const CAPTION = 26;
const GAP = 20;

// Chromium films a page at the size of its screen, never its pixels, so the page draws itself this much larger.
const LARGER = 2;

export async function video(port: number, id: string, filmed: Filmed, shape: Size): Promise<Uint8Array> {
  const beside = filmed.beside !== undefined;
  const viewport = { width: LARGER * ((beside ? 2 * shape.width + GAP : shape.width) + 2 * ROOM), height: LARGER * (shape.height + CAPTION + 2 * ROOM) };
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport, colorScheme: filmed.dark ? "dark" : "light" });
    const page = await context.newPage();
    const { dark, ...shown } = filmed;
    await page.goto(`http://localhost:${port}/${encodeURIComponent(id)}?video=${encodeURIComponent(JSON.stringify({ ...shown, speed: SPEED, larger: LARGER }))}`);
    await page.waitForFunction((frames) => !!window.video && document.querySelectorAll("[data-frame]:not([hidden]) iframe").length >= frames, beside ? 2 : 1);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const crop = await page.evaluate(around, { room: LARGER * ROOM, caption: beside ? LARGER * CAPTION : 0 });
    const filmedFrames = await film(page, viewport);
    return await encode(await browser.newPage(), filmedFrames, crop);
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

// The page as it plays, frame by frame as the browser draws it, each at the moment it was drawn, in the video's seconds.
type Frame = { at: number; jpeg: string };
async function film(page: Page, viewport: Size): Promise<Frame[]> {
  const browser = await page.context().newCDPSession(page);
  const frames: Frame[] = [];
  let start = 0;
  browser.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ at: (metadata.timestamp ?? Date.now() / 1000) - start, jpeg: data });
    void browser.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await browser.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: viewport.width, maxHeight: viewport.height });
  start = Date.now() / 1000;
  await page.evaluate(() => window.video!.play());
  const end = Date.now() / 1000 - start;
  await browser.send("Page.stopScreencast");
  // What was drawn before it started playing is its first frame.
  return [...frames.map((frame) => ({ ...frame, at: Math.max(0, frame.at) * SPEED })), { at: end * SPEED, jpeg: frames.at(-1)!.jpeg }];
}

// At a steady frame rate, each frame what was last drawn by then, cut to what's filmed and made no wider than a video's
// usually shown.
async function encode(page: Page, frames: Frame[], crop: { x: number; y: number; width: number; height: number }): Promise<Uint8Array> {
  const k = Math.min(1, WIDEST / crop.width);
  const even = (value: number) => 2 * Math.round(value / 2);
  const size = { width: even(crop.width * k), height: even(crop.height * k) };
  await page.route("https://video.playthrough/", (route) => route.fulfill({ contentType: "text/html", body: "" }));
  await page.goto("https://video.playthrough/");
  await page.evaluate(start, { ...size, fps: FPS, crop });
  const count = Math.ceil(frames.at(-1)!.at * FPS);
  let shown: Frame | undefined;
  for (let i = 0; i < count; i++) {
    const frame = frames.findLast((frame) => frame.at <= i / FPS) ?? frames[0]!;
    await page.evaluate(add, { jpeg: frame === shown ? undefined : frame.jpeg, key: i % (2 * FPS) === 0 });
    shown = frame;
  }
  const done = await page.evaluate(finish);
  const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
  return mp4({ ...size, fps: FPS, avcC: bytes(done.avcC), frames: done.frames.map((frame) => ({ data: bytes(frame.data), key: frame.key })) });
}

// In the page that encodes, each run there on its own: the frames go in one at a time, the last one drawn again where
// nothing new was.
type Encoding = { encoder: VideoEncoder; canvas: OffscreenCanvas; crop: { x: number; y: number; width: number; height: number }; fps: number; i: number; avcC?: string; frames: { data: string; key: boolean }[] };

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
  if (jpeg) {
    const picture = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${jpeg}`)).blob());
    const draw = state.canvas.getContext("2d")!;
    draw.imageSmoothingQuality = "high";
    draw.drawImage(picture, state.crop.x, state.crop.y, state.crop.width, state.crop.height, 0, 0, state.canvas.width, state.canvas.height);
    picture.close();
  }
  const frame = new VideoFrame(state.canvas, { timestamp: (state.i * 1_000_000) / state.fps, duration: 1_000_000 / state.fps });
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
