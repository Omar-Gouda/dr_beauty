export default function AdminCard({ children, className = "", as: Element = "section", ...props }) {
  return (
    <Element className={`min-w-0 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_8px_30px_var(--color-shadow)] ${className}`} {...props}>
      {children}
    </Element>
  );
}
