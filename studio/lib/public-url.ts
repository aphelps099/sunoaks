import type { NextRequest } from "next/server";

export function studioPublicOrigin(request: Pick<NextRequest, "headers" | "nextUrl">) {
  const configured = process.env.PUBLIC_STUDIO_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "").replace(/\/studio$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

export function reviewUrl(request: Pick<NextRequest, "headers" | "nextUrl">, token: string) {
  return `${studioPublicOrigin(request)}/studio/review/${encodeURIComponent(token)}`;
}
