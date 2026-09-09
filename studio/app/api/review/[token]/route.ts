import { NextResponse } from "next/server";
import { z } from "zod";
import { findReviewLink, mutateReviewState, publicReviewPayload } from "@/lib/review-service";
import { repository } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
  const { token } = await context.params;
  const db = await repository.read();
  const link = findReviewLink(db, token);
  if (!link) return NextResponse.json({ error: "This review link is invalid, expired, or revoked." }, { status: 404 });
  return NextResponse.json(publicReviewPayload(db, link, token), {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

const decisionSchema = z.object({
  decision: z.enum(["approve", "request_changes"]),
  comment: z.string().max(4000).optional(),
}).superRefine((value, context) => {
  if (value.decision === "request_changes" && !value.comment?.trim()) {
    context.addIssue({ code: "custom", path: ["comment"], message: "A comment is required when requesting changes." });
  }
});

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  let payload: ReturnType<typeof publicReviewPayload> | undefined;
  try {
    await repository.update((db) => {
      const link = findReviewLink(db, token);
      if (!link) throw new Error("This review link is invalid, expired, or revoked.");
      mutateReviewState(db, link, parsed.data);
      payload = publicReviewPayload(db, link, token);
    });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Review could not be saved." }, { status: 409 });
  }
}
