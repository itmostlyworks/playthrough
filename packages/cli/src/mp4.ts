// An MP4 of one H.264 track, at a steady frame rate: what X, Slack, GitHub and a phone all play. Its index comes before
// its frames, so a page can start playing it before it's all arrived.

export type Encoded = { width: number; height: number; fps: number; avcC: Uint8Array; frames: { data: Uint8Array; key: boolean }[] };

export function mp4({ width, height, fps, avcC, frames }: Encoded): Uint8Array {
  const scale = fps * 1000;
  const length = frames.length * 1000;
  const keys = frames.flatMap((frame, i) => (frame.key ? [i + 1] : []));
  const moov = (offset: number) =>
    box("moov", [
      full("mvhd", 0, 0, [u32(0), u32(0), u32(scale), u32(length), u32(0x00010000), u16(0x0100), zeros(10), matrix, zeros(24), u32(2)]),
      box("trak", [
        full("tkhd", 0, 3, [u32(0), u32(0), u32(1), u32(0), u32(length), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(width << 16), u32(height << 16)]),
        box("mdia", [
          full("mdhd", 0, 0, [u32(0), u32(0), u32(scale), u32(length), u16(0x55c4), u16(0)]),
          full("hdlr", 0, 0, [u32(0), ascii("vide"), zeros(12), ascii("Playthrough\0")]),
          box("minf", [
            full("vmhd", 0, 1, [zeros(8)]),
            box("dinf", [full("dref", 0, 0, [u32(1), full("url ", 0, 1, [])])]),
            box("stbl", [
              full("stsd", 0, 0, [
                u32(1),
                box("avc1", [zeros(6), u16(1), zeros(16), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), box("avcC", [avcC])]),
              ]),
              full("stts", 0, 0, [u32(1), u32(frames.length), u32(1000)]),
              full("stss", 0, 0, [u32(keys.length), ...keys.map(u32)]),
              full("stsc", 0, 0, [u32(1), u32(1), u32(frames.length), u32(1)]),
              full("stsz", 0, 0, [u32(0), u32(frames.length), ...frames.map((frame) => u32(frame.data.length))]),
              full("stco", 0, 0, [u32(1), u32(offset)]),
            ]),
          ]),
        ]),
      ]),
    ]);
  const ftyp = box("ftyp", [ascii("isom"), u32(0x200), ascii("isom"), ascii("iso2"), ascii("avc1"), ascii("mp41")]);
  // The frames start after the type, the index and their own box's header.
  const index = moov(ftyp.length + moov(0).length + 8);
  return join([ftyp, index, box("mdat", frames.map((frame) => frame.data))]);
}

const matrix = join([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

function box(type: string, parts: Uint8Array[]): Uint8Array {
  const body = join(parts);
  return join([u32(body.length + 8), ascii(type), body]);
}

const full = (type: string, version: number, flags: number, parts: Uint8Array[]) => box(type, [u32((version << 24) | flags), ...parts]);

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0);
  return bytes;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value);
  return bytes;
}

const zeros = (length: number) => new Uint8Array(length);
const ascii = (text: string) => new TextEncoder().encode(text);

function join(parts: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}
