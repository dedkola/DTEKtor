import { type NextRequest, NextResponse } from "next/server";

import { normalizeLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "dtektor_lang";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** GET ?set=en|ru -> remember the language and go back to "/". */
export function GET(request: NextRequest) {
  const lang = normalizeLang(request.nextUrl.searchParams.get("set"));
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(COOKIE, lang, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return res;
}
