export default function AdminPageHeader({ eyebrow = "DR. BEAUTY · ADMIN", title, description, actions }) {
  return (
    <header className="flex flex-col justify-between gap-5 border-b border-[var(--color-border)] pb-6 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">{eyebrow}</p>
        <h1 className="font-editorial text-3xl font-bold leading-tight text-[var(--color-text)] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
