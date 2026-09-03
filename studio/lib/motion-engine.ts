export const MOTION_ASPECTS = {
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
} as const;

export type MotionAspect = keyof typeof MOTION_ASPECTS;
export type MotionTemplate = "title" | "statement" | "stat" | "list" | "quote" | "image" | "details" | "calendar" | "presenter" | "disclaimer" | "endcard";
export type MotionAnimation = "rise" | "fade" | "wipe" | "scale";
export type MotionTransition = "cut" | "fade" | "slide";
export type MotionImage = { id: string; name: string; image: HTMLImageElement };
export type MotionScene = {
  id: string;
  template: MotionTemplate;
  duration: number;
  kicker: string;
  title: string;
  subtitle: string;
  animation: MotionAnimation;
  transition: MotionTransition;
  imageId: string | null;
};
export type MotionDocument = { aspect: MotionAspect; fps: number; scenes: MotionScene[] };

let sceneNumber = 0;
export function makeMotionScene(template: MotionTemplate, values: Partial<MotionScene> = {}): MotionScene {
  sceneNumber += 1;
  return {
    id: `motion-${Date.now().toString(36)}-${sceneNumber}`,
    template,
    duration: 3200,
    kicker: template === "endcard" ? "SUN OAKS" : "VERIFIED AT SUN OAKS",
    title: template === "endcard" ? "Your time. Well spent." : "New scene",
    subtitle: "",
    animation: template === "endcard" ? "scale" : "rise",
    transition: "fade",
    imageId: null,
    ...values,
  };
}

export function motionDuration(doc: MotionDocument) {
  return doc.scenes.reduce((sum, scene) => sum + scene.duration, 0);
}

export function motionSceneAt(doc: MotionDocument, time: number) {
  let start = 0;
  for (let index = 0; index < doc.scenes.length; index += 1) {
    const scene = doc.scenes[index];
    if (time < start + scene.duration || index === doc.scenes.length - 1) return { scene, index, local: time - start, start };
    start += scene.duration;
  }
  return { scene: doc.scenes[0], index: 0, local: 0, start: 0 };
}

function ease(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - t, 3);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function coverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, scaleProgress: number) {
  const zoom = 1 + scaleProgress * .06;
  const scale = Math.max(width / image.width, height / image.height) * zoom;
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height);
}

