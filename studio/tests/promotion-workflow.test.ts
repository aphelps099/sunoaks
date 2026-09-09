import { describe, expect, it } from "vitest";
import { actionRequestSchema, applyAction } from "../lib/action-service";
import { validateDatabaseIntegrity } from "../lib/domain";
import { calendarDays, clubDate, recordSchedule, type PromotionOutput } from "../lib/promotion";
import { createReviewLink, findReviewLink, mutateReviewState, publicReviewPayload } from "../lib/review-service";
import { parseStudioRoute, studioSearch } from "../lib/studio-navigation";
import { fixtureDatabase } from "./fixtures";

function promotion(formats: PromotionOutput[] = ["portrait", "instagram-caption"]) {
  const db = fixtureDatabase();
  const result = applyAction(actionRequestSchema.parse({ action: "createPromotion", recordId: "record-event", calendarItemId: "calendar-event", marketingDate: "2026-09-11", formats }), db);
  return { db, id: String(result.campaignId) };
}
const versions = (db: ReturnType<typeof fixtureDatabase>) => Object.fromEntries(db.deliverables.map((item) => [item.id, item.version]));

describe("selected promotion materials", () => {
  it("completes a post and caption without requiring unselected video or email", () => {
    const { db, id } = promotion();
    expect(db.calendarItems).toHaveLength(2);
    expect(db.calendarItems[0].marketingDate).toBe("2026-09-11");
    expect(db.deliverables.map((item) => item.format)).toEqual(["portrait", "instagram-caption"]);
    applyAction({ action: "approveCampaign", campaignId: id, expectedVersions: versions(db) }, db);
    for (const output of db.deliverables) applyAction({ action: "markExported", calendarItemId: "calendar-event", deliverableId: output.id, expectedVersion: output.version }, db);
    expect(db.calendarItems[0].status).toBe("done");
    expect(validateDatabaseIntegrity(db)).toBe(db);
  });

  it("rejects empty and unknown output choices and an unrelated planned item", () => {
    for (const formats of [[], ["facebook-publish"]]) expect(actionRequestSchema.safeParse({ action: "createPromotion", recordId: "record-event", marketingDate: "2026-09-11", formats }).success).toBe(false);
    const db = fixtureDatabase();
    expect(() => applyAction({ action: "createPromotion", recordId: "record-event", calendarItemId: "calendar-class", marketingDate: "2026-09-11", formats: ["portrait"] }, db)).toThrow(/no longer available/);
    expect(db.campaigns).toHaveLength(0);
  });

  it("keeps the old promotion unchanged when creating one from updated details", () => {
    const { db } = promotion();
    const original = structuredClone(db.campaigns[0]);
    applyAction({ action: "updateRecord", recordId: "record-event", changes: { location: "Family Pool" } }, db);
    applyAction({ action: "createPromotion", recordId: "record-event", marketingDate: "2026-09-12", formats: ["portrait"] }, db);
    expect(db.campaigns[0]).toEqual(original);
    expect(db.campaigns[1].sourceSnapshot.facts.location).toBe("Family Pool");
    expect(validateDatabaseIntegrity(db)).toBe(db);
  });
});

