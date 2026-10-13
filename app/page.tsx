import { cookies } from "next/headers";

import AddressForm from "@/components/AddressForm";
import AutoRefresh from "@/components/AutoRefresh";
import LangSwitch from "@/components/LangSwitch";
import { normalizeLang, t, type Dict, type Lang } from "@/lib/i18n";
import { readState, type AddressInfo, type DayInfo } from "@/lib/state";
import { KYIV_TZ } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const lang = normalizeLang(cookieStore.get("dtektor_lang")?.value);
  const cookieId = cookieStore.get("dtektor_id")?.value ?? null;
  const L = t(lang);

  const state = await readState(cookieId);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">DTEKtor</h1>
          <p className="text-sm text-slate-500">{L.tagline}</p>
        </div>
        <LangSwitch lang={lang} />
      </header>

      {state.address ? (
        <Dashboard state={state} lang={lang} L={L} />
      ) : (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">{L.setupTitle}</h2>
          <p className="mt-1 mb-5 text-sm text-slate-500">{L.setupIntro}</p>
          <AddressForm lang={lang} />
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-slate-400">{L.footer}</footer>
    </main>
  );
}

function Dashboard({
  state,
  lang,
  L,
}: {
  state: Extract<Awaited<ReturnType<typeof readState>>, { address: AddressInfo }>;
  lang: Lang;
  L: Dict;
}) {
  const stamp = (iso: string | null) => formatStamp(iso, lang, L.noData);

  return (
    <div className="mt-8 space-y-4">
      <AutoRefresh seconds={60} />
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {L.addressLabel}
            </div>
            <div className="truncate text-lg font-semibold text-slate-900">
              {addressLabel(state.address)}
            </div>
          </div>
          <a
            href="/settings"
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {L.changeAddress}
          </a>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DayCard title={L.todayTitle} day={state.today} L={L} />
        <DayCard title={L.tomorrowTitle} day={state.tomorrow} L={L} />
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stamp label={L.updatedLabel} value={stamp(state.updated)} />
        <Stamp label={L.graphLabel} value={stamp(state.graphUpdated)} />
        <Stamp label={L.checkedLabel} value={stamp(state.checkedAt)} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{L.historyTitle}</h2>
        <div className="mt-4 flex items-end gap-2">
          {state.history.map((h) => (
            <div key={h.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="h-4 text-[10px] font-medium text-slate-500">
                {h.offHours > 0 ? `${h.offHours}${L.hoursShort}` : ""}
              </div>
              <div className="flex h-16 w-full items-end overflow-hidden rounded bg-slate-100">
                <div
                  className="w-full rounded bg-slate-800"
                  style={{ height: `${Math.min(100, (h.offHours / 24) * 100)}%` }}
                />
              </div>
              <div className="text-[10px] font-medium text-slate-500">
                {weekdayShort(h.day, lang)}
              </div>
              <div className="text-[10px] text-slate-400">{h.day.slice(5)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DayCard({ title, day, L }: { title: string; day: DayInfo; L: Dict }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {day.windows.length > 0 ? (
          <span className="text-xs text-slate-400">
            {day.windows.length} {L.windowLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        {day.upcoming.length === 0 ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {L.noOutages}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {day.upcoming.map((w) => (
              <span
                key={w}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 ring-1 ring-slate-200"
              >
                {w}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Stamp({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function addressLabel(a: AddressInfo): string {
  const base = `${a.street} ${a.building}`.trim();
  return a.label ? `${base} · ${a.label}` : base;
}

function formatStamp(iso: string | null, lang: Lang, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    timeZone: KYIV_TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function weekdayShort(day: string, lang: Lang): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    weekday: "short",
    timeZone: "UTC",
  }).format(dt);
}
