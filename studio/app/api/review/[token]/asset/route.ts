import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { findReviewLink } from "@/lib/review-service";
import { repository } from "@/lib/store";

export const dynamic = "force-dynamic";

// This capability only exposes the immutable campaign photo selected by a valid review link.
// It never accepts an arbitrary asset ID or grants access to the rest of the library.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = await repository.read();
  const link = findReviewLink(db, token);
  const campaign = link?.campaignId && db.campaigns.find((item) => item.id === link.campaignId);
  const asset = campaign && campaign.sourceSnapshot.asset;
  const hasArtwork = link && db.deliverables.some((item) => link.selectedDeliverableIds.includes(item.id) && item.campaignId === link.campaignId && ["still", "motion"].includes(item.deliverableType));
  if (!asset || !hasArtwork || !/^[a-f0-9-]{36}$/.test(asset.id) || asset.fileReference !== `/studio/api/assets/${asset.id}`) return NextResponse.json({ error: "Review image unavailable." }, { status: 404 });
  const dataPath = process.env.STUDIO_DATA_PATH || path.join(process.cwd(), "data", "studio.json");
  const directory = process.env.STUDIO_UPLOAD_PATH || path.join(path.dirname(dataPath), "uploads");
  for (const [extension, mime] of Object.entries({ jpg: "image/jpeg", png: "image/png", webp: "image/webp" })) {
    try {
      const body = await readFile(path.join(/* turbopackIgnore: true */ directory, `${asset.id}.${extension}`));
      return new NextResponse(body, { headers: { "Content-Type": mime, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
    } catch {}
  }
  return NextResponse.json({ error: "Review image unavailable." }, { status: 404 });
}
