import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  assertCalendarTarget,
  buildDeliverables,
  calendarItemSchema,
  contentRecordSchema,
  createSourceSnapshot,
  deriveRecordStatus,
  isoDateSchema,
  normalizedRecordKey,
  packForRecord,
  parseSource,
  sourceFingerprint,
  timeSchema,
  type Database,
} from "./domain";
import type { StudioRepository } from "./store";
import { createProjectReviewLink, createReviewLink, regenerateReviewLink, revokeReviewLink } from "./review-service";

const candidateBase = {
  name: z.string().trim().min(2),
  summary: z.string().trim().min(2),
  description: z.string().trim().min(2),
  startTime: timeSchema,
  endTime: timeSchema.optional(),
  location: z.string().trim().min(2),
  instructor: z.string().trim().optional(),
  price: z.string().trim().optional(),
  assetId: z.string().nullable().optional(),
  cta: z.string().trim().min(2),
};

export const publishCandidateInputSchema = z.object({
  action: z.literal("publishCandidate"),
  sourceId: z.string(),
  candidate: z.discriminatedUnion("recordType", [
    z.object({ ...candidateBase, recordType: z.literal("event"), date: isoDateSchema, daysOfWeek: z.array(z.never()).max(0).default([]) }),
    z.object({
      ...candidateBase,
      recordType: z.literal("recurring_class"),
      date: isoDateSchema.optional(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    }),
  ]),
  duplicateDecision: z.enum(["create", "update"]).default("create"),
  duplicateRecordId: z.string().optional(),
  marketingDate: isoDateSchema,
});

export const actionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("previewSource"), rawText: z.string().min(2).max(50_000), sourceType: z.enum(["plain_text", "guided"]), guidedType: z.enum(["event", "recurring_class"]).optional() }),
  publishCandidateInputSchema,
  z.object({ action: z.literal("generateCampaign"), calendarItemId: z.string(), packId: z.enum(["event-promo", "class-spotlight"]) }),
  z.object({ action: z.literal("setApproval"), deliverableId: z.string(), status: z.enum(["draft", "approved", "changes_requested"]) }),
  z.object({ action: z.literal("setRecordAsset"), recordId: z.string(), assetId: z.string().nullable() }),
  z.object({
    action: z.literal("updateRecord"),
    recordId: z.string(),
    changes: z.object({
      name: z.string().trim().min(2).optional(),
      summary: z.string().trim().min(2).optional(),
      description: z.string().trim().min(2).optional(),
      date: isoDateSchema.optional(),
      startTime: timeSchema.optional(),
      endTime: timeSchema.optional(),
      location: z.string().trim().min(2).optional(),
      instructor: z.string().trim().optional(),
      price: z.string().trim().optional(),
      cta: z.string().trim().min(2).optional(),
    }).refine((changes) => Object.keys(changes).length > 0, "Choose at least one field to update."),
  }),
  z.object({ action: z.literal("authorizeExport"), calendarItemId: z.string(), deliverableId: z.string() }),
  z.object({ action: z.literal("markExported"), calendarItemId: z.string(), deliverableId: z.string() }),
  z.object({
    action: z.literal("createReviewLink"),
    campaignId: z.string(),
    selectedDeliverableIds: z.array(z.string()).min(1).max(20),
    expiresInHours: z.number().min(1).max(720).default(72),
  }),
  z.object({ action: z.literal("revokeReviewLink"), reviewLinkId: z.string() }),
  z.object({ action: z.literal("regenerateReviewLink"), reviewLinkId: z.string() }),
  z.object({
    action: z.literal("saveCreativeProject"),
    projectId: z.string().optional(),
    kind: z.enum(["promo", "motion"]),
    recordId: z.string(),
    title: z.string().trim().min(1).max(160),
    payload: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("createProjectReviewLink"),
    creativeProjectId: z.string(),
    selectedArtworkKeys: z.array(z.string()).min(1).max(20),
    expiresInHours: z.number().min(1).max(720).default(72),
  }),
]);

export type ActionInput = z.infer<typeof actionRequestSchema>;

function recomputeCampaignCompletion(db: Database, campaignId: string) {
  const campaign = db.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("Campaign not found while deriving completion.");
  const item = db.calendarItems.find((entry) => entry.id === campaign.calendarItemId);
  if (!item) throw new Error("Calendar item not found while deriving completion.");
  const required = db.deliverables.filter((entry) => entry.campaignId === campaign.id && entry.required);
  const exportedIds = new Set(db.exportEvents.filter((event) => event.campaignId === campaign.id).map((event) => event.deliverableId));
  const complete = required.length > 0 && required.every((entry) =>
    entry.approvalStatus === "approved" &&
    !entry.validationResults.some((result) => result.severity === "error") &&
    exportedIds.has(entry.id),
  );
  item.status = complete ? "done" : "campaign_generated";
  const record = db.records.find((entry) => entry.id === item.contentRecordId);
  if (record) record.status = deriveRecordStatus(record, db.calendarItems);
  return complete;
}

