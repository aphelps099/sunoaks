import { z } from "zod";
import type { ContentRecord, ScheduleRule } from "./client-types";
import { type MotionDocument } from "./motion-engine";
import { recordSchedule } from "./promotion";
import { sceneFromPreset } from "./scene-presets";

export const canvasDocumentSchema = z.object({
  designVersion: z.literal(2),
  aspect: z.enum(["16:9", "1:1", "9:16", "4:5"]),
  fps: z.literal(30),
  scenes: z.array(z.object({
    id: z.string().min(1), template: z.enum(["title", "statement", "stat", "list", "quote", "image", "details", "calendar", "presenter", "disclaimer", "endcard"]),
    duration: z.number().min(1500).max(12000), kicker: z.string().max(160), title: z.string().max(240), subtitle: z.string().max(400),
    animation: z.enum(["rise", "fade", "wipe", "scale", "stagger"]), transition: z.enum(["cut", "fade", "slide"]), imageId: z.string().nullable(),
    position: z.enum(["top-left", "center-left", "bottom-left", "center", "bottom-center", "bottom-right"]).optional(),
    shade: z.number().min(0).max(1).optional(), zoom: z.boolean().optional(), focalX: z.number().min(0).max(1).optional(), focalY: z.number().min(0).max(1).optional(),
    styleId: z.enum(["oak", "sun", "pool", "mint", "cream", "clay", "night", "white"]).optional(),
    logoStyle: z.enum(["emblem", "wordmark"]).optional(),
  })).min(1).max(30),
});
export const canvasEditorDocumentSchema = canvasDocumentSchema.extend({ designVersion: z.literal(2).optional() });

export function newCanvasDocument(record?: ContentRecord, imageId: string | null = null, rules: ScheduleRule[] = []): MotionDocument {
  const opener = sceneFromPreset("hello", imageId);
  if (record) { opener.title = record.name; opener.subtitle = recordSchedule(record, rules); opener.duration = 6000; }
  const ending = sceneFromPreset("ending");
  if (record?.cta) ending.subtitle = record.cta;
  return { designVersion: 2, aspect: "4:5", fps: 30, scenes: record ? [opener, ending] : [opener, sceneFromPreset("energy"), ending] };
}

export function canvasSignature(doc: MotionDocument, title: string, mode: "graphic" | "video", plannedDate: string) {
  return JSON.stringify({ doc, title, mode, plannedDate });
}

// Graphics always show settled text, even when a short video scene is mid-reveal.
export function stillDocument(doc: MotionDocument, selectedId: string): MotionDocument {
  const scene = doc.scenes.find((item) => item.id === selectedId) || doc.scenes[0];
  return { ...doc, scenes: [{ ...scene, duration: Math.max(4000, scene.duration), animation: "fade", transition: "cut" }] };
}
