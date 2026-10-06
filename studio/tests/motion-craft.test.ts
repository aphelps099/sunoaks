import { describe, expect, it, vi } from "vitest";
import { canvasEditorDocumentSchema } from "../lib/canvas-document";
import { MOTION_ANIMATIONS, TRANSITION_MS, renderMotionFrame, sceneKenBurns, type MotionDocument, type MotionImage } from "../lib/motion-engine";
import { EXIT_MS, compositionLayout, drawPhotoComposition, eventDateParts, linesFor, statText } from "../lib/photo-composition";
import { newCanvasDocument } from "../lib/canvas-document";
import { fixtureDatabase } from "./fixtures";
import { sceneFromPreset } from "../lib/scene-presets";

function context() {
  const ctx = {
    font: "", fillStyle: "", globalAlpha: 1, filter: "none", textAlign: "left", textBaseline: "top", globalCompositeOperation: "source-over",
    measureText(text: string) { return { width: text.length * Number(this.font.match(/([\d.]+)px/)?.[1] || 20) * .55 }; },
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), setTransform: vi.fn(),
    roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), letterSpacing: "0px", lineWidth: 1, strokeStyle: "",
    drawImage: vi.fn(), fillText: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}
const texts = (ctx: CanvasRenderingContext2D) => vi.mocked(ctx.fillText).mock.calls.map(([text, x, y]) => `${text}@${Math.round(Number(x))},${Math.round(Number(y))}`);
const photo = { width: 2400, height: 1600 } as HTMLImageElement;
const images: Record<string, MotionImage> = { "library-a": { id: "library-a", name: "Pool", image: photo } };

describe("typesetting", () => {
  it("balances display lines and never strands a single word", () => {
    const ctx = context(); ctx.font = "600 100px Jost";
    const width = ctx.measureText("Your time well spent ").width;
    expect(linesFor(ctx, "Your time well spent with us", width, true).every((line) => line.split(" ").length >= 2)).toBe(true);
    expect(linesFor(ctx, "Make a little room for yourself today", width).at(-1)?.split(" ").length).toBeGreaterThanOrEqual(2);
    expect(linesFor(ctx, "Breathe in.\nFind your pace.", width * 4)).toEqual(["Breathe in.", "Find your pace."]);
    expect(linesFor(ctx, "Supercalifragilisticexpialidocious", ctx.measureText("Supercali").width).length).toBeGreaterThan(1);
  });
});

describe("motion presets", () => {
  it("all settle to the identical layout, so stills and videos always agree", () => {
    const settled = new Set<string>();
    for (const animation of MOTION_ANIMATIONS) {
      const ctx = context();
      drawPhotoComposition(ctx, { ...sceneFromPreset("energy"), animation, duration: 4000 }, 1080, 1350, 3000, {});
      const drawn = texts(ctx);
      if (animation === "words" || animation === "letters" || animation === "typewriter") {
        // Per-unit presets draw the same characters, just one unit at a time.
        expect(vi.mocked(ctx.fillText).mock.calls.map(([text]) => text).join("")).toBe("MAKE ROOM FOR YOUFind yoursunny side.A little movement. A little you time.".replace(/ /g, "").replace(/MAKEROOMFORYOU/, "MAKEROOMFORYOU"));
      } else settled.add(drawn.join("|"));
    }
    expect(settled.size).toBe(1);
  });

  it("starts the first element before the cut and blinks a caret while typing", () => {
    const ctx = context();
    drawPhotoComposition(ctx, { ...sceneFromPreset("energy"), animation: "rise" }, 1080, 1350, 0, {});
    expect(vi.mocked(ctx.fillText).mock.calls.length).toBeGreaterThan(0);
    const typing = context();
    drawPhotoComposition(typing, { ...sceneFromPreset("energy"), animation: "typewriter" }, 1080, 1350, 300, {});
    const fills = vi.mocked(typing.fillRect).mock.calls;
    expect(fills.length).toBeGreaterThan(2);
    expect(vi.mocked(typing.fillText).mock.calls.length).toBeLessThan(40);
  });

  it("lifts and fades the message out only when an exit is requested", () => {
    const scene = { ...sceneFromPreset("energy"), duration: 4000 };
    const exiting = context();
    drawPhotoComposition(exiting, scene, 1080, 1350, 4000 - EXIT_MS / 2, {}, { exit: true });
    expect(vi.mocked(exiting.translate).mock.calls.some(([x, y]) => x === 0 && y < -1)).toBe(true);
    const staying = context();
    drawPhotoComposition(staying, scene, 1080, 1350, 4000 - EXIT_MS / 2, {}, { exit: false });
    expect(vi.mocked(staying.translate).mock.calls.some(([x, y]) => x === 0 && y < -1)).toBe(false);
  });
});

