import type { Database } from "../lib/domain";

export function fixtureDatabase(): Database {
  const now = "2026-09-02T16:30:00.000Z";
  return {
    schemaVersion: 1,
    sources: [
      { id: "source-event", sourceType: "guided", title: "Poolside Family Night", rawText: "Verified source", fingerprint: "event-fingerprint", createdAt: now, createdBy: "pilot", processingStatus: "published" },
      { id: "source-class", sourceType: "guided", title: "Sunrise Strength", rawText: "Verified class source", fingerprint: "class-fingerprint", createdAt: now, createdBy: "pilot", processingStatus: "published" },
      { id: "source-update", sourceType: "guided", title: "Updated schedule", rawText: "Updated class source", fingerprint: "update-fingerprint", createdAt: now, createdBy: "pilot", processingStatus: "candidate" },
    ],
    records: [
      {
        id: "record-event", normalizedKey: "event:poolside-family-night", recordType: "event", name: "Poolside Family Night",
        summary: "Swimming and music.", description: "A verified event.", date: "2026-09-18", startTime: "18:30", endTime: "20:30",
        location: "Outdoor Pool", price: "Included", cta: "RSVP at the front desk", status: "verified", verificationStatus: "verified",
        sourceIds: ["source-event"], version: 1, updatedAt: now, lastConfirmedAt: now, active: true, assetId: "asset-approved",
      },
      {
        id: "record-class", normalizedKey: "recurring_class:sunrise-strength", recordType: "recurring_class", name: "Sunrise Strength",
        summary: "Morning strength.", description: "Every Tuesday and Thursday.", startTime: "06:00", endTime: "06:50",
        location: "Studio A", instructor: "Delaney", cta: "Reserve in the app", status: "verified", verificationStatus: "verified",
        sourceIds: ["source-class"], version: 1, updatedAt: now, lastConfirmedAt: now, active: true, assetId: "asset-approved",
      },
    ],
    recordVersions: [],
    scheduleRules: [{
      id: "rule-class", contentRecordId: "record-class", daysOfWeek: [2, 4], startTime: "06:00", endTime: "06:50",
      startDate: "2026-09-01", endDate: null, timezone: "America/Los_Angeles", location: "Studio A", exceptions: [],
    }],
    occurrences: [{
      id: "occurrence-class", contentRecordId: "record-class", scheduleRuleId: "rule-class",
      startsAt: "2026-09-08T13:00:00.000Z", endsAt: "2026-09-08T13:50:00.000Z", status: "scheduled",
    }],
    calendarItems: [
      { id: "calendar-event", contentRecordId: "record-event", targetType: "contentRecord", targetId: "record-event", marketingDate: "2026-09-10", objective: "launch", status: "verified", campaignId: null },
      { id: "calendar-class", contentRecordId: "record-class", targetType: "scheduleRule", targetId: "rule-class", marketingDate: "2026-09-08", objective: "spotlight", status: "verified", campaignId: null },
    ],
    assets: [
      {
        id: "asset-approved", assetType: "image", fileReference: "/approved.jpg", title: "Approved", altText: "Approved image",
        width: 1440, height: 1440, subjects: ["fitness"], usageTags: ["social"], focalPoint: { x: 0.5, y: 0.5 }, rightsStatus: "approved", active: true,
      },
      {
        id: "asset-review", assetType: "image", fileReference: "/review.jpg", title: "Under review", altText: "Image awaiting rights review",
        width: 1440, height: 1440, subjects: ["fitness"], usageTags: ["social"], focalPoint: { x: 0.5, y: 0.5 }, rightsStatus: "review", active: true,
      },
    ],
    campaigns: [],
    deliverables: [],
    exportEvents: [],
    reviewLinks: [],
    creativeProjects: [],
  };
}
