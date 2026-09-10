"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, FolderOpen, ImagePlus, LogOut, Pause, Play, Plus, Redo2, Trash2, Undo2, X } from "lucide-react";
import type { ContentRecord, StudioData } from "@/lib/client-types";
import { uploadAsset } from "@/lib/assets-client";
import { calendarDays, clubDate } from "@/lib/promotion";
import { canvasSignature, newCanvasDocument, stillDocument } from "@/lib/canvas-document";
import { loadCanvasBrand, SUN_OAKS_LOGO } from "@/lib/photo-composition";
import { MOTION_ASPECTS, makeMotionScene, motionDuration, motionSceneAt, renderMotionFrame, exportMotionPng, exportMotionMp4, exportMotionWebm, downloadMotionBlob, type MotionDocument, type MotionScene, type MotionImage, type MotionAspect } from "@/lib/motion-engine";

// The calendar and saved work are panels, so the editor stays mounted beneath them.
type Project = StudioData["creativeProjects"][number];
type Editor = { doc: MotionDocument; title: string; mode: "graphic" | "video"; plannedDate: string; recordId: string | null };
type Props = { data: StudioData; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>; initialProjectId?: string; initialRecordId?: string; onDirtyChange: (dirty: boolean) => void; onProject: (id: string) => void; onLegacy: () => void; onImport: () => void; onLogout: () => void };
const signature = (editor: Editor) => canvasSignature(editor.doc, editor.title, editor.mode, editor.plannedDate);
const settleTime = (doc: MotionDocument, id: string) => { const index = Math.max(0, doc.scenes.findIndex((scene) => scene.id === id)); return doc.scenes.slice(0, index).reduce((sum, scene) => sum + scene.duration, 0) + doc.scenes[index].duration * .7; };
const restoredEditor = (project: Project): Editor => ({ doc: project.payload.doc as MotionDocument, title: project.title, mode: project.payload.mode === "graphic" ? "graphic" : "video", plannedDate: typeof project.payload.plannedDate === "string" ? project.payload.plannedDate : "", recordId: project.recordId });

function SceneThumbnail({ doc, scene, images }: { doc: MotionDocument; scene: MotionScene; images: Record<string, MotionImage> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const size = MOTION_ASPECTS[doc.aspect];
    const full = document.createElement("canvas"); full.width = size.width; full.height = size.height;
    const ctx = full.getContext("2d"); if (!ctx) return;
    renderMotionFrame(ctx, { ...doc, scenes: [scene] }, scene.duration * .7, images);
    canvas.width = 160; canvas.height = Math.round(160 * size.height / size.width);
    canvas.getContext("2d")?.drawImage(full, 0, 0, canvas.width, canvas.height);
  }, [doc.aspect, doc.designVersion, scene, images]);
  return <canvas ref={ref} aria-label={`${scene.title || "Untitled"} thumbnail`} />;
}

