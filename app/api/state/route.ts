import { type NextRequest, NextResponse } from "next/server";

import { readState } from "@/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> dashboard state for the visitor cookie (or {address:null}). */
export async function GET(request: NextRequest) {
  const cookieId = request.cookies.get("dtektor_id")?.value ?? null;
  const state = await readState(cookieId);
  return NextResponse.json(state, {
    headers: { "cache-control": "no-store" },
  });
}
