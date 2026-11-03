export default function Container({
  children,
  className = "",
  as: Component = "div",
  size = "default",
}) {
  const widthClass = size === "wide" ? "max-w-[1680px]" : "max-w-7xl";

  return (
    <Component
      className={[
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        widthClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Component>
  );
}
