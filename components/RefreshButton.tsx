"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Small icon+label button that re-fetches the server data in place. */
export default function RefreshButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spin, setSpin] = useState(false);

  function onClick() {
    setSpin(true);
    startTransition(() => router.refresh());
    setTimeout(() => setSpin(false), 600);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
    >
      <svg
        className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      {label}
    </button>
  );
}