export default function CanvasStudio({ data, mutate, initialProjectId, initialRecordId, onDirtyChange, onProject, onLegacy, onImport, onLogout }: Props) {
  const approved = data.assets.filter((asset) => asset.active && asset.rightsStatus === "approved");
  const initial = initialProjectId ? data.creativeProjects.find((p) => p.id === initialProjectId && p.kind === "motion") : initialRecordId ? data.creativeProjects.find((p) => p.recordId === initialRecordId && p.kind === "motion") : [...data.creativeProjects].filter((p) => p.kind === "motion" && (p.payload.doc as MotionDocument | undefined)?.designVersion === 2).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const source = data.records.find((record) => record.id === initialRecordId);
  const photoId = source?.assetId || approved[0]?.id;
  const [editor, setEditor] = useState<Editor>(() => initial?.payload.doc ? restoredEditor(initial) : { doc: newCanvasDocument(source, photoId ? `library-${photoId}` : null, data.scheduleRules), title: source?.name || "A little Sun Oaks", mode: "video", plannedDate: "", recordId: source?.id || null });
  const editorRef = useRef(editor); editorRef.current = editor;
  const [selectedId, setSelectedId] = useState(editor.doc.scenes[0].id);
  const selected = editor.doc.scenes.find((scene) => scene.id === selectedId) || editor.doc.scenes[0];
  const projectId = useRef(initial?.id || "");
  const version = useRef(initial?.version);
  const savedRef = useRef(initial ? signature(editor) : "");
  const [savedSignature, setSavedSignature] = useState(savedRef.current);
  const [saving, setSaving] = useState(false);
  const savingPromise = useRef<Promise<string> | null>(null);
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [panel, setPanel] = useState<"saved" | "calendar" | "content" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [images, setImages] = useState<Record<string, MotionImage>>({});
  const imagesRef = useRef(images); imagesRef.current = images;
  const [assetsReady, setAssetsReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(playing); playingRef.current = playing;
  const timeRef = useRef(settleTime(editor.doc, selectedId));
  const [time, setTime] = useState(timeRef.current);
  const [exporting, setExporting] = useState<"png" | "mp4" | "webm" | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);
  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
  const history = useRef<{ past: Editor[]; future: Editor[]; last: number }>({ past: [], future: [], last: 0 });
  const [, setHistoryTick] = useState(0);
  const today = clubDate();
  const [month, setMonth] = useState(() => new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1));
  const [day, setDay] = useState(today);
  const dirty = signature(editor) !== savedSignature;
  const busy = uploading || Boolean(exporting);
  useEffect(() => { onDirtyChange(dirty || saving || busy); return () => onDirtyChange(false); }, [dirty, saving, busy, onDirtyChange]);
  useEffect(() => { if (panel) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [panel]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!motion.matches && editorRef.current.mode === "video");
    if (!motion.matches) timeRef.current = 0;
    return () => exportAbort.current?.abort();
  }, []);
  useEffect(() => {
    let live = true;
    const size = MOTION_ASPECTS[editor.doc.aspect];
    void (async () => {
      if (!("VideoEncoder" in window) || !("VideoFrame" in window)) return false;
      for (const codec of ["avc1.64002a", "avc1.4d402a", "avc1.42002a", "avc1.640028", "avc1.4d0028"]) {
        try { if ((await window.VideoEncoder.isConfigSupported({ codec, width: size.width, height: size.height, framerate: 30, bitrate: Math.round(size.width * size.height * 30 * .14) })).supported) return true; } catch {}
      }
      return false;
    })().then((supported) => { if (live) setMp4Supported(supported); });
    return () => { live = false; };
  }, [editor.doc.aspect]);
  useEffect(() => {
    let live = true;
    void (async () => {
      await document.fonts.ready;
      const brand = await loadCanvasBrand();
      const entries = await Promise.all(approved.map(async (asset) => {
        try { const image = new Image(); image.src = asset.fileReference; await image.decode(); return [`library-${asset.id}`, { id: `library-${asset.id}`, name: asset.title, image }] as const; }
        catch { return null; }
      }));
      if (live) { setImages((current) => ({ ...current, ...brand, ...Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)) })); setAssetsReady(true); }
    })().catch(() => { if (live) setSaveError("The logo or fonts could not load. Reload to try again."); });
    return () => { live = false; };
  }, [data.assets]);
  useEffect(() => {
    let frame = 0, previous = performance.now(), lastUi = 0, lastTime = -1;
    let lastDoc: MotionDocument | null = null, lastImages: Record<string, MotionImage> | null = null, lastMode = "";
    const tick = (now: number) => {
      const current = editorRef.current;
      if (playingRef.current && current.mode === "video") timeRef.current = (timeRef.current + Math.min(now - previous, 100)) % motionDuration(current.doc);
      previous = now;
      const canvas = canvasRef.current;
      if (canvas && (current.doc !== lastDoc || imagesRef.current !== lastImages || timeRef.current !== lastTime || current.mode !== lastMode)) {
        const size = MOTION_ASPECTS[current.doc.aspect];
        if (canvas.width !== size.width || canvas.height !== size.height) { canvas.width = size.width; canvas.height = size.height; }
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          const doc = current.mode === "graphic" ? stillDocument(current.doc, motionSceneAt(current.doc, timeRef.current).scene.id) : current.doc;
          renderMotionFrame(ctx, doc, current.mode === "graphic" ? 2500 : timeRef.current, imagesRef.current);
        }
        lastDoc = current.doc; lastImages = imagesRef.current; lastMode = current.mode;
      }
      if (now - lastUi > 100 && timeRef.current !== lastTime) { setTime(timeRef.current); lastUi = now; }
      lastTime = timeRef.current;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const edit = (next: Editor | ((current: Editor) => Editor), coalesce = true) => {
    const current = editorRef.current;
    const updated = typeof next === "function" ? next(current) : next;
    const now = Date.now();
    if (!coalesce || now - history.current.last > 600) { history.current.past.push(current); if (history.current.past.length > 60) history.current.past.shift(); }
    history.current.last = now; history.current.future = [];
    editorRef.current = updated; setEditor(updated); setSaveError(""); setHistoryTick((v) => v + 1);
  };
  const patchScene = (patch: Partial<MotionScene>) => {
    setPlaying(false);
    edit((current) => ({ ...current, doc: { ...current.doc, scenes: current.doc.scenes.map((scene) => scene.id === selected.id ? { ...scene, ...patch } : scene) } }));
    timeRef.current = settleTime(editorRef.current.doc, selected.id);
  };
  const seek = (id: string) => { setSelectedId(id); setPlaying(false); timeRef.current = settleTime(editorRef.current.doc, id); setTime(timeRef.current); };
  const ensureAssets = (doc: MotionDocument) => {
    if (!assetsReady) throw new Error("Your photos and logo are still loading. Try again in a moment.");
    if (doc.scenes.some((scene) => scene.imageId && !imagesRef.current[scene.imageId])) throw new Error("A photo could not load. Choose another photo before saving or exporting.");
  };
  const saveNow = async (): Promise<string> => {
    if (savingPromise.current) return savingPromise.current;
    const snapshot = editorRef.current;
    const key = signature(snapshot);
    if (savedRef.current === key && projectId.current) return projectId.current;
    const task = Promise.resolve().then(async () => {
      setSaving(true); setSaveError("");
      try {
        ensureAssets(snapshot.doc); await document.fonts.ready;
        const canvas = document.createElement("canvas"); const size = MOTION_ASPECTS[snapshot.doc.aspect]; canvas.width = size.width; canvas.height = size.height;
        const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Preview is unavailable.");
        renderMotionFrame(ctx, stillDocument(snapshot.doc, selected.id), 2500, imagesRef.current);
        const result = await mutate({ action: "saveCreativeProject", projectId: projectId.current || undefined, expectedVersion: version.current, kind: "motion", recordId: snapshot.recordId, title: snapshot.title.trim() || "Untitled design", payload: { doc: snapshot.doc, mode: snapshot.mode, plannedDate: snapshot.plannedDate || null, editor: "canvas-v2", artworks: [{ key: "canvas-preview", kind: "motion", format: snapshot.doc.aspect, width: size.width, height: size.height, dataUrl: canvas.toDataURL("image/jpeg", .8) }] } });
        projectId.current = String(result.creativeProjectId); version.current = Number(result.version);
        savedRef.current = key; setSavedSignature(key); onProject(projectId.current);
        return projectId.current;
      } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save. Your changes are still here."); throw error; }
      finally { setSaving(false); savingPromise.current = null; }
    });
    savingPromise.current = task;
    return task;
  };
  const saveRef = useRef(saveNow); saveRef.current = saveNow;
  useEffect(() => {
    if (!dirty || saving || busy || !assetsReady || saveError) return;
    const timer = window.setTimeout(() => { void saveRef.current().catch(() => undefined); }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, signature(editor), saving, busy, assetsReady, saveError]);
  const flush = async () => { await saveNow(); if (savedRef.current !== signature(editorRef.current)) await saveNow(); };
  const switchTo = async (next: Editor, project?: Project) => {
    try { await flush(); } catch { return; }
    setPlaying(false); projectId.current = project?.id || ""; version.current = project?.version;
    savedRef.current = project ? signature(next) : ""; setSavedSignature(savedRef.current);
    editorRef.current = next; setEditor(next); setSelectedId(next.doc.scenes[0].id); timeRef.current = settleTime(next.doc, next.doc.scenes[0].id);
    history.current = { past: [], future: [], last: 0 }; setHistoryTick((v) => v + 1); setPanel(null); setSaveError(""); setMessage(""); onProject(project?.id || "");
  };
  const useRecord = (record: ContentRecord) => switchTo({ doc: newCanvasDocument(record, record.assetId ? `library-${record.assetId}` : photoId ? `library-${photoId}` : null, data.scheduleRules), title: record.name, mode: editor.mode, plannedDate: "", recordId: record.id });
  const addScene = (endcard = false) => {
    const record = data.records.find((item) => item.id === editor.recordId);
    const scene = makeMotionScene(endcard ? "endcard" : "image", { title: endcard ? record?.cta || "See you at Sun Oaks." : "Make it your time.", subtitle: endcard ? "" : "", kicker: "", imageId: endcard ? null : selected.imageId, animation: "stagger", position: "bottom-left", zoom: true, duration: endcard ? 3500 : 5000 });
    edit((current) => ({ ...current, doc: { ...current.doc, scenes: [...current.doc.scenes, scene] } }), false); seek(scene.id);
  };
  const undoRedo = (redo: boolean) => {
    const from = redo ? history.current.future : history.current.past, to = redo ? history.current.past : history.current.future;
    const next = from.pop(); if (!next) return;
    to.push(editorRef.current); editorRef.current = next; setEditor(next); setSelectedId(next.doc.scenes[0].id); timeRef.current = settleTime(next.doc, next.doc.scenes[0].id); setPlaying(false); setSaveError(""); setHistoryTick((v) => v + 1);
  };
  const runExport = async (kind: "png" | "mp4" | "webm") => {
    if (busy) return;
    setExporting(kind); setPlaying(false); setProgress(0); setMessage("");
    const controller = new AbortController(); exportAbort.current = controller;
    try {
      ensureAssets(editor.doc); await document.fonts.ready; await flush();
      const blob = kind === "png" ? await exportMotionPng(stillDocument(editor.doc, selected.id), 2500, imagesRef.current) : kind === "mp4" ? await exportMotionMp4(editor.doc, imagesRef.current, setProgress, controller.signal) : await exportMotionWebm(editor.doc, imagesRef.current, setProgress, controller.signal);
      if (controller.signal.aborted) return;
      downloadMotionBlob(blob, `sun-oaks-${editor.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${editor.doc.aspect.replace(":", "x")}.${kind}`);
      setMessage(`${kind.toUpperCase()} download started.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not export. Try again."); }
    finally { setExporting(null); exportAbort.current = null; }
  };
  const upload = async (file: File) => {
    setUploading(true); setMessage("");
    try {
      const asset = await uploadAsset(file); const image = new Image(); image.src = asset.fileReference; await image.decode();
      const id = `library-${asset.id}`; const next = { ...imagesRef.current, [id]: { id, name: asset.title, image } }; imagesRef.current = next; setImages(next);
      patchScene({ imageId: id, template: "image" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not upload the photo."); }
    finally { setUploading(false); }
  };
  const total = motionDuration(editor.doc), selectedIndex = editor.doc.scenes.findIndex((scene) => scene.id === selected.id);
  const projects = [...data.creativeProjects].filter((p) => p.kind === "motion" && p.payload.doc).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const dayProjects = projects.filter((project) => project.payload.plannedDate === day);
  const dayItems = data.calendarItems.filter((item) => item.marketingDate === day);
  const photos = Object.values(images).filter((image) => image.id.startsWith("library-"));

  return <div className="canvas-studio">
    <header className="cs-header"><img src={SUN_OAKS_LOGO} alt="Sun Oaks" /><span className="cs-wordmark">Studio</span><nav aria-label="Studio navigation"><button className={!panel ? "active" : ""} onClick={() => setPanel(null)}>Create</button><button className={panel === "saved" ? "active" : ""} disabled={busy} onClick={() => setPanel("saved")}><FolderOpen size={16} />Saved</button><button className={panel === "calendar" ? "active" : ""} disabled={busy} onClick={() => setPanel("calendar")}><CalendarDays size={16} />Calendar</button></nav><button className="cs-icon cs-signout" aria-label="Sign out" onClick={async () => { try { await flush(); onLogout(); } catch {} }}><LogOut size={17} /></button></header>
    <div className="cs-toolbar"><button className="cs-icon cs-new" aria-label="New design" title="New design" disabled={busy} onClick={() => switchTo({ doc: newCanvasDocument(undefined, photoId ? `library-${photoId}` : null), title: "Untitled design", mode: editor.mode, plannedDate: "", recordId: null })}><Plus size={19} /></button><div className="cs-project-name"><input aria-label="Design name" maxLength={160} value={editor.title} disabled={busy} onChange={(event) => edit({ ...editor, title: event.target.value })} /><span role="status">{saveError ? "Couldn’t save" : saving ? "Saving…" : dirty ? "Unsaved changes" : <><Check size={12} />Saved</>}</span></div><div className="cs-segment" aria-label="Design type">{(["graphic", "video"] as const).map((mode) => <button key={mode} aria-pressed={editor.mode === mode} disabled={busy} className={editor.mode === mode ? "active" : ""} onClick={() => { edit({ ...editor, mode }, false); setPlaying(false); timeRef.current = settleTime(editor.doc, selected.id); }}>{mode === "graphic" ? "Graphic" : "Video"}</button>)}</div><select className="cs-format" aria-label="Canvas size" value={editor.doc.aspect} disabled={busy} onChange={(event) => edit({ ...editor, doc: { ...editor.doc, aspect: event.target.value as MotionAspect } }, false)}><option value="4:5">Portrait · 4:5</option><option value="9:16">Story · 9:16</option><option value="1:1">Square · 1:1</option><option value="16:9">Landscape · 16:9</option></select><button className="cs-primary" disabled={busy || !assetsReady || (editor.mode === "video" && mp4Supported !== true)} onClick={() => runExport(editor.mode === "graphic" ? "png" : "mp4")}><Download size={16} />{exporting ? `Exporting ${Math.round(progress * 100)}%` : editor.mode === "graphic" ? "Export PNG" : "Export MP4"}</button></div>
    {(saveError || message || exporting || (editor.mode === "video" && mp4Supported === false)) && <div className="cs-notice" role="status">{saveError || (exporting ? `Rendering ${Math.round(progress * 100)}%` : message) || "This browser can’t encode MP4. Use Chrome or Edge, or download WebM."}{saveError && <button onClick={() => { void saveNow().catch(() => undefined); }}>Retry save</button>}{exporting && <button onClick={() => exportAbort.current?.abort()}>Cancel export</button>}{!exporting && editor.mode === "video" && mp4Supported === false && <button onClick={() => runExport("webm")}>Export WebM</button>}</div>}
    <div className={`cs-workspace ${editor.mode === "graphic" ? "cs-graphic-mode" : ""}`}>
      <aside className="cs-scenes"><div className="cs-panel-title">{editor.mode === "video" ? "Scenes" : "Artboards"}<span>{editor.doc.scenes.length}</span></div>{editor.doc.scenes.map((scene, index) => <button key={scene.id} className={`cs-scene ${scene.id === selected.id ? "active" : ""}`} disabled={busy} onClick={() => seek(scene.id)}><SceneThumbnail doc={editor.doc} scene={scene} images={images} /><span><b>{String(index + 1).padStart(2, "0")}</b>{scene.title || "Untitled"}{editor.mode === "video" && <small>{scene.duration / 1000}s</small>}</span></button>)}<button className="cs-add" disabled={busy || editor.doc.scenes.length >= 30} onClick={() => addScene()}><Plus size={15} />{editor.mode === "video" ? "Add scene" : "Add artboard"}</button>{editor.mode === "video" && <button className="cs-add" disabled={busy || editor.doc.scenes.length >= 30} onClick={() => addScene(true)}>+ Logo ending</button>}</aside>
      <main className="cs-center"><div className="cs-stage" onDoubleClick={() => document.getElementById("cs-headline")?.focus()}><canvas ref={canvasRef} style={{ aspectRatio: `${MOTION_ASPECTS[editor.doc.aspect].width} / ${MOTION_ASPECTS[editor.doc.aspect].height}` }} aria-label="Sun Oaks live canvas" /></div><div className="cs-transport">{editor.mode === "video" && <><button className="cs-play" aria-label={playing ? "Pause preview" : "Play preview"} onClick={() => { if (!playing) timeRef.current = 0; setPlaying(!playing); }}>{playing ? <Pause size={17} /> : <Play size={17} />}</button><span>{(time / 1000).toFixed(1)} / {(total / 1000).toFixed(1)}s</span></>}<button className="cs-icon" disabled={busy || !history.current.past.length} onClick={() => undoRedo(false)} aria-label="Undo"><Undo2 size={17} /></button><button className="cs-icon" disabled={busy || !history.current.future.length} onClick={() => undoRedo(true)} aria-label="Redo"><Redo2 size={17} /></button><span className="cs-stage-hint">{editor.mode === "graphic" ? "PNG exports the selected artboard" : "Double-click the canvas to edit the headline"}</span></div>{editor.mode === "video" && <div className="cs-timeline"><div className="cs-timeline-labels">{editor.doc.scenes.map((scene) => <button key={scene.id} style={{ flex: scene.duration }} onClick={() => seek(scene.id)}>{scene.title || "Scene"}</button>)}</div><input aria-label="Video playhead" type="range" min={0} max={Math.max(1, total - 1)} value={time} onChange={(event) => { const value = Number(event.target.value); timeRef.current = value; setTime(value); setPlaying(false); setSelectedId(motionSceneAt(editor.doc, value).scene.id); }} /></div>}</main>
      <aside className="cs-inspector"><fieldset disabled={busy}><div className="cs-inspector-head"><strong>Your message</strong><button type="button" className="cs-link" onClick={() => setPanel("content")}>Use class / event</button></div><label>Headline<textarea id="cs-headline" rows={3} maxLength={240} value={selected.title} onChange={(event) => patchScene({ title: event.target.value })} /></label><label>Small line<textarea rows={2} maxLength={400} value={selected.subtitle} onChange={(event) => patchScene({ subtitle: event.target.value })} /></label><div className="cs-panel-title">Background<button className="cs-link" onClick={() => fileRef.current?.click()}><ImagePlus size={14} />{uploading ? "Uploading…" : "Upload"}</button></div><div className="cs-photos">{photos.map((photo) => <button key={photo.id} className={selected.imageId === photo.id ? "active" : ""} title={photo.name} aria-label={`Use photo: ${photo.name}`} onClick={() => patchScene({ imageId: photo.id, template: "image" })}><img src={photo.image.src} alt={photo.name} /></button>)}</div><input hidden ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { if (event.target.files?.[0]) void upload(event.target.files[0]); event.target.value = ""; }} /><div className="cs-segment cs-composition">{[{ id: "image", label: "Photo" }, { id: "title", label: "Type" }, { id: "endcard", label: "Logo" }].map((choice) => <button key={choice.id} className={selected.template === choice.id ? "active" : ""} onClick={() => { if (editor.doc.designVersion !== 2) edit({ ...editor, doc: { ...editor.doc, designVersion: 2 } }, false); patchScene({ template: choice.id as MotionScene["template"], imageId: choice.id === "image" ? selected.imageId || photos[0]?.id || null : null }); }}>{choice.label}</button>)}</div><div className="cs-panel-title">Text position</div><div className="cs-positions">{[{ id: "top-left", label: "Upper left" }, { id: "center-left", label: "Middle left" }, { id: "center", label: "Center" }, { id: "bottom-left", label: "Lower left" }, { id: "bottom-center", label: "Lower center" }, { id: "bottom-right", label: "Lower right" }].map((position) => <button key={position.id} aria-pressed={(selected.position || "bottom-left") === position.id} className={(selected.position || "bottom-left") === position.id ? "active" : ""} onClick={() => patchScene({ position: position.id as MotionScene["position"] })}>{position.label}</button>)}</div>{editor.mode === "video" && <><div className="cs-panel-title">Motion</div><div className="cs-segment">{[{ id: "stagger", label: "Reveal" }, { id: "rise", label: "Rise" }, { id: "fade", label: "Fade" }].map((motion) => <button key={motion.id} className={selected.animation === motion.id ? "active" : ""} onClick={() => { patchScene({ animation: motion.id as MotionScene["animation"] }); timeRef.current = editor.doc.scenes.slice(0, selectedIndex).reduce((sum, scene) => sum + scene.duration, 0); setPlaying(true); }}>{motion.label}</button>)}</div><label className="cs-range">Scene length <span>{selected.duration / 1000}s</span><input type="range" min={1500} max={12000} step={500} value={selected.duration} onChange={(event) => patchScene({ duration: Number(event.target.value) })} /></label></>}
      <details><summary>Fine-tune</summary><label>Small label<input maxLength={160} value={selected.kicker} onChange={(event) => patchScene({ kicker: event.target.value })} /></label>{selected.imageId && <><label className="cs-range">Photo shading<input type="range" min={0} max={1} step={.05} value={selected.shade ?? .5} onChange={(event) => patchScene({ shade: Number(event.target.value) })} /></label><label className="cs-range">Crop left / right<input type="range" min={0} max={1} step={.02} value={selected.focalX ?? .5} onChange={(event) => patchScene({ focalX: Number(event.target.value) })} /></label><label className="cs-range">Crop up / down<input type="range" min={0} max={1} step={.02} value={selected.focalY ?? .5} onChange={(event) => patchScene({ focalY: Number(event.target.value) })} /></label>{editor.mode === "video" && <label className="cs-check"><input type="checkbox" checked={selected.zoom !== false} onChange={(event) => patchScene({ zoom: event.target.checked })} />Slow photo movement</label>}</>}{editor.mode === "video" && <label>Between scenes<select value={selected.transition} onChange={(event) => patchScene({ transition: event.target.value as MotionScene["transition"] })}><option value="fade">Crossfade</option><option value="slide">Reveal</option><option value="cut">Cut</option></select></label>}<label>Template<select value={selected.template} onChange={(event) => patchScene({ template: event.target.value as MotionScene["template"] })}>{["image", "title", "statement", "stat", "list", "quote", "details", "calendar", "presenter", "disclaimer", "endcard"].map((template) => <option key={template}>{template}</option>)}</select></label></details>
      <div className="cs-scene-tools"><button aria-label="Move scene earlier" disabled={selectedIndex === 0} onClick={() => { const scenes = [...editor.doc.scenes]; [scenes[selectedIndex - 1], scenes[selectedIndex]] = [scenes[selectedIndex], scenes[selectedIndex - 1]]; edit({ ...editor, doc: { ...editor.doc, scenes } }, false); seek(selected.id); }}><ArrowLeft size={16} /></button><button aria-label="Move scene later" disabled={selectedIndex === editor.doc.scenes.length - 1} onClick={() => { const scenes = [...editor.doc.scenes]; [scenes[selectedIndex + 1], scenes[selectedIndex]] = [scenes[selectedIndex], scenes[selectedIndex + 1]]; edit({ ...editor, doc: { ...editor.doc, scenes } }, false); seek(selected.id); }}><ArrowRight size={16} /></button><button aria-label="Duplicate scene" disabled={editor.doc.scenes.length >= 30} onClick={() => { const duplicate = makeMotionScene(selected.template, { ...selected, id: crypto.randomUUID() }); const scenes = [...editor.doc.scenes]; scenes.splice(selectedIndex + 1, 0, duplicate); edit({ ...editor, doc: { ...editor.doc, scenes } }, false); seek(duplicate.id); }}><Copy size={16} /></button><button aria-label="Delete scene" disabled={editor.doc.scenes.length === 1} onClick={() => { const scenes = editor.doc.scenes.filter((scene) => scene.id !== selected.id); edit({ ...editor, doc: { ...editor.doc, scenes } }, false); seek(scenes[Math.max(0, selectedIndex - 1)].id); }}><Trash2 size={16} /></button></div>
      <details><summary>More export options</summary><button className="cs-add" onClick={() => runExport("png")}>PNG of this artboard</button><button className="cs-add" onClick={() => runExport("webm")}>WebM video</button><button className="cs-add" onClick={async () => { try { await flush(); const result = await mutate({ action: "createProjectReviewLink", creativeProjectId: projectId.current, selectedArtworkKeys: ["canvas-preview"], expiresInHours: 72 }); const url = String(result.reviewUrl || ""); await navigator.clipboard.writeText(url); setMessage("Still-preview review link copied. It does not play the full video."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not share."); } }}>Share still preview</button></details>
      </fieldset></aside>
    </div>
    <dialog className="cs-drawer" ref={dialogRef} onCancel={() => setPanel(null)} onClick={(event) => { if (event.target === dialogRef.current) setPanel(null); }}><div className="cs-drawer-content"><header><h2>{panel === "saved" ? "Saved designs" : panel === "calendar" ? "Your calendar" : "Classes & events"}</h2><button className="cs-icon" aria-label="Close panel" onClick={() => setPanel(null)}><X size={20} /></button></header>
      {panel === "saved" && <><button className="cs-primary" onClick={() => switchTo({ doc: newCanvasDocument(undefined, photoId ? `library-${photoId}` : null), title: "Untitled design", mode: "video", plannedDate: "", recordId: null })}><Plus size={16} />New design</button><div className="cs-saved-grid">{projects.map((project) => { const preview = (project.payload.artworks as { dataUrl?: string }[] | undefined)?.[0]?.dataUrl; return <button key={project.id} onClick={() => switchTo(restoredEditor(project), project)}>{preview && <img src={preview} alt="" />}<strong>{project.title}</strong><small>{project.payload.mode === "graphic" ? "Graphic" : "Video"}{project.payload.plannedDate ? ` · ${project.payload.plannedDate}` : ""}</small></button>; })}</div><button className="cs-link" onClick={async () => { try { await flush(); onLegacy(); } catch {} }}>Previous campaigns & other formats</button></>}
      {panel === "content" && <><div className="cs-content-list">{data.records.filter((record) => record.active && record.verificationStatus === "verified").map((record) => <button key={record.id} onClick={() => useRecord(record)}><strong>{record.name}</strong><span>{record.recordType === "event" ? record.date : "Recurring class"} · {record.location}<ArrowRight size={16} /></span></button>)}</div><button className="cs-link" onClick={async () => { try { await flush(); onImport(); } catch {} }}>Add a class or event</button></>}
      {panel === "calendar" && <><label className="cs-plan-date">Plan this design<input type="date" aria-label="Planned date" value={editor.plannedDate} onChange={(event) => edit({ ...editor, plannedDate: event.target.value })} /><small>A reminder for your team; this does not publish to social media.</small></label><div className="cs-month"><button className="cs-icon" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><strong>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong><button className="cs-icon" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div><div className="cs-calendar">{["M", "T", "W", "T", "F", "S", "S"].map((label, index) => <span key={index}>{label}</span>)}{calendarDays(month.getFullYear(), month.getMonth() + 1).map((number, index) => { const date = `${monthPrefix}-${String(number).padStart(2, "0")}`; const count = projects.filter((p) => p.payload.plannedDate === date).length + data.calendarItems.filter((item) => item.marketingDate === date).length; return number ? <button className={day === date ? "active" : today === date ? "today" : ""} key={index} onClick={() => setDay(date)}>{number}{count > 0 && <small>{count}</small>}</button> : <i key={index} />; })}</div><h3>{new Date(day + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}</h3><div className="cs-content-list">{dayProjects.map((project) => <button key={project.id} onClick={() => switchTo(restoredEditor(project), project)}><strong>{project.title}</strong><span>Open design <ArrowRight size={16} /></span></button>)}{dayItems.map((item) => { const record = data.records.find((record) => record.id === item.contentRecordId); return record && <button key={item.id} onClick={() => useRecord(record)}><strong>{record.name}</strong><span>{item.status === "done" ? "Previous promotion completed" : "Make a design"}<ArrowRight size={16} /></span></button>; })}{!dayProjects.length && !dayItems.length && <p>No work planned for this day.</p>}</div></>}
    </div></dialog>
  </div>;
}
