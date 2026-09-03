import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { actionRequestSchema, performAction } from "@/lib/action-service";
import { repository } from "@/lib/store";
import { reviewUrl } from "@/lib/public-url";

export async function POST(request: NextRequest) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = actionRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({
    error: `Cannot verify: ${parsed.error.issues[0]?.message || "review the submitted information."}`,
    details: parsed.error.flatten(),
  }, { status: 400 });
  try {
    const result = await performAction(parsed.data, repository);
    if (typeof result.token === "string") {
      const token = result.token;
      delete result.token;
      result.reviewUrl = reviewUrl(request, token);
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The action could not be completed." }, { status: 409 });
  }
}
