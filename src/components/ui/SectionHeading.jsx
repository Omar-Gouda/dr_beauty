export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "right",
  className = "",
}) {
  const alignmentClasses = {
    right: "text-right",
    center: "text-center",
    left: "text-left",
  };

  const alignment = alignmentClasses[align] ?? alignmentClasses.right;

  return (
    <header className={`${alignment} ${className}`.trim()}>
      {eyebrow ? (
        <p className="mb-2 text-sm font-semibold tracking-wide text-[var(--color-primary)]">
          {eyebrow}
        </p>
      ) : null}

      <h2 className="font-editorial text-2xl font-bold leading-tight text-[var(--color-text)] sm:text-3xl">
        {title}
      </h2>

      {description ? (
        <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)] sm:text-base">
          {description}
        </p>
      ) : null}
    </header>
  );
}