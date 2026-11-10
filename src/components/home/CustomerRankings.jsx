import Container from "@/components/ui/Container";
import SectionHeading from "@/components/ui/SectionHeading";

function LovedBySection({ rows }) {
  return <section aria-labelledby="loved-by-dr-beauty-title" className="rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8">
    <SectionHeading id="loved-by-dr-beauty-title" eyebrow="Our Community" title="Loved by DR. Beauty" align="left" />
    {!rows?.length
      ? <p className="mt-5 rounded-2xl bg-[var(--color-background)] px-4 py-6 text-center text-sm text-[var(--color-text-secondary)]">Our community is growing. Customer highlights will appear here soon.</p>
      : <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Top five customers by delivered orders">
        {rows.map((row, index) => <li key={`${index}-${row.displayName}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 sm:p-4">
          <RankingBadge rank={index + 1} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[var(--color-text)]">{row.displayName}</span></span>
        </li>)}
      </ol>}
  </section>;
}

const podiumStyles = [
  "border-[#b48a3b] bg-[#f8efd9] text-[#684d18]",
  "border-[#92979a] bg-[#eff1f1] text-[#4c5558]",
  "border-[#ad7659] bg-[#f5e8e0] text-[#70462e]",
];

function RankingBadge({ rank }) {
  return <span aria-label={`Rank ${rank}`} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border font-editorial text-lg font-bold ${podiumStyles[rank - 1] ?? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-rose)]"}`}>
    {rank}
  </span>;
}

function ElitesSection({ rows }) {
  return <section aria-labelledby="dr-beauty-elites-title" className="h-full rounded-[2rem] border border-[var(--color-border)] border-t-2 border-t-[var(--color-rose)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-background)] to-[var(--color-primary-light)] p-5 shadow-sm sm:p-7">
    <header className="border-b border-[var(--color-border)] pb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">With gratitude</p>
      <h2 id="dr-beauty-elites-title" className="font-editorial text-2xl font-bold leading-tight text-[var(--color-text)] sm:text-3xl">DR. Beauty Elites</h2>
    </header>
    {rows?.length > 0 && <ol className="mt-5 grid gap-3" aria-label="Top three customers by paid delivered purchase value">
      {rows.map((row, index) => <li key={`${index}-${row.displayName}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/90 p-3 shadow-sm sm:p-4">
        <RankingBadge rank={index + 1} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[var(--color-text)]">{row.displayName}</span></span>
      </li>)}
    </ol>}
  </section>;
}

export default function CustomerRankings({ settings, rankings }) {
  if (!settings?.showLovedByDrBeauty && !settings?.showDrBeautyElites) return null;
  return <section className="home-section" aria-label="Customer community highlights">
    <Container size="wide" className="grid items-stretch gap-5 md:grid-cols-2 sm:gap-7">
      {settings.showLovedByDrBeauty && <LovedBySection rows={rankings?.lovedByDrBeauty ?? []} />}
      {settings.showDrBeautyElites && <ElitesSection rows={rankings?.drBeautyElites ?? []} />}
    </Container>
  </section>;
}
