"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { SCENE_PRESETS, type ScenePresetId } from "@/lib/scene-presets";
import { sceneStyle } from "@/lib/scene-styles";
import type { MotionAspect, MotionImage, MotionScene } from "@/lib/motion-engine";
import SceneThumbnail from "./SceneThumbnail";

type Props = { aspect: MotionAspect; photoId: string | null; images: Record<string, MotionImage>; disabled: boolean; onAdd: (id: ScenePresetId, imageId: string | null) => void };

export default function ScenePresetGallery({ aspect, photoId, images, disabled, onAdd }: Props) {
  const scenes = useMemo(() => SCENE_PRESETS.map((preset) => {
    const theme = preset.id === "pool" ? /pool|swim|aquatic/i : preset.id === "class" ? /train|fitness|gym/i : preset.id === "together" ? /family|community/i : null;
    const matchingPhoto = theme ? Object.values(images).find((image) => image.id.startsWith("library-") && theme.test(image.name)) : null;
    // Preview IDs are deterministic; only insertion creates a new document ID.
    const scene: MotionScene = { ...preset.values, id: `preset-${preset.id}`, imageId: preset.photo ? matchingPhoto?.id || photoId : null, shade: .5, zoom: true, transition: "fade" };
    return { preset, scene };
  }), [photoId, images]);

  return <section id="cs-scene-gallery" className="cs-gallery" aria-label="Ready-made scenes">
    <div className="cs-gallery-heading"><strong>Make it yours</strong><span>Click to add a scene · hover to preview</span></div>
    <div className="cs-preset-rail">{scenes.map(({ preset, scene }, index) =>
      <button id={index === 0 ? "cs-first-preset" : undefined} key={preset.id} className="cs-preset" aria-label={`Add ${preset.name} scene`} title={preset.note} disabled={disabled} onClick={() => onAdd(preset.id, scene.imageId)}>
        <div style={{ background: sceneStyle(scene.styleId).background }}>
          <SceneThumbnail doc={{ aspect, fps: 30, designVersion: 2, scenes: [scene] }} scene={scene} images={images} />
          <span className="cs-preset-plus"><Plus size={16} /></span>
        </div>
        <strong>{preset.name}</strong><small>{scene.duration / 1000}s · {preset.photo ? "Photo" : "Color"}</small>
      </button>
    )}</div>
  </section>;
}
