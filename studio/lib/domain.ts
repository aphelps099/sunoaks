import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { creativeTextLayouts } from "./creative-text";

export const lifecycleSchema = z.enum([
  "needs_information",
  "verified",
  "campaign_generated",
  "done",
]);
export const recordTypeSchema = z.enum(["event", "recurring_class"]);
export const targetTypeSchema = z.enum(["contentRecord", "scheduleRule", "occurrence"]);
export const approvalSchema = z.enum(["draft", "approved", "changes_requested"]);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date (YYYY-MM-DD).").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time (HH:MM).");

export const sourceDocumentSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["plain_text", "guided"]),
  title: z.string(),
  rawText: z.string(),
  fingerprint: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
  processingStatus: z.enum(["candidate", "published"]),
});

export const contentRecordSchema = z.object({
  id: z.string(),
  normalizedKey: z.string(),
  recordType: recordTypeSchema,
  name: z.string().min(2),
  summary: z.string(),
  description: z.string(),
  date: isoDateSchema.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  location: z.string().optional(),
  instructor: z.string().optional(),
  price: z.string().optional(),
  cta: z.string().default("Learn more at the front desk"),
  status: lifecycleSchema,
  verificationStatus: z.enum(["candidate", "verified"]),
  sourceIds: z.array(z.string()),
  version: z.number().int().positive(),
  updatedAt: z.string(),
  lastConfirmedAt: z.string(),
  active: z.boolean(),
  assetId: z.string().nullable(),
}).superRefine((record, context) => {
  if (record.verificationStatus !== "verified") return;
  if (!record.startTime) context.addIssue({ code: "custom", path: ["startTime"], message: "A verified record requires a start time." });
  if (!record.location?.trim()) context.addIssue({ code: "custom", path: ["location"], message: "A verified record requires a location." });
  if (record.recordType === "event" && !record.date) context.addIssue({ code: "custom", path: ["date"], message: "A verified event requires an exact date." });
});

export const recordVersionSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  version: z.number(),
  changedFields: z.array(z.string()),
  snapshot: contentRecordSchema,
  createdAt: z.string(),
});

export const scheduleRuleSchema = z.object({
  id: z.string(),
  contentRecordId: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: timeSchema,
  endTime: timeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  timezone: z.literal("America/Los_Angeles"),
  location: z.string(),
  exceptions: z.array(z.string()),
});

export const occurrenceSchema = z.object({
  id: z.string(),
  contentRecordId: z.string(),
  scheduleRuleId: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(["scheduled", "cancelled"]),
});

export const calendarItemSchema = z.object({
  id: z.string(),
  contentRecordId: z.string(),
  targetType: targetTypeSchema,
  targetId: z.string(),
  marketingDate: isoDateSchema,
  objective: z.enum(["launch", "spotlight"]),
  status: lifecycleSchema,
  campaignId: z.string().nullable(),
});

export const assetSchema = z.object({
  id: z.string(),
  assetType: z.literal("image"),
  fileReference: z.string(),
  title: z.string(),
  altText: z.string(),
  width: z.number(),
  height: z.number(),
  subjects: z.array(z.string()),
  usageTags: z.array(z.string()),
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  rightsStatus: z.enum(["approved", "review"]),
  active: z.boolean(),
});

export const sourceSnapshotSchema = z.object({
  contentRecordId: z.string(),
  recordVersion: z.number(),
  asset: z.object({
    id: z.string(),
    fileReference: z.string(),
    title: z.string(),
    altText: z.string(),
    width: z.number(),
    height: z.number(),
    focalPoint: z.object({ x: z.number(), y: z.number() }),
    rightsStatus: z.literal("approved"),
  }).nullable(),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("contentRecord"), id: z.string(), contentRecordId: z.string() }),
    z.object({
      type: z.literal("scheduleRule"), id: z.string(), contentRecordId: z.string(),
      daysOfWeek: z.array(z.number()), startTime: timeSchema, endTime: timeSchema,
      startDate: isoDateSchema, endDate: isoDateSchema.nullable(), timezone: z.string(),
      location: z.string(), exceptions: z.array(z.string()),
    }),
    z.object({
      type: z.literal("occurrence"), id: z.string(), contentRecordId: z.string(),
      scheduleRuleId: z.string().nullable(), startsAt: z.string().datetime(), endsAt: z.string().datetime(),
      status: z.enum(["scheduled", "cancelled"]),
    }),
  ]),
  capturedAt: z.string(),
  facts: z.object({
    recordType: recordTypeSchema,
    name: z.string(),
    date: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    location: z.string().optional(),
    instructor: z.string().optional(),
    price: z.string().optional(),
    cta: z.string(),
  }),
});

