"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Eye, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { recordSchedule } from "@/lib/promotion";
import type { Asset, ContentRecord, ScheduleRule, StudioData } from "@/lib/client-types";

const FORMATS = [
  { id: "square", label: "Social 1:1", width: 1080, height: 1080 },
  { id: "portrait", label: "Feed 4:5", width: 1080, height: 1350 },
  { id: "story", label: "Story 9:16", width: 1080, height: 1920 },
  { id: "email", label: "Email 2:1", width: 1200, height: 600 },
  { id: "lobby", label: "Lobby 16:9", width: 1920, height: 1080 },
] as const;

type Format = typeof FORMATS[number];
type Fields = { headline: string; summary: string; schedule: string; location: string; cta: string };

function fieldsFor(record?: ContentRecord, rules: ScheduleRule[] = []): Fields {
  return record ? {
    headline: record.name,
    summary: record.summary,
    schedule: recordSchedule(record, rules),
    location: record.location || "",
    cta: record.cta,
  } : { headline: "", summary: "", schedule: "", location: "", cta: "" };
}


function loadImage(asset?: Asset) {
  if (!asset) return Promise.resolve<HTMLImageElement | null>(null);
  const image = new Image();
  image.crossOrigin = "anonymous";
  return new Promise<HTMLImageElement | null>((resolve) => {
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = asset.fileReference;
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, minimum: number, family: string, weight = 600) {
  let size = start;
  while (size > minimum) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawPromo(canvas: HTMLCanvasElement, format: Format, fields: Fields, record: ContentRecord, image: HTMLImageElement | null, asset?: Asset) {
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = format;
  const horizontal = W / H >= 1.6;
  ctx.fillStyle = "#FAF9F7";
  ctx.fillRect(0, 0, W, H);
  const photo = horizontal ? { x: W * .55, y: 0, w: W * .45, h: H } : { x: 0, y: 0, w: W, h: H * .54 };
  if (image) {
    const scale = Math.max(photo.w / image.width, photo.h / image.height);
    const sw = photo.w / scale;
    const sh = photo.h / scale;
    const sx = Math.max(0, Math.min(image.width - sw, image.width * (asset?.focalPoint.x ?? .5) - sw / 2));
    const sy = Math.max(0, Math.min(image.height - sh, image.height * (asset?.focalPoint.y ?? .5) - sh / 2));
    ctx.drawImage(image, sx, sy, sw, sh, photo.x, photo.y, photo.w, photo.h);
  } else {
    ctx.fillStyle = "#0D0D0C";
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
    ctx.strokeStyle = "rgba(247,181,0,.3)";
    ctx.lineWidth = Math.max(2, W * .002);
    for (let r = W * .05; r < photo.w; r += W * .05) {
      ctx.beginPath();
      ctx.arc(photo.x + photo.w * .72, photo.y + photo.h * .28, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#F7B500";
  if (horizontal) ctx.fillRect(W * .535, 0, W * .015, H);
  else ctx.fillRect(0, H * .54, W, H * .014);
  const area = horizontal ? { x: W * .06, y: H * .12, w: W * .43, h: H * .76 } : { x: W * .075, y: H * .61, w: W * .85, h: H * .32 };
  ctx.fillStyle = "#0891A8";
  ctx.font = `700 ${Math.max(20, W * .019)}px Jost, sans-serif`;
  ctx.letterSpacing = `${W * .002}px`;
  ctx.fillText(record.recordType === "event" ? "SUN OAKS EVENT" : "CLASS SPOTLIGHT", area.x, area.y);
  ctx.letterSpacing = "0px";
  const titleSize = fitText(ctx, fields.headline, area.w, horizontal ? W * .052 : W * .068, W * .034, "Jost, sans-serif");
  ctx.fillStyle = "#0D0D0C";
  ctx.font = `600 ${titleSize}px Jost, sans-serif`;
  ctx.fillText(fields.headline, area.x, area.y + titleSize * 1.25, area.w);
  ctx.font = `italic 500 ${horizontal ? W * .021 : W * .032}px Newsreader, serif`;
  ctx.fillText(fields.summary, area.x, area.y + titleSize * 1.95, area.w);
  ctx.font = `500 ${horizontal ? W * .016 : W * .025}px Jost, sans-serif`;
  ctx.fillText(fields.schedule, area.x, area.y + titleSize * 2.65, area.w);
  ctx.fillText(fields.location, area.x, area.y + titleSize * 3.08, area.w);
  ctx.fillStyle = "#0D0D0C";
  ctx.fillRect(area.x, area.y + titleSize * 3.5, Math.min(area.w, ctx.measureText(fields.cta).width + W * .04), horizontal ? H * .075 : H * .047);
  ctx.fillStyle = "#FAF9F7";
  ctx.font = `600 ${horizontal ? W * .014 : W * .021}px Jost, sans-serif`;
  ctx.fillText(fields.cta, area.x + W * .018, area.y + titleSize * 3.5 + (horizontal ? H * .049 : H * .032));
  ctx.fillStyle = horizontal ? "#FAF9F7" : "#0D0D0C";
  ctx.textAlign = "right";
  ctx.font = `700 ${Math.max(18, W * .018)}px Jost, sans-serif`;
  ctx.fillText("SUN OAKS", W - W * .035, H - H * .045);
  ctx.textAlign = "left";
}

function PromoArtboard({ format, fields, record, asset, valid }: { format: Format; fields: Fields; record: ContentRecord; asset?: Asset; valid: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => { void loadImage(asset).then(setImage); }, [asset]);
  useEffect(() => { if (canvasRef.current) drawPromo(canvasRef.current, format, fields, record, image, asset); }, [asset, fields, format, image, record]);
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !valid) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `sun-oaks-${record.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${format.id}-${format.width}x${format.height}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    }, "image/png");
  };
  return <article className="promo-artboard">
    <div className="promo-artboard-head"><span>{format.label}</span><small>{format.width} × {format.height}</small></div>
    <canvas ref={canvasRef} aria-label={`${format.label} promotional artboard`} />
    <button className="button secondary compact" onClick={download} disabled={!valid} data-testid={`button-promo-download-${format.id}`}><Download size={15} />Download PNG</button>
  </article>;
}

export default function PromoKit({ data, mutate, initialRecordId, onBack, onDirtyChange }: {
  data: StudioData; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  initialRecordId?: string; onBack?: () => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const records = data.records.filter((record) => record.active && record.verificationStatus === "verified");
  const [recordId, setRecordId] = useState(initialRecordId || records[0]?.id || "");
  const record = records.find((item) => item.id === recordId);
  const project = data.creativeProjects.find((item) => item.kind === "promo" && item.recordId === recordId);
  const restoredCopy = (record?: ContentRecord) => {
    const stored = data.creativeProjects.find((item) => item.kind === "promo" && item.recordId === record?.id)?.payload.fields as Partial<Fields> | undefined;
    return { headline: stored?.headline || record?.name || "", summary: stored?.summary || record?.summary || "" };
  };
  const [copy, setCopy] = useState(() => restoredCopy(record));
  const [savedCopy, setSavedCopy] = useState(() => JSON.stringify(copy));
  const [projectId, setProjectId] = useState(project?.id || "");
  const [selectedFormats, setSelectedFormats] = useState<string[]>(FORMATS.map((format) => format.id));
  const [activeFormat, setActiveFormat] = useState<Format["id"]>("portrait");
  const [reviewUrl, setReviewUrl] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(copy) !== savedCopy;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  if (!record) return <section className="empty-state"><h2>Choose a class or event</h2><p>This saved design's source is not available.</p>{onBack && <button className="button primary" onClick={onBack}>Back</button>}</section>;
  const fields = { ...fieldsFor(record, data.scheduleRules), ...copy };
  const valid = Boolean(copy.headline.trim() && copy.summary.trim());
  const asset = data.assets.find((item) => item.id === record.assetId && item.active && item.rightsStatus === "approved");
  const saveProject = async (createReview: boolean) => {
    if (!valid || saving) return;
    setSaving(true); setSaveStatus("Saving…");
    try {
      const loaded = await loadImage(asset);
      if (asset && !loaded) throw new Error("The photo could not load. Try again before saving or sharing.");
      await document.fonts.ready;
      const artworks = FORMATS.map((format) => {
        const canvas = document.createElement("canvas");
        drawPromo(canvas, format, fields, record, loaded, asset);
        return { key: format.id, kind: "still", format: format.label, width: format.width, height: format.height, dataUrl: canvas.toDataURL("image/jpeg", .86) };
      });
      const saved = await mutate({ action: "saveCreativeProject", projectId: projectId || undefined, expectedVersion: project?.version,
        kind: "promo", recordId: record.id, title: `${record.name} Promo Kit`, payload: { fields, artworks } });
      const id = String(saved.creativeProjectId); setProjectId(id); setSavedCopy(JSON.stringify(copy));
      setSaveStatus("Draft saved");
      if (createReview) {
        const result = await mutate({ action: "createProjectReviewLink", creativeProjectId: id, selectedArtworkKeys: selectedFormats, expiresInHours: 72 });
        const url = String(result.reviewUrl || ""); setReviewUrl(url); setSaveStatus("Saved · review link ready");
        if (url) await navigator.clipboard.writeText(url).catch(() => undefined);
      }
    } catch (caught) { setSaveStatus(caught instanceof Error ? caught.message : "Could not save. Try again."); }
    finally { setSaving(false); }
  };
  return <>
    <header className="page-heading"><div>{onBack && <button className="editor-back" onClick={onBack}><ArrowLeft size={15} />Back</button>}<p className="eyebrow">STANDALONE DESIGN</p><h1>One message, more formats</h1><p>Edit your wording. The class or event details stay confirmed.</p></div><span className="fact-integrity is-valid"><CheckCircle2 size={17} />Details confirmed</span></header>
    <section className="promo-layout">
      <aside className="promo-fields">
        <label>Class or event<select value={record.id} disabled={saving} onChange={(event) => {
          if (dirty && !window.confirm("You have unsaved changes. Switch without saving?")) return;
          const next = records.find((item) => item.id === event.target.value); const restored = restoredCopy(next);
          setRecordId(event.target.value); setCopy(restored); setSavedCopy(JSON.stringify(restored));
          setProjectId(data.creativeProjects.find((item) => item.kind === "promo" && item.recordId === next?.id)?.id || ""); setSaveStatus(""); setReviewUrl("");
        }} data-testid="select-promo-record">{records.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Headline<input maxLength={200} disabled={saving} value={copy.headline} onChange={(event) => setCopy((current) => ({ ...current, headline: event.target.value }))} /></label>
        <label>Short message<textarea rows={3} maxLength={400} disabled={saving} value={copy.summary} onChange={(event) => setCopy((current) => ({ ...current, summary: event.target.value }))} /></label>
        <details className="protected-details"><summary>Confirmed class or event details</summary><dl><dt>When</dt><dd>{fields.schedule}</dd><dt>Where</dt><dd>{fields.location}</dd><dt>Registration</dt><dd>{fields.cta}</dd></dl><p>Update these in Classes & events.</p></details>
        <div className="promo-image-note"><ImageIcon size={18} /><span><strong>{asset?.title || "Brand design without a photo"}</strong></span></div>
        <button className="button secondary full" disabled={!valid || saving} onClick={() => saveProject(false)}>Save draft</button>
        <p className="editor-save-status" role="status">{saving ? "Saving…" : dirty ? "Unsaved changes" : saveStatus || "Ready to edit"}</p>
        {saveStatus && dirty && !saving && <p role="alert" className="inline-error">{saveStatus}</p>}
        <details className="promo-review-options"><summary>Share for review</summary><fieldset className="promo-review-select"><legend>Include these formats</legend>{FORMATS.map((format) => <label key={format.id}><input type="checkbox" checked={selectedFormats.includes(format.id)} onChange={() => setSelectedFormats((current) => current.includes(format.id) ? current.filter((id) => id !== format.id) : [...current, format.id])} />{format.label}</label>)}</fieldset><button className="button primary full" disabled={!valid || saving || !selectedFormats.length} onClick={() => saveProject(true)} data-testid="button-promo-review">Save & get review link</button></details>
        {reviewUrl && <div className="editor-review-url"><input readOnly value={reviewUrl} aria-label="Promo Kit review URL" /><button onClick={() => navigator.clipboard.writeText(reviewUrl)}>Copy</button></div>}
      </aside>
      <div className="promo-gallery"><div className="format-tabs" role="group" aria-label="Preview format">{FORMATS.map((format) => <button aria-pressed={activeFormat === format.id} className={activeFormat === format.id ? "active" : ""} key={format.id} onClick={() => setActiveFormat(format.id)}>{format.label}</button>)}</div><div className="promo-single-preview"><PromoArtboard key={`${record.id}-${activeFormat}`} format={FORMATS.find((format) => format.id === activeFormat)!} fields={fields} record={record} asset={asset} valid={valid} /></div><p className="capability-note">Standalone design downloads are drafts. Share a saved version for manager review.</p></div>
    </section>
  </>;
}
