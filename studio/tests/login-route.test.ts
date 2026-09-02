import { describe, expect, it } from "vitest";
import { POST } from "../app/api/auth/login/route";
import { LoginAttemptLimiter, trustedClientKey } from "../lib/login-throttle";

function request(body: string, ip: string, userAgent = "vitest") {
  return new Request("http://localhost/studio/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": userAgent },
    body,
  });
}

describe("login request hardening", () => {
  it("returns a bounded 400 for malformed JSON", async () => {
    const response = await POST(request("{bad", "192.0.2.10"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Request body must be valid JSON." });
  });

  it("throttles one trusted client IP even when user-agent rotates", async () => {
    const previous = process.env.STUDIO_TRUST_PROXY_HEADERS;
    process.env.STUDIO_TRUST_PROXY_HEADERS = "true";
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await POST(request(JSON.stringify({ username: "wrong", password: "wrong" }), "192.0.2.11", `rotating-agent-${attempt}`));
        expect(response.status).toBe(401);
      }
      const blocked = await POST(request(JSON.stringify({ username: "wrong", password: "wrong" }), "192.0.2.11", "another-agent"));
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toBeTruthy();
    } finally {
      if (previous === undefined) delete process.env.STUDIO_TRUST_PROXY_HEADERS;
      else process.env.STUDIO_TRUST_PROXY_HEADERS = previous;
    }
  });

  it("expires stale keys and bounds memory", () => {
    const limiter = new LoginAttemptLimiter(5, 1_000, 100, 2);
    limiter.recordFailure("one", 0);
    limiter.recordFailure("two", 1);
    limiter.recordFailure("three", 2);
    expect(limiter.size).toBe(2);
    limiter.prune(102);
    expect(limiter.size).toBe(0);
  });

  it("ignores forwarding headers unless proxy trust is explicitly enabled", () => {
    const previous = process.env.STUDIO_TRUST_PROXY_HEADERS;
    delete process.env.STUDIO_TRUST_PROXY_HEADERS;
    expect(trustedClientKey(request("{}", "192.0.2.99"))).toBe("direct-peer");
    if (previous !== undefined) process.env.STUDIO_TRUST_PROXY_HEADERS = previous;
  });
});
