import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { databaseSchema, reconcileRecordStatuses, validateDatabaseIntegrity, type Database } from "./domain";

export interface StudioRepository {
  read(): Promise<Database>;
  update(mutator: (db: Database) => void | Promise<void>): Promise<Database>;
}

export class JsonFileStudioRepository implements StudioRepository {
  private queue = Promise.resolve();
  private initialization: Promise<Database> | null = null;
  constructor(private readonly filePath = process.env.STUDIO_DATA_PATH || path.join(process.cwd(), "data", "studio.json")) {}

  async read() {
    try {
      return await this.readExisting();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return this.initialize();
    }
  }

  private readExisting() {
    return readFile(this.filePath, "utf8").then((contents) =>
      validateDatabaseIntegrity(reconcileRecordStatuses(databaseSchema.parse(migrateLegacyData(JSON.parse(contents))))),
    );
  }

  private initialize() {
    if (!this.initialization) {
      const operation = (async () => {
        try {
          return await this.readExisting();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await this.write(seedDatabase());
          return this.readExisting();
        }
      })();
      this.initialization = operation.finally(() => {
        this.initialization = null;
      });
    }
    return this.initialization;
  }

  async update(mutator: (db: Database) => void | Promise<void>) {
    let result!: Database;
    const operation = this.queue.catch(() => undefined).then(async () => {
      const db = await this.read();
      await mutator(db);
      result = validateDatabaseIntegrity(reconcileRecordStatuses(databaseSchema.parse(db)));
      await this.write(result);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    await operation;
    return result;
  }

  private async write(db: Database) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(db, null, 2), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}

function migrateLegacyData(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.exportEvents)) raw.exportEvents = [];
  if (!Array.isArray(raw.reviewLinks)) raw.reviewLinks = [];
  if (!Array.isArray(raw.creativeProjects)) raw.creativeProjects = [];
  if (!Array.isArray(raw.campaigns) || !Array.isArray(raw.calendarItems) || !Array.isArray(raw.records) || !Array.isArray(raw.assets)) return raw;
  for (const campaignValue of raw.campaigns) {
    const campaign = campaignValue as Record<string, unknown>;
    const snapshot = campaign.sourceSnapshot as Record<string, unknown> | undefined;
    if (!snapshot) continue;
    const item = (raw.calendarItems as Array<Record<string, unknown>>).find((entry) => entry.id === campaign.calendarItemId);
    const record = (raw.records as Array<Record<string, unknown>>).find((entry) => entry.id === snapshot.contentRecordId);
    if (!item || !record) continue;
    if (!("asset" in snapshot)) {
      const selected = (raw.assets as Array<Record<string, unknown>>).find((entry) => entry.id === record.assetId && entry.active && entry.rightsStatus === "approved");
      snapshot.asset = selected ? {
        id: selected.id, fileReference: selected.fileReference, title: selected.title, altText: selected.altText,
        width: selected.width, height: selected.height, focalPoint: selected.focalPoint, rightsStatus: "approved",
      } : null;
    }
    if (!("target" in snapshot)) {
      if (item.targetType === "scheduleRule" && Array.isArray(raw.scheduleRules)) {
        const rule = (raw.scheduleRules as Array<Record<string, unknown>>).find((entry) => entry.id === item.targetId);
        snapshot.target = rule ? { type: "scheduleRule", ...rule } : { type: "contentRecord", id: record.id, contentRecordId: record.id };
      } else if (item.targetType === "occurrence" && Array.isArray(raw.occurrences)) {
        const occurrence = (raw.occurrences as Array<Record<string, unknown>>).find((entry) => entry.id === item.targetId);
        snapshot.target = occurrence ? { type: "occurrence", ...occurrence } : { type: "contentRecord", id: record.id, contentRecordId: record.id };
      } else {
        snapshot.target = { type: "contentRecord", id: record.id, contentRecordId: record.id };
      }
    }
  }
  return raw;
}

