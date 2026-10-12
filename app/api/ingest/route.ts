import { type NextRequest, NextResponse } from "next/server";

import { ensureSchema, ingest, type IngestBody } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST collector payload.
 * Requires header `x-ingest-secret: <INGEST_SECRET>` when INGEST_SECRET is set.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_SECRET?.trim();
  if (secret) {
    const provided = request.headers.get("x-ingest-secret");
    if (!provided || provided !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const body = (await request.json().catch(() => null)) as IngestBody | null;
  const street = String(body?.address?.street ?? "").trim();
  const building = String(body?.address?.building ?? "").trim();
  if (!street || !building) {
    return NextResponse.json({ ok: false, error: "address_required" }, { status: 400 });
  }

  await ensureSchema();

  try {
    const result = await ingest(body as IngestBody);
    return NextResponse.json({ ok: true, address_id: result.address_id });
  } catch {
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }
}
