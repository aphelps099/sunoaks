import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Database, Deliverable, ReviewLink } from "./domain";

export const DEFAULT_REVIEW_TTL_HOURS = 72;

export function createReviewToken() {
  return randomBytes(32).toString("base64url");
}

export function hashReviewToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isReviewLinkUsable(link: Pick<ReviewLink, "expiresAt" | "revokedAt">, now = new Date()) {
  return link.revokedAt === null && new Date(link.expiresAt).getTime() > now.getTime();
}

export function findReviewLink(db: Database, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return undefined;
  const hash = hashReviewToken(token);
  return db.reviewLinks.find((link) => link.tokenHash === hash && isReviewLinkUsable(link, now));
}

export function createReviewLink(
  db: Database,
  input: { campaignId: string; selectedDeliverableIds: string[]; expiresInHours?: number },
  now = new Date(),
) {
  const campaign = db.campaigns.find((item) => item.id === input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const selected = [...new Set(input.selectedDeliverableIds)];
  const artwork = db.deliverables.filter((item) =>
    selected.includes(item.id) && item.campaignId === campaign.id,
  );
  if (!artwork.length || artwork.length !== selected.length) throw new Error("Select artwork from this campaign only.");
  const hours = input.expiresInHours ?? DEFAULT_REVIEW_TTL_HOURS;
  if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) throw new Error("Review expiration must be between 1 hour and 30 days.");
  const token = createReviewToken();
  const link: ReviewLink = {
    id: randomUUID(),
    campaignId: campaign.id,
    creativeProjectId: null,
    tokenHash: hashReviewToken(token),
    selectedDeliverableIds: selected,
    selectedArtworkKeys: [],
    projectSnapshot: null,
    title: campaign.sourceSnapshot.facts.name,
    version: Math.max(...artwork.map((item) => item.version)),
    approvalState: "pending",
    reviewerComment: null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    reviewedAt: null,
  };
  db.reviewLinks.push(link);
  return { link, token };
}

export function createProjectReviewLink(
  db: Database,
  input: { creativeProjectId: string; selectedArtworkKeys: string[]; expiresInHours?: number },
  now = new Date(),
) {
  const project = db.creativeProjects.find((item) => item.id === input.creativeProjectId);
  if (!project) throw new Error("Creative project not found.");
  const payloadArtwork = Array.isArray(project.payload.artworks)
    ? project.payload.artworks as Array<{ key?: unknown }>
    : [];
  const available = new Set(payloadArtwork.map((item) => typeof item.key === "string" ? item.key : "").filter(Boolean));
  const selected = [...new Set(input.selectedArtworkKeys)];
  if (!selected.length || selected.some((key) => !available.has(key))) throw new Error("Select saved artwork from this project only.");
  const hours = input.expiresInHours ?? DEFAULT_REVIEW_TTL_HOURS;
  if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) throw new Error("Review expiration must be between 1 hour and 30 days.");
  const token = createReviewToken();
  const link: ReviewLink = {
    id: randomUUID(),
    campaignId: null,
    creativeProjectId: project.id,
    tokenHash: hashReviewToken(token),
    selectedDeliverableIds: [],
    selectedArtworkKeys: selected,
    projectSnapshot: { kind: project.kind, payload: structuredClone(project.payload) },
    title: project.title,
    version: project.version,
    approvalState: "pending",
    reviewerComment: null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    reviewedAt: null,
  };
  db.reviewLinks.push(link);
  return { link, token };
}

export function revokeReviewLink(db: Database, reviewLinkId: string, now = new Date()) {
  const link = db.reviewLinks.find((item) => item.id === reviewLinkId);
  if (!link) throw new Error("Review link not found.");
  if (!link.revokedAt) link.revokedAt = now.toISOString();
  return link;
}

export function regenerateReviewLink(db: Database, reviewLinkId: string, now = new Date()) {
  const existing = revokeReviewLink(db, reviewLinkId, now);
  const remainingMs = Math.max(60 * 60 * 1000, new Date(existing.expiresAt).getTime() - now.getTime());
  if (existing.campaignId) return createReviewLink(db, {
        campaignId: existing.campaignId,
        selectedDeliverableIds: existing.selectedDeliverableIds,
        expiresInHours: remainingMs / (60 * 60 * 1000),
      }, now);
  const token = createReviewToken();
  const link: ReviewLink = {
    ...structuredClone(existing),
    id: randomUUID(),
    tokenHash: hashReviewToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + remainingMs).toISOString(),
    revokedAt: null,
    reviewedAt: null,
    reviewerComment: null,
    approvalState: "pending",
  };
  db.reviewLinks.push(link);
  return { link, token };
}

