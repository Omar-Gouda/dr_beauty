"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import CustomSelect from "@/components/ui/Select";

const options = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "last90", label: "Last 90 days" },
  { value: "thisYear", label: "This year" },
  { value: "custom", label: "Custom range" },
];

export default function AdminDateRangeFilter({ range, from = "", to = "" }) {
  const router = useRouter();
  const [selectedRange, setSelectedRange] = useState(range);
  const [startDate, setStartDate] = useState(from);
  const [endDate, setEndDate] = useState(to);

  function submit(event) {
    event.preventDefault();
    const params = new URLSearchParams({ range: selectedRange });
    if (selectedRange === "custom") {
      params.set("from", startDate);
      params.set("to", endDate);
    }
    router.push(`/admin?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
      <label className="grid min-w-0 gap-1.5 text-[10px] font-semibold text-[var(--color-text-secondary)] sm:w-44">
        <span>Date range</span>
        <CustomSelect id="admin-dashboard-range" ariaLabel="Dashboard date range" options={options} value={selectedRange} onChange={setSelectedRange} />
      </label>
      {selectedRange === "custom" && <>
        <label className="grid min-w-0 gap-1.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
          <span>From</span>
          <input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} className="min-h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" />
        </label>
        <label className="grid min-w-0 gap-1.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
          <span>To</span>
          <input type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)} className="min-h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" />
        </label>
      </>}
      <Button type="submit" variant="secondary" size="sm">Apply</Button>
      <span className="text-[9px] text-[var(--color-text-secondary)]">Reporting dates use UTC.</span>
    </form>
  );
}
