import { NextResponse } from "next/server";
import { readHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    return NextResponse.json(await readHealth(), { headers });
  } catch {
    return NextResponse.json({
      ready: false,
      buildSha: process.env.DTEKTOR_BUILD_SHA || "unknown",
      collection: null,
    }, { status: 503, headers });
  }
}
