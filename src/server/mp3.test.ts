import { describe, expect, it } from "vitest";
import { joinMp3, mp3Duration } from "./mp3";

function frames(count: number, header = [0xff, 0xfb, 0x90, 0x00], size = 417) {
  const bytes = new Uint8Array(count * size);
  for (let i = 0; i < count; i++) bytes.set(header, i * size);
  return bytes;
}

describe("mp3Duration", () => {
  it("adds up MPEG-1 frames", () => {
    expect(mp3Duration(frames(100))).toBeCloseTo((100 * 1152) / 44100, 5);
  });
  it("reads MPEG-2 frames at 24 kHz", () => {
    // MPEG-2 Layer III, 64 kbps, 24 kHz: 72 * 64000 / 24000 = 192 bytes
    expect(mp3Duration(frames(50, [0xff, 0xf3, 0x84, 0xc4], 192))).toBeCloseTo((50 * 576) / 24000, 5);
  });
  it("skips an ID3v2 tag", () => {
    const tag = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5]);
    const file = new Uint8Array([...tag, ...frames(10)]);
    expect(mp3Duration(file)).toBeCloseTo((10 * 1152) / 44100, 5);
  });
  it("finds nothing in other files", () => {
    expect(mp3Duration(new TextEncoder().encode("not audio at all"))).toBeNull();
    expect(mp3Duration(new Uint8Array(5000))).toBeNull();
  });
});

describe("joinMp3", () => {
  it("plays as long as its parts together", () => {
    const joined = joinMp3([frames(10), frames(20)]);
    expect(mp3Duration(joined)).toBeCloseTo((30 * 1152) / 44100, 5);
  });
});
