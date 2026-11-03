import Container from "@/components/ui/Container";

export default function AddressBookLoading() {
  return (
    <main className="section flex-1" aria-busy="true" aria-label="Loading address book">
      <Container className="max-w-6xl animate-pulse space-y-6">
        <div className="h-16 w-72 rounded-xl bg-[var(--color-primary-light)]" />
        <div className="h-16 rounded-2xl bg-[var(--color-surface)]" />
        <div className="h-80 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]" />
      </Container>
    </main>
  );
}
