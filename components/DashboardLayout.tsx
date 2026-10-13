"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const ORDER_KEY = "dtektor.address-order";
const ORDER_EVENT = "dtektor:address-order";
let temporaryOrder: string | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(ORDER_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ORDER_EVENT, onChange);
  };
}

function readOrder() {
  if (temporaryOrder !== null) return temporaryOrder;
  try {
    return window.localStorage.getItem(ORDER_KEY);
  } catch {
    return temporaryOrder;
  }
}

function saveOrder(ids: string[]) {
  const value = JSON.stringify(ids);
  try {
    window.localStorage.setItem(ORDER_KEY, value);
    temporaryOrder = null;
  } catch {
    // Keep the current session usable if storage is blocked or full.
    temporaryOrder = value;
  }
  window.dispatchEvent(new Event(ORDER_EVENT));
}

type Entry = { id: string; address: string; card: ReactNode; screenshot: ReactNode };

export default function DashboardLayout({ entries, header, refresh }: {
  entries: Entry[];
  header: ReactNode;
  refresh: ReactNode;
}) {
  const savedOrder = useSyncExternalStore(subscribe, readOrder, () => null);
  let preferred: string[] = [];
  try {
    const parsed: unknown = JSON.parse(savedOrder ?? "[]");
    if (Array.isArray(parsed)) preferred = parsed.filter((id): id is string => typeof id === "string");
  } catch { /* Ignore invalid preferences and use configured order. */ }
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const ordered = [...new Set([...preferred, ...entries.map(entry => entry.id)])]
    .flatMap(id => byId.has(id) ? [byId.get(id)!] : []);

  function move(index: number, direction: number) {
    const next = ordered.map(entry => entry.id);
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    saveOrder(next);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-6">
      <div className="space-y-5">
        {header}
        {ordered.map((entry, index) => (
          <div key={entry.id} className="relative" data-address-card={entry.id}>
            {entry.card}
            <div className="absolute right-4 top-4 flex gap-1 sm:right-5 sm:top-5">
              {([-1, 1] as const).map(direction => (
                <button
                  key={direction}
                  type="button"
                  aria-label={`${entry.address}: переместить ${direction === -1 ? "вверх" : "вниз"}`}
                  title={`Переместить ${direction === -1 ? "вверх" : "вниз"}`}
                  disabled={direction === -1 ? index === 0 : index === ordered.length - 1}
                  onClick={() => move(index, direction)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-default disabled:opacity-30"
                >
                  <span aria-hidden="true">{direction === -1 ? "↑" : "↓"}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {refresh}
      </div>
      <div className="space-y-5">
        {ordered.map(entry => (
          <div key={entry.id} data-address-screenshot={entry.id}>{entry.screenshot}</div>
        ))}
      </div>
    </div>
  );
}
