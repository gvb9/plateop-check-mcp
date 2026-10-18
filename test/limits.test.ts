import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/limits.js";

describe("RateLimiter", () => {
  it("applies the daily cap after the 10-minute window resets", () => {
    let now = 0;
    const l = new RateLimiter(() => now);
    let ok = 0;
    for (let w = 0; w < 10; w++) {
      now = w * 600_000;
      for (let i = 0; i < 20; i++) if (l.check("a", "vehicle").ok) ok++;
    }
    expect(ok).toBe(100);
    now = 10 * 600_000;
    const r = l.check("a", "vehicle");
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("counts addresses separately and starts a new window", () => {
    let now = 0;
    const l = new RateLimiter(() => now);
    for (let i = 0; i < 60; i++) l.check("a", "model");
    expect(l.check("a", "model").ok).toBe(false);
    expect(l.check("b", "model").ok).toBe(true);
    now = 60_000;
    expect(l.check("a", "model").ok).toBe(true);
  });
});
