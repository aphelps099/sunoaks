import type { ContentRecord, ScheduleRule } from "./client-types";

export const PROMOTION_OUTPUTS = [
  { id: "portrait", label: "Social post", detail: "Portrait image · Instagram & Facebook" },
  { id: "instagram-caption", label: "Social caption", detail: "Ready to copy with your post" },
  { id: "square", label: "Square post", detail: "Square image · Instagram & Facebook" },
  { id: "story", label: "Story", detail: "Full-screen vertical image" },
  { id: "structured-email-copy", label: "Email copy", detail: "Subject, preview text, and message" },
  { id: "story-webm", label: "Animated story", detail: "Six-second animation · WebM" },
] as const;
export type PromotionOutput = typeof PROMOTION_OUTPUTS[number]["id"];
export const OUTPUT_IDS = PROMOTION_OUTPUTS.map((output) => output.id) as [PromotionOutput, ...PromotionOutput[]];
export const DEFAULT_OUTPUTS: PromotionOutput[] = ["portrait", "instagram-caption"];
export const outputLabel = (format: string) => PROMOTION_OUTPUTS.find((output) => output.id === format)?.label || format;

export function clubDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function formatTime(time?: string) {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  return `${Number(hours) % 12 || 12}:${minutes} ${Number(hours) >= 12 ? "PM" : "AM"}`;
}

export function recordSchedule(record: Pick<ContentRecord, "id" | "recordType" | "date" | "startTime" | "endTime">, rules: ScheduleRule[] = []) {
  const rule = rules.find((item) => item.contentRecordId === record.id);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const when = record.recordType === "recurring_class" && rule
    ? rule.daysOfWeek.map((day) => days[day]).join(" & ")
    : record.date ? new Date(`${record.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  const start = rule?.startTime || record.startTime;
  const end = rule?.endTime || record.endTime;
  return [when, [formatTime(start), end && end !== start ? formatTime(end) : ""].filter(Boolean).join("–")].filter(Boolean).join(" · ");
}

export function calendarDays(year: number, month: number) {
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? day : null;
  });
}
