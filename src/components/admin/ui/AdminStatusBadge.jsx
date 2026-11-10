const tones = {
  success: "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]",
  warning: "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[#8A5B08]",
  muted: "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-secondary)]",
  rose: "border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] text-[var(--color-rose)]",
};

export default function AdminStatusBadge({ children, tone = "muted", className = "" }) {
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize leading-tight ${tones[tone] ?? tones.muted} ${className}`}>{children}</span>;
}
