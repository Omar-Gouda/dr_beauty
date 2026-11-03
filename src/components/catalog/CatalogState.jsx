export default function CatalogState({ title = "Catalog unavailable", message }) {
  return (
    <main className="container section">
      <section className="mx-auto max-w-2xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm sm:p-8">
        <h1 className="section-heading">{title}</h1>
        <p role="status" className="section-description">{message}</p>
      </section>
    </main>
  );
}
