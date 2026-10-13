import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { SHOTS_DIR } from "@/lib/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/screenshot/<slug> -> the latest full-page capture as PNG. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-z0-9_-]+$/.test(slug)) {
    return new NextResponse("bad slug", { status: 400 });
  }

  const file = path.join(SHOTS_DIR, `${slug}.png`);
  try {
    const buf = await fs.readFile(file);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
