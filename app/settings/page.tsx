"use client";

import { useCallback, useEffect, useState } from "react";

import AddressForm from "@/components/AddressForm";
import LangSwitch from "@/components/LangSwitch";
import { normalizeLang, t, type Lang } from "@/lib/i18n";

type AddressInfo = {
  id: number;
  street: string;
  building: string;
  label: string | null;
};

type StateResponse = { address: AddressInfo | null };

function readLangCookie(): Lang {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)dtektor_lang=([^;]+)/);
  return normalizeLang(m ? decodeURIComponent(m[1]) : null);
}

export default function SettingsPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      setState((await res.json()) as StateResponse);
    } catch {
      setState({ address: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLang(readLangCookie());
    void load();
  }, [load]);

  const L = t(lang);
  const address = state?.address ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {L.settingsTitle}
          </h1>
          <p className="text-sm text-slate-500">{L.tagline}</p>
        </div>
        <LangSwitch lang={lang} />
      </header>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {L.currentAddress}
          </div>
          <div className="text-lg font-semibold text-slate-900">
            {loading
              ? "…"
              : address
                ? `${address.street} ${address.building}`
                : L.notSet}
          </div>
        </div>

        <AddressForm lang={lang} initial={address} onSaved={() => void load()} />

        <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
          {L.settingsNote}
        </p>
      </section>

      <div className="mt-6">
        <a
          href="/"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
        >
          ← {L.backToDashboard}
        </a>
      </div>
    </main>
  );
}
