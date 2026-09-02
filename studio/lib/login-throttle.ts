import { isIP } from "node:net";

type AttemptState = { failures: number; blockedUntil: number; lastSeen: number };

export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, AttemptState>();
  constructor(
    private readonly maxFailures = 5,
    private readonly blockMs = 15 * 60 * 1000,
    private readonly retentionMs = 15 * 60 * 1000,
    private readonly maxKeys = 2_048,
  ) {}

  retryAfterSeconds(key: string, now = Date.now()) {
    this.prune(now);
    const state = this.attempts.get(key);
    return state && state.blockedUntil > now ? Math.ceil((state.blockedUntil - now) / 1000) : 0;
  }

  recordFailure(key: string, now = Date.now()) {
    this.prune(now);
    const prior = this.attempts.get(key);
    const failures = (prior?.failures || 0) + 1;
    this.attempts.set(key, {
      failures,
      blockedUntil: failures >= this.maxFailures ? now + this.blockMs : 0,
      lastSeen: now,
    });
    this.enforceBound();
  }

  recordSuccess(key: string) {
    this.attempts.delete(key);
  }

  prune(now = Date.now()) {
    for (const [key, state] of this.attempts) {
      if (state.blockedUntil <= now && state.lastSeen + this.retentionMs <= now) this.attempts.delete(key);
    }
    this.enforceBound();
  }

  get size() {
    return this.attempts.size;
  }

  private enforceBound() {
    while (this.attempts.size > this.maxKeys) {
      const oldest = [...this.attempts.entries()].sort((left, right) => left[1].lastSeen - right[1].lastSeen)[0];
      if (!oldest) break;
      this.attempts.delete(oldest[0]);
    }
  }
}

export function trustedClientKey(request: Request) {
  if (process.env.STUDIO_TRUST_PROXY_HEADERS !== "true") return "direct-peer";
  const candidate = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("cf-connecting-ip")?.trim();
  return candidate && isIP(candidate) ? candidate : "unknown-proxy-peer";
}