export function applyAction(input: ActionInput, db: Database): Record<string, unknown> {
  if (input.action === "previewSource") {
    const candidate = parseSource(input.rawText, input.guidedType);
    const fingerprint = sourceFingerprint(input.rawText);
    const key = normalizedRecordKey(candidate.recordType, candidate.name);
    const existingSource = db.sources.find((item) => item.fingerprint === fingerprint);
    const possibleMatch = db.records.find((item) => item.normalizedKey === key && item.active);
    const source = existingSource || {
      id: randomUUID(), sourceType: input.sourceType, title: candidate.name || "Untitled source", rawText: input.rawText,
      fingerprint, createdAt: new Date().toISOString(), createdBy: "pilot", processingStatus: "candidate" as const,
    };
    if (!existingSource) db.sources.push(source);
    return {
      source,
      candidate,
      duplicate: possibleMatch ? { kind: "normalized_key", record: possibleMatch } : existingSource ? { kind: "source_fingerprint" } : null,
    };
  }

  if (input.action === "publishCandidate") {
    const source = db.sources.find((item) => item.id === input.sourceId);
    if (!source) throw new Error("The source could not be found.");
    const now = new Date().toISOString();
    const existing = input.duplicateDecision === "update" && input.duplicateRecordId
      ? db.records.find((item) => item.id === input.duplicateRecordId)
      : undefined;
    if (input.duplicateDecision === "update" && !existing) throw new Error("The selected duplicate record could not be found.");
    if (existing && existing.recordType !== input.candidate.recordType) throw new Error("A record version cannot change its record type.");
    const candidateKey = normalizedRecordKey(input.candidate.recordType, input.candidate.name);
    if (existing && (!existing.active || existing.normalizedKey !== candidateKey)) {
      throw new Error("The selected duplicate must match the candidate’s active record type and normalized key.");
    }
    if (input.candidate.assetId && !db.assets.some((item) => item.id === input.candidate.assetId && item.active && item.rightsStatus === "approved")) {
      throw new Error("Select an active asset with approved usage rights.");
    }
    const record = contentRecordSchema.parse({
      id: existing?.id || randomUUID(),
      normalizedKey: candidateKey,
      ...input.candidate,
      status: "verified",
      verificationStatus: "verified",
      sourceIds: [...new Set([...(existing?.sourceIds || []), source.id])],
      version: (existing?.version || 0) + 1,
      updatedAt: now,
      lastConfirmedAt: now,
      active: true,
      assetId: input.candidate.assetId ?? existing?.assetId ?? null,
    });
    if (existing) Object.assign(existing, record);
    else db.records.push(record);
    db.recordVersions.push({
      id: randomUUID(), recordId: record.id, version: record.version,
      changedFields: existing ? Object.keys(input.candidate) : Object.keys(record), snapshot: structuredClone(record), createdAt: now,
    });
    source.processingStatus = "published";
    let targetType: "contentRecord" | "scheduleRule" = "contentRecord";
    let targetId = record.id;
    if (record.recordType === "recurring_class") {
      let rule = db.scheduleRules.find((item) => item.contentRecordId === record.id);
      const schedule = {
        daysOfWeek: [...input.candidate.daysOfWeek],
        startTime: record.startTime!,
        endTime: record.endTime || record.startTime!,
        startDate: input.candidate.date || rule?.startDate || input.marketingDate,
        endDate: rule?.endDate || null,
        timezone: "America/Los_Angeles" as const,
        location: record.location!,
        exceptions: rule?.exceptions || [],
      };
      if (rule) Object.assign(rule, schedule);
      else {
        rule = { id: randomUUID(), contentRecordId: record.id, ...schedule };
        db.scheduleRules.push(rule);
      }
      targetType = "scheduleRule";
      targetId = rule.id;
    }
    const calendarItem = calendarItemSchema.parse({
      id: randomUUID(), contentRecordId: record.id, targetType, targetId, marketingDate: input.marketingDate,
      objective: record.recordType === "event" ? "launch" : "spotlight", status: "verified", campaignId: null,
    });
    assertCalendarTarget(calendarItem, db);
    db.calendarItems.push(calendarItem);
    record.status = deriveRecordStatus(record, db.calendarItems);
    return { ok: true, recordId: record.id, calendarItemId: calendarItem.id };
  }

  if (input.action === "generateCampaign") {
    const item = db.calendarItems.find((entry) => entry.id === input.calendarItemId);
    if (!item) throw new Error("Calendar item not found.");
    assertCalendarTarget(item, db);
    if (item.campaignId || db.campaigns.some((campaign) => campaign.calendarItemId === item.id)) {
      throw new Error("This calendar item already has a campaign.");
    }
    const record = db.records.find((entry) => entry.id === item.contentRecordId);
    if (!record || record.verificationStatus !== "verified") throw new Error("Only verified records can generate campaigns.");
    const eligible = packForRecord(record.recordType);
    if (input.packId !== eligible) throw new Error("That campaign pack is not eligible for this record type.");
    const campaign = {
      id: randomUUID(), calendarItemId: item.id, campaignPackId: input.packId,
      sourceSnapshot: createSourceSnapshot(record, item, db), createdAt: new Date().toISOString(),
    };
    db.campaigns.push(campaign);
    db.deliverables.push(...buildDeliverables(campaign.id, campaign.sourceSnapshot, input.packId));
    item.campaignId = campaign.id;
    item.status = "campaign_generated";
    record.status = deriveRecordStatus(record, db.calendarItems);
    return { ok: true, campaignId: campaign.id };
  }

  if (input.action === "setApproval") {
    const deliverable = db.deliverables.find((item) => item.id === input.deliverableId);
    if (!deliverable) throw new Error("Deliverable not found.");
    if (input.status === "approved" && deliverable.validationResults.some((item) => item.severity === "error")) {
      throw new Error("Resolve validation errors before approval.");
    }
    deliverable.approvalStatus = input.status;
    deliverable.approvedAt = input.status === "approved" ? new Date().toISOString() : null;
    deliverable.editedAt = new Date().toISOString();
    if (input.status !== "approved") {
      db.exportEvents = db.exportEvents.filter((event) => event.deliverableId !== deliverable.id);
      deliverable.renderedFileReference = null;
    }
    const complete = recomputeCampaignCompletion(db, deliverable.campaignId);
    return { ok: true, complete };
  }

  if (input.action === "setRecordAsset") {
    const record = db.records.find((item) => item.id === input.recordId);
    if (!record) throw new Error("Record not found.");
    if (input.assetId && !db.assets.some((item) => item.id === input.assetId && item.active && item.rightsStatus === "approved")) {
      throw new Error("Select an active asset with approved usage rights.");
    }
    if (record.assetId === input.assetId) return { ok: true, unchanged: true };
    const now = new Date().toISOString();
    record.assetId = input.assetId;
    record.updatedAt = now;
    record.lastConfirmedAt = now;
    record.version += 1;
    db.recordVersions.push({
      id: randomUUID(), recordId: record.id, version: record.version, changedFields: ["assetId"],
      snapshot: structuredClone(record), createdAt: now,
    });
    record.status = deriveRecordStatus(record, db.calendarItems);
    return { ok: true, version: record.version };
  }

  if (input.action === "updateRecord") {
    const record = db.records.find((item) => item.id === input.recordId && item.active);
    if (!record) throw new Error("Record not found.");
    const next = contentRecordSchema.parse({
      ...record,
      ...input.changes,
      normalizedKey: input.changes.name ? normalizedRecordKey(record.recordType, input.changes.name) : record.normalizedKey,
      version: record.version + 1,
      updatedAt: new Date().toISOString(),
      lastConfirmedAt: new Date().toISOString(),
    });
    const duplicate = db.records.find((item) => item.id !== record.id && item.active && item.normalizedKey === next.normalizedKey);
    if (duplicate) throw new Error("Another active trusted record already uses that name.");
    const changedFields = Object.keys(input.changes).filter((field) =>
      record[field as keyof typeof record] !== next[field as keyof typeof next],
    );
    if (!changedFields.length) return { ok: true, unchanged: true, version: record.version };
    Object.assign(record, next);
    const rule = db.scheduleRules.find((item) => item.contentRecordId === record.id);
    if (rule) {
      if (input.changes.startTime) rule.startTime = input.changes.startTime;
      if (input.changes.endTime) rule.endTime = input.changes.endTime;
      if (input.changes.location) rule.location = input.changes.location;
    }
    db.recordVersions.push({
      id: randomUUID(), recordId: record.id, version: record.version, changedFields,
      snapshot: structuredClone(record), createdAt: record.updatedAt,
    });
    record.status = deriveRecordStatus(record, db.calendarItems);
    return { ok: true, version: record.version, changedFields };
  }

  if (input.action === "createReviewLink") {
    const { link, token } = createReviewLink(db, input);
    return { ok: true, reviewLinkId: link.id, token, expiresAt: link.expiresAt };
  }

  if (input.action === "revokeReviewLink") {
    const link = revokeReviewLink(db, input.reviewLinkId);
    return { ok: true, reviewLinkId: link.id, revokedAt: link.revokedAt };
  }

  if (input.action === "regenerateReviewLink") {
    const { link, token } = regenerateReviewLink(db, input.reviewLinkId);
    return { ok: true, reviewLinkId: link.id, token, expiresAt: link.expiresAt };
  }

  if (input.action === "saveCreativeProject") {
    const record = db.records.find((item) => item.id === input.recordId && item.active && item.verificationStatus === "verified");
    if (!record) throw new Error("Creative projects require an active verified source record.");
    const serialized = JSON.stringify(input.payload);
    if (serialized.length > 8_000_000) throw new Error("Project snapshot is too large. Use approved library images or fewer artboards.");
    if (!Array.isArray(input.payload.artworks) || input.payload.artworks.length === 0) throw new Error("Project must include rendered artwork.");
    if (input.kind === "promo") {
      const fields = input.payload.fields as Record<string, unknown> | undefined;
      const schedule = [
        record.date ? new Date(`${record.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "",
        record.startTime ? new Date(`2000-01-01T${record.startTime}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "",
      ].filter(Boolean).join(" · ");
      const expected = { headline: record.name, summary: record.summary, schedule, location: record.location || "", cta: record.cta };
      if (!fields || Object.entries(expected).some(([key, value]) => fields[key] !== value)) throw new Error("Promo project facts must exactly match the verified record.");
    }
    const now = new Date().toISOString();
    const existing = input.projectId ? db.creativeProjects.find((item) => item.id === input.projectId) : undefined;
    if (input.projectId && !existing) throw new Error("Creative project not found.");
    if (existing && (existing.kind !== input.kind || existing.recordId !== input.recordId)) throw new Error("A project cannot change its type or verified source.");
    if (existing) {
      existing.title = input.title;
      existing.version += 1;
      existing.sourceRecordVersion = record.version;
      existing.payload = structuredClone(input.payload);
      existing.updatedAt = now;
      return { ok: true, creativeProjectId: existing.id, version: existing.version };
    }
    const project = {
      id: randomUUID(), kind: input.kind, recordId: record.id, title: input.title, version: 1,
      sourceRecordVersion: record.version, payload: structuredClone(input.payload), createdAt: now, updatedAt: now,
    };
    db.creativeProjects.push(project);
    return { ok: true, creativeProjectId: project.id, version: project.version };
  }

  if (input.action === "createProjectReviewLink") {
    const { link, token } = createProjectReviewLink(db, input);
    return { ok: true, reviewLinkId: link.id, token, expiresAt: link.expiresAt };
  }

  const item = db.calendarItems.find((entry) => entry.id === input.calendarItemId);
  if (!item || !item.campaignId) throw new Error("The calendar item has no current campaign.");
  const campaign = db.campaigns.find((entry) => entry.id === item.campaignId && entry.calendarItemId === item.id);
  if (!campaign) throw new Error("The current campaign could not be resolved.");
  const deliverable = db.deliverables.find((entry) => entry.id === input.deliverableId && entry.campaignId === campaign.id);
  if (!deliverable) throw new Error("That deliverable does not belong to the current campaign.");
  if (deliverable.approvalStatus !== "approved") throw new Error("Approve this deliverable before export.");
  if (deliverable.validationResults.some((result) => result.severity === "error")) throw new Error("Resolve validation errors before export.");
  if (input.action === "authorizeExport") return { ok: true, authorized: true };
  const existingExport = db.exportEvents.find((event) => event.deliverableId === deliverable.id);
  if (!existingExport) {
    const exportedAt = new Date().toISOString();
    db.exportEvents.push({
      id: randomUUID(), deliverableId: deliverable.id, campaignId: campaign.id,
      calendarItemId: item.id, format: deliverable.format, exportedAt,
    });
    deliverable.renderedFileReference = `browser-download://${exportedAt}`;
  }
  const complete = recomputeCampaignCompletion(db, campaign.id);
  return { ok: true, complete, alreadyRecorded: Boolean(existingExport) };
}

export async function performAction(input: ActionInput, repository: StudioRepository) {
  let response: Record<string, unknown> = {};
  await repository.update((db) => { response = applyAction(input, db); });
  return response;
}
