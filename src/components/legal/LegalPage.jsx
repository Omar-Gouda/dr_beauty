import Container from "@/components/ui/Container";

export function LegalPage({ title, intro, effectiveDate, sections = [], children, lang = "en", dir = "ltr", alternateLanguageHref, alternateLanguageLabel }) {
  const contentsLabel = lang === "ar" ? "المحتويات" : "Contents";
  const dateLabel = lang === "ar" ? "تاريخ السريان" : "Effective date";
  return (
    <main lang={lang} dir={dir} className="section flex-1">
      <Container className="max-w-4xl">
        <header className="mb-8 rounded-3xl border border-[var(--color-border)] bg-[var(--color-primary-light)] p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-rose)]">Dr. Beauty</p>
          <h1 className="mt-3 font-editorial text-3xl font-semibold leading-tight text-[var(--color-text)] sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">{intro}</p>
          {effectiveDate && <p className="mt-4 text-xs font-semibold text-[var(--color-text)]">{dateLabel}: {effectiveDate}</p>}
          {alternateLanguageHref && <a className="mt-4 inline-flex min-h-10 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-xs font-semibold text-[var(--color-rose)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" href={alternateLanguageHref}>{alternateLanguageLabel}</a>}
        </header>

        {sections.length > 0 && <nav aria-label="Contents" className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
          <h2 className="font-editorial text-xl font-semibold text-[var(--color-text)]">{contentsLabel}</h2>
          <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {sections.map(({ id, title }) => <li key={id}><a href={`#${id}`} className="text-sm font-medium text-[var(--color-rose)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">{title}</a></li>)}
          </ol>
        </nav>}

        <div className="divide-y divide-[var(--color-border)] rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 sm:px-8">
          {children}
        </div>
      </Container>
    </main>
  );
}

export function LegalSection({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-8 py-6 first:pt-6 sm:py-8">
      <h2 className="font-editorial text-xl font-semibold text-[var(--color-text)] sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--color-text-secondary)]">{children}</div>
    </section>
  );
}

export function OwnerConfirmation({ children }) {
  return <p className="rounded-xl border border-dashed border-[var(--color-rose)] bg-[var(--color-background)] px-4 py-3 text-sm leading-6 text-[var(--color-text)]">Owner confirmation required: {children}</p>;
}