const NOW = "2026-09-02T16:30:00.000Z";
function seedDatabase(): Database {
  const classId = randomUUID();
  const eventId = randomUUID();
  const ruleId = randomUUID();
  const occurrenceId = randomUUID();
  const assets = [
    {
      id: "asset-training", assetType: "image" as const, fileReference: "/studio/brand/photos/training-day-sunoaks.jpg",
      title: "Training day", altText: "Sun Oaks members training together", width: 1440, height: 1440,
      subjects: ["fitness", "community"], usageTags: ["class", "social"], focalPoint: { x: 0.5, y: 0.45 }, rightsStatus: "approved" as const, active: true,
    },
    {
      id: "asset-pool", assetType: "image" as const, fileReference: "/studio/brand/photos/sun-oaks-outside-pool.jpg",
      title: "Outdoor pool", altText: "The Sun Oaks outdoor pool and oak-shaded deck", width: 2464, height: 1632,
      subjects: ["aquatics", "facility"], usageTags: ["event", "social"], focalPoint: { x: 0.52, y: 0.48 }, rightsStatus: "approved" as const, active: true,
    },
    {
      id: "asset-community", assetType: "image" as const, fileReference: "/studio/brand/photos/community-fitness.jpg",
      title: "Community fitness", altText: "A Sun Oaks group fitness class in progress", width: 1440, height: 1440,
      subjects: ["fitness"], usageTags: ["class", "social"], focalPoint: { x: 0.5, y: 0.5 }, rightsStatus: "approved" as const, active: true,
    },
  ];
  const records: Database["records"] = [
    {
      id: classId, normalizedKey: "recurring_class:sunrise-strength", recordType: "recurring_class", name: "Sunrise Strength",
      summary: "A focused full-body strength class to start the day with energy.", description: "Every Tuesday and Thursday at 6:00 AM in Studio A with Delaney.",
      startTime: "06:00", endTime: "06:50", location: "Studio A", instructor: "Delaney", cta: "Reserve in the Sun Oaks app",
      status: "verified", verificationStatus: "verified", sourceIds: ["seed-class"], version: 1, updatedAt: NOW, lastConfirmedAt: NOW, active: true, assetId: "asset-training",
    },
    {
      id: eventId, normalizedKey: "event:poolside-family-night", recordType: "event", name: "Poolside Family Night",
      summary: "An easy evening of swimming, music, and time together.", description: "Friday, September 18 at 6:30 PM at the Outdoor Pool. Members and guests welcome.",
      date: "2026-09-18", startTime: "18:30", endTime: "20:30", location: "Outdoor Pool", price: "Included with membership", cta: "RSVP at the front desk",
      status: "verified", verificationStatus: "verified", sourceIds: ["seed-event"], version: 1, updatedAt: NOW, lastConfirmedAt: NOW, active: true, assetId: "asset-pool",
    },
  ];
  const scheduleRules: Database["scheduleRules"] = [{
    id: ruleId, contentRecordId: classId, daysOfWeek: [2, 4], startTime: "06:00", endTime: "06:50", startDate: "2026-09-01",
    endDate: null, timezone: "America/Los_Angeles", location: "Studio A", exceptions: [],
  }];
  return {
    schemaVersion: 1,
    sources: [
      { id: "seed-class", sourceType: "guided", title: "Sunrise Strength", rawText: records[0].description, fingerprint: "seed-class", createdAt: NOW, createdBy: "pilot", processingStatus: "published" },
      { id: "seed-event", sourceType: "guided", title: "Poolside Family Night", rawText: records[1].description, fingerprint: "seed-event", createdAt: NOW, createdBy: "pilot", processingStatus: "published" },
    ],
    records,
    recordVersions: records.map((record) => ({ id: randomUUID(), recordId: record.id, version: 1, changedFields: Object.keys(record), snapshot: record, createdAt: NOW })),
    scheduleRules,
    occurrences: [{ id: occurrenceId, contentRecordId: classId, scheduleRuleId: ruleId, startsAt: "2026-09-08T13:00:00.000Z", endsAt: "2026-09-08T13:50:00.000Z", status: "scheduled" }],
    calendarItems: [
      { id: randomUUID(), contentRecordId: classId, targetType: "scheduleRule", targetId: ruleId, marketingDate: "2026-09-08", objective: "spotlight", status: "verified", campaignId: null },
      { id: randomUUID(), contentRecordId: eventId, targetType: "contentRecord", targetId: eventId, marketingDate: "2026-09-10", objective: "launch", status: "verified", campaignId: null },
    ],
    assets,
    campaigns: [],
    deliverables: [],
    exportEvents: [],
    reviewLinks: [],
    creativeProjects: [],
  };
}

export const repository = new JsonFileStudioRepository();
