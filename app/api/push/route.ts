import { type NextRequest } from "next/server";
import {
  newPushBrowserId,
  pushBrowserId,
  pushResponse,
  sameOriginPushRequest,
} from "@/lib/push-request";
import {
  parsePushSubscription,
  pushConfiguration,
  pushSubscriptionForBrowser,
  removePushSubscriptions,
  savePushSubscription,
} from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const configuration = pushConfiguration();
  const cookieId = pushBrowserId(request) ?? newPushBrowserId();
  const subscription = await pushSubscriptionForBrowser(cookieId);
  return pushResponse(
    {
      configured: !!configuration,
      publicKey: configuration?.publicKey ?? null,
      endpoint:
        subscription?.vapid_public_key === configuration?.publicKey
          ? (subscription?.endpoint ?? null)
          : null,
    },
    200,
    cookieId,
  );
}

export async function POST(request: NextRequest) {
  if (!sameOriginPushRequest(request))
    return pushResponse({ error: "forbidden" }, 403);
  const cookieId = pushBrowserId(request);
  if (!cookieId)
    return pushResponse({ error: "browser_session_required" }, 401);
  const configuration = pushConfiguration();
  if (!configuration)
    return pushResponse({ error: "push_not_configured" }, 503);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return pushResponse({ error: "json_required" }, 415);
  const raw = await request.text();
  if (raw.length > 8192)
    return pushResponse({ error: "subscription_too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return pushResponse({ error: "invalid_subscription" }, 400);
  }
  const subscription = parsePushSubscription(body);
  if (!subscription)
    return pushResponse({ error: "invalid_subscription" }, 400);
  try {
    await savePushSubscription(cookieId, subscription, configuration.publicKey);
    return pushResponse({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "subscription_conflict")
      return pushResponse({ error: "subscription_conflict" }, 409);
    return pushResponse({ error: "subscription_save_failed" }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOriginPushRequest(request))
    return pushResponse({ error: "forbidden" }, 403);
  const cookieId = pushBrowserId(request);
  if (!cookieId)
    return pushResponse({ error: "browser_session_required" }, 401);
  await removePushSubscriptions(cookieId);
  return pushResponse({ ok: true });
}
