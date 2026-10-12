import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { ensureSchema, linkWatch, upsertAddress } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "dtektor_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** POST {street, building, label?} -> upsert address + link the visitor cookie. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { street?: unknown; building?: unknown; label?: unknown }
    | null;

  const street = String(body?.street ?? "").trim();
  const building = String(body?.building ?? "").trim();
  const label = body?.label != null ? String(body.label).trim() : "";

  if (!street || !building) {
    return NextResponse.json(
      { ok: false, error: "street_and_building_required" },
      { status: 400 },
    );
  }

  await ensureSchema();

  const addressId = await upsertAddress(street, building, label || null);

  const existing = request.cookies.get(COOKIE)?.value;
  const cookieId = existing && existing.length > 0 ? existing : randomUUID();
  await linkWatch(addressId, cookieId);

  const res = NextResponse.json({ ok: true, address_id: addressId });
  res.cookies.set(COOKIE, cookieId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return res;
}
