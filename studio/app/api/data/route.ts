import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { deriveCampaignRollup } from "@/lib/domain";
import { repository } from "@/lib/store";

export async function GET() {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const db = await repository.read();
  const reviewLinks = db.reviewLinks.map((link) => ({
    id: link.id,
    campaignId: link.campaignId,
    creativeProjectId: link.creativeProjectId,
    selectedDeliverableIds: link.selectedDeliverableIds,
    selectedArtworkKeys: link.selectedArtworkKeys,
    title: link.title,
    version: link.version,
    approvalState: link.approvalState,
    reviewerComment: link.reviewerComment,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    reviewedAt: link.reviewedAt,
  }));
  return NextResponse.json({
    ...db,
    reviewLinks,
    campaigns: db.campaigns.map((campaign) => ({
      ...campaign,
      rollupStatus: deriveCampaignRollup(db.deliverables.filter((item) => item.campaignId === campaign.id)),
    })),
  });
}
