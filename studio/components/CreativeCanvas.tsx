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
  deliverable: Deliverable,
  snapshot: SourceSnapshot,
  image: HTMLImageElement | null,
  asset?: Asset,
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
  const download = async () => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!canExport || (authorizeExport && !await authorizeExport())) return;
    // Guides are a preview aid and must never be baked into production creative.
    drawCreative(canvas, deliverable, snapshot, image, asset, 1, false);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `sun-oaks-${snapshot.facts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${deliverable.format}-${canvas.width}x${canvas.height}.png`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      void onExported?.();
      if (safeZones) drawCreative(canvas, deliverable, snapshot, image, asset, 1, true);
    }, "image/png");
  };
  return (
    <div className="canvas-shell">
      <canvas ref={ref} className={`creative-canvas format-${deliverable.format}`} aria-label={`${deliverable.format} campaign preview`} />
      <div className="canvas-actions">
        <button className="button secondary compact" onClick={() => setSafeZones((value) => !value)} data-testid={`button-safe-zone-${deliverable.id}`}>
          {safeZones ? <EyeOff size={16} /> : <Eye size={16} />}{safeZones ? "Hide safe area" : "Show safe area"}
        </button>
        <button className="button dark compact" onClick={download} disabled={!canExport} title={canExport ? "Export approved PNG" : "Approve this deliverable before export"} data-testid={`button-download-${deliverable.id}`}><Download size={16} />Export PNG</button>
      </div>
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

  const exportWebM = async () => {
    const canvas = ref.current;
    if (!canvas || !("captureStream" in canvas) || typeof MediaRecorder === "undefined") return;
    if (!canExport || (authorizeExport && !await authorizeExport())) return;
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const complete = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    startRef.current = performance.now();
    setPlaying(true);
    recorder.start(250);
    window.setTimeout(() => recorder.stop(), 6000);
    await complete;
    const blob = new Blob(chunks, { type: "video/webm" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `sun-oaks-${snapshot.facts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-motion.webm`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    await onExported?.();
  };

  return (
    <div className="canvas-shell">
      <canvas ref={ref} className="creative-canvas format-story" aria-label="Animated story campaign preview" />
      <div className="motion-timeline" aria-hidden="true"><span className={playing ? "is-playing" : ""} /></div>
      <div className="canvas-actions">
        <button className="button secondary compact" aria-pressed={playing} onClick={() => { startRef.current = performance.now(); setPlaying((value) => !value); }} data-testid={`button-play-${deliverable.id}`}>
          <Film size={16} />{playing ? "Pause preview" : "Play preview"}
        </button>
        <button className="button dark compact" onClick={exportWebM} disabled={!canExport} title={canExport ? "Export approved WebM" : "Approve this deliverable before export"} data-testid={`button-webm-${deliverable.id}`}><Download size={16} />Export WebM</button>
      </div>
      <p className="capability-note">6-second preset · {reducedMotion ? "Preview paused for reduced motion · " : ""}WebM export works in current Chrome and Edge. MP4 awaits the production H.264 worker.</p>
    </div>
  );
}
