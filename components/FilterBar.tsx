"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const ROOM_OPTIONS = ["1", "2", "3", "4", "5+"];

export function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [district, setDistrict] = useState(params.get("district") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const rooms = params.get("rooms") ?? "";
  const source = params.get("source") ?? "";

  const hasFilters = Boolean(
    params.get("district") || params.get("min") || params.get("max") || rooms || source
  );

  function apply(overrides: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    const values: Record<string, string> = {
      district: district.trim(),
      min: min.trim(),
      max: max.trim(),
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // filter change resets pagination
    startTransition(() => {
      router.push(next.size ? `/?${next.toString()}` : "/");
    });
  }

  return (
    <form
      className="rounded-2xl bg-white p-4 ring-1 ring-stone-200"
      onSubmit={(e) => {
        e.preventDefault();
        apply({});
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[1fr_repeat(3,minmax(0,0.6fr))_auto]">
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-xs font-medium text-stone-500">District</span>
          <input
            type="text"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder="e.g. Saburtalo / საბურთალო"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-500">Min $</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="0"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-500">Max $</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="Any"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-500">Source</span>
          <select
            value={source}
            onChange={(e) => apply({ source: e.target.value })}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">All sources</option>
            <option value="myhome">myhome.ge</option>
            <option value="ss">ss.ge</option>
          </select>
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-1">
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Search
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setDistrict("");
                setMin("");
                setMax("");
                startTransition(() => router.push("/"));
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-stone-500 transition hover:text-stone-800"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-stone-500">Rooms:</span>
        <button
          type="button"
          onClick={() => apply({ rooms: "" })}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
            rooms === ""
              ? "bg-stone-900 text-white ring-stone-900"
              : "bg-white text-stone-600 ring-stone-300 hover:ring-stone-400"
          }`}
        >
          Any
        </button>
        {ROOM_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => apply({ rooms: r })}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
              rooms === r
                ? "bg-stone-900 text-white ring-stone-900"
                : "bg-white text-stone-600 ring-stone-300 hover:ring-stone-400"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </form>
  );
}
