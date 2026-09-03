import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { repository } from "@/lib/store";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function uploadDirectory() {
  const dataPath = process.env.STUDIO_DATA_PATH || path.join(process.cwd(), "data", "studio.json");
  return process.env.STUDIO_UPLOAD_PATH || path.join(path.dirname(dataPath), "uploads");
}

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { assetId } = await context.params;
  const db = await repository.read();
  if (!db.assets.some((asset) => asset.id === assetId && asset.fileReference === `/studio/api/assets/${assetId}`)) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
  for (const [extension, type] of Object.entries(TYPES)) {
    try {
      const body = await readFile(/* turbopackIgnore: true */ path.join(uploadDirectory(), `${assetId}.${extension}`));
      return new NextResponse(body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable" } });
    } catch {}
  }
  return NextResponse.json({ error: "Image file not found." }, { status: 404 });
}
