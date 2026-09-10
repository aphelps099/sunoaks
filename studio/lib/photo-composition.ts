import type { MotionImage, MotionScene } from "./motion-engine";
import { SCENE_STYLES, sceneStyle } from "./scene-styles";

export const SUN_OAKS_LOGO = "/studio/brand/logos/SunOaks_Logo_Horizontal_RGB.png";
export const LOGO_LIGHT = "__sun-oaks-light";
export const LOGO_ORIGINAL = "__sun-oaks-original";
const ease = (value: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 4);

function linesFor(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && ctx.measureText(`${line} ${word}`).width > width) { result.push(line); line = ""; }
      if (ctx.measureText(word).width > width) {
        if (line) { result.push(line); line = ""; }
        for (const character of word) {
          if (line && ctx.measureText(line + character).width > width) { result.push(line); line = ""; }
          line += character;
        }
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) result.push(line);
  }
  return result;
}

export type CanvasTextField = "title" | "subtitle" | "kicker";
export type TextRegion = { x: number; y: number; width: number; height: number; size: number; lineHeight: number; lines: string[] };

// Shared geometry keeps click-to-edit controls aligned with the exported type.
export function compositionLayout(ctx: CanvasRenderingContext2D, scene: MotionScene, W: number, H: number) {
  const position = scene.position || (scene.template === "endcard" ? "center" : "bottom-left");
  const align: "left" | "center" | "right" = position === "center" || position === "bottom-center" ? "center" : position === "bottom-right" ? "right" : "left";
  const width = W * .85, left = W * .075, gap = H * .025;
  let size = W * (H / W < .8 ? .067 : .095);
  let titleLines: string[] = [], subtitles: string[] = [], subSize = size * .3;
  let titleHeight = 0, subHeight = 0;
  for (let attempt = 0; attempt < 35; attempt++) {
    ctx.font = `600 ${size}px Jost, sans-serif`; titleLines = linesFor(ctx, scene.title, width);
    subSize = Math.max(W * .018, size * .3);
    ctx.font = `400 ${subSize}px Jost, sans-serif`; subtitles = linesFor(ctx, scene.subtitle, width);
    titleHeight = Math.max(1, titleLines.length) * size * 1.08;
    subHeight = Math.max(1, subtitles.length) * subSize * 1.4;
    if (titleLines.length <= 4 && titleHeight + gap + subHeight < H * .55) break;
    size *= .92;
  }
  const blockHeight = titleHeight + gap + subHeight;
  const top = position.startsWith("top") ? H * .24 : position.startsWith("bottom") ? H * .87 - blockHeight : (H - blockHeight) / 2;
  const labelSize = W * .021;
  ctx.font = `500 ${labelSize}px Jost, sans-serif`;
  const labels = linesFor(ctx, scene.kicker.toUpperCase(), width);
  const labelHeight = Math.max(1, labels.length) * labelSize * 1.3;
  return {
    align, x: align === "center" ? W / 2 : align === "right" ? W - left : left,
    regions: {
      title: { x: left, y: top, width, height: titleHeight, size, lineHeight: 1.08, lines: titleLines },
      subtitle: { x: left, y: top + titleHeight + gap, width, height: subHeight, size: subSize, lineHeight: 1.4, lines: subtitles },
      kicker: { x: left, y: top - H * .02 - labelHeight, width, height: labelHeight, size: labelSize, lineHeight: 1.3, lines: labels },
    } satisfies Record<CanvasTextField, TextRegion>,
  };
}