export const deliverableSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  deliverableType: z.enum(["still", "motion", "caption", "emailCopy"]),
  format: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  templateReference: z.string(),
  creativeFields: z.record(z.string(), z.string()),
  renderedFileReference: z.string().nullable(),
  required: z.boolean(),
  validationResults: z.array(z.object({ code: z.string(), severity: z.enum(["info", "warning", "error"]), message: z.string() })),
  approvalStatus: approvalSchema,
  version: z.number(),
  editedAt: z.string(),
  approvedAt: z.string().nullable(),
});

export const exportEventSchema = z.object({
  id: z.string(),
  deliverableId: z.string(),
  campaignId: z.string(),
  calendarItemId: z.string(),
  format: z.string(),
  exportedAt: z.string().datetime(),
});

export const campaignSchema = z.object({
  id: z.string(),
  calendarItemId: z.string(),
  campaignPackId: z.enum(["event-promo", "class-spotlight"]),
  sourceSnapshot: sourceSnapshotSchema,
  createdAt: z.string(),
});

export const reviewLinkSchema = z.object({
  id: z.string(),
  campaignId: z.string().nullable().default(null),
  creativeProjectId: z.string().nullable().default(null),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  selectedDeliverableIds: z.array(z.string()).default([]),
  selectedArtworkKeys: z.array(z.string()).default([]),
  projectSnapshot: z.object({
    kind: z.enum(["promo", "motion"]),
    payload: z.record(z.string(), z.unknown()),
  }).nullable().default(null),
  title: z.string().min(1).max(160),
  version: z.number().int().positive(),
  approvalState: z.enum(["pending", "approved", "changes_requested"]),
  reviewerComment: z.string().max(4000).nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  reviewedAt: z.string().datetime().nullable(),
}).refine((link) => Boolean(link.campaignId) !== Boolean(link.creativeProjectId), "Review link must target one campaign or creative project.");

export const creativeProjectSchema = z.object({
  id: z.string(),
  kind: z.enum(["promo", "motion"]),
  recordId: z.string(),
  title: z.string().min(1).max(160),
  version: z.number().int().positive(),
  sourceRecordVersion: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const databaseSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.array(sourceDocumentSchema),
  records: z.array(contentRecordSchema),
  recordVersions: z.array(recordVersionSchema),
  scheduleRules: z.array(scheduleRuleSchema),
  occurrences: z.array(occurrenceSchema),
  calendarItems: z.array(calendarItemSchema),
  assets: z.array(assetSchema),
  campaigns: z.array(campaignSchema),
  deliverables: z.array(deliverableSchema),
  exportEvents: z.array(exportEventSchema).default([]),
  reviewLinks: z.array(reviewLinkSchema).default([]),
  creativeProjects: z.array(creativeProjectSchema).default([]),
});

export type Database = z.infer<typeof databaseSchema>;
export type ContentRecord = z.infer<typeof contentRecordSchema>;
export type ScheduleRule = z.infer<typeof scheduleRuleSchema>;
export type Occurrence = z.infer<typeof occurrenceSchema>;
export type CalendarItem = z.infer<typeof calendarItemSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type Deliverable = z.infer<typeof deliverableSchema>;
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;
export type ExportEvent = z.infer<typeof exportEventSchema>;
export type ReviewLink = z.infer<typeof reviewLinkSchema>;
export type CreativeProject = z.infer<typeof creativeProjectSchema>;

const LIFECYCLE_ORDER: Record<CalendarItem["status"], number> = {
  needs_information: 0,
  verified: 1,
  campaign_generated: 2,
  done: 3,
};

export function deriveRecordStatus(record: Pick<ContentRecord, "id" | "verificationStatus">, items: CalendarItem[]): ContentRecord["status"] {
  const relevant = items.filter((item) => item.contentRecordId === record.id);
  if (!relevant.length) return record.verificationStatus === "verified" ? "verified" : "needs_information";
  return relevant.reduce((leastComplete, item) =>
    LIFECYCLE_ORDER[item.status] < LIFECYCLE_ORDER[leastComplete] ? item.status : leastComplete,
  relevant[0].status);
}

