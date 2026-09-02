import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { deriveCampaignRollup } from "@/lib/domain";
import { repository } from "@/lib/store";

export async function GET() {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const db = await repository.read();
  return NextResponse.json({
    ...db,
    campaigns: db.campaigns.map((campaign) => ({
      ...campaign,
      rollupStatus: deriveCampaignRollup(db.deliverables.filter((item) => item.campaignId === campaign.id)),
    })),
  });
}
