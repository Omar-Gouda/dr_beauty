export default function SearchBar({ id = "store-search" }) {
  return (
    <form
      action="/shop"
      method="GET"
      role="search"
      className="flex w-full items-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-all focus-within:border-[var(--color-primary)]"
    >
      <label htmlFor={id} className="sr-only">
        Search for products
      </label>

      <input
        id={id}
        type="search"
        name="q"
        placeholder="Search for favorite products..."
        className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-secondary)]"
      />

      <button
        type="submit"
        aria-label="Search"
        className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 py-2.5 text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] sm:px-4"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
        >
          <circle
            cx="10.8"
            cy="10.8"
            r="6.8"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="m16 16 4.2 4.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </form>
  );
}
