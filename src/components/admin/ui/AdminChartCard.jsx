import AdminCard from "@/components/admin/ui/AdminCard";

export default function AdminChartCard({ title, description, actions, children, className = "" }) {
  return (
    <AdminCard className={`p-4 sm:p-6 ${className}`}>
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h2 className="font-editorial text-xl font-bold text-[var(--color-text)] sm:text-2xl">{title}</h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </AdminCard>
  );
}
