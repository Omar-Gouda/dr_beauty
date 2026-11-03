import Container from "@/components/ui/Container";

export function LegalPage({ title, intro, children, notice = "Draft for owner review. Confirm all business details before publication." }) {
  return (
    <main className="section flex-1">
      <Container className="max-w-4xl">
        <header className="mb-8 rounded-3xl border border-[var(--color-border)] bg-[var(--color-primary-light)] p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-rose)]">Dr. Beauty</p>
          <h1 className="mt-3 font-editorial text-3xl font-semibold leading-tight text-[var(--color-text)] sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">{intro}</p>
        </header>

        {notice && <p className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium leading-6 text-[var(--color-text-secondary)]">{notice}</p>}

        <div className="divide-y divide-[var(--color-border)] rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 sm:px-8">
          {children}
        </div>
      </Container>
    </main>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section className="py-6 first:pt-6 sm:py-8">
      <h2 className="font-editorial text-xl font-semibold text-[var(--color-text)] sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--color-text-secondary)]">{children}</div>
    </section>
  );
}

export function OwnerConfirmation({ children }) {
  return <p className="rounded-xl border border-dashed border-[var(--color-rose)] bg-[var(--color-background)] px-4 py-3 text-sm leading-6 text-[var(--color-text)]">Owner confirmation required: {children}</p>;
}
