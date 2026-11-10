"use client";

import { useMemo, useState } from "react";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import Button from "@/components/ui/Button";

const chartWidth = 960;
const chartHeight = 260;
const left = 56;
const right = 12;
const top = 14;
const bottom = 34;

function formatCurrency(value) {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function AdminSalesChart({ series, previousSeries = [], range, rangeLabel, unavailable = false }) {
  const [mode, setMode] = useState("revenue");
  const { points, previousPoints, maxValue } = useMemo(() => {
    const source = series ?? [];
    const previousSource = previousSeries ?? [];
    const max = Math.max(1, ...source.map((point) => Number(point[mode]) || 0), ...previousSource.map((point) => Number(point[mode]) || 0));
    const plotWidth = chartWidth - left - right;
    const plotHeight = chartHeight - top - bottom;
    const getX = (date, periodStart, periodEnd) => {
      const span = Date.parse(periodEnd) - Date.parse(periodStart);
      const fraction = span > 0 ? (Date.parse(date) - Date.parse(periodStart)) / span : 0.5;
      return left + Math.max(0, Math.min(1, fraction)) * plotWidth;
    };
    const getY = (point) => top + plotHeight - (Number(point[mode]) || 0) / max * plotHeight;
    const points = source.map((point) => ({
      ...point,
      x: getX(point.date, range.start, range.end),
      y: getY(point),
      value: Number(point[mode]) || 0,
    }));
    const previousPoints = previousSource.map((point) => ({
      ...point,
      x: getX(point.date, range.previousStart, range.previousEnd),
      y: getY(point),
      value: Number(point[mode]) || 0,
    })).slice(0, points.length);
    return { points, previousPoints, maxValue: max };
  }, [series, previousSeries, mode, range]);
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const previousPath = previousPoints.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const ticks = [0, 0.5, 1].map((fraction) => ({ y: top + (chartHeight - top - bottom) * (1 - fraction), value: maxValue * fraction }));

  if (unavailable) return <AdminEmptyState title="Sales series unavailable" description="The selected range is too large for a safe live calculation. A database-side aggregate is needed for this range." />;
  if (!points.length) return <AdminEmptyState title="No order activity in this period" description="Try a wider date range to see sales and order volume." />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-secondary)]">
          <p>{mode === "revenue" ? "Delivered order value by order date" : "Orders placed"} · {rangeLabel} · UTC</p>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-[var(--color-primary)]" />Selected period</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-[var(--color-text-secondary)]" />Previous period</span>
        </div>
        <div className="flex gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] p-1" aria-label="Chart metric">
          <Button type="button" size="sm" variant={mode === "revenue" ? "primary" : "ghost"} className="min-h-9 px-3 text-xs" aria-pressed={mode === "revenue"} onClick={() => setMode("revenue")}>Revenue</Button>
          <Button type="button" size="sm" variant={mode === "orders" ? "primary" : "ghost"} className="min-h-9 px-3 text-xs" aria-pressed={mode === "orders"} onClick={() => setMode("orders")}>Orders</Button>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${mode === "revenue" ? "Delivered revenue" : "Order volume"} over ${rangeLabel}`} className="h-56 min-w-[620px] w-full overflow-visible sm:h-64">
          {ticks.map((tick) => <g key={tick.y}>
            <line x1={left} y1={tick.y} x2={chartWidth - right} y2={tick.y} stroke="var(--color-border)" strokeDasharray="3 5" />
            <text x={left - 9} y={tick.y + 4} textAnchor="end" fill="var(--color-text-secondary)" fontSize="10">{mode === "revenue" ? formatCurrency(tick.value) : Math.round(tick.value)}</text>
          </g>)}
          {previousPath && <path d={previousPath} fill="none" stroke="var(--color-text-secondary)" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />}
          {path && <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          {previousPoints.map((point) => <g key={`previous-${point.date}`}>
            <circle cx={point.x} cy={point.y} r="3" fill="var(--color-surface)" stroke="var(--color-text-secondary)" strokeOpacity="0.7" strokeWidth="2">
              <title>{`Previous period ${point.label}: ${mode === "revenue" ? formatCurrency(point.value) : point.value} ${mode === "revenue" ? "delivered revenue" : "orders"}`}</title>
            </circle>
          </g>)}
          {points.map((point) => <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="10" fill="transparent" />
            <circle cx={point.x} cy={point.y} r="4" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="2.5">
              <title>{`${point.label}: ${mode === "revenue" ? formatCurrency(point.value) : point.value} ${mode === "revenue" ? "delivered revenue" : "orders"}`}</title>
            </circle>
          </g>)}
          {points.filter((_, index) => index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2)).map((point) => <text key={`label-${point.date}`} x={point.x} y={chartHeight - 6} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="10">{point.label}</text>)}
        </svg>
      </div>
      <ul className="sr-only" aria-label="Chart data">
        {points.map((point) => <li key={`data-${point.date}`}>{point.label}: {mode === "revenue" ? formatCurrency(point.value) : point.value}</li>)}
        {previousPoints.map((point) => <li key={`previous-data-${point.date}`}>Previous period {point.label}: {mode === "revenue" ? formatCurrency(point.value) : point.value}</li>)}
      </ul>
    </div>
  );
}