function resetExportsFor(db: Database, deliverable: Deliverable) {
  db.exportEvents = db.exportEvents.filter((event) => event.deliverableId !== deliverable.id);
  deliverable.renderedFileReference = null;
}

export function mutateReviewState(
  db: Database,
  link: ReviewLink,
  input: { decision: "approve" | "request_changes"; comment?: string },
  now = new Date(),
) {
  if (!isReviewLinkUsable(link, now)) throw new Error("This review link is expired or revoked.");
  if (link.reviewedAt) throw new Error("This review has already been submitted.");
  const comment = input.comment?.trim() || "";
  if (input.decision === "request_changes" && !comment) throw new Error("A comment is required when requesting changes.");
  const artwork = link.campaignId
    ? db.deliverables.filter((item) => link.selectedDeliverableIds.includes(item.id) && item.campaignId === link.campaignId)
    : [];
  if (link.campaignId && artwork.length !== link.selectedDeliverableIds.length) throw new Error("Selected artwork is no longer available.");
  if (input.decision === "approve" && artwork.some((item) => item.validationResults.some((result) => result.severity === "error"))) {
    throw new Error("Artwork with validation errors cannot be approved.");
  }
  for (const deliverable of artwork) {
    deliverable.approvalStatus = input.decision === "approve" ? "approved" : "changes_requested";
    deliverable.approvedAt = input.decision === "approve" ? now.toISOString() : null;
    deliverable.editedAt = now.toISOString();
    if (input.decision === "request_changes") resetExportsFor(db, deliverable);
  }
  link.approvalState = input.decision === "approve" ? "approved" : "changes_requested";
  link.reviewerComment = comment || null;
  link.reviewedAt = now.toISOString();
  return link;
}

export function publicReviewPayload(db: Database, link: ReviewLink, token?: string) {
  if (link.creativeProjectId) {
    const snapshot = link.projectSnapshot;
    if (!snapshot) throw new Error("Review project snapshot is unavailable.");
    const savedArtwork = Array.isArray(snapshot.payload.artworks)
      ? snapshot.payload.artworks as Array<Record<string, unknown>>
      : [];
    const artwork = savedArtwork.filter((item) => typeof item.key === "string" && link.selectedArtworkKeys.includes(item.key));
    return {
      title: link.title,
      version: link.version,
      approvalState: link.approvalState,
      reviewerComment: link.reviewerComment,
      expiresAt: link.expiresAt,
      artwork,
      presentation: { projectKind: snapshot.kind },
    };
  }
  const campaign = db.campaigns.find((item) => item.id === link.campaignId);
  if (!campaign) throw new Error("Review campaign is unavailable.");
  const artwork = link.selectedDeliverableIds.map((id, index) => {
    const item = db.deliverables.find((entry) => entry.id === id && entry.campaignId === link.campaignId);
    if (!item) throw new Error("Review artwork is unavailable.");
    return {
      key: `artwork-${index + 1}`,
      kind: item.deliverableType,
      format: item.format,
      width: item.width,
      height: item.height,
      creativeFields: item.creativeFields,
    };
  });
  return {
    title: link.title,
    version: link.version,
    approvalState: link.approvalState,
    reviewerComment: link.reviewerComment,
    expiresAt: link.expiresAt,
    artwork,
    presentation: {
      facts: campaign.sourceSnapshot.facts,
      asset: campaign.sourceSnapshot.asset ? {
        fileReference: token && campaign.sourceSnapshot.asset.fileReference.startsWith("/studio/api/assets/")
          ? `/studio/api/review/${encodeURIComponent(token)}/asset` : campaign.sourceSnapshot.asset.fileReference,
        altText: campaign.sourceSnapshot.asset.altText,
        focalPoint: campaign.sourceSnapshot.asset.focalPoint,
      } : null,
    },
  };
}
