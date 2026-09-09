import type { Asset } from "./client-types";

export async function uploadAsset(file: File) {
  const bitmap = await createImageBitmap(file);
  const form = new FormData();
  form.set("file", file);
  form.set("width", String(bitmap.width));
  form.set("height", String(bitmap.height));
  form.set("title", file.name.replace(/\.[^.]+$/, ""));
  form.set("altText", `Sun Oaks campaign image: ${file.name.replace(/\.[^.]+$/, "")}`);
  bitmap.close();
  const response = await fetch("/studio/api/assets/upload", { method: "POST", body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The image could not be uploaded.");
  return body.asset as Asset;
}