describe("photo movement", () => {
  it("keeps every movement inside the photo and honours the older zoom flag", () => {
    expect(sceneKenBurns({ zoom: false, kenBurns: "pan-left" })).toBe("none");
    expect(sceneKenBurns({ zoom: true })).toBe("zoom-in");
    for (const kenBurns of ["zoom-in", "zoom-out", "pan-left", "pan-right", "none"] as const) for (const local of [0, 2500, 4999]) {
      const ctx = context();
      drawPhotoComposition(ctx, { ...sceneFromPreset("pool", "library-a"), kenBurns, duration: 5000 }, 1920, 1080, local, images);
      const [, sx, sy, sw, sh] = vi.mocked(ctx.drawImage).mock.calls[0] as unknown as [unknown, number, number, number, number];
      expect(sx).toBeGreaterThanOrEqual(0); expect(sy).toBeGreaterThanOrEqual(0);
      expect(sx + sw).toBeLessThanOrEqual(photo.width + 1e-6); expect(sy + sh).toBeLessThanOrEqual(photo.height + 1e-6);
    }
    const left = context(), right = context();
    drawPhotoComposition(left, { ...sceneFromPreset("pool", "library-a"), kenBurns: "pan-left", duration: 5000 }, 1920, 1080, 4999, images);
    drawPhotoComposition(right, { ...sceneFromPreset("pool", "library-a"), kenBurns: "pan-right", duration: 5000 }, 1920, 1080, 4999, images);
    expect((vi.mocked(left.drawImage).mock.calls[0] as unknown[])[1]).toBeLessThan((vi.mocked(right.drawImage).mock.calls[0] as unknown[])[1] as number);
  });
});

describe("scene transitions", () => {
  const doc = (transition: MotionDocument["scenes"][number]["transition"]): MotionDocument => ({ designVersion: 2, aspect: "1:1", fps: 30, scenes: [{ ...sceneFromPreset("energy"), duration: 3000 }, { ...sceneFromPreset("pause"), duration: 3000, transition }] });
  it("slides, wipes with an accent edge, crossfades, or cuts", () => {
    const slide = context();
    renderMotionFrame(slide, doc("slide"), 3000 + TRANSITION_MS / 2, {});
    expect(vi.mocked(slide.translate).mock.calls.some(([x, y]) => x > 0 && x < 1080 && y === 0)).toBe(true);
    const wipe = context();
    renderMotionFrame(wipe, doc("wipe"), 3000 + TRANSITION_MS / 2, {});
    expect(vi.mocked(wipe.rect).mock.calls.some(([x, y, w, h]) => x === 0 && y === 0 && w === 540 && h === 1080)).toBe(true);
    expect(vi.mocked(wipe.fillRect).mock.calls.some(([x, , w, h]) => x === 537 && w === 6 && h === 1080)).toBe(true);
    const cut = context();
    renderMotionFrame(cut, doc("cut"), 3000 + 10, {});
    expect(vi.mocked(cut.fillRect).mock.calls[0][0]).toBe(0);
    expect(vi.mocked(cut.fillText).mock.calls.map(([text]) => text).join(" ")).toContain("Breathe");
    expect(vi.mocked(cut.fillText).mock.calls.map(([text]) => text).join(" ")).not.toContain("sunny");
    const fade = context();
    renderMotionFrame(fade, doc("fade"), 3000 + 10, {});
    expect(vi.mocked(fade.fillText).mock.calls.map(([text]) => text).join(" ")).toContain("sunny");
  });

  it("persists the new motion, transition, movement, and grain choices while reading older designs", () => {
    const parsed = canvasEditorDocumentSchema.parse({ ...doc("wipe"), grain: true, scenes: doc("wipe").scenes.map((scene) => ({ ...scene, animation: "letters", kenBurns: "pan-right" })) });
    expect(parsed.grain).toBe(true); expect(parsed.scenes[1]).toMatchObject({ animation: "letters", transition: "wipe", kenBurns: "pan-right" });
    expect(canvasEditorDocumentSchema.parse({ aspect: "4:5", fps: 30, scenes: [{ ...sceneFromPreset("hello"), zoom: false }] }).scenes[0].kenBurns).toBeUndefined();
    expect(() => canvasEditorDocumentSchema.parse({ ...doc("fade"), scenes: [{ ...doc("fade").scenes[0], animation: "bounce" }] })).toThrow();
  });
});

