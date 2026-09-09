"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, EyeOff, Film } from "lucide-react";
import type { Asset, Deliverable, SourceSnapshot } from "@/lib/client-types";
import { creativeTextLayouts } from "@/lib/creative-text";

type Props = {
  deliverable: Deliverable;
  snapshot: SourceSnapshot;
  asset?: Asset;
  canExport?: boolean;
  authorizeExport?: () => Promise<boolean>;
  onExported?: () => Promise<void>;
};

const BRAND = { ink: "#0D0D0C", sun: "#F7B500", cream: "#FAF9F7", pool: "#0891A8" };

function renderedLine(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) return value;
  const characters = [...value.replace(/…+$/, "")];
  while (characters.length && ctx.measureText(`${characters.join("")}…`).width > maxWidth) characters.pop();
  return `${characters.join("")}…`;
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number, maxWidth: number) {
  lines.forEach((line, index) => ctx.fillText(renderedLine(ctx, line, maxWidth), x, y + index * lineHeight));
}

async function imageFor(asset?: Asset) {
  if (!asset) return null;
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image unavailable"));
    image.src = asset.fileReference;
  });
  return image;
}

export function drawCreative(
  canvas: HTMLCanvasElement,
  deliverable: Pick<Deliverable, "width" | "height" | "creativeFields" | "format">,
  snapshot: Pick<SourceSnapshot, "facts">,
  image: HTMLImageElement | null,
  asset?: Pick<Asset, "focalPoint">,
  progress = 1,
  safeZones = false,
) {
  const width = deliverable.width || 1080;
  const height = deliverable.height || 1080;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = BRAND.cream;
  ctx.fillRect(0, 0, width, height);
  const photoHeight = Math.round(height * (height / width > 1.55 ? 0.58 : 0.55));
  if (image) {
    const scale = Math.max(width / image.width, photoHeight / image.height);
    const sw = width / scale;
    const sh = photoHeight / scale;
    const fx = asset?.focalPoint.x ?? 0.5;
    const fy = asset?.focalPoint.y ?? 0.5;
    const sx = Math.max(0, Math.min(image.width - sw, image.width * fx - sw / 2));
    const sy = Math.max(0, Math.min(image.height - sh, image.height * fy - sh / 2));
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, photoHeight);
    const shade = ctx.createLinearGradient(0, photoHeight * 0.5, 0, photoHeight);
    shade.addColorStop(0, "rgba(13,13,12,0)");
    shade.addColorStop(1, "rgba(13,13,12,.38)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, photoHeight);
  } else {
    ctx.fillStyle = BRAND.ink;
    ctx.fillRect(0, 0, width, photoHeight);
    ctx.strokeStyle = "rgba(247,181,0,.2)";
    ctx.lineWidth = 2;
    for (let radius = 100; radius < Math.max(width, photoHeight); radius += 90) {
      ctx.beginPath();
      ctx.arc(width * 0.78, photoHeight * 0.2, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = BRAND.sun;
    ctx.beginPath();
    ctx.arc(width * 0.78, photoHeight * 0.2, width * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = BRAND.sun;
  ctx.fillRect(0, photoHeight, width, Math.max(14, height * 0.012));
  const pad = Math.round(width * 0.075);
  const reveal = Math.max(0, Math.min(1, progress));
  ctx.save();
  ctx.globalAlpha = reveal;
  ctx.translate(0, (1 - reveal) * 35);
  ctx.fillStyle = BRAND.pool;
  ctx.font = `600 ${Math.round(width * 0.024)}px Jost, sans-serif`;
  ctx.letterSpacing = `${Math.round(width * 0.003)}px`;
  ctx.fillText(snapshot.facts.recordType === "event" ? "SUN OAKS EVENT" : "CLASS SPOTLIGHT", pad, photoHeight + height * 0.085);
  const title = deliverable.creativeFields.headline || snapshot.facts.name;
  const maxTextWidth = width - pad * 2;
  const textLayouts = creativeTextLayouts({
    headline: title,
    hook: deliverable.creativeFields.hook || "Your time. Well spent.",
    schedule: deliverable.creativeFields.schedule,
    location: deliverable.creativeFields.location || snapshot.facts.location,
    cta: snapshot.facts.cta,
  });
  const titleSize = textLayouts.headline.fontSize;
  ctx.fillStyle = BRAND.ink;
  ctx.font = `600 ${titleSize}px Jost, sans-serif`;
  ctx.letterSpacing = "-2px";
  const titleLines = textLayouts.headline.lines;
  drawLines(ctx, titleLines, pad, photoHeight + height * 0.15, titleSize * 1.04, maxTextWidth);
  const titleOffset = (titleLines.length - 1) * titleSize * 0.9;
  ctx.letterSpacing = "0px";
  ctx.font = `italic 500 ${Math.round(width * 0.035)}px Newsreader, serif`;
  drawLines(ctx, textLayouts.hook.lines, pad, photoHeight + height * 0.215 + titleOffset, width * 0.043, maxTextWidth);
  ctx.font = `500 ${Math.round(width * 0.027)}px Jost, sans-serif`;
  drawLines(ctx, textLayouts.detail.lines, pad, photoHeight + height * 0.29 + titleOffset, width * 0.035, maxTextWidth);
  ctx.font = `600 ${Math.round(width * 0.023)}px Jost, sans-serif`;
  drawLines(ctx, textLayouts.cta.lines, pad, photoHeight + height * 0.36 + titleOffset, width * 0.031, maxTextWidth);
  ctx.restore();
  ctx.fillStyle = BRAND.ink;
  ctx.font = `600 ${Math.round(width * 0.027)}px Jost, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("SUN OAKS", width - pad, height - pad * 0.6);
  ctx.textAlign = "left";
  if (safeZones) {
    const safe = deliverable.format.includes("story") ? { x: 65, y: 180 } : { x: 55, y: 55 };
    ctx.strokeStyle = "rgba(8,145,168,.9)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.strokeRect(safe.x, safe.y, width - safe.x * 2, height - safe.y * 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(8,145,168,.9)";
    ctx.font = "600 18px Jost, sans-serif";
    ctx.fillText("SAFE AREA", safe.x + 12, safe.y + 28);
  }
}

export function StillCanvas({ deliverable, snapshot, asset, canExport = false, authorizeExport, onExported }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [safeZones, setSafeZones] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => { imageFor(asset).then(setImage).catch(() => setImage(null)); }, [asset]);
  useEffect(() => { if (ref.current) drawCreative(ref.current, deliverable, snapshot, image, asset, 1, safeZones); }, [deliverable, snapshot, image, asset, safeZones]);
  const { download, pending, message } = usePromotionDownload({ deliverable, snapshot, asset, canExport, authorizeExport, onExported });

  return (
    <div className="canvas-shell">
      <canvas ref={ref} className={`creative-canvas format-${deliverable.format}`} aria-label={`${deliverable.format} campaign preview`} />
      <div className="canvas-actions">
        <button className="button secondary compact" onClick={() => setSafeZones((value) => !value)} data-testid={`button-safe-zone-${deliverable.id}`}>
          {safeZones ? <EyeOff size={16} /> : <Eye size={16} />}{safeZones ? "Hide safe area" : "Show safe area"}
        </button>
        <button className="button dark compact" onClick={download} disabled={!canExport || pending} title={canExport ? "Export approved PNG" : "Approve this deliverable before export"} data-testid={`button-download-${deliverable.id}`}><Download size={16} />{pending ? "Preparing…" : "Export PNG"}</button>
      </div>
      {message && <p className="capability-note" role="status">{message}</p>}
    </div>
  );
}

export function MotionCanvas({ deliverable, snapshot, asset, canExport = false, authorizeExport, onExported }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    imageFor(asset).then((image) => { imageRef.current = image; }).catch(() => { imageRef.current = null; });
    startRef.current = performance.now();
  }, [asset]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const synchronize = () => {
      setReducedMotion(media.matches);
      setPlaying(!media.matches);
    };
    synchronize();
    media.addEventListener("change", synchronize);
    return () => media.removeEventListener("change", synchronize);
  }, []);
  useEffect(() => {
    const tick = (time: number) => {
      const elapsed = (time - startRef.current) % 6000;
      const progress = Math.min(1, elapsed / 1300);
      if (ref.current) drawCreative(ref.current, deliverable, snapshot, imageRef.current, asset, progress);
      if (playing) frameRef.current = requestAnimationFrame(tick);
    };
    if (playing) frameRef.current = requestAnimationFrame(tick);
    else if (ref.current) drawCreative(ref.current, deliverable, snapshot, imageRef.current, asset, 1);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [asset, deliverable, playing, snapshot]);

  const { download: exportWebM, pending, message } = usePromotionDownload({ deliverable, snapshot, asset, canExport, authorizeExport, onExported });

  return (
    <div className="canvas-shell">
      <canvas ref={ref} className="creative-canvas format-story" aria-label="Animated story campaign preview" />
      <div className="motion-timeline" aria-hidden="true"><span className={playing ? "is-playing" : ""} /></div>
      <div className="canvas-actions">
        <button className="button secondary compact" aria-pressed={playing} onClick={() => { startRef.current = performance.now(); setPlaying((value) => !value); }} data-testid={`button-play-${deliverable.id}`}>
          <Film size={16} />{playing ? "Pause preview" : "Play preview"}
        </button>
        <button className="button dark compact" onClick={exportWebM} disabled={!canExport || pending} title={canExport ? "Export approved WebM" : "Approve this deliverable before export"} data-testid={`button-webm-${deliverable.id}`}><Download size={16} />{pending ? "Preparing…" : "Export WebM"}</button>
      </div>
      {message && <p className="capability-note" role="status">{message}</p>}
      <p className="capability-note">6-second preset · {reducedMotion ? "Preview paused for reduced motion · " : ""}Download a WebM video for your selected channel. Chrome or Edge is recommended.</p>
    </div>
  );
}

function usePromotionDownload({ deliverable, snapshot, asset, canExport, authorizeExport, onExported }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const download = async () => {
    if (!canExport || pending) return;
    setPending(true); setMessage("Preparing your download…");
    try {
      if (authorizeExport && !await authorizeExport()) throw new Error("This material changed or needs approval. Reload before downloading.");
      const file = await renderPromotionFile(deliverable, snapshot, asset);
      if (authorizeExport && !await authorizeExport()) throw new Error("This material changed while preparing. Reload before downloading.");
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `sun-oaks-${snapshot.facts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${file.name}`;
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Download started. Recording your download…");
      await onExported?.(); setMessage("Download started.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not download. Try again."); }
    finally { setPending(false); }
  };
  return { download, pending, message };
}

export async function renderPromotionFile(deliverable: Deliverable, snapshot: SourceSnapshot, asset?: Asset) {
  if (deliverable.deliverableType === "caption") return { name: "social-caption.txt", blob: new Blob([deliverable.creativeFields.caption], { type: "text/plain;charset=utf-8" }) };
  if (deliverable.deliverableType === "emailCopy") return { name: "email-copy.txt", blob: new Blob([`Subject: ${deliverable.creativeFields.subject}\nPreview: ${deliverable.creativeFields.preview}\n\n${deliverable.creativeFields.body}`], { type: "text/plain;charset=utf-8" }) };
  await document.fonts.ready;
  const image = await imageFor(asset);
  const canvas = document.createElement("canvas");
  drawCreative(canvas, deliverable, snapshot, image, asset, 1);
  if (deliverable.deliverableType === "still") {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not render this image. Try again.")), "image/png"));
    return { name: `${deliverable.format}-${canvas.width}x${canvas.height}.png`, blob };
  }
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") throw new Error("Animation download needs a browser with WebM recording support.");
  const stream = canvas.captureStream(30);
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) { stream.getTracks().forEach((track) => track.stop()); throw new Error("This browser cannot export WebM. Try current Chrome or Edge."); }
  let frame = 0;
  let timer = 0;
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("Animation recording failed. Try again."));
      recorder.onstop = () => chunks.length ? resolve(new Blob(chunks, { type: "video/webm" })) : reject(new Error("The animation was empty. Try again."));
      const start = performance.now();
      const draw = (now: number) => { drawCreative(canvas, deliverable, snapshot, image, asset, Math.min(1, (now - start) / 1300)); frame = requestAnimationFrame(draw); };
      drawCreative(canvas, deliverable, snapshot, image, asset, 0);
      recorder.start(250); frame = requestAnimationFrame(draw);
      timer = window.setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 6000);
    });
    return { name: "animated-story.webm", blob };
  } finally { cancelAnimationFrame(frame); window.clearTimeout(timer); stream.getTracks().forEach((track) => track.stop()); }
}