function drawSun(ctx: CanvasRenderingContext2D, W: number, H: number, progress: number) {
  ctx.strokeStyle = "rgba(247,181,0,.24)";
  ctx.lineWidth = Math.max(2, W * .0014);
  const x = W * .78;
  const y = H * .24;
  for (let radius = W * .05; radius <= W * .32; radius += W * .052) {
    ctx.beginPath();
    ctx.arc(x, y, radius * (0.9 + .1 * progress), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#F7B500";
  ctx.beginPath();
  ctx.arc(x, y, W * .065 * ease(progress), 0, Math.PI * 2);
  ctx.fill();
}

function animationTransform(ctx: CanvasRenderingContext2D, animation: MotionAnimation, progress: number, W: number) {
  const p = ease(progress);
  ctx.globalAlpha = animation === "fade" ? p : Math.min(1, p * 1.25);
  if (animation === "rise") ctx.translate(0, (1 - p) * W * .035);
  if (animation === "scale") {
    const scale = .88 + p * .12;
    ctx.translate(W / 2, 0);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, 0);
  }
  if (animation === "wipe") {
    ctx.beginPath();
    ctx.rect(0, 0, W * p, 10000);
    ctx.clip();
  }
}

export function renderMotionFrame(
  ctx: CanvasRenderingContext2D,
  doc: MotionDocument,
  time: number,
  images: Record<string, MotionImage>,
) {
  const { width: W, height: H } = MOTION_ASPECTS[doc.aspect];
  const total = Math.max(1, motionDuration(doc));
  const loopTime = Math.max(0, time % total);
  const { scene, local, index } = motionSceneAt(doc, loopTime);
  if (!scene) return;
  const sceneProgress = Math.max(0, Math.min(1, local / scene.duration));
  const enter = Math.min(1, local / 720);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = scene.template === "endcard" ? "#0891A8" : "#0D0D0C";
  ctx.fillRect(0, 0, W, H);
  const image = scene.imageId ? images[scene.imageId]?.image : undefined;
  if (scene.template === "image" && image) {
    coverImage(ctx, image, W, H, sceneProgress);
    const gradient = ctx.createLinearGradient(0, H * .25, 0, H);
    gradient.addColorStop(0, "rgba(13,13,12,.05)");
    gradient.addColorStop(1, "rgba(13,13,12,.82)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  } else if (scene.template !== "endcard") drawSun(ctx, W, H, enter);
  if (scene.transition === "fade" && index > 0 && local < 420) ctx.globalAlpha *= Math.max(.18, local / 420);
  if (scene.transition === "slide" && index > 0 && local < 520) ctx.translate((1 - ease(local / 520)) * W, 0);
  const pad = W * .075;
  const centerY = scene.template === "details" || scene.template === "list" || scene.template === "disclaimer"
    ? H * .34 : scene.template === "image" || scene.template === "presenter" ? H * .68 : H * .48;
  ctx.save();
  animationTransform(ctx, scene.animation, enter, W);
  ctx.fillStyle = scene.template === "endcard" ? "#0D0D0C" : "#F7B500";
  ctx.font = `700 ${Math.max(22, W * .022)}px Jost, sans-serif`;
  ctx.letterSpacing = `${W * .003}px`;
  ctx.fillText(scene.kicker.toUpperCase(), pad, centerY - H * .13);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#FAF9F7";
  const titleSize = scene.template === "disclaimer" ? W * .034 : scene.template === "details" || scene.template === "list" ? W * .058 : scene.template === "stat" ? W * .13 : W * .072;
  ctx.font = `${scene.template === "quote" ? "italic 500" : "600"} ${titleSize}px ${scene.template === "quote" ? "Newsreader, serif" : "Jost, sans-serif"}`;
  const renderedTitle = scene.template === "quote" ? `“${scene.title}”` : scene.title;
  const lines = scene.template === "list"
    ? scene.title.split("\n").filter(Boolean).slice(0, 5).map((line) => `— ${line}`)
    : wrapLines(ctx, renderedTitle, W - pad * 2, scene.template === "details" || scene.template === "disclaimer" ? 6 : 3);
  lines.forEach((line, lineIndex) => ctx.fillText(line, pad, centerY + lineIndex * titleSize * 1.03));
  ctx.font = `italic 500 ${Math.max(26, W * .034)}px Newsreader, serif`;
  ctx.fillStyle = scene.template === "endcard" ? "#0D0D0C" : "#FAF9F7";
  ctx.fillText(scene.subtitle, pad, centerY + lines.length * titleSize * 1.04 + H * .035, W - pad * 2);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = scene.template === "endcard" ? "#0D0D0C" : "#FAF9F7";
  ctx.font = `600 ${Math.max(18, W * .019)}px Jost, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("SUN OAKS", W - pad, H - H * .06);
  ctx.textAlign = "left";
}

export async function exportMotionPng(doc: MotionDocument, time: number, images: Record<string, MotionImage>) {
  const size = MOTION_ASPECTS[doc.aspect];
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is unavailable.");
  renderMotionFrame(ctx, doc, time, images);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
}

export async function exportMotionWebm(
  doc: MotionDocument,
  images: Record<string, MotionImage>,
  onProgress: (value: number) => void,
) {
  const size = MOTION_ASPECTS[doc.aspect];
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx || typeof MediaRecorder === "undefined") throw new Error("WebM export is unavailable in this browser.");
  const stream = canvas.captureStream(doc.fps);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((value) => MediaRecorder.isTypeSupported(value)) || "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(size.width * size.height * doc.fps * .11) });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const duration = motionDuration(doc);
  return new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("WebM recording failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    recorder.start(200);
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(duration, now - start);
      renderMotionFrame(ctx, doc, elapsed, images);
      onProgress(elapsed / duration);
      if (elapsed >= duration) recorder.stop();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function exportMotionMp4(
  doc: MotionDocument,
  images: Record<string, MotionImage>,
  onProgress: (value: number) => void,
) {
  if (!("VideoEncoder" in window) || !("VideoFrame" in window)) throw new Error("H.264 MP4 requires WebCodecs in current Chrome or Edge.");
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const size = MOTION_ASPECTS[doc.aspect];
  const VideoEncoderClass = window.VideoEncoder;
  const VideoFrameClass = window.VideoFrame;
  const codecs = ["avc1.64002a", "avc1.4d402a", "avc1.42002a"];
  let codec = "";
  const bitrate = Math.round(size.width * size.height * doc.fps * .14);
  for (const candidate of codecs) {
    try {
      const result = await VideoEncoderClass.isConfigSupported({ codec: candidate, width: size.width, height: size.height, framerate: doc.fps, bitrate });
      if (result.supported) { codec = candidate; break; }
    } catch {}
  }
  if (!codec) throw new Error("This browser cannot encode standard H.264. Export WebM instead.");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: "avc", width: size.width, height: size.height }, fastStart: "in-memory" });
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is unavailable.");
  let encodeError: Error | null = null;
  const encoder = new VideoEncoderClass({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (error) => { encodeError = error instanceof Error ? error : new Error(String(error)); },
  });
  encoder.configure({ codec, width: size.width, height: size.height, framerate: doc.fps, bitrate });
  const frames = Math.max(1, Math.round(motionDuration(doc) / 1000 * doc.fps));
  try {
    for (let index = 0; index < frames; index += 1) {
      if (encodeError) throw encodeError;
      renderMotionFrame(ctx, doc, index / doc.fps * 1000, images);
      const frame = new VideoFrameClass(canvas, { timestamp: Math.round(index * 1_000_000 / doc.fps), duration: Math.round(1_000_000 / doc.fps) });
      encoder.encode(frame, { keyFrame: index % (doc.fps * 2) === 0 });
      frame.close();
      if (encoder.encodeQueueSize > 8) while (encoder.encodeQueueSize > 2) await new Promise((resolve) => window.setTimeout(resolve, 0));
      if (index % 3 === 0) {
        onProgress((index + 1) / frames);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
    onProgress(1);
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}

export function downloadMotionBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
