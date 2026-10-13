/** One-way server events. Reads never overlap; disconnects release all timers. */
export function createLiveStream(
  signal: AbortSignal,
  readRevision: () => Promise<string>,
  intervalMs = 5_000,
) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let stop = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        controller.close();
      };
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) {
        stop();
        return;
      }

      let previous: string | undefined;
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      async function tick() {
        try {
          const revision = await readRevision();
          if (stopped) return;
          const event = revision !== previous
            ? `event: revision\ndata: ${revision}\n\n`
            : "event: heartbeat\ndata: {}\n\n";
          controller.enqueue(encoder.encode(event));
          previous = revision;
          timer = setTimeout(tick, intervalMs);
        } catch {
          // EventSource reconnects automatically; the client also has a fallback.
          stop();
        }
      }
      void tick();
    },
    cancel() {
      // Cancellation already closes the controller.
      stopped = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    },
  });
}
