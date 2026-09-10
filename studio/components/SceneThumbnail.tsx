"use client";

import { useEffect, useRef, useState } from "react";
import { MOTION_ASPECTS, renderMotionFrame, type MotionDocument, type MotionScene, type MotionImage } from "@/lib/motion-engine";

export default function SceneThumbnail({ doc, scene, images }: { doc: MotionDocument; scene: MotionScene; images: Record<string, MotionImage> }) {
  const { aspect, designVersion } = doc;
  const ref = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const size = MOTION_ASPECTS[aspect];
    const full = document.createElement("canvas"); full.width = size.width; full.height = size.height;
    const ctx = full.getContext("2d"); if (!ctx) return;
    canvas.width = 160; canvas.height = Math.round(160 * size.height / size.width);
    const draw = (time: number) => { renderMotionFrame(ctx, { aspect, designVersion, fps: 30, scenes: [scene] }, time, images); canvas.getContext("2d")?.drawImage(full, 0, 0, canvas.width, canvas.height); };
    draw(scene.duration * .7);
    if (!hovered || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0; const start = performance.now();
    const tick = (now: number) => { draw((now - start) % scene.duration); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [aspect, designVersion, scene, images, hovered]);
  return <canvas ref={ref} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} aria-label={`${scene.title || "Untitled"} thumbnail`} />;
}

