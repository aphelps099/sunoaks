import type { MotionImage, MotionScene } from "./motion-engine";

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

export function drawPhotoComposition(ctx: CanvasRenderingContext2D, scene: MotionScene, W: number, H: number, local: number, images: Record<string, MotionImage>) {
  const alpha = ctx.globalAlpha;
  const pad = W * .075;
  const elapsed = Math.max(0, Math.min(1, local / scene.duration));
  const endcard = scene.template === "endcard";
  const photo = scene.imageId && images[scene.imageId]?.image;
  ctx.fillStyle = endcard ? "#F7B500" : "#102E32";
  ctx.fillRect(0, 0, W, H);
  if (photo) {
    const zoom = scene.zoom === false ? 1 : 1.02 + .055 * elapsed;
    const scale = Math.max(W / photo.width, H / photo.height) * zoom;
    const sw = W / scale, sh = H / scale;
    const x = Math.max(0, Math.min(photo.width - sw, photo.width * (scene.focalX ?? .5) - sw / 2));
    const y = Math.max(0, Math.min(photo.height - sh, photo.height * (scene.focalY ?? .5) - sh / 2));
    ctx.drawImage(photo, x, y, sw, sh, 0, 0, W, H);
    const shade = scene.shade ?? .5;
    ctx.fillStyle = `rgba(4,18,20,${.1 + shade * .35})`;
    ctx.fillRect(0, 0, W, H);
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, `rgba(4,18,20,${.15 + shade * .25})`);
    gradient.addColorStop(.35, "rgba(4,18,20,0)");
    gradient.addColorStop(1, `rgba(4,18,20,${.35 + shade * .6})`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  }
  const light = Boolean(photo) || !endcard;
  const logo = images[light ? LOGO_LIGHT : LOGO_ORIGINAL]?.image;
  if (logo) {
    const width = endcard ? W * .68 : Math.min(W * .36, 480);
    const height = width * logo.height / logo.width;
    ctx.save();
    ctx.globalAlpha = alpha * ease(local / 650);
    ctx.drawImage(logo, endcard ? (W - width) / 2 : pad, endcard ? H * .35 - height / 2 : H * .065, width, height);
    ctx.restore();
  }
  const position = endcard ? "center" : scene.position || "bottom-left";
  const center = position === "center" || position === "bottom-center";
  const right = position === "bottom-right";
  const maxWidth = W * (endcard ? .8 : .85);
  const baseSize = W * (H / W < .8 ? .067 : .095);
  let size = endcard ? baseSize * .62 : baseSize;
  let titleLines: string[] = [];
  do {
    ctx.font = `600 ${size}px Jost, sans-serif`;
    titleLines = linesFor(ctx, scene.title, maxWidth);
    if (titleLines.length <= 4 && titleLines.length * size * 1.08 < H * .4) break;
    size *= .91;
  } while (size > W * .026);
  const subSize = Math.max(W * .025, size * .29);
  ctx.font = `400 ${subSize}px Jost, sans-serif`;
  const subtitles = linesFor(ctx, scene.subtitle, maxWidth);
  const gap = H * .025;
  const titleHeight = titleLines.length * size * 1.08;
  const subHeight = subtitles.length * subSize * 1.4;
  const blockHeight = titleHeight + (subtitles.length ? gap + subHeight : 0);
  let top = position.startsWith("top") ? H * .25 : position.startsWith("bottom") ? H * .87 - blockHeight : (H - blockHeight) / 2;
  if (endcard) top = H * .49;
  const x = center ? W / 2 : right ? W - pad : pad;
  ctx.textAlign = center ? "center" : right ? "right" : "left";
  ctx.textBaseline = "top";
  if (scene.kicker) {
    ctx.save(); ctx.globalAlpha = alpha * ease(local / 550);
    ctx.font = `500 ${W * .021}px Jost, sans-serif`; ctx.fillStyle = light ? "#F7B500" : "#102E32";
    ctx.fillText(scene.kicker.toUpperCase(), x, top - H * .045, maxWidth); ctx.restore();
  }
  const drawLine = (line: string, y: number, fontSize: number, index: number, secondary = false) => {
    const p = ease((local - (scene.animation === "stagger" ? index * 110 : 0)) / 750);
    ctx.save(); ctx.globalAlpha = alpha * p;
    ctx.fillStyle = light ? "#FFFFFF" : "#102E32";
    ctx.font = `${secondary ? "400" : "600"} ${fontSize}px Jost, sans-serif`;
    if (scene.animation === "wipe" || scene.animation === "stagger") {
      ctx.beginPath(); ctx.rect(0, y, W, fontSize * 1.3); ctx.clip();
      ctx.translate(0, (1 - p) * fontSize * 1.15);
    } else if (scene.animation === "rise") ctx.translate(0, (1 - p) * 35);
    else if (scene.animation === "scale") { ctx.translate(x, y); ctx.scale(.94 + p * .06, .94 + p * .06); ctx.translate(-x, -y); }
    ctx.fillText(line, x, y, maxWidth); ctx.restore();
  };
  titleLines.forEach((line, index) => drawLine(line, top + index * size * 1.08, size, index));
  subtitles.forEach((line, index) => drawLine(line, top + titleHeight + gap + index * subSize * 1.4, subSize, titleLines.length + index, true));
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

let brandPromise: Promise<Record<string, MotionImage>> | undefined;
export function loadCanvasBrand() {
  if (!brandPromise) brandPromise = (async () => {
    const original = new Image(); original.src = SUN_OAKS_LOGO; await original.decode();
    const canvas = document.createElement("canvas"); canvas.width = original.width; canvas.height = original.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(original, 0, 0);
    ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const light = new Image(); light.src = canvas.toDataURL("image/png"); await light.decode();
    return { [LOGO_LIGHT]: { id: LOGO_LIGHT, name: "Sun Oaks white", image: light }, [LOGO_ORIGINAL]: { id: LOGO_ORIGINAL, name: "Sun Oaks", image: original } };
  })().catch((error) => { brandPromise = undefined; throw error; });
  return brandPromise;
}
