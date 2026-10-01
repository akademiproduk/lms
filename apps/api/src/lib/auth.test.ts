import { describe, expect, it } from "vitest";
import { calculateProgress, isSafeExternalVideoUrl, normalizeEmail, validatePassword } from "./auth.js";

describe("auth and learning helpers", () => {
  it("normalizes registration emails", () => {
    expect(normalizeEmail("  HELLO@Example.COM ")).toBe("hello@example.com");
  });

  it("rejects unsafe passwords and accepts a strong one", () => {
    expect(validatePassword("short").valid).toBe(false);
    expect(validatePassword("StrongPass9!").valid).toBe(true);
  });

  it("calculates course completion as a bounded percentage", () => {
    expect(calculateProgress(3, 4)).toBe(75);
    expect(calculateProgress(5, 4)).toBe(100);
    expect(calculateProgress(0, 0)).toBe(0);
  });

  it("only allows http(s) external video URLs", () => {
    expect(isSafeExternalVideoUrl("https://video.example.com/watch/1")).toBe(true);
    expect(isSafeExternalVideoUrl("javascript:alert(1)")).toBe(false);
  });
});
