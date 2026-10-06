import type { KenBurns, MotionImage, MotionScene } from "./motion-engine";
import { SCENE_STYLES, sceneStyle } from "./scene-styles";
import { easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, easeOutQuart, easeOutQuint, hashRandom, seg } from "./easings";

export const SUN_OAKS_LOGO = "/studio/brand/logos/SunOaks_Logo_Horizontal_RGB.png";
export const LOGO_LIGHT = "__sun-oaks-light";
export const LOGO_ORIGINAL = "__sun-oaks-original";

// Entrance discipline: every element fades over 600ms and rises over 800ms, staggered
// top to bottom 150ms apart. The first element starts 150ms BEFORE the scene cut so a
// hard cut never lands on an empty frame. Exits run only before hard cuts or at the loop end.
const ENTER_FADE_MS = 600, ENTER_RISE_MS = 800, ENTER_STAGGER_MS = 150, ENTER_LEAD_MS = 150;
export const EXIT_MS = 450;
const enterAt = (index: number) => -ENTER_LEAD_MS + index * ENTER_STAGGER_MS;
const FONT = "Jost, sans-serif";

/** The photo movement a scene renders with, honouring the older `zoom` flag. */
export const sceneKenBurns = (scene: Pick<MotionScene, "zoom" | "kenBurns">): KenBurns => scene.zoom === false ? "none" : scene.kenBurns || "zoom-in";

type Word = { text: string; width: number };
function wordsFor(ctx: CanvasRenderingContext2D, paragraph: string, width: number): Word[] {
  const words: Word[] = [];
  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
    if (ctx.measureText(word).width <= width) { words.push({ text: word, width: ctx.measureText(word).width }); continue; }
    // A single word wider than the column breaks by character so it can never overflow the canvas.
    let chunk = "";
    for (const character of word) {
      if (chunk && ctx.measureText(chunk + character).width > width) { words.push({ text: chunk, width: ctx.measureText(chunk).width }); chunk = ""; }
      chunk += character;
    }
    if (chunk) words.push({ text: chunk, width: ctx.measureText(chunk).width });
  }
  return words;
}

/**
 * Word wrap with two refinements borrowed from editorial typesetting: a balanced display
 * wrap (`balance`) keeps the greedy line count but picks the breaks that minimise ragged
 * edges, and plain wraps never strand a single word on the last line.
 */
