import { describe, expect, it, vi } from "vitest";
import { canvasDocumentSchema, newCanvasDocument } from "../lib/canvas-document";
import { MOTION_ASPECTS, type MotionImage } from "../lib/motion-engine";
import { brandImageKey, compositionLayout, drawPhotoComposition } from "../lib/photo-composition";
import { SCENE_PRESETS, sceneFromPreset } from "../lib/scene-presets";
import { SCENE_STYLES } from "../lib/scene-styles";

function context() {
  const ctx = {
    font: "", fillStyle: "", globalAlpha: 1,
    measureText(text: string) { return { width: text.length * Number(this.font.match(/([\d.]+)px/)?.[1] || 20) * .55 }; },
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(),
    drawImage: vi.fn(), fillText: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe("ready-made scene rendering", () => {
  it("provides distinct, persistable scenes and gives each inserted scene its own identity", () => {
    const doc = newCanvasDocument();
    expect(doc.scenes).toHaveLength(3);
    doc.scenes = SCENE_PRESETS.map((preset) => sceneFromPreset(preset.id, "library-approved"));
    expect(canvasDocumentSchema.parse(doc).scenes).toHaveLength(8);
    expect(new Set(doc.scenes.map((scene) => scene.id)).size).toBe(8);
    expect(sceneFromPreset("hello").id).not.toBe(sceneFromPreset("hello").id);
    expect(doc.scenes.filter((scene) => !scene.imageId).every((scene) => scene.styleId && scene.logoStyle)).toBe(true);
    expect(() => canvasDocumentSchema.parse({ ...doc, scenes: [{ ...doc.scenes[0], styleId: "unknown" }] })).toThrow();
    expect(() => canvasDocumentSchema.parse({ ...doc, scenes: [{ ...doc.scenes[0], logoStyle: "unknown" }] })).toThrow();
  });

  it("keeps editable text regions inside all four export sizes, including long copy", () => {
    for (const size of Object.values(MOTION_ASPECTS)) for (const preset of SCENE_PRESETS) {
      const scene = sceneFromPreset(preset.id);
      for (const long of [false, true]) {
        if (long) { scene.title = "A little time for yourself. ".repeat(9).slice(0, 240); scene.subtitle = "Space to move and be together. ".repeat(15).slice(0, 400); scene.kicker = "SUN OAKS ".repeat(18).slice(0, 160); }
        const layout = compositionLayout(context(), scene, size.width, size.height);
        for (const region of Object.values(layout.regions)) {
          expect(region.x).toBeGreaterThanOrEqual(0);
          expect(region.y).toBeGreaterThanOrEqual(0);
          expect(region.x + region.width).toBeLessThanOrEqual(size.width);
          expect(region.y + region.height).toBeLessThanOrEqual(size.height);
        }
      }
    }
  });

  it("uses each selected palette in the shared renderer and crops the full-size emblem", () => {
    for (const style of SCENE_STYLES) {
      const ctx = context(), fills: string[] = [];
      vi.mocked(ctx.fillRect).mockImplementation(() => { fills.push(String(ctx.fillStyle)); });
      const scene = { ...sceneFromPreset("energy"), styleId: style.id };
      const id = brandImageKey("emblem", style.accent);
      const image = { width: 240, height: 240 } as HTMLImageElement;
      drawPhotoComposition(ctx, scene, 1080, 1350, 2500, { [id]: { id, name: "Oak", image } });
      expect(fills[0]).toBe(style.background);
      const [, x, y, width, height] = vi.mocked(ctx.drawImage).mock.calls[0] as unknown as [MotionImage, number, number, number, number];
      expect(width).toBeGreaterThan(1080);
      expect(height).toBe(width);
      expect(x + width).toBeGreaterThan(1080);
      expect(y).toBeLessThan(0);
    }
  });

  it("keeps the complete wordmark small on both photo and closing scenes", () => {
    for (const preset of ["hello", "invitation"] as const) {
      const ctx = context(), id = brandImageKey("wordmark", "#FFFFFF");
      const image = { width: 1074, height: 148 } as HTMLImageElement;
      drawPhotoComposition(ctx, sceneFromPreset(preset), 1080, 1350, 2500, { [id]: { id, name: "Sun Oaks", image } });
      const [, x, y, width, height] = vi.mocked(ctx.drawImage).mock.calls[0] as unknown as [MotionImage, number, number, number, number];
      expect(width / 1080).toBeLessThan(.3);
      expect(width / height).toBeCloseTo(1074 / 148);
      expect(x).toBeGreaterThan(0); expect(y).toBeGreaterThan(0);
    }
  });
});
