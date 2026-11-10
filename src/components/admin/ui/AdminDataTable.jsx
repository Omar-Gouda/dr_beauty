import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";

export default function AdminDataTable({ columns, rows, rowKey = "id", emptyTitle = "No records to show", emptyDescription, caption, className = "" }) {
  if (!rows?.length) return <AdminEmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div tabIndex={0} role="region" aria-label={caption ?? "Data table; scroll horizontally to view all columns"} className={`overflow-x-auto rounded-2xl border border-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] ${className}`}>
      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-[var(--color-background)] text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
          <tr>{columns.map((column) => <th key={column.key} scope="col" className={`px-4 py-3 ${column.className ?? ""}`}>{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
          {rows.map((row, index) => <tr key={row[rowKey] ?? index} className="align-middle hover:bg-[var(--color-background)]/60">
            {columns.map((column) => <td key={column.key} className={`px-4 py-3 ${column.cellClassName ?? ""}`}>{column.render ? column.render(row) : row[column.key]}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}
