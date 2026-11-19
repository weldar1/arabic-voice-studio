import { describe, expect, it } from "vitest";
import { splitIntoChunks } from "./chunks";

describe("splitIntoChunks", () => {
  it("keeps short text whole", () => {
    expect(splitIntoChunks("مرحبا. كيف حالك؟")).toEqual(["مرحبا. كيف حالك؟"]);
  });
  it("cuts at sentence ends", () => {
    const text = "الجملة الأولى. ".repeat(30) + "الجملة الأخيرة؟";
    const chunks = splitIntoChunks(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.length).toBeLessThanOrEqual(100);
      expect(chunk).toMatch(/[.؟]$/);
    }
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.trim().replace(/\s+/g, " "));
  });
  it("cuts an overlong sentence at spaces", () => {
    const chunks = splitIntoChunks("كلمة ".repeat(100), 50);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(50);
  });
});
