/* eslint-disable @next/next/no-img-element */
import { cookies } from "next/headers";

import AutoRefresh from "@/components/AutoRefresh";
import LangSwitch from "@/components/LangSwitch";
import RefreshButton from "@/components/RefreshButton";
import { normalizeLang, t, type Dict, type Lang } from "@/lib/i18n";
import { shotSlug } from "@/lib/shots";
import { readDashboard, type DashboardColumn, type DayInfo } from "@/lib/state";
import { KYIV_TZ } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const lang = normalizeLang(cookieStore.get("dtektor_lang")?.value);
  const L = t(lang);

  const columns = await readDashboard();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <AutoRefresh seconds={60} />

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">DTEKtor</h1>
          <p className="text-sm text-slate-500">{L.tagline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RefreshButton label={L.refresh} />
          <LangSwitch lang={lang} />
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        {columns.map((col) => (
          <AddressColumn key={`${col.street}/${col.building}`} col={col} lang={lang} L={L} />
        ))}
      </div>

      <Screenshots columns={columns} L={L} />

      <footer className="mt-10 text-center text-xs text-slate-400">{L.footer}</footer>
    </main>
  );
}

function AddressColumn({ col, lang, L }: { col: DashboardColumn; lang: Lang; L: Dict }) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {L.addressLabel}
        </div>
        <div className="truncate text-lg font-semibold text-slate-900">
          {col.street} {col.building}
        </div>
      </div>

      {col.state ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DayCard title={L.todayTitle} day={col.state.today} L={L} />
            <DayCard title={L.tomorrowTitle} day={col.state.tomorrow} L={L} />
          </div>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stamp label={L.updatedLabel} value={formatStamp(col.state.updated, lang, L.noData)} />
            <Stamp
              label={L.graphLabel}
              value={formatStamp(col.state.graphUpdated, lang, L.noData)}
            />
            <Stamp
              label={L.checkedLabel}
              value={formatStamp(col.state.checkedAt, lang, L.noData)}
            />
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          {L.waitingIntro}
        </div>
      )}
    </section>
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

function Screenshots({ columns, L }: { columns: DashboardColumn[]; L: Dict }) {
  const items = columns
    .map((col) => ({ col, slug: shotSlug(col.street) }))
    .filter((x): x is { col: DashboardColumn; slug: string } => x.slug !== null);
  if (items.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-slate-700">{L.screenshotTitle}</h2>
      <p className="mt-1 text-xs text-slate-400">{L.screenshotHint}</p>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map(({ col, slug }) => (
          <figure
            key={slug}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <figcaption className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <span className="truncate text-xs font-medium text-slate-600">
                {col.street} {col.building}
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                {L.screenshotClickHint}
              </span>
            </figcaption>
            <a
              href={`/api/screenshot/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <img
                src={`/api/screenshot/${slug}`}
                alt={`DTEK outage graph — ${col.street} ${col.building}`}
                className="block w-full bg-slate-50 transition hover:opacity-90"
              />
            </a>
          </figure>
        ))}
      </div>
    </section>
  );
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
