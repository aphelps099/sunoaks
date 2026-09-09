import { describe, expect, it } from "vitest";
import { actionRequestSchema, applyAction } from "../lib/action-service";
import {
  createReviewLink, findReviewLink, hashReviewToken, isReviewLinkUsable, mutateReviewState, publicReviewPayload,
  regenerateReviewLink, revokeReviewLink,
} from "../lib/review-service";
import { fixtureDatabase } from "./fixtures";

function campaignWithArtwork() {
  const db = fixtureDatabase();
  applyAction({ action: "generateCampaign", calendarItemId: "calendar-event", packId: "event-promo" }, db);
  const campaign = db.campaigns[0];
  const artwork = db.deliverables.filter((item) => item.campaignId === campaign.id && ["still", "motion"].includes(item.deliverableType));
  return { db, campaign, artwork };
}

describe("opaque GM review tokens", () => {
  it("stores only a one-way token hash and resolves an unexpired token", () => {
    const { db, campaign, artwork } = campaignWithArtwork();
    const now = new Date("2026-09-03T20:00:00.000Z");
    const { link, token } = createReviewLink(db, {
      campaignId: campaign.id,
      selectedDeliverableIds: artwork.map((item) => item.id),
      expiresInHours: 24,
    }, now);
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,100}$/);
    expect(link.tokenHash).toBe(hashReviewToken(token));
    expect(JSON.stringify(link)).not.toContain(token);
    expect(findReviewLink(db, token, new Date("2026-09-04T19:59:00.000Z"))).toBe(link);
    expect(findReviewLink(db, token, new Date("2026-09-04T20:00:00.000Z"))).toBeUndefined();
    expect(isReviewLinkUsable(link, new Date("2026-09-04T20:00:00.000Z"))).toBe(false);
  });

  it("revokes and regenerates atomically without reusing the old token", () => {
    const { db, campaign, artwork } = campaignWithArtwork();
    const now = new Date("2026-09-03T20:00:00.000Z");
    const first = createReviewLink(db, { campaignId: campaign.id, selectedDeliverableIds: [artwork[0].id] }, now);
    revokeReviewLink(db, first.link.id, new Date("2026-09-03T21:00:00.000Z"));
    expect(findReviewLink(db, first.token, new Date("2026-09-03T21:00:01.000Z"))).toBeUndefined();
    const second = regenerateReviewLink(db, first.link.id, new Date("2026-09-03T22:00:00.000Z"));
    expect(second.token).not.toBe(first.token);
    expect(second.link.tokenHash).not.toBe(first.link.tokenHash);
    expect(first.link.revokedAt).not.toBeNull();
    expect(findReviewLink(db, second.token, new Date("2026-09-03T22:00:01.000Z"))).toBe(second.link);
  });
});

describe("public review state mutation", () => {
  it("requires a comment for changes and updates only selected artwork", () => {
    const { db, campaign, artwork } = campaignWithArtwork();
    const now = new Date("2026-09-03T20:00:00.000Z");
    const { link } = createReviewLink(db, { campaignId: campaign.id, selectedDeliverableIds: [artwork[0].id] }, now);
    expect(() => mutateReviewState(db, link, { decision: "request_changes", comment: " " }, now)).toThrow(/comment is required/i);
    mutateReviewState(db, link, { decision: "request_changes", comment: "Increase the date contrast." }, now);
    expect(link).toMatchObject({ approvalState: "changes_requested", reviewerComment: "Increase the date contrast." });
    expect(artwork[0].approvalStatus).toBe("changes_requested");
    expect(artwork[1].approvalStatus).toBe("draft");
  });

  it("approves selected artwork and exposes no repository or campaign identifiers publicly", () => {
    const { db, campaign, artwork } = campaignWithArtwork();
    const now = new Date("2026-09-03T20:00:00.000Z");
    const { link } = createReviewLink(db, { campaignId: campaign.id, selectedDeliverableIds: [artwork[0].id] }, now);
    mutateReviewState(db, link, { decision: "approve" }, now);
    expect(artwork[0].approvalStatus).toBe("approved");
    const payload = publicReviewPayload(db, link);
    const serialized = JSON.stringify(payload);
    expect(payload.approvalState).toBe("approved");
    expect(serialized).not.toContain(campaign.id);
    expect(serialized).not.toContain(artwork[0].id);
    expect(serialized).not.toContain(link.id);
    expect(serialized).not.toContain(link.tokenHash);
  });

  it("locks the link after its first submitted decision", () => {
    const { db, campaign, artwork } = campaignWithArtwork();
    const now = new Date("2026-09-03T20:00:00.000Z");
    const { link } = createReviewLink(db, { campaignId: campaign.id, selectedDeliverableIds: [artwork[0].id] }, now);
    mutateReviewState(db, link, { decision: "approve" }, now);
    expect(() => mutateReviewState(
      db,
      link,
      { decision: "request_changes", comment: "Changed my mind." },
      new Date("2026-09-03T20:01:00.000Z"),
    )).toThrow(/already been submitted/i);
    expect(link.approvalState).toBe("approved");
    expect(artwork[0].approvalStatus).toBe("approved");
  });
});

describe("editor project review integration", () => {
  it("versions a Promo Kit project and reviews the exact persisted artwork snapshot", () => {
    const db = fixtureDatabase();
    const payload = {
      fields: {
        headline: "Poolside Family Night",
        summary: "Swimming and music.",
        schedule: "September 18, 2026 · 6:30 PM–8:30 PM",
        location: "Outdoor Pool",
        cta: "RSVP at the front desk",
      },
      artworks: [{ key: "square", kind: "still", format: "Social 1:1", width: 1080, height: 1080, dataUrl: "data:image/jpeg;base64,exact-v1" }],
    };
    const save = applyAction(actionRequestSchema.parse({
      action: "saveCreativeProject", kind: "promo", recordId: "record-event", title: "Poolside Family Night Promo Kit", payload,
    }), db);
    const projectId = String(save.creativeProjectId);
    const created = applyAction(actionRequestSchema.parse({
      action: "createProjectReviewLink", creativeProjectId: projectId, selectedArtworkKeys: ["square"], expiresInHours: 24,
    }), db);
    const link = db.reviewLinks.find((item) => item.id === created.reviewLinkId)!;
    const publicPayload = publicReviewPayload(db, link);
    expect(publicPayload.version).toBe(1);
    expect(JSON.stringify(publicPayload)).toContain("exact-v1");
    expect(JSON.stringify(publicPayload)).not.toContain(projectId);

    payload.artworks[0].dataUrl = "data:image/jpeg;base64,exact-v2";
    applyAction(actionRequestSchema.parse({
      action: "saveCreativeProject", projectId, kind: "promo", recordId: "record-event", title: "Poolside Family Night Promo Kit", payload,
    }), db);
    expect(db.creativeProjects[0].version).toBe(2);
    expect(JSON.stringify(publicReviewPayload(db, link))).toContain("exact-v1");
    expect(JSON.stringify(publicReviewPayload(db, link))).not.toContain("exact-v2");
  });
});