describe("scene types", () => {
  it("counts a number up to its final figure and draws it in accent", () => {
    const scene = { ...sceneFromPreset("numbers"), statValue: 1234, statPrefix: "$", statSuffix: "+" };
    expect(statText(scene, 0)).toBe("$0+");
    expect(statText(scene, 3000)).toBe("$1,234+");
    expect(Number(statText(scene, 800).replace(/[^0-9]/g, ""))).toBeGreaterThan(0);
    const ctx = context();
    drawPhotoComposition(ctx, scene, 1080, 1350, 3000, {});
    const figure = vi.mocked(ctx.fillText).mock.calls.find(([text]) => text === "$1,234+");
    expect(figure).toBeTruthy();
    const layout = compositionLayout(context(), scene, 1080, 1350);
    expect(layout.stat!.size).toBeGreaterThan(layout.regions.title.size * 3);
    expect(layout.stat!.y).toBeLessThan(layout.regions.title.y);
  });

  it("lays list rows out under the headline, one per line, each with its own tick", () => {
    const scene = { ...sceneFromPreset("included"), body: "Pools and courts\nGroup classes\n\nSauna" };
    const layout = compositionLayout(context(), scene, 1080, 1350);
    expect(layout.regions.body!.lines).toEqual(["Pools and courts", "Group classes", "Sauna"]);
    expect(layout.regions.body!.y).toBeGreaterThan(layout.regions.title.y + layout.regions.title.height);
    expect(layout.regions.subtitle.y).toBeGreaterThanOrEqual(layout.regions.body!.y + layout.regions.body!.height);
    expect(layout.tick).toBeTruthy();
    const settled = context();
    drawPhotoComposition(settled, scene, 1080, 1350, 4000, {});
    expect(vi.mocked(settled.fillText).mock.calls.map(([text]) => text)).toEqual(expect.arrayContaining(["Pools and courts", "Group classes", "Sauna"]));
    const early = context();
    drawPhotoComposition(early, scene, 1080, 1350, 250, {});
    expect(vi.mocked(early.fillText).mock.calls.map(([text]) => text)).not.toContain("Sauna");
  });

  it("draws a Save the Date tile from an ISO date and says TBD until one is known", () => {
    expect(eventDateParts("2026-09-18")).toEqual({ month: "SEP", day: "18", known: true });
    expect(eventDateParts("")).toEqual({ month: "DATE", day: "TBD", known: false });
    expect(eventDateParts("2026-13-40").known).toBe(false);
    const scene = { ...sceneFromPreset("date"), eventDate: "2026-09-18" };
    const ctx = context();
    drawPhotoComposition(ctx, scene, 1920, 1080, 3000, {});
    const drawn = vi.mocked(ctx.fillText).mock.calls.map(([text]) => text);
    expect(drawn).toEqual(expect.arrayContaining(["SEP", "18"]));
    expect(vi.mocked(ctx.roundRect)).toHaveBeenCalledTimes(1);
    const wide = compositionLayout(context(), scene, 1920, 1080), tall = compositionLayout(context(), scene, 1080, 1920);
    expect(wide.regions.title.x).toBeGreaterThan(wide.tile!.x + wide.tile!.w);
    expect(tall.regions.title.y).toBeGreaterThan(tall.tile!.y + tall.tile!.h);
  });

  it("adds a Save the Date beat from a verified dated event, never from a class without a date", () => {
    const db = fixtureDatabase();
    const event = db.records.find((record) => record.id === "record-event")!;
    const doc = newCanvasDocument(event, null, db.scheduleRules);
    expect(doc.scenes.map((scene) => scene.template)).toEqual(["image", "calendar", "endcard"]);
    expect(doc.scenes[1]).toMatchObject({ title: "Poolside Family Night", eventDate: "2026-09-18", subtitle: "6:30 PM–8:30 PM · Outdoor Pool" });
    const klass = db.records.find((record) => record.id === "record-class")!;
    expect(newCanvasDocument(klass, null, db.scheduleRules).scenes.map((scene) => scene.template)).toEqual(["image", "endcard"]);
    expect(() => canvasEditorDocumentSchema.parse({ ...doc, scenes: [{ ...doc.scenes[1], eventDate: "next friday" }] })).toThrow();
  });
});
