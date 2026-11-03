const variants = {
  primary: [
    "border border-primary bg-primary text-white",
    "hover:bg-primary-hover hover:border-primary-hover",
    "focus-visible:ring-rose",
  ].join(" "),

  secondary: [
    "border border-border bg-surface text-text",
    "hover:bg-surface-soft",
    "focus-visible:ring-rose",
  ].join(" "),

  outline: [
    "border border-rose bg-transparent text-rose",
    "hover:bg-primary-light",
    "focus-visible:ring-rose",
  ].join(" "),

  ghost: [
    "border border-transparent bg-transparent text-text",
    "hover:bg-primary-light",
    "focus-visible:ring-rose",
  ].join(" "),
};

const sizes = {
  sm: "min-h-10 px-3 text-sm",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-12 px-7 text-base",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled = false,
  className = "",
  ...props
}) {
  const variantClasses = variants[variant] ?? variants.primary;
  const sizeClasses = sizes[size] ?? sizes.md;

  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2",
        "rounded-full font-semibold",
        "transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses,
        sizeClasses,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
