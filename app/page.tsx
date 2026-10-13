/* eslint-disable @next/next/no-img-element */
import AutoRefresh from "@/components/AutoRefresh";
import RefreshButton from "@/components/RefreshButton";
import { labels as L, type Dict } from "@/lib/i18n";
import { hasShot, shotSlug } from "@/lib/shots";
import { readDashboard, type DashboardColumn } from "@/lib/state";
import { KYIV_TZ } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const columns = await readDashboard();

  return (
    <main className="w-full px-4 py-8 sm:px-6 sm:py-10">
      <AutoRefresh seconds={60} />

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">DTEKtor</h1>
          <p className="text-sm text-slate-500">{L.tagline}</p>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-6">
        <div className="space-y-5">
          {columns.map((col) => (
            <ScheduleCard key={`c-${col.street}/${col.building}`} col={col} L={L} />
          ))}
          <div className="flex items-center gap-2">
            <RefreshButton label={L.refresh} />
          </div>
        </div>

        <div className="space-y-5">
          {columns.map((col) => (
            <GraphPanel key={`g-${col.street}/${col.building}`} col={col} L={L} />
          ))}
        </div>
      </div>

      <footer className="mt-10 text-center text-xs text-slate-400">{L.footer}</footer>
    </main>
  );
}

/** Compact "Power outage schedule" card (one per address). */
function ScheduleCard({ col, L }: { col: DashboardColumn; L: Dict }) {
  const s = col.state;
  const address = `${col.street} ${col.building}`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-6">
          ⚡
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{L.cardTitle}</h2>
          <p className="truncate text-xs text-slate-500">{address}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        {s ? (
          <div className="space-y-3">
            <Row label={L.todayShort} windows={s.today.windows} empty={L.noOutagesToday} />
            <Row
              label={L.tomorrowShort}
              windows={s.tomorrow.windows}
              empty={L.noOutagesTomorrow}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">{L.waitingIntro}</p>
        )}
      </div>

      {s?.collectionProblem ? (
        <p role="status" className="mt-3 text-xs text-amber-700">
          Не удалось обновить график или данные устарели. Показан последний сохранённый график.
        </p>
      ) : null}
      {s ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${s.collectionProblem ? "text-amber-700" : "text-emerald-600"}`}>
              {s.collectionProblem ? "Данные требуют обновления" : L.upToDate}
            </span>
            <span className="text-xs text-slate-500">
              {L.checkedPrefix} {formatStamp(s.checkedAt, L.noData)}
            </span>
          </div>

        </div>
      ) : null}
    </section>
  );
}

function Row({ label, windows, empty }: { label: string; windows: string[]; empty: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {windows.length > 0 ? (
        <span className="flex flex-wrap gap-1.5">
          {windows.map((w) => (
            <span
              key={w}
              className="rounded-md bg-rose-50 px-2 py-0.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200"
            >
              {w}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-sm font-semibold text-emerald-700">{empty} ✓</span>
      )}
    </div>
  );
}

/** Wide panel holding the cropped DTEK graph capture (click to enlarge). */
async function GraphPanel({ col, L }: { col: DashboardColumn; L: Dict }) {
  const slug = shotSlug(col.street, col.building);
  const address = `${col.street} ${col.building}`;
  const available = slug ? await hasShot(slug) : false;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {L.graphPanelTitle}
        </h2>
        <span className="truncate text-xs text-slate-400">{address}</span>
      </div>

      {slug && available ? (
        <a href={`/api/screenshot/${slug}`} target="_blank" rel="noreferrer" className="block">
          <img
            src={`/api/screenshot/${slug}`}
            alt={`График отключений ДТЕК — ${address}`}
            className="block w-full bg-slate-50 transition hover:opacity-90"
          />
        </a>
      ) : (
        <div className="p-6 text-sm text-slate-400">{L.noData}</div>
      )}
    </section>
  );
}

function formatStamp(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: KYIV_TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
