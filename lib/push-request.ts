import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

export const PUSH_COOKIE = "dtektor_push_id";

export function pushBrowserId(request: NextRequest) {
  const value = request.cookies.get(PUSH_COOKIE)?.value;
  return value && /^[a-f0-9-]{36}$/.test(value) ? value : null;
}

export function sameOriginPushRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site")
    return false;

  // next start constructs nextUrl using its listening hostname (localhost),
  // even when a reverse proxy preserves the public Host header. Compare against
  // that incoming host and the proxy's original protocol instead.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    request.nextUrl.protocol.slice(0, -1);
  if (
    !host ||
    /[\/\\?#@,\s]/.test(host) ||
    !["http", "https"].includes(protocol)
  )
    return false;
  try {
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
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
