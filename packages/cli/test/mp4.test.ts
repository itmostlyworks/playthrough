// What a downloaded video is as a file: an MP4 every player takes as it's meant, whatever made its frames.

import assert from "node:assert/strict";
import { test } from "node:test";
import { mp4 } from "../src/mp4.ts";

// Three frames at 60 a second, the first and third whole.
const frames = [
  { data: new Uint8Array([1, 1, 1, 1]), key: true },
  { data: new Uint8Array([2, 2]), key: false },
  { data: new Uint8Array([3, 3, 3]), key: true },
];
const made = Buffer.from(mp4({ width: 1920, height: 1346, fps: 60, avcC: new Uint8Array([1, 100, 0, 51]), frames }));

// Each box by its path, as "moov/trak/mdia/mdhd", where its contents start and end.
function boxes(bytes: Buffer, from = 0, to = bytes.length, path = ""): Record<string, { at: number; end: number }> {
  const found: Record<string, { at: number; end: number }> = {};
  for (let at = from; at < to; ) {
    const [size, type] = [bytes.readUInt32BE(at), bytes.toString("latin1", at + 4, at + 8)];
    const here = path ? `${path}/${type}` : type;
    found[here] = { at: at + 8, end: at + size };
    const inside = { moov: 0, trak: 0, mdia: 0, minf: 0, stbl: 0, stsd: 8, avc1: 78 }[type];
    if (inside !== undefined) Object.assign(found, boxes(bytes, at + 8 + inside, at + size, here));
    at += size;
  }
  return found;
}
const found = boxes(made);
const stbl = "moov/trak/mdia/minf/stbl";

test("a video's index comes before its frames, so a page plays it before it has all arrived", () => {
  assert.deepEqual(
    Object.keys(found).filter((path) => !path.includes("/")),
    ["ftyp", "moov", "mdat"],
  );
  assert.deepEqual([...made.subarray(found.mdat!.at, found.mdat!.end)], [1, 1, 1, 1, 2, 2, 3, 3, 3], "its frames, in order, where the index says they start");
});

test("a video plays at the frame rate it's made at, as long as its frames are", () => {
  const mdhd = found["moov/trak/mdia/mdhd"]!.at;
  const [scale, length] = [made.readUInt32BE(mdhd + 12), made.readUInt32BE(mdhd + 16)];
  const stts = found[`${stbl}/stts`]!.at;
  assert.equal(scale / made.readUInt32BE(stts + 12), 60);
  assert.equal(made.readUInt32BE(stts + 8), 3);
  assert.equal(length / scale, 3 / 60);
});

test("a player can start from any whole frame in a video", () => {
  const stss = found[`${stbl}/stss`]!.at;
  assert.deepEqual([made.readUInt32BE(stss + 4), made.readUInt32BE(stss + 8), made.readUInt32BE(stss + 12)], [2, 1, 3]);
});

test("a video says its colours are HD video's own, BT.709 at a TV's range, so no player blows them out", () => {
  const colr = found[`${stbl}/stsd/avc1/colr`];
  assert.ok(colr, "it says what its colours are");
  assert.equal(made.toString("latin1", colr.at, colr.at + 4), "nclx");
  assert.deepEqual([made.readUInt16BE(colr.at + 4), made.readUInt16BE(colr.at + 6), made.readUInt16BE(colr.at + 8)], [1, 1, 1], "BT.709's primaries, transfer and matrix");
  assert.equal(made[colr.at + 10]! & 0x80, 0, "at a TV's range, not full");
});

test("a video is the size it's made at", () => {
  const avc1 = found[`${stbl}/stsd/avc1`]!.at;
  assert.deepEqual([made.readUInt16BE(avc1 + 24), made.readUInt16BE(avc1 + 26)], [1920, 1346]);
});
