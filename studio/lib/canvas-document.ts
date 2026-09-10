import { z } from "zod";
import type { ContentRecord, ScheduleRule } from "./client-types";
import { makeMotionScene, type MotionDocument } from "./motion-engine";
import { recordSchedule } from "./promotion";

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
  })).min(1).max(30),
});
export const canvasEditorDocumentSchema = canvasDocumentSchema.extend({ designVersion: z.literal(2).optional() });

export function newCanvasDocument(record?: ContentRecord, imageId: string | null = null, rules: ScheduleRule[] = []): MotionDocument {
  return { designVersion: 2, aspect: "4:5", fps: 30, scenes: [makeMotionScene("image", {
    title: record?.name || "Your time.\nWell spent.",
    subtitle: record ? recordSchedule(record, rules) : "SUN OAKS · REDDING",
    kicker: "", imageId, duration: 6000, animation: "stagger", position: "bottom-left", shade: .5, zoom: true,
  })] };
}

export function canvasSignature(doc: MotionDocument, title: string, mode: "graphic" | "video", plannedDate: string) {
  return JSON.stringify({ doc, title, mode, plannedDate });
}

// Graphics always show settled text, even when a short video scene is mid-reveal.
export function stillDocument(doc: MotionDocument, selectedId: string): MotionDocument {
  const scene = doc.scenes.find((item) => item.id === selectedId) || doc.scenes[0];
  return { ...doc, scenes: [{ ...scene, duration: Math.max(4000, scene.duration), animation: "fade", transition: "cut" }] };
}
