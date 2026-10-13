import { after, type NextRequest } from "next/server";
import {
  pushBrowserId,
  pushResponse,
  sameOriginPushRequest,
} from "@/lib/push-request";
import {
  enqueuePushTest,
  flushPushQueue,
  pushConfiguration,
} from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!sameOriginPushRequest(request))
    return pushResponse({ error: "forbidden" }, 403);
  const cookieId = pushBrowserId(request);
  if (!cookieId)
    return pushResponse({ error: "browser_session_required" }, 401);
  if (!pushConfiguration())
    return pushResponse({ error: "push_not_configured" }, 503);
  const result = await enqueuePushTest(cookieId);
  if (result === "missing")
    return pushResponse({ error: "subscription_required" }, 404);
  if (result === "rate_limited")
    return pushResponse({ error: "try_in_one_minute" }, 429);
  after(() => flushPushQueue());
  return pushResponse({ ok: true }, 202);
}