export function linesFor(ctx: CanvasRenderingContext2D, text: string, width: number, balance = false) {
  const space = ctx.measureText(" ").width;
  const lineWidth = (words: Word[]) => words.reduce((sum, word) => sum + word.width, 0) + Math.max(0, words.length - 1) * space;
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = wordsFor(ctx, paragraph, width);
    let lines: Word[][] = [], current: Word[] = [];
    for (const word of words) {
      if (current.length && lineWidth([...current, word]) > width) { lines.push(current); current = []; }
      current.push(word);
    }
    if (current.length) lines.push(current);
    let balanced = false;
    if (balance && lines.length >= 2 && words.length > lines.length) {
      const target = lines.length, count = words.length, prefix = [0];
      for (const word of words) prefix.push(prefix[prefix.length - 1] + word.width);
      const cost = (i: number, j: number, last: boolean) => {
        const w = prefix[j] - prefix[i] + (j - i - 1) * space;
        if (w > width) return Infinity;
        return (width - w) ** 2 * (last ? .25 : 1) + (j - i === 1 ? width * width : 0);
      };
      const best = Array.from({ length: target + 1 }, () => new Array<number>(count + 1).fill(Infinity));
      const breaks = Array.from({ length: target + 1 }, () => new Array<number>(count + 1).fill(0));
      best[0][0] = 0;
      for (let k = 1; k <= target; k++) for (let j = k; j <= count; j++) for (let i = k - 1; i < j; i++) {
        if (best[k - 1][i] === Infinity) continue;
        const c = best[k - 1][i] + cost(i, j, k === target);
        if (c < best[k][j]) { best[k][j] = c; breaks[k][j] = i; }
      }
      if (best[target][count] < Infinity) {
        const cuts = [count];
        for (let k = target, j = count; k >= 1; k--) { j = breaks[k][j]; cuts.unshift(j); }
        lines = cuts.slice(0, -1).map((start, k) => words.slice(start, cuts[k + 1]));
        balanced = true;
      }
    }
    if (!balanced && lines.length >= 2) {
      const last = lines[lines.length - 1], previous = lines[lines.length - 2];
      if (last.length === 1 && previous.length >= 2) { last.unshift(previous.pop()!); }
    }
    result.push(...lines.map((line) => line.map((word) => word.text).join(" ")));
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
    ctx.font = `600 ${size}px ${FONT}`; titleLines = linesFor(ctx, scene.title, width, true);
    subSize = Math.max(W * .018, size * .3);
    ctx.font = `400 ${subSize}px ${FONT}`; subtitles = linesFor(ctx, scene.subtitle, width);
    titleHeight = Math.max(1, titleLines.length) * size * 1.08;
    subHeight = Math.max(1, subtitles.length) * subSize * 1.4;
    if (titleLines.length <= 4 && titleHeight + gap + subHeight < H * .55) break;
    size *= .92;
  }
  const blockHeight = titleHeight + gap + subHeight;
  const top = position.startsWith("top") ? H * .24 : position.startsWith("bottom") ? H * .87 - blockHeight : (H - blockHeight) / 2;
  const labelSize = W * .021;
  // Left-aligned labels carry a short accent dash in front, so their text column starts after it.
  const dash = align === "left" && scene.kicker.trim() ? { width: W * .032, gap: W * .012 } : null;
  const labelLeft = left + (dash ? dash.width + dash.gap : 0), labelWidth = width - (dash ? dash.width + dash.gap : 0);
  ctx.font = `500 ${labelSize}px ${FONT}`;
  const labels = linesFor(ctx, scene.kicker.toUpperCase(), labelWidth);
  const labelHeight = Math.max(1, labels.length) * labelSize * 1.3;
  return {
    align, x: align === "center" ? W / 2 : align === "right" ? W - left : left, dash,
    regions: {
      title: { x: left, y: top, width, height: titleHeight, size, lineHeight: 1.08, lines: titleLines },
      subtitle: { x: left, y: top + titleHeight + gap, width, height: subHeight, size: subSize, lineHeight: 1.4, lines: subtitles },
      kicker: { x: labelLeft, y: top - H * .02 - labelHeight, width: labelWidth, height: labelHeight, size: labelSize, lineHeight: 1.3, lines: labels },
    } satisfies Record<CanvasTextField, TextRegion>,
  };
}

type TextBlock = { region: TextRegion; align: "left" | "center" | "right"; anchorX: number; weight: string; color: string; accent: string; tStart: number };

/**
 * Draw one text region with the scene's animation. Every preset resolves to the same
 * settled layout, so presets are hot-swappable and stills always match the video.
 */
