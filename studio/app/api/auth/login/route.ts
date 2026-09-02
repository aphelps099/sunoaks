import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, credentialsAreValid } from "@/lib/auth";
import { LoginAttemptLimiter, trustedClientKey } from "@/lib/login-throttle";

const bodySchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const limiter = new LoginAttemptLimiter();

export async function POST(request: Request) {
  const key = trustedClientKey(request);
  const retryAfter = limiter.retryAfterSeconds(key);
  if (retryAfter) return NextResponse.json(
    { error: "Too many sign-in attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !credentialsAreValid(parsed.data.username, parsed.data.password)) {
    limiter.recordFailure(key);
    return NextResponse.json({ error: "Those pilot credentials do not match." }, { status: 401 });
  }
  limiter.recordSuccess(key);
  await createSession();
  return NextResponse.json({ ok: true });
}
