"use client";

import { useEffect, useEffectEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes on server changes without losing scroll position or address order.
 * EventSource reconnects automatically; an unhealthy stream falls back to polling.
 */
export default function AutoRefresh({ revision }: { revision: string }) {
  const router = useRouter();
  const onRevision = useEffectEvent((next: string) => {
    if (next !== revision) router.refresh();
  });

  useEffect(() => {
    let lastEvent = 0;
    const events = typeof EventSource === "undefined" ? null : new EventSource("/api/events");
    events?.addEventListener("revision", (event: MessageEvent<string>) => {
      lastEvent = Date.now();
      onRevision(event.data);
    });
    events?.addEventListener("heartbeat", () => { lastEvent = Date.now(); });

    const id = setInterval(() => {
      if (!events || events.readyState !== EventSource.OPEN || Date.now() - lastEvent > 45_000) {
        router.refresh();
      }
    }, 60_000);
    const catchUp = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("online", catchUp);
    return () => {
      events?.close();
      clearInterval(id);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
    };
  }, [router]);

  return null;
}