function drawTextBlock(ctx: CanvasRenderingContext2D, scene: MotionScene, block: TextBlock, local: number) {
  const { region, align, anchorX, color, accent, tStart } = block;
  const px = region.size, lh = px * region.lineHeight, animation = scene.animation;
  ctx.font = `${block.weight} ${px}px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const space = ctx.measureText(" ").width;
  const perWord = animation === "words", perLetter = animation === "letters" || animation === "typewriter";
  let unit = 0, caret: { x: number; y: number } | null = null, typing = false;
  region.lines.forEach((line, index) => {
    const y = region.y + index * lh;
    const lineWidth = Math.min(region.width, ctx.measureText(line).width);
    const lineX = align === "center" ? anchorX - lineWidth / 2 : align === "right" ? anchorX - lineWidth : anchorX;
    if (!perWord && !perLetter) {
      const lineStart = tStart + index * (animation === "rise" ? ENTER_STAGGER_MS : 140);
      const p = animation === "rise" ? seg(local, lineStart, ENTER_FADE_MS, easeOutCubic) : seg(local, lineStart, 740, easeOutQuint);
      if (p <= 0) return;
      ctx.save();
      if (animation === "rise") { ctx.globalAlpha *= p; ctx.translate(0, (1 - seg(local, lineStart, ENTER_RISE_MS, easeOutCubic)) * px * .45); }
      else if (animation === "fade") ctx.globalAlpha *= p;
      else if (animation === "blur") { ctx.globalAlpha *= p; const blur = (1 - p) * px * .18; if (blur > .4) ctx.filter = `blur(${blur.toFixed(1)}px)`; }
      else if (animation === "scale") {
        const ps = seg(local, lineStart, 780, easeOutBack), cx = lineX + lineWidth / 2, cy = y + px * .5;
        ctx.globalAlpha *= p; ctx.translate(cx, cy); ctx.scale(.9 + .1 * ps, .9 + .1 * ps); ctx.translate(-cx, -cy);
      } else if (animation === "wipe") {
        ctx.beginPath(); ctx.rect(lineX - px * .1, y - px * .1, (lineWidth + px * .25) * p, lh * 1.25); ctx.clip();
        if (p < 1) { ctx.save(); ctx.fillStyle = accent; ctx.globalAlpha *= .9; ctx.fillRect(lineX + (lineWidth + px * .2) * p - px * .06, y - px * .02, px * .05, px * 1.15); ctx.restore(); }
      } else { // "stagger": each line slides up through a mask
        ctx.beginPath(); ctx.rect(lineX - px * .2, y - px * .15, lineWidth + px * .4, lh * 1.24); ctx.clip();
        ctx.translate(0, (1 - p) * px * 1.15);
      }
      ctx.fillStyle = color; ctx.fillText(line, lineX, y, region.width); ctx.restore();
      return;
    }
    let x = lineX;
    for (const word of line.split(" ")) {
      const width = ctx.measureText(word).width;
      if (perWord) {
        const p = seg(local, tStart + unit * 110, 620, easeOutQuint);
        if (p > 0) { ctx.save(); ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * px * .5); ctx.fillStyle = color; ctx.fillText(word, x, y); ctx.restore(); }
        unit += 1;
      } else {
        let lx = x;
        for (const character of word) {
          const cw = ctx.measureText(character).width;
          if (animation === "typewriter") {
            if (local >= tStart + unit * 34) { ctx.fillStyle = color; ctx.fillText(character, lx, y); caret = { x: lx + cw, y }; }
            else typing = true;
          } else {
            const p = seg(local, tStart + unit * 26, 380, easeOutQuint);
            if (p > 0) { ctx.save(); ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * px * .35); ctx.fillStyle = color; ctx.fillText(character, lx, y); ctx.restore(); }
          }
          lx += cw; unit += 1;
        }
      }
      x += width + space;
    }
  });
  // The typewriter caret blinks while typing, then disappears.
  if (animation === "typewriter" && caret && typing && Math.floor(local / 350) % 2 === 0) {
    const at = caret as { x: number; y: number };
    ctx.fillStyle = accent; ctx.fillRect(at.x + px * .08, at.y + px * .1, px * .07, px * .92);
  }
}

export const brandImageKey = (kind: "emblem" | "wordmark", color: string) => `__sun-oaks-${kind}-${color}`;
export function drawPhotoComposition(ctx: CanvasRenderingContext2D, scene: MotionScene, W: number, H: number, local: number, images: Record<string, MotionImage>, options: { exit?: boolean } = {}) {
  const alpha = ctx.globalAlpha;
  const elapsed = Math.max(0, Math.min(1, local / scene.duration));
  const u = Math.min(W, H) / 1080;
  const style = sceneStyle(scene.styleId, scene.template === "endcard");
  const photo = scene.imageId && images[scene.imageId]?.image;
  const ink = photo ? "#FFFFFF" : style.ink;
  const accent = photo ? style.photoAccent : style.accent;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.fillStyle = style.background; ctx.fillRect(0, 0, W, H);
  if (photo) {
    const movement = sceneKenBurns(scene), p = easeInOutCubic(elapsed);
    const zoom = movement === "zoom-in" ? 1.02 + .07 * p : movement === "zoom-out" ? 1.09 - .07 * p : movement === "none" ? 1 : 1.12;
    const drift = movement === "pan-left" ? (.5 - p) * .07 : movement === "pan-right" ? (p - .5) * .07 : 0;
    const scale = Math.max(W / photo.width, H / photo.height) * zoom;
    const sw = W / scale, sh = H / scale;
    const x = Math.max(0, Math.min(photo.width - sw, photo.width * ((scene.focalX ?? .5) + drift) - sw / 2));
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
    const entrance = seg(local, -ENTER_LEAD_MS, 1000, easeOutQuart);
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
  const { regions, align, x, dash } = compositionLayout(ctx, scene, W, H);
  ctx.save();
  // The message exits (fade + lift) only before a hard cut or the loop end.
  const exit = options.exit ? seg(local, scene.duration - EXIT_MS, EXIT_MS, easeInCubic) : 0;
  if (exit > 0) { ctx.globalAlpha *= 1 - exit; ctx.translate(0, -exit * 26 * u); }
  // A subtle 3% content zoom across the scene keeps even still type alive, anchored on the message.
  const blockTop = regions.kicker.lines.length && scene.kicker.trim() ? regions.kicker.y : regions.title.y;
  const blockBottom = regions.subtitle.y + regions.subtitle.height;
  const zoom = 1 + .03 * elapsed, cy = (blockTop + blockBottom) / 2;
  ctx.translate(x, cy); ctx.scale(zoom, zoom); ctx.translate(-x, -cy);
  if (dash && scene.kicker.trim()) {
    const p = seg(local, enterAt(0), 500, easeOutQuint);
    if (p > 0) { ctx.fillStyle = accent; ctx.fillRect(regions.title.x, regions.kicker.y + regions.kicker.size * .55, dash.width * p, Math.max(2, dash.width * .08)); }
  }
  const fields = [
    { field: "kicker" as const, weight: "500", color: photo ? accent : ink },
    { field: "title" as const, weight: "600", color: ink },
    { field: "subtitle" as const, weight: "400", color: ink },
  ];
  fields.forEach(({ field, weight, color }, index) => {
    const region = regions[field];
    if (!region.lines.length) return;
    const anchorX = field === "kicker" && align === "left" ? region.x : x;
    drawTextBlock(ctx, scene, { region, align, anchorX, weight, color, accent, tStart: enterAt(index) }, local);
  });
  ctx.restore();
  ctx.restore();
}
let grainTile: HTMLCanvasElement | OffscreenCanvas | null = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 192;
  const tile: HTMLCanvasElement | OffscreenCanvas | null = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(size, size)
    : typeof document !== "undefined" ? Object.assign(document.createElement("canvas"), { width: size, height: size }) : null;
  const g = tile?.getContext("2d") as CanvasRenderingContext2D | null | undefined;
  if (!tile || !g?.createImageData) return null;
  const data = g.createImageData(size, size);
  for (let i = 0; i < data.data.length; i += 4) { const v = Math.floor(hashRandom(i) * 255); data.data[i] = v; data.data[i + 1] = v; data.data[i + 2] = v; data.data[i + 3] = 255; }
  g.putImageData(data, 0, 0);
  grainTile = tile;
  return tile;
}

/** Film grain at 5%, re-seeded from time every 83ms so preview and export flicker identically. */
export function drawGrain(ctx: CanvasRenderingContext2D, W: number, H: number, time: number) {
  const tile = getGrainTile();
  if (!tile) return;
  const frame = Math.floor(time / 83);
  const ox = Math.floor(hashRandom(frame * 2 + 1) * 192), oy = Math.floor(hashRandom(frame * 2 + 2) * 192);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .05; ctx.globalCompositeOperation = "overlay";
  for (let y = -oy; y < H; y += 192) for (let x = -ox; x < W; x += 192) ctx.drawImage(tile as CanvasImageSource, x, y);
  ctx.restore();
}

/** Make sure every Jost weight the canvas uses is decoded before drawing or exporting. */
export async function ensureCanvasFonts() {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return;
  const loads = typeof fonts.load === "function" ? ["400", "500", "600"].map((weight) => fonts.load(`${weight} 32px Jost`).catch(() => [])) : [];
  await Promise.race([Promise.all([fonts.ready, ...loads]), new Promise((resolve) => setTimeout(resolve, 4000))]);
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