export const brandImageKey = (kind: "emblem" | "wordmark", color: string) => `__sun-oaks-${kind}-${color}`;
export function drawPhotoComposition(ctx: CanvasRenderingContext2D, scene: MotionScene, W: number, H: number, local: number, images: Record<string, MotionImage>) {
  const alpha = ctx.globalAlpha;
  const elapsed = Math.max(0, Math.min(1, local / scene.duration));
  const style = sceneStyle(scene.styleId, scene.template === "endcard");
  const photo = scene.imageId && images[scene.imageId]?.image;
  const ink = photo ? "#FFFFFF" : style.ink;
  const accent = photo ? style.photoAccent : style.accent;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.fillStyle = style.background; ctx.fillRect(0, 0, W, H);
  if (photo) {
    const zoom = scene.zoom === false ? 1 : 1.02 + .055 * elapsed;
    const scale = Math.max(W / photo.width, H / photo.height) * zoom;
    const sw = W / scale, sh = H / scale;
    const x = Math.max(0, Math.min(photo.width - sw, photo.width * (scene.focalX ?? .5) - sw / 2));
    const y = Math.max(0, Math.min(photo.height - sh, photo.height * (scene.focalY ?? .5) - sh / 2));
    ctx.drawImage(photo, x, y, sw, sh, 0, 0, W, H);
    const shade = scene.shade ?? .5;
    // A light color wash plus a dark gradient keeps photos visible and type clear.
    ctx.save(); ctx.globalAlpha = alpha * .24; ctx.fillStyle = style.background; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.fillStyle = `rgba(4,18,20,${.18 + shade * .36})`; ctx.fillRect(0, 0, W, H);
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, `rgba(4,18,20,${.18 + shade * .25})`);
    gradient.addColorStop(.35, "rgba(4,18,20,0)");
    gradient.addColorStop(1, `rgba(4,18,20,${.4 + shade * .5})`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  }
  const emblem = scene.logoStyle === "emblem";
  const logo = images[brandImageKey(emblem ? "emblem" : "wordmark", emblem ? accent : ink)]?.image
    || (!emblem ? images[ink === "#FFFFFF" ? LOGO_LIGHT : LOGO_ORIGINAL]?.image : undefined);
  if (logo) {
    ctx.save();
    const entrance = ease(local / 1000);
    if (emblem) {
      const diameter = Math.min(W, H) * 1.22;
      const right = scene.position !== "bottom-right";
      ctx.globalAlpha = alpha * entrance * (photo ? .28 : .6);
      const drift = (1 - entrance) * W * .055;
      ctx.drawImage(logo, (right ? W - diameter * .77 : -diameter * .23) + drift, -diameter * .18, diameter, diameter);
    } else {
      const width = Math.min(W * .28, 440), height = width * logo.height / logo.width;
      ctx.globalAlpha = alpha * entrance;
      ctx.drawImage(logo, W * .075, H * .07, width, height);
    }
    ctx.restore();
  }
  const { regions, align, x } = compositionLayout(ctx, scene, W, H);
  ctx.textAlign = align; ctx.textBaseline = "top";
  let lineIndex = 0;
  for (const field of ["kicker", "title", "subtitle"] as const) {
    const region = regions[field];
    region.lines.forEach((line, index) => {
      const y = region.y + index * region.size * region.lineHeight;
      const p = ease((local - (scene.animation === "stagger" ? lineIndex * 110 : 0)) / 750);
      lineIndex++;
      ctx.save(); ctx.globalAlpha = alpha * p;
      ctx.fillStyle = field === "kicker" && photo ? accent : ink;
      ctx.font = `${field === "title" ? "600" : field === "kicker" ? "500" : "400"} ${region.size}px Jost, sans-serif`;
      if (scene.animation === "wipe" || scene.animation === "stagger") {
        ctx.beginPath(); ctx.rect(0, y, W, region.size * 1.3); ctx.clip();
        ctx.translate(0, (1 - p) * region.size * 1.15);
      } else if (scene.animation === "rise") ctx.translate(0, (1 - p) * 35);
      else if (scene.animation === "scale") { ctx.translate(x, y); ctx.scale(.92 + p * .08, .92 + p * .08); ctx.translate(-x, -y); }
      ctx.fillText(line, x, y, region.width); ctx.restore();
    });
  }
  ctx.restore();
}

let brandPromise: Promise<Record<string, MotionImage>> | undefined;
export function loadCanvasBrand() {
  if (!brandPromise) brandPromise = (async () => {
    const original = new Image(); original.src = SUN_OAKS_LOGO; await original.decode();
    const response = await fetch("/studio/brand/logos/SunOaks_Emblem.svg");
    if (!response.ok) throw new Error("The Sun Oaks emblem could not load.");
    const emblemSvg = await response.text();
    const colors = new Set<string>(SCENE_STYLES.flatMap((style) => [style.ink, style.accent, style.photoAccent]));
    const entries = await Promise.all((["wordmark", "emblem"] as const).flatMap((kind) => [...colors].map(async (color) => {
      const image = new Image();
      if (kind === "emblem") {
        // Keep the supplied paths vector-sharp without allocating a large bitmap per color.
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblemSvg.replace('fill="#102E32"', `fill="${color}"`))}`;
      } else {
        const canvas = document.createElement("canvas"); canvas.width = original.width; canvas.height = original.height;
        const ctx = canvas.getContext("2d")!; ctx.drawImage(original, 0, 0);
        ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height);
        image.src = canvas.toDataURL("image/png");
      }
      await image.decode();
      const id = brandImageKey(kind, color); return [id, { id, name: `Sun Oaks ${kind}`, image }] as const;
    })));
    const variants = Object.fromEntries(entries);
    return { ...variants, [LOGO_LIGHT]: { id: LOGO_LIGHT, name: "Sun Oaks white", image: variants[brandImageKey("wordmark", "#FFFFFF")].image }, [LOGO_ORIGINAL]: { id: LOGO_ORIGINAL, name: "Sun Oaks", image: original } };
  })().catch((error) => { brandPromise = undefined; throw error; });
  return brandPromise;
}
