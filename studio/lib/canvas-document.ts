import { z } from "zod";
import type { ContentRecord, ScheduleRule } from "./client-types";
import { KEN_BURNS, MOTION_ANIMATIONS, MOTION_TRANSITIONS, type MotionDocument } from "./motion-engine";
import { formatTime, recordSchedule } from "./promotion";
import { sceneFromPreset } from "./scene-presets";

/** How long one scene may stay on screen, in milliseconds. The timeline trims in tenths of a second. */
export const SCENE_LENGTH = { min: 1500, max: 12000, step: 100 } as const;
export const clampSceneLength = (ms: number) => Math.min(SCENE_LENGTH.max, Math.max(SCENE_LENGTH.min, Math.round(ms / SCENE_LENGTH.step) * SCENE_LENGTH.step));

export const canvasDocumentSchema = z.object({
  designVersion: z.literal(2),
  aspect: z.enum(["16:9", "1:1", "9:16", "4:5"]),
  fps: z.literal(30),
  scenes: z.array(z.object({
    id: z.string().min(1), template: z.enum(["title", "statement", "stat", "list", "quote", "image", "details", "calendar", "presenter", "disclaimer", "endcard"]),
    duration: z.number().min(SCENE_LENGTH.min).max(SCENE_LENGTH.max), kicker: z.string().max(160), title: z.string().max(240), subtitle: z.string().max(400),
    animation: z.enum(MOTION_ANIMATIONS), transition: z.enum(MOTION_TRANSITIONS), imageId: z.string().nullable(),
    position: z.enum(["top-left", "center-left", "bottom-left", "center", "bottom-center", "bottom-right"]).optional(),
    shade: z.number().min(0).max(1).optional(), zoom: z.boolean().optional(), kenBurns: z.enum(KEN_BURNS).optional(),
    focalX: z.number().min(0).max(1).optional(), focalY: z.number().min(0).max(1).optional(),
    styleId: z.enum(["oak", "sun", "pool", "mint", "cream", "clay", "night", "white"]).optional(),
    logoStyle: z.enum(["emblem", "wordmark"]).optional(),
    body: z.string().max(600).optional(),
    statValue: z.number().finite().min(0).max(999_999_999).optional(), statPrefix: z.string().max(8).optional(), statSuffix: z.string().max(8).optional(),
    eventDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a YYYY-MM-DD date.").optional(),
  })).min(1).max(30),
  grain: z.boolean().optional(),
});
export const canvasEditorDocumentSchema = canvasDocumentSchema.extend({ designVersion: z.literal(2).optional() });

export function newCanvasDocument(record?: ContentRecord, imageId: string | null = null, rules: ScheduleRule[] = []): MotionDocument {
  const opener = sceneFromPreset("hello", imageId);
  if (record) { opener.title = record.name; opener.subtitle = recordSchedule(record, rules); opener.duration = 6000; }
  const ending = sceneFromPreset("ending");
  if (record?.cta) ending.subtitle = record.cta;
  const scenes = record ? [opener, ending] : [opener, sceneFromPreset("energy"), ending];
  if (record?.date) {
    // A dated event gets a Save the Date beat drawn from the verified record, never typed by hand.
    const date = sceneFromPreset("date");
    date.title = record.name; date.eventDate = record.date;
    date.subtitle = [[formatTime(record.startTime), record.endTime && record.endTime !== record.startTime ? formatTime(record.endTime) : ""].filter(Boolean).join("–"), record.location].filter(Boolean).join(" · ");
    scenes.splice(1, 0, date);
  }
  return { designVersion: 2, aspect: "4:5", fps: 30, grain: true, scenes };
}

export function canvasSignature(doc: MotionDocument, title: string, mode: "graphic" | "video", plannedDate: string) {
  return JSON.stringify({ doc, title, mode, plannedDate });
}

// Graphics always show settled text, even when a short video scene is mid-reveal.
export function stillDocument(doc: MotionDocument, selectedId: string): MotionDocument {
  const scene = doc.scenes.find((item) => item.id === selectedId) || doc.scenes[0];
  return { ...doc, scenes: [{ ...scene, duration: Math.max(4000, scene.duration), animation: "fade", transition: "cut" }] };
}
