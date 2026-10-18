export type Bucket = "vehicle" | "model" | "read";

interface Rule {
  windowMs: number;
  max: number;
}

// Per hashed IP. vehicle_check mirrors the Plateop app's own limit (20 per 10 minutes, 100 per day); a stricter or looser
// limit here would be pointless. The model tools get 60 per minute, like the app's /open/model route. Plain GETs: 600 per hour.
const RULES: Record<Bucket, Rule[]> = {
  vehicle: [
    { windowMs: 600_000, max: 20 },
    { windowMs: 86_400_000, max: 100 },
  ],
  model: [{ windowMs: 60_000, max: 60 }],
  read: [{ windowMs: 3_600_000, max: 600 }],
};

export interface LimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/** Fixed-window limiter in memory. No timers and no disk: stale windows are pruned on use, everything resets on restart. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(private now: () => number = Date.now) {}

  check(ipHash: string, bucket: Bucket): LimitResult {
    const now = this.now();
    if (this.windows.size > 5000) this.prune(now);
    const slots = RULES[bucket].map((rule) => {
      const key = `${ipHash}|${bucket}|${rule.windowMs}`;
      const start = now - (now % rule.windowMs);
      const cur = this.windows.get(key);
      return { key, rule, start, count: cur && cur.start === start ? cur.count : 0 };
    });
    // Longest wait wins when more than one window is full.
    const full = slots.filter((s) => s.count >= s.rule.max);
    if (full.length) {
      const wait = Math.max(...full.map((s) => s.start + s.rule.windowMs - now));
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(wait / 1000)) };
    }
    for (const s of slots) this.windows.set(s.key, { start: s.start, count: s.count + 1 });
    return { ok: true, retryAfterSec: 0 };
  }

  private prune(now: number): void {
    for (const [key, w] of this.windows) {
      const windowMs = Number(key.split("|")[2]);
      if (w.start + windowMs <= now) this.windows.delete(key);
    }
  }
}
