"use client";

import { useEffect, useState, type RefObject } from "react";
import { compositionLayout, type CanvasTextField } from "@/lib/photo-composition";
import { MOTION_ASPECTS, type MotionDocument, type MotionScene } from "@/lib/motion-engine";

const labels = { title: "headline", subtitle: "small line", kicker: "small label" };
const limits = { title: 240, subtitle: 400, kicker: 160 };
type Props = { canvasRef: RefObject<HTMLCanvasElement | null>; scene: MotionScene; aspect: MotionDocument["aspect"]; ready: boolean; onChange: (patch: Partial<MotionScene>) => void };

export default function CanvasTextEditor({ canvasRef, scene, aspect, ready, onChange }: Props) {
  const [field, setField] = useState<CanvasTextField | null>(null);
  const [geometry, setGeometry] = useState<{ left: number; top: number; scale: number; layout: ReturnType<typeof compositionLayout> } | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const measure = () => {
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      const box = canvas.getBoundingClientRect(), parent = canvas.parentElement!.getBoundingClientRect();
      const size = MOTION_ASPECTS[aspect], scale = Math.min(box.width / size.width, box.height / size.height);
      const layout = compositionLayout(ctx, scene, size.width, size.height);
      setGeometry({ left: box.left - parent.left + (box.width - size.width * scale) / 2, top: box.top - parent.top + (box.height - size.height * scale) / 2, scale, layout });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(canvas); window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [canvasRef, scene, aspect, ready]);

  if (!geometry) return null;
  return <div className="cs-text-targets" aria-label="Edit canvas text">
    {(["kicker", "title", "subtitle"] as const).map((name) => {
      const region = geometry.layout.regions[name];
      const style = { left: geometry.left + region.x * geometry.scale, top: geometry.top + region.y * geometry.scale, width: region.width * geometry.scale, height: Math.max(22, region.height * geometry.scale), textAlign: geometry.layout.align };
      return field === name ? <textarea key={name} autoFocus aria-label={`Edit ${labels[name]} on canvas`} className="cs-inline-text" maxLength={limits[name]} value={scene[name]} style={{ ...style, fontSize: Math.max(14, region.size * geometry.scale), lineHeight: region.lineHeight, fontWeight: name === "title" ? 600 : 400 }} onFocus={(event) => event.target.select()} onChange={(event) => onChange({ [name]: event.target.value })} onBlur={() => setField(null)} onKeyDown={(event) => { if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) { event.preventDefault(); setField(null); } }} />
        : <button key={name} className={`cs-text-target ${scene[name] ? "" : "cs-text-empty"}`} aria-label={`Edit ${labels[name]} on canvas`} style={style} onClick={() => setField(name)}><span>{scene[name] ? `Edit ${labels[name]}` : `+ Add ${labels[name]}`}</span></button>;
    })}
  </div>;
}
