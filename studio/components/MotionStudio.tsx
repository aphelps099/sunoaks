"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Download, Film, ImagePlus, Pause, Play, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { uploadAsset } from "@/lib/assets-client";
import { recordSchedule as confirmedSchedule } from "@/lib/promotion";
import type { ContentRecord, ScheduleRule, StudioData } from "@/lib/client-types";
import {
  MOTION_ASPECTS, downloadMotionBlob, exportMotionMp4, exportMotionPng, exportMotionWebm, makeMotionScene,
  motionDuration, motionSceneAt, renderMotionFrame,
  type MotionAnimation, type MotionAspect, type MotionDocument, type MotionImage, type MotionScene, type MotionTemplate, type MotionTransition,
} from "@/lib/motion-engine";

const TEMPLATES: { id: MotionTemplate; label: string }[] = [
  { id: "title", label: "Title" }, { id: "statement", label: "Statement" }, { id: "stat", label: "Stat" },
  { id: "list", label: "List" }, { id: "quote", label: "Quote" }, { id: "image", label: "Photo" },
  { id: "details", label: "Details" }, { id: "calendar", label: "Calendar" }, { id: "presenter", label: "Presenter" },
  { id: "disclaimer", label: "Disclaimer" }, { id: "endcard", label: "End card" },
];
const ANIMATIONS: MotionAnimation[] = ["rise", "fade", "wipe", "scale"];
const TRANSITIONS: MotionTransition[] = ["cut", "fade", "slide"];

function recordSchedule(record: ContentRecord, rules: ScheduleRule[]) {
  return [confirmedSchedule(record, rules), record.location].filter(Boolean).join(" · ");
}

function defaultDocument(record: ContentRecord, imageId: string | null, rules: ScheduleRule[]): MotionDocument {
  return {
    aspect: "9:16",
    fps: 30,
    scenes: [
      makeMotionScene("title", { kicker: record.recordType === "event" ? "SUN OAKS EVENT" : "CLASS SPOTLIGHT", title: record.name, subtitle: record.summary }),
      makeMotionScene("image", { kicker: record.name, title: recordSchedule(record, rules), subtitle: record.instructor ? `With ${record.instructor}` : record.price || "", imageId, animation: "wipe" }),
      makeMotionScene("endcard", { kicker: "SUN OAKS", title: record.cta, subtitle: record.name, transition: "slide" }),
    ],
  };
}

async function imageElement(src: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  return image;
}

