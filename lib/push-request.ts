import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

export const PUSH_COOKIE = "dtektor_push_id";

export function pushBrowserId(request: NextRequest) {
  const value = request.cookies.get(PUSH_COOKIE)?.value;
  return value && /^[a-f0-9-]{36}$/.test(value) ? value : null;
}

export function sameOriginPushRequest(request: NextRequest) {
  return (
    request.headers.get("origin") === request.nextUrl.origin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}

export function pushResponse(body: unknown, status = 200, cookieId?: string) {
  const response = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  if (cookieId)
    response.cookies.set(PUSH_COOKIE, cookieId, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  return response;
}

export function newPushBrowserId() {
  return randomUUID();
}
