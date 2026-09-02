import { describe, expect, it } from "vitest";
import { actionRequestSchema, applyAction } from "../lib/action-service";
import { validateDatabaseIntegrity } from "../lib/domain";
import { fixtureDatabase } from "./fixtures";

describe("server-side candidate validation", () => {
  it("rejects incomplete candidates and malformed dates before mutation", () => {
    const invalid = actionRequestSchema.safeParse({
      action: "publishCandidate", sourceId: "source-event", marketingDate: "not-a-date",
      candidate: { recordType: "event", name: "Only a name", summary: "x", description: "x", startTime: "25:90", location: "", cta: "RSVP", daysOfWeek: [] },
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects active images whose rights are not approved", () => {
    const db = fixtureDatabase();
    expect(() => applyAction({ action: "setRecordAsset", recordId: "record-event", assetId: "asset-review" }, db)).toThrow(/approved usage rights/);
  });

  it("rejects a crafted overwrite of an unrelated same-type record", () => {
    const db = fixtureDatabase();
    const input = actionRequestSchema.parse({
      action: "publishCandidate", sourceId: "source-update", duplicateDecision: "update",
      duplicateRecordId: "record-event", marketingDate: "2026-09-15",
      candidate: {
        recordType: "event", name: "Completely Different Event", summary: "Different event",
        description: "Different verified event.", date: "2026-10-01", startTime: "17:00",
        location: "Tennis Courts", cta: "Register", daysOfWeek: [],
      },
    });
    expect(() => applyAction(input, db)).toThrow(/normalized key/);
    expect(db.records[0].name).toBe("Poolside Family Night");
  });
});

describe("recurring-class version updates", () => {
  it("updates the existing schedule rule atomically with the record", () => {
    const db = fixtureDatabase();
    const input = actionRequestSchema.parse({
      action: "publishCandidate", sourceId: "source-update", duplicateDecision: "update", duplicateRecordId: "record-class", marketingDate: "2026-09-15",
      candidate: {
        recordType: "recurring_class", name: "Sunrise Strength", summary: "Updated class", description: "Updated verified schedule",
        date: "2026-10-01", startTime: "07:00", endTime: "07:45", location: "Studio B", instructor: "Delaney",
        cta: "Reserve in the app", daysOfWeek: [1, 3], assetId: "asset-approved",
      },
    });
    applyAction(input, db);
    expect(db.records.find((item) => item.id === "record-class")).toMatchObject({ version: 2, startTime: "07:00", location: "Studio B" });
    expect(db.scheduleRules.find((item) => item.id === "rule-class")).toMatchObject({
      daysOfWeek: [1, 3], startTime: "07:00", endTime: "07:45", startDate: "2026-10-01", location: "Studio B",
    });
    expect(validateDatabaseIntegrity(db)).toBe(db);
  });

  it("versions canonical asset changes without altering an existing campaign snapshot", () => {
    const db = fixtureDatabase();
    applyAction({ action: "generateCampaign", calendarItemId: "calendar-event", packId: "event-promo" }, db);
    const campaignAsset = db.campaigns[0].sourceSnapshot.asset?.id;
    applyAction({ action: "setRecordAsset", recordId: "record-event", assetId: null }, db);
    expect(db.records[0]).toMatchObject({ assetId: null, version: 2 });
    expect(db.recordVersions.at(-1)).toMatchObject({ recordId: "record-event", version: 2, changedFields: ["assetId"] });
    expect(db.campaigns[0].sourceSnapshot.asset?.id).toBe(campaignAsset);
  });
});

describe("campaign generation and authorized exports", () => {
  const completeCampaign = (db: ReturnType<typeof fixtureDatabase>, calendarItemId: string) => {
    const campaignId = db.calendarItems.find((item) => item.id === calendarItemId)?.campaignId;
    for (const deliverable of db.deliverables.filter((item) => item.campaignId === campaignId)) {
      applyAction({ action: "setApproval", deliverableId: deliverable.id, status: "approved" }, db);
      applyAction({ action: "markExported", calendarItemId, deliverableId: deliverable.id }, db);
    }
  };

  it("rejects duplicate generation for one calendar item", () => {
    const db = fixtureDatabase();
    applyAction({ action: "generateCampaign", calendarItemId: "calendar-event", packId: "event-promo" }, db);
    expect(() => applyAction({ action: "generateCampaign", calendarItemId: "calendar-event", packId: "event-promo" }, db)).toThrow(/already has a campaign/);
    expect(db.campaigns).toHaveLength(1);
    expect(db.deliverables).toHaveLength(6);
    db.campaigns[0].sourceSnapshot.target.id = "wrong-target";
    expect(() => validateDatabaseIntegrity(db)).toThrow(/wrong calendar target/);
  });

  it("gates by approval and ownership, records per-deliverable exports, and completes only the full set", () => {
    const db = fixtureDatabase();
    applyAction({ action: "generateCampaign", calendarItemId: "calendar-event", packId: "event-promo" }, db);
    const first = db.deliverables[0];
    expect(() => applyAction({ action: "authorizeExport", calendarItemId: "calendar-event", deliverableId: first.id }, db)).toThrow(/Approve/);
    expect(() => applyAction({ action: "markExported", calendarItemId: "calendar-event", deliverableId: first.id }, db)).toThrow(/Approve/);
    expect(() => applyAction({ action: "markExported", calendarItemId: "calendar-class", deliverableId: first.id }, db)).toThrow(/no current campaign/);
    for (const deliverable of db.deliverables) {
      applyAction({ action: "setApproval", deliverableId: deliverable.id, status: "approved" }, db);
      expect(applyAction({ action: "authorizeExport", calendarItemId: "calendar-event", deliverableId: deliverable.id }, db)).toMatchObject({ authorized: true });
      const result = applyAction({ action: "markExported", calendarItemId: "calendar-event", deliverableId: deliverable.id }, db);
      if (deliverable !== db.deliverables.at(-1)) expect(result.complete).toBe(false);
    }
    expect(db.exportEvents).toHaveLength(6);
    expect(db.calendarItems[0].status).toBe("done");
    expect(db.records[0].status).toBe("done");
    const duplicate = applyAction({ action: "markExported", calendarItemId: "calendar-event", deliverableId: first.id }, db);
    expect(duplicate.alreadyRecorded).toBe(true);
    expect(db.exportEvents).toHaveLength(6);

    const reopened = applyAction({ action: "setApproval", deliverableId: first.id, status: "changes_requested" }, db);
    expect(reopened.complete).toBe(false);
    expect(db.exportEvents).toHaveLength(5);
    expect(first.renderedFileReference).toBeNull();
    expect(db.calendarItems[0].status).toBe("campaign_generated");
    expect(db.records[0].status).toBe("campaign_generated");
  });

  it("aggregates record status across completed and unprocessed calendar items", () => {
    const db = fixtureDatabase();
    applyAction({ action: "generateCampaign", calendarItemId: "calendar-event", packId: "event-promo" }, db);
    completeCampaign(db, "calendar-event");
    expect(db.records[0].status).toBe("done");
    const oldDeliverableId = db.deliverables[0].id;

    const update = actionRequestSchema.parse({
      action: "publishCandidate", sourceId: "source-update", duplicateDecision: "update",
      duplicateRecordId: "record-event", marketingDate: "2026-10-05",
      candidate: {
        recordType: "event", name: "Poolside Family Night", summary: "A new date for family night",
        description: "Updated and verified event.", date: "2026-10-18", startTime: "18:30",
        endTime: "20:30", location: "Outdoor Pool", cta: "RSVP at the front desk",
        daysOfWeek: [], assetId: "asset-approved",
      },
    });
    const published = applyAction(update, db);
    const newItemId = published.calendarItemId as string;
    expect(db.calendarItems.find((item) => item.id === newItemId)).toMatchObject({ status: "verified", campaignId: null });
    expect(db.records[0].status).toBe("verified");

    applyAction({ action: "markExported", calendarItemId: "calendar-event", deliverableId: oldDeliverableId }, db);
    expect(db.records[0].status).toBe("verified");

    applyAction({ action: "generateCampaign", calendarItemId: newItemId, packId: "event-promo" }, db);
    expect(db.records[0].status).toBe("campaign_generated");
    completeCampaign(db, newItemId);
    expect(db.records[0].status).toBe("done");

    applyAction({ action: "setApproval", deliverableId: oldDeliverableId, status: "draft" }, db);
    expect(db.calendarItems.find((item) => item.id === "calendar-event")?.status).toBe("campaign_generated");
    expect(db.records[0].status).toBe("campaign_generated");
  });
});
