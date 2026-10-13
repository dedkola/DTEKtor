"use client";

import { useEffect, useState } from "react";

type PushState = {
  configured: boolean;
  publicKey: string | null;
  endpoint: string | null;
};
type BrowserState = {
  server: PushState;
  registration: ServiceWorkerRegistration;
  subscription: PushSubscription | null;
};
const BUTTON =
  "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-default disabled:opacity-50";

function publicKeyBytes(key: string) {
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function usesKey(subscription: PushSubscription, key: string | null) {
  if (!key || !subscription.options.applicationServerKey) return false;
  return (
    Array.from(new Uint8Array(subscription.options.applicationServerKey)).join(
      ",",
    ) === Array.from(publicKeyBytes(key)).join(",")
  );
}

export default function PushNotifications() {
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  const [status, setStatus] = useState("Проверяем поддержку уведомлений…");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const [installHint, setInstallHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const needsInstall =
        ios && !window.matchMedia("(display-mode: standalone)").matches;
      setInstallHint(needsInstall);
      if (
        !window.isSecureContext ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window) ||
        needsInstall
      ) {
        setStatus(
          needsInstall
            ? "Для уведомлений установите DTEKtor на экран «Домой»."
            : "Уведомления доступны в поддерживаемом браузере через HTTPS.",
        );
        setReady(true);
        return;
      }
      try {
        const response = await fetch("/api/push", { cache: "no-store" });
        if (!response.ok) throw new Error("load_failed");
        const server: PushState = await response.json();
        if (!server.configured) {
          if (!cancelled) {
            setStatus("Уведомления пока не настроены на сервере.");
            setReady(true);
          }
          return;
        }
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;
        const subscribed =
          !!subscription &&
          subscription.endpoint === server.endpoint &&
          usesKey(subscription, server.publicKey) &&
          Notification.permission === "granted";
        setBrowser({ server, registration, subscription });
        setEnabled(subscribed);
        setStatus(
          Notification.permission === "denied"
            ? "Уведомления заблокированы. Разрешите их в настройках сайта в браузере."
            : subscribed
              ? "Уведомления включены в этом браузере."
              : "Получайте изменения графиков для всех адресов, даже когда страница закрыта.",
        );
        setCanRetry(false);
        setReady(true);
      } catch {
        if (!cancelled) {
          setStatus("Не удалось проверить уведомления. Попробуйте ещё раз.");
          setCanRetry(true);
          setReady(true);
        }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  async function enable() {
    if (!browser?.server.publicKey) return;
    setBusy(true);
    let created: PushSubscription | null = null;
    try {
      // Ask directly from the click, as required by Safari and other browsers.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(
          permission === "denied"
            ? "Уведомления заблокированы. Разрешите их в настройках сайта в браузере."
            : "Разрешение не получено. Нажмите «Включить», чтобы попробовать снова.",
        );
        return;
      }
      let subscription =
        await browser.registration.pushManager.getSubscription();
      if (subscription && !usesKey(subscription, browser.server.publicKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await browser.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKeyBytes(browser.server.publicKey),
        });
        created = subscription;
      }
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("save_failed");
      setBrowser({ ...browser, subscription });
      setEnabled(true);
      setStatus("Уведомления включены в этом браузере.");
    } catch {
      await created?.unsubscribe().catch(() => {});
      setStatus(
        "Не удалось включить уведомления. Проверьте соединение и попробуйте снова.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!browser) return;
    setBusy(true);
    try {
      const response = await fetch("/api/push", { method: "DELETE" });
      if (!response.ok) throw new Error("delete_failed");
      await browser.subscription?.unsubscribe().catch(() => {});
      setBrowser({ ...browser, subscription: null });
      setEnabled(false);
      setStatus("Уведомления отключены в этом браузере.");
    } catch {
      setStatus("Не удалось отключить уведомления. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      if (response.status === 429) {
        setStatus("Повторная проверка доступна через минуту.");
        return;
      }
      if (!response.ok) throw new Error("test_failed");
      setStatus("Проверочное уведомление отправлено в очередь доставки.");
    } catch {
      setStatus("Не удалось отправить проверку. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Уведомления"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 className="text-sm font-bold text-slate-900">Уведомления</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Новые графики, изменения и публикация графика на завтра.
      </p>
      <p role="status" className="mt-2 text-xs leading-5 text-slate-600">
        {status}
      </p>
      {installHint ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          В Safari откройте «Поделиться» → «На экран Домой», затем включите
          уведомления в установленном приложении.
        </p>
      ) : null}
      {ready && browser ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={enabled ? disable : enable}
          >
            {busy ? "Подождите…" : enabled ? "Отключить" : "Включить"}
          </button>
          {enabled ? (
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={test}
            >
              Проверить уведомление
            </button>
          ) : null}
        </div>
      ) : null}
      {canRetry ? (
        <button
          type="button"
          className={`${BUTTON} mt-3`}
          onClick={() => {
            setCanRetry(false);
            setRetry((value) => value + 1);
          }}
        >
          Повторить
        </button>
      ) : null}
    </section>
  );
}
