"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes the server components on an interval without a full page reload
 * (keeps scroll position and form state). Renders nothing.
 */
export default function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), Math.max(5, seconds) * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
