import { readDashboardSnapshot } from "@/lib/dashboard-snapshot";
import { createLiveStream } from "@/lib/live-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const stream = createLiveStream(request.signal, async () => (await readDashboardSnapshot()).revision);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
