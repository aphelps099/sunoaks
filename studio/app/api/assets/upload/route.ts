import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { assetSchema } from "@/lib/domain";
import { repository } from "@/lib/store";

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function uploadDirectory() {
  const dataPath = process.env.STUDIO_DATA_PATH || path.join(process.cwd(), "data", "studio.json");
  return process.env.STUDIO_UPLOAD_PATH || path.join(path.dirname(dataPath), "uploads");
}

export async function POST(request: Request) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  const extension = EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Images must be 10 MB or smaller." }, { status: 400 });
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return NextResponse.json({ error: "The image dimensions could not be verified." }, { status: 400 });
  }
  const id = randomUUID();
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(/* turbopackIgnore: true */ path.join(directory, `${id}.${extension}`), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
  const asset = assetSchema.parse({
    id,
    assetType: "image",
    fileReference: `/studio/api/assets/${id}`,
    title: String(form.get("title") || file.name.replace(/\.[^.]+$/, "")).slice(0, 160),
    altText: String(form.get("altText") || "Sun Oaks campaign image").slice(0, 300),
    width,
    height,
    subjects: [],
    usageTags: ["campaign", "social"],
    focalPoint: { x: 0.5, y: 0.5 },
    rightsStatus: "approved",
    active: true,
  });
  await repository.update((db) => { db.assets.push(asset); });
  return NextResponse.json({ ok: true, asset });
}
