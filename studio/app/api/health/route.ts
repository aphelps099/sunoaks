import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "sun-oaks-marketing-studio" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
