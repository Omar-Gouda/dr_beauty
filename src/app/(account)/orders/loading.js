export default function OrdersLoading() {
  return (
    <main className="container section" aria-busy="true">
      <section className="mx-auto max-w-4xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
        <h1 className="section-heading">Loading your orders</h1>
        <p role="status" className="section-description">Retrieving your order information...</p>
      </section>
    </main>
  );
}