export function reconcileRecordStatuses<T extends Pick<Database, "records" | "calendarItems">>(db: T): T {
  for (const record of db.records) record.status = deriveRecordStatus(record, db.calendarItems);
  return db;
}

export type Candidate = {
  recordType: z.infer<typeof recordTypeSchema>;
  name: string;
  summary: string;
  description: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  instructor?: string;
  price?: string;
  daysOfWeek: number[];
  sourceExcerpts: Record<string, string>;
  warnings: string[];
};

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};
const DAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

export function sourceFingerprint(rawText: string) {
  return createHash("sha256").update(rawText.trim().replace(/\s+/g, " ").toLowerCase()).digest("hex");
}

export function normalizedRecordKey(type: string, name: string) {
  return `${type}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function parseSource(rawText: string, guidedType?: "event" | "recurring_class"): Candidate {
  const text = rawText.trim();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const recurring = guidedType === "recurring_class" || (!guidedType && /\b(every|weekly|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\b/i.test(text));
  const recordType = recurring ? "recurring_class" : "event";
  const labeled = (name: string) => lines.find((line) => new RegExp(`^${name}\\s*:`, "i").test(line))?.replace(/^[^:]+:\s*/, "");
  const name = labeled("name|title|class|event") || lines[0]?.replace(/^(class|event)\s*:\s*/i, "") || "";

  const dateMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/) ||
    text.match(new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\s+(\\d{1,2})(?:,\\s*(20\\d{2}))?`, "i"));
  let date: string | undefined;
  if (dateMatch) {
    date = dateMatch[0].includes("-")
      ? dateMatch[0]
      : dateMatch[3]
        ? `${dateMatch[3]}-${MONTHS[dateMatch[1].toLowerCase()]}-${String(dateMatch[2]).padStart(2, "0")}`
        : undefined;
  }

  const timeMatches = [...text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)];
  const normalizeTime = (match?: RegExpMatchArray) => {
    if (!match) return undefined;
    let hour = Number(match[1]);
    if (match[3].toLowerCase() === "pm" && hour < 12) hour += 12;
    if (match[3].toLowerCase() === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${match[2] || "00"}`;
  };
  const dayMatches = Object.entries(DAYS)
    .filter(([label]) => new RegExp(`\\b${label}s?\\b`, "i").test(text))
    .map(([, value]) => value);
  const daysOfWeek = [...new Set(dayMatches)];
  const location = labeled("location|where") || text.match(/\b(?:at|in)\s+(Studio [A-Z]|Pool|Tennis Courts?|Sun Oaks(?: Club)?)\b/i)?.[1];
  const instructor = labeled("instructor|trainer|coach") || text.match(/\b(?:with|led by|instructor:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1];
  const price = labeled("price|cost") || text.match(/\$\d+(?:\.\d{2})?(?:\s+\w+)?/)?.[0];
  const summary = labeled("summary") || lines.slice(1).find((line) => !/^(date|time|location|where|instructor|trainer|coach|price|cost)\s*:/i.test(line)) || `Join us for ${name}.`;
  const warnings: string[] = [];
  if (!name) warnings.push("A name is required.");
  if (!recurring && !date) warnings.push(dateMatch ? "Confirm the event year." : "Confirm the event date.");
  if (recurring && !daysOfWeek.length) warnings.push("Confirm at least one recurring day.");
  if (!timeMatches.length) warnings.push("Confirm the start time.");
  if (!location) warnings.push("Confirm the location.");

  return {
    recordType,
    name,
    summary,
    description: text,
    date,
    startTime: normalizeTime(timeMatches[0]),
    endTime: normalizeTime(timeMatches[1]),
    location,
    instructor,
    price,
    daysOfWeek,
    warnings,
    sourceExcerpts: {
      name: lines[0] || "",
      schedule: lines.find((line) => /\b(am|pm|every|monday|tuesday|wednesday|thursday|friday|saturday|sunday|20\d{2}-)\b/i.test(line)) || "",
      location: lines.find((line) => /\b(location|where|studio|pool|court|sun oaks)\b/i.test(line)) || "",
    },
  };
}

export function resolveCalendarOwner(
  targetType: z.infer<typeof targetTypeSchema>,
  targetId: string,
  db: Pick<Database, "records" | "scheduleRules" | "occurrences">,
) {
  if (targetType === "contentRecord") return db.records.find((item) => item.id === targetId)?.id;
  if (targetType === "scheduleRule") return db.scheduleRules.find((item) => item.id === targetId)?.contentRecordId;
  return db.occurrences.find((item) => item.id === targetId)?.contentRecordId;
}

export function assertCalendarTarget(item: Pick<CalendarItem, "contentRecordId" | "targetType" | "targetId">, db: Pick<Database, "records" | "scheduleRules" | "occurrences">) {
  const owner = resolveCalendarOwner(item.targetType, item.targetId, db);
  if (!owner || owner !== item.contentRecordId) throw new Error("Calendar target must resolve to its owning trusted content record.");
  return true;
}

export function validateDatabaseIntegrity(db: Database) {
  const sourceIds = new Set(db.sources.map((item) => item.id));
  const recordIds = new Set(db.records.map((item) => item.id));
  const assetIds = new Set(db.assets.map((item) => item.id));
  const campaignIds = new Set(db.campaigns.map((item) => item.id));
  const deliverableIds = new Set(db.deliverables.map((item) => item.id));
  const calendarIds = new Set(db.calendarItems.map((item) => item.id));
  for (const record of db.records) {
    if (record.sourceIds.some((id) => !sourceIds.has(id))) throw new Error(`Record ${record.id} references a missing source.`);
    if (record.assetId && !assetIds.has(record.assetId)) throw new Error(`Record ${record.id} references a missing asset.`);
    if (record.status !== deriveRecordStatus(record, db.calendarItems)) throw new Error(`Record ${record.id} has a stale derived lifecycle status.`);
    if (record.recordType === "recurring_class" && record.verificationStatus === "verified" && !db.scheduleRules.some((rule) => rule.contentRecordId === record.id)) {
      throw new Error(`Verified recurring class ${record.id} requires a schedule rule.`);
    }
  }
  for (const rule of db.scheduleRules) if (!recordIds.has(rule.contentRecordId)) throw new Error(`Schedule rule ${rule.id} has no owning record.`);
  for (const occurrence of db.occurrences) {
    if (!recordIds.has(occurrence.contentRecordId)) throw new Error(`Occurrence ${occurrence.id} has no owning record.`);
    if (occurrence.scheduleRuleId) {
      const rule = db.scheduleRules.find((item) => item.id === occurrence.scheduleRuleId);
      if (!rule || rule.contentRecordId !== occurrence.contentRecordId) throw new Error(`Occurrence ${occurrence.id} has an inconsistent schedule rule.`);
    }
  }
  for (const item of db.calendarItems) {
    assertCalendarTarget(item, db);
    if (item.campaignId) {
      const campaign = db.campaigns.find((entry) => entry.id === item.campaignId);
      if (!campaign || campaign.calendarItemId !== item.id) throw new Error(`Calendar item ${item.id} has an inconsistent campaign.`);
    }
  }
  for (const campaign of db.campaigns) {
    const item = db.calendarItems.find((entry) => entry.id === campaign.calendarItemId);
    if (!item || !calendarIds.has(campaign.calendarItemId)) throw new Error(`Campaign ${campaign.id} has no calendar item.`);
    if (campaign.sourceSnapshot.contentRecordId !== item.contentRecordId) {
      throw new Error(`Campaign ${campaign.id} snapshots the wrong record.`);
    }
    if (
      campaign.sourceSnapshot.target.type !== item.targetType ||
      campaign.sourceSnapshot.target.id !== item.targetId ||
      campaign.sourceSnapshot.target.contentRecordId !== item.contentRecordId
    ) throw new Error(`Campaign ${campaign.id} snapshots the wrong calendar target.`);
  }
  for (const deliverable of db.deliverables) if (!campaignIds.has(deliverable.campaignId)) throw new Error(`Deliverable ${deliverable.id} has no campaign.`);
  for (const event of db.exportEvents) {
    if (!deliverableIds.has(event.deliverableId) || !campaignIds.has(event.campaignId) || !calendarIds.has(event.calendarItemId)) {
      throw new Error(`Export event ${event.id} has inconsistent references.`);
    }
    const deliverable = db.deliverables.find((item) => item.id === event.deliverableId);
    const campaign = db.campaigns.find((item) => item.id === event.campaignId);
    if (deliverable?.campaignId !== event.campaignId || campaign?.calendarItemId !== event.calendarItemId) {
      throw new Error(`Export event ${event.id} does not match deliverable ownership.`);
    }
  }
  for (const link of db.reviewLinks) {
    if (link.campaignId && !campaignIds.has(link.campaignId)) throw new Error(`Review link ${link.id} has no campaign.`);
    if (link.creativeProjectId && !db.creativeProjects.some((item) => item.id === link.creativeProjectId)) throw new Error(`Review link ${link.id} has no creative project.`);
    if (link.campaignId && link.selectedDeliverableIds.some((id) => !db.deliverables.some((item) => item.id === id && item.campaignId === link.campaignId))) {
      throw new Error(`Review link ${link.id} contains artwork outside its campaign.`);
    }
  }
  for (const project of db.creativeProjects) {
    const record = db.records.find((item) => item.id === project.recordId && item.verificationStatus === "verified");
    if (!record) throw new Error(`Creative project ${project.id} has no verified source record.`);
  }
  return db;
}

export function packForRecord(type: ContentRecord["recordType"]) {
  return type === "event" ? "event-promo" as const : "class-spotlight" as const;
}

export const EXPORT_FORMATS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
} as const;

export function createSourceSnapshot(
  record: ContentRecord,
  target: CalendarItem,
  db: Pick<Database, "scheduleRules" | "occurrences" | "assets">,
  capturedAt = new Date().toISOString(),
): SourceSnapshot {
  const asset = record.assetId ? db.assets.find((item) => item.id === record.assetId && item.active && item.rightsStatus === "approved") : undefined;
  const targetSnapshot: SourceSnapshot["target"] = target.targetType === "scheduleRule"
    ? (() => {
        const rule = db.scheduleRules.find((item) => item.id === target.targetId && item.contentRecordId === record.id);
        if (!rule) throw new Error("The selected schedule rule is unavailable.");
        return { type: "scheduleRule" as const, ...structuredClone(rule) };
      })()
    : target.targetType === "occurrence"
      ? (() => {
          const occurrence = db.occurrences.find((item) => item.id === target.targetId && item.contentRecordId === record.id);
          if (!occurrence) throw new Error("The selected occurrence is unavailable.");
          return { type: "occurrence" as const, ...structuredClone(occurrence) };
        })()
      : { type: "contentRecord", id: record.id, contentRecordId: record.id };
  return {
    contentRecordId: record.id,
    recordVersion: record.version,
    asset: asset ? {
      id: asset.id, fileReference: asset.fileReference, title: asset.title, altText: asset.altText,
      width: asset.width, height: asset.height, focalPoint: structuredClone(asset.focalPoint), rightsStatus: "approved",
    } : null,
    target: targetSnapshot,
    capturedAt,
    facts: {
      recordType: record.recordType,
      name: record.name,
      date: record.date,
      startTime: record.startTime,
      endTime: record.endTime,
      location: record.location,
      instructor: record.instructor,
      price: record.price,
      cta: record.cta,
    },
  };
}

export function protectedFacts(snapshot: SourceSnapshot) {
  return Object.values(snapshot.facts).filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function validateProtectedFacts(text: string, snapshot: SourceSnapshot) {
  const targetFacts = snapshot.target.type === "scheduleRule"
    ? [formatDays(snapshot.target.daysOfWeek), snapshot.target.startTime, snapshot.target.location]
    : snapshot.target.type === "occurrence"
      ? [snapshot.target.startsAt, snapshot.target.endsAt]
      : [];
  const important = [snapshot.facts.name, snapshot.facts.date, snapshot.facts.startTime, snapshot.facts.location, ...targetFacts].filter(Boolean) as string[];
  return important.map((fact) => ({
    fact,
    present: text.toLowerCase().includes(fact.toLowerCase()),
  }));
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function formatDays(days: number[]) {
  return days.map((day) => DAY_LABELS[day]).join(" & ");
}

export function creativeOverflowResults(fields: { headline: string; hook: string; schedule: string; location?: string; cta: string }) {
  const layouts = creativeTextLayouts(fields);
  return Object.entries(layouts).filter(([, layout]) => layout.truncated).map(([field]) => ({
    code: `${field}-overflow`,
    severity: "error" as const,
    message: `${field[0].toUpperCase()}${field.slice(1)} is too long for the protected template area.`,
  }));
}

export function deriveCampaignRollup(deliverables: Deliverable[]) {
  const required = deliverables.filter((item) => item.required);
  if (required.some((item) => item.validationResults.some((result) => result.severity === "error"))) return "blocked" as const;
  if (required.length > 0 && required.every((item) => item.approvalStatus === "approved")) return "ready" as const;
  if (required.some((item) => item.approvalStatus === "changes_requested")) return "changes_requested" as const;
  return "in_review" as const;
}

export function buildDeliverables(campaignId: string, snapshot: SourceSnapshot, packId: "event-promo" | "class-spotlight", now = new Date().toISOString()): Deliverable[] {
  const { facts } = snapshot;
  const schedule = snapshot.target.type === "scheduleRule"
    ? `${formatDays(snapshot.target.daysOfWeek)} · ${snapshot.target.startTime}`
    : snapshot.target.type === "occurrence"
      ? new Date(snapshot.target.startsAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : facts.recordType === "event"
    ? [facts.date, facts.startTime].filter(Boolean).join(" · ")
    : facts.startTime || "See class schedule";
  const hook = packId === "event-promo" ? "Make room for something memorable." : "Your strongest hour starts here.";
  const baseCreative = { headline: facts.name, hook, schedule, location: facts.location || "Sun Oaks", cta: facts.cta };
  const overflowResults = creativeOverflowResults(baseCreative);
  const stills = Object.entries(EXPORT_FORMATS).map(([format, dimensions]) => ({
    id: randomUUID(),
    campaignId,
    deliverableType: "still" as const,
    format,
    ...dimensions,
    templateReference: `${packId}/sun-frame-v1`,
    creativeFields: baseCreative,
    renderedFileReference: null,
    required: true,
    validationResults: [
      { code: "safe-zone", severity: "info" as const, message: "Text and logo are constrained to the format safe zone." },
      ...overflowResults,
    ],
    approvalStatus: "draft" as const,
    version: 1,
    editedAt: now,
    approvedAt: null,
  }));
  const caption = [
    hook,
    facts.name,
    schedule,
    facts.location,
    facts.instructor ? `With ${facts.instructor}` : undefined,
    facts.price,
    facts.cta,
    "#SunOaks #ReddingWellness",
  ].filter(Boolean).join("\n");
  const emailBody = [
    hook,
    "",
    `${facts.name} is coming to Sun Oaks.`,
    [schedule, facts.location].filter(Boolean).join(" · "),
    facts.instructor ? `Led by ${facts.instructor}.` : "",
    facts.price ? `Price: ${facts.price}.` : "",
    "",
    facts.cta,
  ].filter((line) => line !== undefined).join("\n");
  return [
    ...stills,
    {
      id: randomUUID(), campaignId, deliverableType: "motion", format: "story-webm", width: 1080, height: 1920,
      templateReference: `${packId}/rise-and-reveal-v1`, creativeFields: baseCreative, renderedFileReference: null, required: true,
      validationResults: [{ code: "duration", severity: "info", message: "Preset duration: 6 seconds." }, ...overflowResults],
      approvalStatus: "draft", version: 1, editedAt: now, approvedAt: null,
    },
    {
      id: randomUUID(), campaignId, deliverableType: "caption", format: "instagram-caption", width: null, height: null,
      templateReference: `${packId}/caption-v1`, creativeFields: { caption }, renderedFileReference: null, required: true,
      validationResults: [{ code: "protected-facts", severity: "info", message: "Operational facts are sourced from the campaign snapshot." }],
      approvalStatus: "draft", version: 1, editedAt: now, approvedAt: null,
    },
    {
      id: randomUUID(), campaignId, deliverableType: "emailCopy", format: "structured-email-copy", width: null, height: null,
      templateReference: `${packId}/email-v1`, creativeFields: {
        subject: `${facts.name} at Sun Oaks`,
        preview: `${schedule}${facts.location ? ` at ${facts.location}` : ""}`,
        body: emailBody,
      }, renderedFileReference: null, required: true,
      validationResults: [{ code: "structured-copy", severity: "info", message: "Ready to transfer into the selected email platform." }],
      approvalStatus: "draft", version: 1, editedAt: now, approvedAt: null,
    },
  ];
}
