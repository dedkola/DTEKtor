"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { t, type Lang } from "@/lib/i18n";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder-slate-400 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export type AddressFormProps = {
  lang: Lang;
  initial?: { street?: string; building?: string; label?: string | null } | null;
  /** Called after a successful save; defaults to refreshing the server data. */
  onSaved?: () => void;
};

export default function AddressForm({ lang, initial, onSaved }: AddressFormProps) {
  const L = t(lang);
  const router = useRouter();

  const [street, setStreet] = useState(initial?.street ?? "");
  const [building, setBuilding] = useState(initial?.building ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!street.trim() || !building.trim()) {
      setError(L.errorRequired);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          street: street.trim(),
          building: building.trim(),
          label: label.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) throw new Error("save_failed");

      setSaved(true);
      if (onSaved) onSaved();
      else router.refresh();
    } catch {
      setError(L.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {L.streetLabel}
          </span>
          <input
            className={inputCls}
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Хрещатик"
            autoComplete="address-line1"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {L.buildingLabel}
          </span>
          <input
            className={inputCls}
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            placeholder="12"
            autoComplete="address-line2"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          {L.labelLabel}
        </span>
        <input
          className={inputCls}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={L.labelPlaceholder}
        />
      </label>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {busy ? L.saving : L.save}
        </button>
        {saved && !busy ? (
          <span className="text-sm font-medium text-emerald-600">{L.saved}</span>
        ) : null}
      </div>
    </form>
  );
}
