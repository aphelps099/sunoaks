import { describe, expect, it } from "vitest";
import {
  EXPORT_FORMATS,
  assertCalendarTarget,
  buildDeliverables,
  createSourceSnapshot,
  creativeOverflowResults,
  deriveCampaignRollup,
  normalizedRecordKey,
  packForRecord,
  parseSource,
  sourceFingerprint,
  validateDatabaseIntegrity,
  validateProtectedFacts,
} from "../lib/domain";
import { isDateInMonth } from "../lib/calendar";
import { CREATIVE_TEXT_SPEC, estimateTextWidth, fitTextBlock } from "../lib/creative-text";
import { fixtureDatabase } from "./fixtures";

describe("ingestion parsing and identity", () => {
  it("extracts exact event and recurring-class facts without invention", () => {
    expect(parseSource("Poolside Family Night\nSeptember 18, 2026 at 6:30 PM\nLocation: Outdoor Pool")).toMatchObject({
      recordType: "event", name: "Poolside Family Night", date: "2026-09-18", startTime: "18:30", location: "Outdoor Pool",
    });
    expect(parseSource("Sunrise Strength\nEvery Tuesday and Thursday at 6:00 AM–6:50 AM\nLocation: Studio A")).toMatchObject({
      recordType: "recurring_class", daysOfWeek: [2, 4], startTime: "06:00", endTime: "06:50", location: "Studio A",
    });
  });

  it("does not invent a year for month/day-only text", () => {
    const candidate = parseSource("Pool Social\nSeptember 18 at 6 PM\nLocation: Outdoor Pool");
    expect(candidate.date).toBeUndefined();
    expect(candidate.warnings).toContain("Confirm the event year.");
  });

  it("normalizes source fingerprints and record keys for duplicate review", () => {
    expect(sourceFingerprint(" Event  Name\n6 PM ")).toBe(sourceFingerprint("event name 6 pm"));
    expect(normalizedRecordKey("event", "Poolside Family Night!")).toBe("event:poolside-family-night");
  });
});

describe("typed targets, snapshots, and protected facts", () => {
  it("enforces target ownership and persisted referential integrity", () => {
    const db = fixtureDatabase();
    expect(assertCalendarTarget(db.calendarItems[1], db)).toBe(true);
    db.calendarItems[1].contentRecordId = "record-event";
    expect(() => validateDatabaseIntegrity(db)).toThrow(/owning trusted/);
  });

  it("immutably snapshots schedule-rule and approved asset facts", () => {
    const db = fixtureDatabase();
    const record = db.records[1];
    const snapshot = createSourceSnapshot(record, db.calendarItems[1], db, "2026-09-03T00:00:00.000Z");
    db.scheduleRules[0].daysOfWeek = [1];
    db.assets[0].title = "Changed later";
    expect(snapshot.target).toMatchObject({ type: "scheduleRule", daysOfWeek: [2, 4], timezone: "America/Los_Angeles" });
    expect(snapshot.asset).toMatchObject({ id: "asset-approved", title: "Approved", rightsStatus: "approved" });
    const outputs = buildDeliverables("campaign", snapshot, "class-spotlight");
    expect(outputs[0].creativeFields.schedule).toBe("Tuesday & Thursday · 06:00");
    expect(validateProtectedFacts(outputs[4].creativeFields.caption, snapshot).every((result) => result.present)).toBe(true);
  });

  it("snapshots a specific occurrence when that is the selected target", () => {
    const db = fixtureDatabase();
    const item = { ...db.calendarItems[1], targetType: "occurrence" as const, targetId: "occurrence-class" };
    const snapshot = createSourceSnapshot(db.records[1], item, db);
    expect(snapshot.target).toMatchObject({ type: "occurrence", id: "occurrence-class", startsAt: "2026-09-08T13:00:00.000Z" });
  });
});

describe("campaign mapping, rollup, dimensions, and text safety", () => {
  const db = fixtureDatabase();
  const snapshot = createSourceSnapshot(db.records[0], db.calendarItems[0], db);
  const items = buildDeliverables("campaign", snapshot, "event-promo");

  it("maps pilot packs and creates six coordinated deliverables", () => {
    expect(packForRecord("event")).toBe("event-promo");
    expect(packForRecord("recurring_class")).toBe("class-spotlight");
    expect(items.map((item) => item.deliverableType)).toEqual(["still", "still", "still", "motion", "caption", "emailCopy"]);
  });

  it("derives campaign approval rollup", () => {
    expect(deriveCampaignRollup(items)).toBe("in_review");
    expect(deriveCampaignRollup(items.map((item) => ({ ...item, approvalStatus: "approved" })))).toBe("ready");
    expect(deriveCampaignRollup(items.map((item, index) => index ? item : { ...item, validationResults: [{ code: "facts", severity: "error", message: "Mismatch" }] }))).toBe("blocked");
  });

  it("locks production export dimensions", () => {
    expect(EXPORT_FORMATS).toEqual({
      square: { width: 1080, height: 1080 }, portrait: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 },
    });
  });

  it("blocks approval for long text that cannot fit protected template areas", () => {
    const results = creativeOverflowResults({ headline: "A".repeat(73), hook: "Short", schedule: "Tuesday", cta: "Reserve" });
    expect(results).toEqual([expect.objectContaining({ code: "headline-overflow", severity: "error" })]);
  });

  it("deterministically truncates and rejects an overlong unbroken wide token", () => {
    const token = "W".repeat(60);
    const layout = fitTextBlock(
      token,
      CREATIVE_TEXT_SPEC.maxWidth,
      CREATIVE_TEXT_SPEC.headline.startSize,
      CREATIVE_TEXT_SPEC.headline.minSize,
      CREATIVE_TEXT_SPEC.headline.maxLines,
    );
    expect(layout.truncated).toBe(true);
    expect(layout.lines.some((line) => line.endsWith("…"))).toBe(true);
    expect(layout.lines.every((line) => estimateTextWidth(line, layout.fontSize) <= CREATIVE_TEXT_SPEC.maxWidth)).toBe(true);
    expect(creativeOverflowResults({ headline: token, hook: "Short", schedule: "Tuesday", cta: "Reserve" })).toEqual([
      expect.objectContaining({ code: "headline-overflow", severity: "error" }),
    ]);
  });
});

describe("calendar month filtering", () => {
  it("requires the displayed year and month, not only day-of-month", () => {
    expect(isDateInMonth("2026-09-18", 2026, 9)).toBe(true);
    expect(isDateInMonth("2026-10-18", 2026, 9)).toBe(false);
    expect(isDateInMonth("2025-09-18", 2026, 9)).toBe(false);
  });
});