describe("saved wording and review integrity", () => {
  it("saves creative wording, preserves operational facts, and retires old approvals and links", () => {
    const { db, id } = promotion(["portrait", "instagram-caption", "structured-email-copy"]);
    const { token } = createReviewLink(db, { campaignId: id, selectedDeliverableIds: db.deliverables.map((item) => item.id) });
    applyAction({ action: "approveCampaign", campaignId: id, expectedVersions: versions(db) }, db);
    for (const item of db.deliverables) applyAction({ action: "markExported", calendarItemId: "calendar-event", deliverableId: item.id }, db);
    const before = structuredClone(db.campaigns[0].sourceSnapshot);
    applyAction({ action: "updateCampaignCopy", campaignId: id, expectedVersions: versions(db), headline: "Meet us by the pool", hook: "Bring the family for an evening together." }, db);
    expect(db.campaigns[0].sourceSnapshot).toEqual(before);
    expect(db.deliverables[0].creativeFields).toMatchObject({ headline: "Meet us by the pool", location: "Outdoor Pool", cta: "RSVP at the front desk" });
    expect(db.deliverables[1].creativeFields.caption).toContain("2026-09-18 · 18:30");
    expect(db.deliverables[1].creativeFields.caption).toContain("Meet us by the pool");
    expect(db.deliverables[1].creativeFields.caption).toContain("Poolside Family Night");
    expect(db.deliverables[2].creativeFields.subject).toBe("Meet us by the pool at Sun Oaks");
    expect(db.deliverables.every((item) => item.version === 2 && item.approvalStatus === "draft")).toBe(true);
    expect(db.exportEvents).toHaveLength(0);
    expect(findReviewLink(db, token)).toBeUndefined();
    expect(db.calendarItems[0].status).toBe("campaign_generated");
    expect(validateDatabaseIntegrity(db)).toBe(db);
  });

  it("rejects stale saves and stale downloads even when the new version is approved", () => {
    const { db, id } = promotion();
    const originalVersions = versions(db);
    applyAction({ action: "updateCampaignCopy", campaignId: id, expectedVersions: originalVersions, headline: "Family night", hook: "Join your neighbors." }, db);
    const before = structuredClone(db);
    expect(() => applyAction({ action: "updateCampaignCopy", campaignId: id, expectedVersions: originalVersions, headline: "Old edit", hook: "Outdated message." }, db)).toThrow(/another window/);
    expect(db).toEqual(before);
    expect(() => applyAction({ action: "setApproval", deliverableId: db.deliverables[0].id, expectedVersion: 1, status: "approved" }, db)).toThrow(/changed/);
    expect(db.deliverables[0].approvalStatus).toBe("draft");
    applyAction({ action: "approveCampaign", campaignId: id, expectedVersions: versions(db) }, db);
    expect(() => applyAction({ action: "markExported", calendarItemId: "calendar-event", deliverableId: db.deliverables[0].id, expectedVersion: 1 }, db)).toThrow(/changed/);
  });

  it("keeps drafts with overflowing text but refuses package approval", () => {
    const { db, id } = promotion();
    applyAction({ action: "updateCampaignCopy", campaignId: id, expectedVersions: versions(db), headline: "W".repeat(100), hook: "A short message." }, db);
    expect(db.deliverables[0].approvalStatus).toBe("draft");
    expect(() => applyAction({ action: "approveCampaign", campaignId: id, expectedVersions: versions(db) }, db)).toThrow(/flagged text/);
  });

  it("includes copy in a manager review and limits the response to the chosen materials", () => {
    const { db, id } = promotion();
    const caption = db.deliverables.find((item) => item.deliverableType === "caption")!;
    const { link } = createReviewLink(db, { campaignId: id, selectedDeliverableIds: [caption.id] });
    const payload = publicReviewPayload(db, link);
    expect(payload.artwork).toHaveLength(1);
    expect(payload.artwork[0]).toMatchObject({ kind: "caption" });
    mutateReviewState(db, link, { decision: "approve" });
    expect(caption.approvalStatus).toBe("approved");
    expect(db.deliverables[0].approvalStatus).toBe("draft");
  });

  it("saves and restores Promo Kit wording without accepting altered schedule details", () => {
    const db = fixtureDatabase();
    const payload = { fields: { headline: "Meet us by the pool", summary: "A family evening together.", schedule: "September 18, 2026 · 6:30 PM–8:30 PM", location: "Outdoor Pool", cta: "RSVP at the front desk" }, artworks: [{ key: "portrait", dataUrl: "data:image/jpeg;base64,saved" }] };
    const saved = applyAction(actionRequestSchema.parse({ action: "saveCreativeProject", kind: "promo", recordId: "record-event", title: "Family night design", payload }), db);
    expect(db.creativeProjects[0].payload.fields).toEqual(payload.fields);
    expect(() => applyAction(actionRequestSchema.parse({ action: "saveCreativeProject", projectId: saved.creativeProjectId, expectedVersion: 1, kind: "promo", recordId: "record-event", title: "Family night design", payload: { ...payload, fields: { ...payload.fields, schedule: "Tomorrow" } } }), db)).toThrow(/schedule/);
    expect(db.creativeProjects[0].version).toBe(1);
  });
});

describe("navigation and real dates", () => {
  it("restores the exact promotion from a URL and preserves editor return context", () => {
    const route = { view: "motion" as const, recordId: "record-event", campaignId: "campaign-older", origin: "campaigns" as const };
    expect(parseStudioRoute(studioSearch(route))).toMatchObject(route);
    expect(parseStudioRoute("?view=campaigns&campaign=first-promotion").campaignId).toBe("first-promotion");
    expect(parseStudioRoute("?view=unknown").view).toBe("create");
  });

  it("places September 1 under Tuesday and handles a leap-year February", () => {
    expect(calendarDays(2026, 9).slice(0, 3)).toEqual([null, 1, 2]);
    expect(calendarDays(2028, 2).filter(Boolean)).toHaveLength(29);
    expect(calendarDays(2026, 8)).toHaveLength(42);
    expect(clubDate(new Date("2026-10-01T01:00:00Z"))).toBe("2026-09-30");
  });

  it("includes recurring days and the complete time range in standalone designs", () => {
    const db = fixtureDatabase();
    expect(recordSchedule(db.records[1], db.scheduleRules)).toBe("Tuesday & Thursday · 6:00 AM–6:50 AM");
  });
});
