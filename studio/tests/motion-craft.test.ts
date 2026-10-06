import { describe, expect, it, vi } from "vitest";
import { canvasEditorDocumentSchema } from "../lib/canvas-document";
import { MOTION_ANIMATIONS, TRANSITION_MS, renderMotionFrame, sceneKenBurns, type MotionDocument, type MotionImage } from "../lib/motion-engine";
import { EXIT_MS, drawPhotoComposition, linesFor } from "../lib/photo-composition";
import { sceneFromPreset } from "../lib/scene-presets";

function context() {
  const ctx = {
    font: "", fillStyle: "", globalAlpha: 1, filter: "none", textAlign: "left", textBaseline: "top", globalCompositeOperation: "source-over",
    measureText(text: string) { return { width: text.length * Number(this.font.match(/([\d.]+)px/)?.[1] || 20) * .55 }; },
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), setTransform: vi.fn(),
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
