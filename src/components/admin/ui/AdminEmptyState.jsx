import { Inbox } from "lucide-react";

export default function AdminEmptyState({ title, description, icon: Icon = Inbox, className = "" }) {
  return (
    <div className={`rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-5 py-8 text-center ${className}`}>
      <Icon aria-hidden="true" className="mx-auto h-7 w-7 text-[var(--color-primary)]" />
      <h3 className="mt-3 font-semibold text-[var(--color-text)]">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-text-secondary)]">{description}</p>}
    </div>
  );
}
