/* Push-only worker: schedules and screenshots always come from the network. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { /* Always show a visible notification. */ }
  event.waitUntil(self.registration.showNotification(message.title || "Обновлён график ДТЕК", {
    body: message.body || "Откройте DTEKtor, чтобы посмотреть актуальный график.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge.png",
    tag: message.tag || "dtektor-schedule",
    renotify: true,
    data: { url: message.url || "/" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    let url = new URL("/", self.location.origin);
    try {
      const requested = new URL(event.notification.data?.url || "/", self.location.origin);
      if (requested.origin === self.location.origin) url = requested;
    } catch { /* Use the dashboard. */ }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && "focus" in client) {
        await client.navigate(url.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(url.href);
  })());
});
