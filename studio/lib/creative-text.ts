export type TextLayout = { lines: string[]; fontSize: number; truncated: boolean };

export const CREATIVE_TEXT_SPEC = {
  maxWidth: 918,
  headline: { startSize: 72, minSize: 41, maxLines: 2 },
  hook: { fontSize: 38, maxLines: 2 },
  detail: { fontSize: 29, maxLines: 2 },
  cta: { fontSize: 25, maxLines: 2 },
} as const;

export function estimateTextWidth(text: string, fontSize: number) {
  let units = 0;
  for (const character of text) {
    if (/[WM@#%&]/.test(character)) units += 0.96;
    else if (/[A-Z0-9]/.test(character)) units += 0.7;
    else if (/[ilI1|.,'`:;]/.test(character)) units += 0.32;
    else if (/\s/.test(character)) units += 0.34;
    else units += 0.58;
  }
  return units * fontSize;
}

function ellipsize(value: string, maxWidth: number, fontSize: number) {
  const characters = [...value.replace(/…+$/, "")];
  while (characters.length && estimateTextWidth(`${characters.join("")}…`, fontSize) > maxWidth) characters.pop();
  return `${characters.join("")}…`;
}

function safeToken(token: string, maxWidth: number, fontSize: number) {
  return estimateTextWidth(token, fontSize) <= maxWidth
    ? { value: token, truncated: false }
    : { value: ellipsize(token, maxWidth, fontSize), truncated: true };
}

export function layoutText(text: string, maxWidth: number, fontSize: number, maxLines: number): TextLayout {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let truncated = false;
  for (let index = 0; index < words.length; index += 1) {
    const token = safeToken(words[index], maxWidth, fontSize);
    truncated ||= token.truncated;
    if (!lines.length) {
      lines.push(token.value);
      continue;
    }
    const candidate = `${lines.at(-1)} ${token.value}`;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
      lines[lines.length - 1] = candidate;
      continue;
    }
    if (lines.length < maxLines) {
      lines.push(token.value);
      continue;
    }
    lines[lines.length - 1] = ellipsize(lines.at(-1) || "", maxWidth, fontSize);
    truncated = true;
    break;
  }
  return { lines, fontSize, truncated };
}

export function fitTextBlock(text: string, maxWidth: number, startSize: number, minSize: number, maxLines: number): TextLayout {
  for (let size = startSize; size >= minSize; size -= 2) {
    const layout = layoutText(text, maxWidth, size, maxLines);
    if (!layout.truncated) return layout;
  }
  return layoutText(text, maxWidth, minSize, maxLines);
}

export function creativeTextLayouts(fields: { headline: string; hook: string; schedule: string; location?: string; cta: string }) {
  const spec = CREATIVE_TEXT_SPEC;
  return {
    headline: fitTextBlock(fields.headline, spec.maxWidth, spec.headline.startSize, spec.headline.minSize, spec.headline.maxLines),
    hook: layoutText(fields.hook, spec.maxWidth, spec.hook.fontSize, spec.hook.maxLines),
    detail: layoutText([fields.schedule, fields.location].filter(Boolean).join(" · "), spec.maxWidth, spec.detail.fontSize, spec.detail.maxLines),
    cta: layoutText(fields.cta.toUpperCase(), spec.maxWidth, spec.cta.fontSize, spec.cta.maxLines),
  };
}
