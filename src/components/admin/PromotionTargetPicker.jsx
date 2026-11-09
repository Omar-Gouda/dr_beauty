"use client";

import { useMemo, useState } from "react";

const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";

export default function PromotionTargetPicker({ label, options, selectedIds, onChange, disabled = false }) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((option) => !normalized ||
      `${option.name} ${option.slug}`.toLowerCase().includes(normalized));
  }, [options, query]);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 rounded-2xl border border-[var(--color-border)] p-3">
      <legend className="px-1 text-xs font-semibold">{label} <span className="font-normal text-[var(--color-text-secondary)]">({selected.size} selected)</span></legend>
      <input type="search" aria-label={`Search ${label.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} className={inputClass} />
      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl bg-[var(--color-background)] p-2" role="group" aria-label={label}>
        {filteredOptions.length ? filteredOptions.map((option) => (
          <label key={option.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-[var(--color-surface)]">
            <input type="checkbox" checked={selected.has(option.id)} onChange={() => toggle(option.id)} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" />
            <span className="min-w-0 break-words">{option.name}<span className="ml-1 text-[var(--color-text-secondary)]">/{option.slug}</span>{option.is_active === false && <span className="ml-1 text-[var(--color-text-secondary)]">(inactive)</span>}</span>
          </label>
        )) : <p className="px-2 py-3 text-xs text-[var(--color-text-secondary)]">No matching options.</p>}
      </div>
    </fieldset>
  );
}
