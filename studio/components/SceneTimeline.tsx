"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { SCENE_LENGTH, clampSceneLength } from "@/lib/canvas-document";
import { motionDuration, type MotionDocument } from "@/lib/motion-engine";
import { reorderKey, useDragReorder } from "./useDragReorder";

// The timeline is the whole video at a glance: one clip per scene, as wide as
// it is long. Drag a clip to move it; pull its right edge to change its length.
// While an edge is being pulled the clips hold a fixed scale so the edge stays
// under the pointer, then the row settles back to fit the width.
type Props = {
  doc: MotionDocument; selectedId: string; time: number; disabled?: boolean;
  onSeek: (id: string) => void; onScrub: (time: number) => void;
  onLength: (id: string, duration: number) => void; onReorder: (from: number, to: number) => void;
};
type Trim = { pointerId: number; id: string; startX: number; startDuration: number; pxPerMs: number };
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export default function SceneTimeline({ doc, selectedId, time, disabled, onSeek, onScrub, onLength, onReorder }: Props) {
  const total = motionDuration(doc);
  const trackRef = useRef<HTMLDivElement>(null);
  const trim = useRef<Trim | null>(null);
  const [trimming, setTrimming] = useState<{ id: string; pxPerMs: number } | null>(null);
  const reorder = useDragReorder({ disabled, touch: true, onReorder, onPick: (index) => onSeek(doc.scenes[index].id) });

  const startTrim = (id: string, duration: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled || event.button !== 0) return;
    const width = trackRef.current?.getBoundingClientRect().width || 600;
    const pxPerMs = width / Math.max(1, total);
    trim.current = { pointerId: event.pointerId, id, startX: event.clientX, startDuration: duration, pxPerMs };
    if (typeof event.currentTarget.setPointerCapture === "function") { try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} }
    setTrimming({ id, pxPerMs });
    onSeek(id);
    event.preventDefault();
  };
  const moveTrim = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const current = trim.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const next = clampSceneLength(current.startDuration + (event.clientX - current.startX) / current.pxPerMs);
    if (next !== doc.scenes.find((scene) => scene.id === current.id)?.duration) onLength(current.id, next);
  };
  const endTrim = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const current = trim.current;
    if (!current || event.pointerId !== current.pointerId) return;
    trim.current = null; setTrimming(null);
    if (typeof event.currentTarget.releasePointerCapture === "function") { try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {} }
  };
  const trimKey = (id: string, duration: number) => (event: KeyboardEvent<HTMLSpanElement>) => {
    const step = event.shiftKey ? 1000 : 500;
    const next = event.key === "ArrowRight" || event.key === "ArrowUp" ? duration + step : event.key === "ArrowLeft" || event.key === "ArrowDown" ? duration - step : event.key === "Home" ? SCENE_LENGTH.min : event.key === "End" ? SCENE_LENGTH.max : null;
    if (next === null) return;
    event.preventDefault(); onLength(id, clampSceneLength(next));
  };

  return <div className="cs-timeline">
    <div ref={trackRef} className={`cs-track ${trimming ? "is-trimming" : ""} ${reorder.drag ? "is-moving" : ""}`} role="list" aria-label="Scenes in order">
      {doc.scenes.map((scene, index) => {
        const placed = reorder.item(index);
        const active = scene.id === selectedId;
        return <div key={scene.id} role="listitem" data-reorder-item="" className={`cs-clip ${active ? "active" : ""} ${placed.lifted ? "is-dragging" : ""} ${trimming?.id === scene.id ? "is-trimming" : ""}`} style={{ ...placed.style, flexBasis: trimming ? `${scene.duration * trimming.pxPerMs}px` : `${scene.duration / total * 100}%` }}>
          <button type="button" className="cs-clip-body" disabled={disabled} aria-current={active ? "true" : undefined} aria-label={`Scene ${index + 1}: ${scene.title || "Untitled"}, ${seconds(scene.duration)}`} title="Drag to move this scene" onClick={() => onSeek(scene.id)} onKeyDown={(event) => reorderKey(event, index, doc.scenes.length, onReorder)} {...reorder.handle(index)}>
            <b>{String(index + 1).padStart(2, "0")}</b><i>{scene.title || "Scene"}</i><small>{seconds(scene.duration)}</small>
          </button>
          <span role="slider" tabIndex={disabled ? -1 : 0} className="cs-trim" aria-label={`Length of scene ${index + 1}`} aria-orientation="horizontal" aria-valuemin={SCENE_LENGTH.min / 1000} aria-valuemax={SCENE_LENGTH.max / 1000} aria-valuenow={scene.duration / 1000} aria-valuetext={seconds(scene.duration)} title="Pull to change the length" onPointerDown={startTrim(scene.id, scene.duration)} onPointerMove={moveTrim} onPointerUp={endTrim} onPointerCancel={endTrim} onKeyDown={trimKey(scene.id, scene.duration)} />
        </div>;
      })}
      {!trimming && !reorder.drag && <div className="cs-playhead" style={{ left: `${Math.min(100, time / Math.max(1, total) * 100)}%` }} aria-hidden="true" />}
    </div>
    <input aria-label="Video playhead" type="range" min={0} max={Math.max(1, total - 1)} value={Math.min(time, Math.max(1, total - 1))} disabled={disabled} onChange={(event) => onScrub(Number(event.target.value))} />
    <p className="cs-timeline-hint">Drag a scene to move it. Pull its right edge to change how long it stays.</p>
  </div>;
}
