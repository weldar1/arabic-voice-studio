// MP3 frames: how long a file plays, and joining several files into one.

const BITRATES = {
  // kbps by index, for Layer III
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = {
  mpeg1: [44100, 48000, 32000],
  mpeg2: [22050, 24000, 16000],
  mpeg25: [11025, 12000, 8000],
};

interface Frame {
  length: number;
  samples: number;
  sampleRate: number;
}

/** The Layer III frame whose header starts at `i`, or null. */
function frameAt(bytes: Uint8Array, i: number): Frame | null {
  if (i + 4 > bytes.length) return null;
  const [b0, b1, b2] = [bytes[i]!, bytes[i + 1]!, bytes[i + 2]!];
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 0b11; // 0: 2.5, 2: 2, 3: 1
  const layer = (b1 >> 1) & 0b11; // 1: Layer III
  if (version === 1 || layer !== 1) return null;
  const bitrateIndex = b2 >> 4;
  const rateIndex = (b2 >> 2) & 0b11;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const padding = (b2 >> 1) & 1;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? BITRATES.mpeg1 : BITRATES.mpeg2)[bitrateIndex]! * 1000;
  const sampleRate = (
    mpeg1 ? SAMPLE_RATES.mpeg1 : version === 2 ? SAMPLE_RATES.mpeg2 : SAMPLE_RATES.mpeg25
  )[rateIndex]!;
  const length = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding;
  return { length, samples: mpeg1 ? 1152 : 576, sampleRate };
}

/** Where the audio starts: after an ID3v2 tag, if there is one. */
function audioStart(bytes: Uint8Array): number {
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    const footer = bytes[5]! & 0x10 ? 10 : 0;
    return 10 + size + footer;
  }
  return 0;
}

/** Where the audio ends: before an ID3v1 tag, if there is one. */
function audioEnd(bytes: Uint8Array): number {
  const n = bytes.length;
  if (n >= 128 && bytes[n - 128] === 0x54 && bytes[n - 127] === 0x41 && bytes[n - 126] === 0x47) {
    return n - 128;
  }
  return n;
}

/**
 * Seconds of audio, from its frames; null when the bytes hold no run of
 * valid MP3 frames.
 */
export function mp3Duration(bytes: Uint8Array): number | null {
  const end = audioEnd(bytes);
  let i = audioStart(bytes);
  let seconds = 0;
  let frames = 0;
  while (i < end) {
    const frame = frameAt(bytes, i);
    // The first frame counts only when another follows it (or the file ends
    // there): a stray 0xFF in other data is not a file.
    if (frame && frame.length > 4 && i + frame.length <= end) {
      const next = i + frame.length;
      if (frames > 0 || next === end || frameAt(bytes, next)) {
        seconds += frame.samples / frame.sampleRate;
        frames++;
        i = next;
        continue;
      }
    }
    i++;
  }
  return frames > 0 ? seconds : null;
}

/** The audio of each file, tags removed, one after the other. */
export function joinMp3(parts: Uint8Array[]): Uint8Array {
  const pieces = parts.map((p) => p.subarray(audioStart(p), audioEnd(p)));
  const out = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}