export default function MotionStudio({ data, mutate, initialRecordId, onBack, onDirtyChange }: {
  data: StudioData;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  initialRecordId?: string;
  onBack?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const records = data.records.filter((record) => record.active && record.verificationStatus === "verified");
  const [recordId, setRecordId] = useState(initialRecordId || records[0]?.id || "");
  const record = records.find((item) => item.id === recordId) || records[0];
  const approvedAsset = data.assets.find((item) => item.id === record?.assetId && item.active && item.rightsStatus === "approved");
  const libraryImageId = approvedAsset ? `library-${approvedAsset.id}` : null;
  const [images, setImages] = useState<Record<string, MotionImage>>({});
  const imagesRef = useRef(images);
  const existingProject = data.creativeProjects.find((item) => item.kind === "motion" && item.recordId === record?.id);
  const savedDocument = existingProject?.payload.doc as MotionDocument | undefined;
  const [doc, setDoc] = useState<MotionDocument>(() => savedDocument?.scenes?.length ? savedDocument : record ? defaultDocument(record, libraryImageId, data.scheduleRules) : { aspect: "9:16", fps: 30, scenes: [] });
  const [savedDoc, setSavedDoc] = useState(() => JSON.stringify(doc));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dirty = JSON.stringify(doc) !== savedDoc;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const docRef = useRef(doc);
  const [selectedId, setSelectedId] = useState(doc.scenes[0]?.id || "");
  const selected = doc.scenes.find((scene) => scene.id === selectedId) || doc.scenes[0];
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(playing);
  const playheadRef = useRef(0);
  const [time, setTime] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState<"png" | "webm" | "mp4" | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState(existingProject?.id || "");
  const [reviewUrl, setReviewUrl] = useState("");
  const [mp4Supported, setMp4Supported] = useState(false);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { docRef.current = doc; }, [doc]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { queueMicrotask(() => setMp4Supported("VideoEncoder" in window && "VideoFrame" in window)); }, []);
  useEffect(() => {
    let live = true;
    const entries = data.assets.filter((asset) => asset.active && asset.rightsStatus === "approved");
    void Promise.all(entries.map(async (asset) => {
      try {
        return [`library-${asset.id}`, { id: `library-${asset.id}`, name: asset.title, image: await imageElement(asset.fileReference) }] as const;
      } catch { return null; }
    })).then((loaded) => {
      if (!live) return;
      setImages((current) => ({ ...Object.fromEntries(loaded.filter((item): item is NonNullable<typeof item> => Boolean(item))), ...current }));
    });
    return () => { live = false; };
  }, [data.assets]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let uiUpdated = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const current = docRef.current;
      const duration = motionDuration(current);
      if (playingRef.current && duration) playheadRef.current = (playheadRef.current + now - previous) % duration;
      previous = now;
      const canvas = canvasRef.current;
      if (canvas) {
        const size = MOTION_ASPECTS[current.aspect];
        if (canvas.width !== size.width || canvas.height !== size.height) { canvas.width = size.width; canvas.height = size.height; }
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) renderMotionFrame(ctx, current, playheadRef.current, imagesRef.current);
      }
      if (now - uiUpdated > 100) { setTime(playheadRef.current); uiUpdated = now; }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const patchScene = (changes: Partial<MotionScene>) => {
    setDoc((current) => ({ ...current, scenes: current.scenes.map((scene) => scene.id === selectedId ? { ...scene, ...changes } : scene) }));
  };
  const seekScene = (scene: MotionScene) => {
    const index = doc.scenes.findIndex((item) => item.id === scene.id);
    playheadRef.current = doc.scenes.slice(0, index).reduce((sum, item) => sum + item.duration, 0) + 1;
    setSelectedId(scene.id);
  };
  const addScene = (template: MotionTemplate) => {
    const scene = makeMotionScene(template, { title: record?.name || "New scene", imageId: template === "image" ? libraryImageId : null });
    setDoc((current) => {
      const index = Math.max(0, current.scenes.findIndex((item) => item.id === selectedId) + 1);
      const scenes = [...current.scenes];
      scenes.splice(index, 0, scene);
      return { ...current, scenes };
    });
    setSelectedId(scene.id);
  };
  const moveScene = (direction: -1 | 1) => setDoc((current) => {
    const index = current.scenes.findIndex((item) => item.id === selectedId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.scenes.length) return current;
    const scenes = [...current.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    return { ...current, scenes };
  });
  const duplicate = () => {
    if (!selected) return;
    const values: Partial<MotionScene> = { ...selected };
    delete values.id;
    const copy = makeMotionScene(selected.template, values);
    setDoc((current) => {
      const index = current.scenes.findIndex((item) => item.id === selected.id);
      const scenes = [...current.scenes];
      scenes.splice(index + 1, 0, copy);
      return { ...current, scenes };
    });
    setSelectedId(copy.id);
  };
  const remove = () => {
    if (!selected || doc.scenes.length <= 1) return;
    const index = doc.scenes.findIndex((item) => item.id === selected.id);
    const next = doc.scenes.filter((item) => item.id !== selected.id);
    setDoc((current) => ({ ...current, scenes: next }));
    setSelectedId(next[Math.max(0, index - 1)].id);
  };
  const upload = async (file: File) => {
    setUploading(true); setMessage("Uploading photo…");
    try {
      const asset = await uploadAsset(file);
      const id = `library-${asset.id}`;
      const image = await imageElement(asset.fileReference);
      setImages((current) => ({ ...current, [id]: { id, name: asset.title, image } }));
      patchScene({ imageId: id, template: "image" });
      setMessage("Photo uploaded. Save your draft to keep this scene.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "The photo could not be uploaded. Try again."); }
    finally { setUploading(false); }
  };
  const scrub = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    playheadRef.current = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * motionDuration(doc);
    const active = motionSceneAt(doc, playheadRef.current).scene;
    if (active) setSelectedId(active.id);
  };
  const runExport = async (kind: "png" | "webm" | "mp4") => {
    setPlaying(false);
    setExporting(kind);
    setProgress(0);
    setMessage("");
    try {
      const blob = kind === "png" ? await exportMotionPng(doc, playheadRef.current, images)
        : kind === "webm" ? await exportMotionWebm(doc, images, setProgress)
          : await exportMotionMp4(doc, images, setProgress);
      const slug = (record?.name || "motion").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      downloadMotionBlob(blob, `sun-oaks-${slug}-${doc.aspect.replace(":", "x")}.${kind}`);
      setMessage(`${kind.toUpperCase()} exported.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  };
  const saveProject = async (createReview: boolean) => {
    if (saving || uploading) return;
    setSaving(true); setPlaying(false);
    try {
    if (doc.scenes.some((scene) => scene.imageId && !images[scene.imageId])) throw new Error("A scene photo is missing or still loading. Replace it or try saving again.");
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    const size = MOTION_ASPECTS[doc.aspect];
    canvas.width = size.width; canvas.height = size.height;
    renderMotionFrame(canvas.getContext("2d")!, doc, playheadRef.current, images);
    const artwork = {
      key: "motion-preview", kind: "motion", format: doc.aspect, width: size.width, height: size.height,
      dataUrl: canvas.toDataURL("image/jpeg", .9),
    };
    const saved = await mutate({
      action: "saveCreativeProject", projectId: projectId || undefined, expectedVersion: existingProject?.version, kind: "motion", recordId: record.id,
      title: `${record.name} Motion`, payload: { doc, playhead: playheadRef.current, artworks: [artwork] },
    });
    const id = String(saved.creativeProjectId);
    setProjectId(id);
    setSavedDoc(JSON.stringify(doc));
    setMessage("Draft saved.");
    if (createReview) {
      const result = await mutate({ action: "createProjectReviewLink", creativeProjectId: id, selectedArtworkKeys: ["motion-preview"], expiresInHours: 72 });
      const url = String(result.reviewUrl || "");
      setReviewUrl(url);
      if (url) await navigator.clipboard.writeText(url).catch(() => undefined);
      setMessage("Saved. This review link shows the current still frame.");
    }
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not save. Try again."); }
    finally { setSaving(false); }
  };
  const total = motionDuration(doc);
  const selectedIndex = doc.scenes.findIndex((scene) => scene.id === selected?.id);
  const availableImages = useMemo(() => Object.values(images), [images]);
  if (!record) return <section className="empty-state"><Film /><h2>No verified records</h2><p>Verify content before building motion scenes.</p></section>;

  return <div className="motion-page">
    <header className="motion-page-head"><div>{onBack && <button className="editor-back" onClick={onBack}><ArrowLeft size={15} />Back</button>}<p className="eyebrow">MOTION STUDIO</p><h1>Build a multi-scene story</h1><p>Customize a standalone animation. Save your draft before leaving.</p></div>
      <label>Class or event<select value={record.id} disabled={saving || uploading} onChange={(event) => {
        if (dirty && !window.confirm("You have unsaved changes. Switch without saving?")) return;
        const nextRecord = records.find((item) => item.id === event.target.value);
        if (!nextRecord) return;
        const nextAsset = data.assets.find((item) => item.id === nextRecord.assetId && item.active && item.rightsStatus === "approved");
        const saved = data.creativeProjects.find((item) => item.kind === "motion" && item.recordId === nextRecord.id);
        const restored = saved?.payload.doc as MotionDocument | undefined;
        const next = restored?.scenes?.length ? restored : defaultDocument(nextRecord, nextAsset ? `library-${nextAsset.id}` : null, data.scheduleRules);
        setRecordId(nextRecord.id);
        setProjectId(saved?.id || "");
        setDoc(next);
        setSavedDoc(JSON.stringify(next)); setReviewUrl(""); setMessage("");
        setSelectedId(next.scenes[0].id);
        playheadRef.current = 0;
      }} data-testid="select-motion-record">{records.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
      <div className="motion-export">
        <button className="button primary compact" disabled={saving || uploading} onClick={() => saveProject(false)}>{saving ? "Saving…" : "Save draft"}</button><button className="button secondary compact" disabled={saving || uploading} onClick={() => saveProject(true)} data-testid="button-motion-review"><ShieldCheck size={15} />Review still frame</button>
        <button className="button secondary compact" disabled={Boolean(exporting)} onClick={() => runExport("png")}><Download size={15} />PNG</button>
        <button className="button secondary compact" disabled={Boolean(exporting)} onClick={() => runExport("webm")}><Download size={15} />WebM</button>
        <button className="button dark compact" disabled={!mp4Supported || Boolean(exporting)} title={mp4Supported ? "Export H.264 MP4" : "Requires WebCodecs in current Chrome or Edge"} onClick={() => runExport("mp4")}><Download size={15} />MP4</button>
      </div>
    </header>
    {dirty && <p className="promotion-save-notice" role="status">Unsaved changes</p>}
    {(exporting || message) && <div className="motion-status" role="status">{exporting ? `Rendering ${exporting.toUpperCase()} · ${Math.round(progress * 100)}%` : message}{reviewUrl && <div className="motion-review-url"><input readOnly value={reviewUrl} aria-label="Motion Studio review URL" /><button onClick={() => navigator.clipboard.writeText(reviewUrl)}>Copy review link</button></div>}<span style={{ width: `${progress * 100}%` }} /></div>}
    <section className="motion-editor">
      <aside className="motion-scenes">
        <div className="pane-title"><span>SCENES</span><small>{(total / 1000).toFixed(1)} sec</small></div>
        <div className="scene-stack">{doc.scenes.map((scene, index) => <button key={scene.id} className={`scene-card ${scene.id === selected?.id ? "active" : ""}`} onClick={() => seekScene(scene)} data-testid={`motion-scene-${index}`}>
          <span>{String(index + 1).padStart(2, "0")}</span><div><small>{scene.template}</small><strong>{scene.title || "Untitled scene"}</strong><em>{(scene.duration / 1000).toFixed(1)}s · {scene.animation}</em></div>
        </button>)}</div>
        <div className="scene-actions"><button aria-label="Move scene up" disabled={selectedIndex <= 0} onClick={() => moveScene(-1)}><ChevronUp /></button><button aria-label="Move scene down" disabled={selectedIndex >= doc.scenes.length - 1} onClick={() => moveScene(1)}><ChevronDown /></button><button aria-label="Duplicate scene" onClick={duplicate}><Copy /></button><button aria-label="Delete scene" disabled={doc.scenes.length <= 1} onClick={remove}><Trash2 /></button></div>
        <p className="pane-label">ADD TEMPLATE</p><div className="template-grid">{TEMPLATES.map((template) => <button key={template.id} onClick={() => addScene(template.id)}><Plus size={13} />{template.label}</button>)}</div>
      </aside>
      <div className="motion-center">
        <div className="motion-stage-wrap"><canvas ref={canvasRef} className={`motion-stage aspect-${doc.aspect.replace(":", "-")}`} aria-label="Motion Studio stage" /></div>
        <div className="motion-transport">
          <button className="button primary compact" onClick={() => setPlaying((value) => !value)} data-testid="button-motion-play">{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause" : "Play"}</button>
          <button className="button secondary compact" onClick={() => { playheadRef.current = 0; setPlaying(true); }}><RotateCcw size={15} />Restart</button>
          <span>{(time / 1000).toFixed(1)} / {(total / 1000).toFixed(1)} sec</span>
        </div>
        <div className="motion-timeline-v2" onPointerDown={scrub}>{doc.scenes.map((scene) => <div key={scene.id} className={scene.id === selected?.id ? "active" : ""} style={{ width: `${scene.duration / total * 100}%` }}><span>{scene.title}</span></div>)}<i style={{ left: `${time / total * 100}%` }} /></div>
      </div>
      {selected && <aside className="motion-inspector">
        <div className="pane-title"><span>INSPECTOR</span><small>Scene {selectedIndex + 1}</small></div>
        <label>Template<select value={selected.template} onChange={(event) => patchScene({ template: event.target.value as MotionTemplate })}>{TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Kicker<input value={selected.kicker} onChange={(event) => patchScene({ kicker: event.target.value })} /></label>
        <label>Headline<textarea rows={3} value={selected.title} onChange={(event) => patchScene({ title: event.target.value })} /></label>
        <label>Supporting line<input value={selected.subtitle} onChange={(event) => patchScene({ subtitle: event.target.value })} /></label>
        <label>Animation<select value={selected.animation} onChange={(event) => patchScene({ animation: event.target.value as MotionAnimation })}>{ANIMATIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Transition<select value={selected.transition} onChange={(event) => patchScene({ transition: event.target.value as MotionTransition })}>{TRANSITIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Duration <span>{(selected.duration / 1000).toFixed(1)}s</span><input type="range" min="1500" max="8000" step="250" value={selected.duration} onChange={(event) => patchScene({ duration: Number(event.target.value) })} /></label>
        <label>Image<select value={selected.imageId || ""} onChange={(event) => patchScene({ imageId: event.target.value || null })}><option value="">No image</option>{availableImages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="button secondary full" disabled={uploading || saving} onClick={() => fileRef.current?.click()}><ImagePlus size={16} />{uploading ? "Uploading…" : "Upload image"}</button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
        <div className="aspect-control"><span>DOCUMENT ASPECT</span><div>{(Object.keys(MOTION_ASPECTS) as MotionAspect[]).map((aspect) => <button key={aspect} className={doc.aspect === aspect ? "active" : ""} onClick={() => setDoc((current) => ({ ...current, aspect }))} data-testid={`motion-aspect-${aspect}`}>{aspect}</button>)}</div><small>{MOTION_ASPECTS[doc.aspect].width} × {MOTION_ASPECTS[doc.aspect].height} · {doc.fps} fps</small></div>
      </aside>}
    </section>
  </div>;
}
