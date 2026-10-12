import type { Lang } from "@/lib/i18n";

/** EN / RU toggle — plain links to /api/lang?set=xx which sets a cookie. */
export default function LangSwitch({ lang }: { lang: Lang }) {
  const base =
    "rounded-md px-2.5 py-1 text-xs font-semibold ring-1 transition-colors";
  const active = "bg-slate-900 text-white ring-slate-900";
  const idle = "bg-white text-slate-600 ring-slate-200 hover:bg-slate-100";
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language">
      <a
        href="/api/lang?set=en"
        className={`${base} ${lang === "en" ? active : idle}`}
        aria-current={lang === "en" ? "true" : undefined}
      >
        EN
      </a>
      <a
        href="/api/lang?set=ru"
        className={`${base} ${lang === "ru" ? active : idle}`}
        aria-current={lang === "ru" ? "true" : undefined}
      >
        RU
      </a>
    </div>
  );
}
