export type Lifecycle = "needs_information" | "verified" | "campaign_generated" | "done";
export type Asset = {
  id: string; fileReference: string; title: string; altText: string; width: number; height: number;
  focalPoint: { x: number; y: number }; rightsStatus: "approved" | "review"; usageTags: string[]; active: boolean;
};
export type ContentRecord = {
  id: string; recordType: "event" | "recurring_class"; name: string; summary: string; description: string;
  date?: string; startTime?: string; endTime?: string; location?: string; instructor?: string; price?: string; cta: string;
  status: Lifecycle; verificationStatus: "candidate" | "verified"; version: number; lastConfirmedAt: string; active: boolean; assetId: string | null;
};
export type CalendarItem = {
  id: string; contentRecordId: string; targetType: "contentRecord" | "scheduleRule" | "occurrence"; targetId: string;
  marketingDate: string; objective: "launch" | "spotlight"; status: Lifecycle; campaignId: string | null;
};
export type ScheduleRule = { id: string; contentRecordId: string; daysOfWeek: number[]; startTime: string; endTime: string; location: string };
export type SourceSnapshot = {
  contentRecordId: string; recordVersion: number; capturedAt: string;
  asset: Pick<Asset, "id" | "fileReference" | "title" | "altText" | "width" | "height" | "focalPoint" | "rightsStatus"> | null;
  target:
    | { type: "contentRecord"; id: string; contentRecordId: string }
    | { type: "scheduleRule"; id: string; contentRecordId: string; daysOfWeek: number[]; startTime: string; endTime: string; startDate: string; endDate: string | null; timezone: string; location: string; exceptions: string[] }
    | { type: "occurrence"; id: string; contentRecordId: string; scheduleRuleId: string | null; startsAt: string; endsAt: string; status: "scheduled" | "cancelled" };
  facts: { recordType: "event" | "recurring_class"; name: string; date?: string; startTime?: string; endTime?: string; location?: string; instructor?: string; price?: string; cta: string };
};
export type Campaign = {
  id: string; calendarItemId: string; campaignPackId: "event-promo" | "class-spotlight"; sourceSnapshot: SourceSnapshot;
  rollupStatus: "blocked" | "ready" | "changes_requested" | "in_review"; createdAt: string;
};
export type Deliverable = {
  id: string; campaignId: string; deliverableType: "still" | "motion" | "caption" | "emailCopy"; format: string;
  width: number | null; height: number | null; templateReference: string; creativeFields: Record<string, string>;
  renderedFileReference: string | null; required: boolean;
  validationResults: { code: string; severity: "info" | "warning" | "error"; message: string }[];
  approvalStatus: "draft" | "approved" | "changes_requested"; version: number; approvedAt: string | null;
};
export type StudioData = {
  sources: { id: string; title: string; fingerprint: string; processingStatus: string }[];
  records: ContentRecord[]; scheduleRules: ScheduleRule[]; occurrences: unknown[]; calendarItems: CalendarItem[];
  assets: Asset[]; campaigns: Campaign[]; deliverables: Deliverable[];
  exportEvents: { id: string; deliverableId: string; campaignId: string; calendarItemId: string; format: string; exportedAt: string }[];
};
export type Candidate = {
  recordType: "event" | "recurring_class"; name: string; summary: string; description: string; date?: string;
  startTime?: string; endTime?: string; location?: string; instructor?: string; price?: string; daysOfWeek: number[];
  warnings: string[]; sourceExcerpts: Record<string, string>;
};
