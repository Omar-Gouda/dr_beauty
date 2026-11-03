"use client";

import Container from "@/components/ui/Container";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CustomSelect from "@/components/ui/Select";
import ProductCard from "@/components/products/ProductCard";
import { Filter, SlidersHorizontal, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_CATALOG_PAGE_SIZE } from "@/lib/catalog-pagination.mjs";

const sortOptions = [
  { label: "Sort by: Featured", value: "featured" },
  { label: "Price: Low to High", value: "price-low" },
  { label: "Price: High to Low", value: "price-high" },
  { label: "Highest Rated", value: "rating" },
];

function FilterPanel({ categoryOptions, selectedCategory, setSelectedCategory, selectedRating, setSelectedRating, ratingsAvailable, brands, selectedBrandSlugs, toggleBrand, resetFilters }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 flex items-center gap-2 font-editorial text-base font-bold text-[var(--color-text)]">
          <Filter aria-hidden="true" className="h-4 w-4 text-[var(--color-primary)]" />
          Categories
        </h3>
        <ul className="space-y-1">
          {categoryOptions.map((cat) => (
            <li key={cat.id}>
              <button type="button" aria-pressed={selectedCategory === cat.slug} onClick={() => setSelectedCategory(cat.slug)} className={`flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-left text-sm transition-colors ${selectedCategory === cat.slug ? "bg-[var(--color-primary-light)] font-bold text-[var(--color-primary)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-background)] hover:text-[var(--color-primary)]"}`}>
                <span>{cat.name}</span><span aria-hidden="true" className="text-xs">›</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <fieldset className="border-t border-[var(--color-border)] pt-4">
        <legend className="mb-2 font-editorial text-base font-bold text-[var(--color-text)]">Customer rating</legend>
        <div className="space-y-1">
          {[4.5, 4.0, 3.5].map((rating) => (
            <button key={rating} type="button" disabled={!ratingsAvailable} aria-pressed={selectedRating === rating} onClick={() => setSelectedRating(selectedRating === rating ? null : rating)} className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selectedRating === rating ? "bg-[var(--color-primary-light)] font-bold text-[var(--color-primary)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-background)]"}`}>
              <Star aria-hidden="true" className="h-4 w-4 fill-[var(--color-warning)] text-[var(--color-warning)]" />{rating} stars &amp; up
            </button>
          ))}
          {!ratingsAvailable && <p className="px-2 text-xs text-[var(--color-text-secondary)]">Ratings are not available yet.</p>}
        </div>
      </fieldset>

      <fieldset className="border-t border-[var(--color-border)] pt-4">
        <legend className="mb-3 font-editorial text-base font-bold text-[var(--color-text)]">Trusted brands</legend>
        <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
          {brands.length ? brands.map((brand) => (
            <label key={brand.slug} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-background)]">
              <input type="checkbox" checked={selectedBrandSlugs.includes(brand.slug)} onChange={() => toggleBrand(brand.slug)} className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-rose)]" />
              <span>{brand.name}</span>
            </label>
          )) : <p className="px-2 text-sm text-[var(--color-text-secondary)]">No brand filters available.</p>}
        </div>
      </fieldset>

      <button type="button" onClick={resetFilters} className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">Reset filters</button>
    </div>
  );
}

function buildShopHref(filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.category && filters.category !== "all") params.set("category", filters.category);
  for (const brandSlug of filters.brandSlugs ?? []) params.append("brand", brandSlug);
  if (filters.sort && filters.sort !== "featured") params.set("sort", filters.sort);
  if (filters.ratingMin != null) params.set("rating", String(filters.ratingMin));
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== DEFAULT_CATALOG_PAGE_SIZE) params.set("pageSize", String(filters.pageSize));
  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}

function ShopContent({ products, categories, brands, filters, pagination, ratingsAvailable }) {
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterSheetState, setFilterSheetState] = useState("compact");
  const filterDialogRef = useRef(null);
  const filterButtonRef = useRef(null);
  const dragStartYRef = useRef(null);
  const suppressHandleClickRef = useRef(false);
  const selectedCategory = filters.category;
  const selectedRating = filters.ratingMin;
  const selectedBrandSlugs = filters.brandSlugs;
  const sortBy = filters.sort;
  const filteredProducts = products;

  function updateFilters(changes) {
    router.push(buildShopHref({ ...filters, ...changes, page: changes.page ?? 1 }), { scroll: false });
  }

  const categoryOptions = [{ id: "all", slug: "all", name: "All Categories" }, ...categories];
  const availableSortOptions = ratingsAvailable
    ? sortOptions
    : sortOptions.filter((option) => option.value !== "rating");

  const toggleBrand = (brand) => {
    const next = selectedBrandSlugs.includes(brand)
      ? selectedBrandSlugs.filter((slug) => slug !== brand)
      : [...selectedBrandSlugs, brand];
    updateFilters({ brandSlugs: next });
  };

  const resetFilters = () => {
    updateFilters({ category: "all", ratingMin: null, brandSlugs: [] });
  };

  const filterCount = (selectedCategory !== "all" ? 1 : 0) + (selectedRating ? 1 : 0) + selectedBrandSlugs.length;
  const showingFrom = pagination.firstItem;
  const showingTo = pagination.lastItem;

  useEffect(() => {
    const dialog = filterDialogRef.current;
    if (!dialog) return;

    if (!filtersOpen) {
      if (dialog.open) dialog.close();
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const restoreFocus = filterButtonRef.current;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      restoreFocus?.focus({ preventScroll: true });
    };
  }, [filtersOpen]);

  function openFilters() {
    setFilterSheetState("compact");
    setFiltersOpen(true);
  }

  function closeFilters() {
    filterDialogRef.current?.close();
    setFiltersOpen(false);
  }

  function moveFilterSheet(direction) {
    if (direction === "down" && filterSheetState === "compact") {
      closeFilters();
      return;
    }

    setFilterSheetState((current) => {
      if (direction === "up") {
        if (current === "compact") return "expanded";
        if (current === "expanded") return "full";
        return current;
      }

      if (current === "full") return "expanded";
      if (current === "expanded") return "compact";
      return current;
    });
  }

  function handleSheetPointerDown(event) {
    dragStartYRef.current = event.clientY;
    suppressHandleClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSheetPointerUp(event) {
    if (dragStartYRef.current === null) return;
    const distance = dragStartYRef.current - event.clientY;
    dragStartYRef.current = null;
    if (Math.abs(distance) < 32) return;

    suppressHandleClickRef.current = true;
    moveFilterSheet(distance > 0 ? "up" : "down");
  }

  function handleSheetHandleClick() {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }
    moveFilterSheet(filterSheetState === "full" ? "down" : "up");
  }

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col bg-[var(--color-background)]">
      
      {/* Hero Header */}
      <section 
        className="relative flex w-full items-center justify-start bg-cover bg-center bg-no-repeat px-4 py-16 sm:px-[7%] sm:py-28"
        style={{ 
          minHeight: '50vh',
          backgroundColor: 'var(--color-background)'
        }}
      >
        <Image
          src="/images/branding/hero-banner.jpg"
          alt=""
          fill
          sizes="100vw"
          preload
          className="object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundImage: 'linear-gradient(to right, rgba(255, 249, 247, 0.95), rgba(255, 249, 247, 0.4))' }}
        />
        <div className="relative z-10 max-w-2xl text-left flex flex-col items-start">
          <span className="mb-2 inline-block font-editorial text-lg italic font-semibold tracking-wide text-[var(--color-primary)] sm:text-2xl"
            style={{ transform: 'rotate(-4deg)', textShadow: '0 2px 4px rgba(215, 123, 142, 0.2)' }}
          >
            Dr. Beauty Curated Store
          </span>
          <h1 className="mb-4 max-w-full break-words font-editorial text-3xl font-bold leading-[1.1] tracking-tight text-[var(--color-text)] sm:text-5xl">
            Science-Backed <br />
            <span className="font-editorial italic text-[var(--color-rose)] relative inline-block pb-1">
              Beauty Catalog
              <span className="absolute bottom-0 left-0 w-full h-1 bg-[var(--color-primary-light)] rounded-full"></span>
            </span>
          </h1>
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
            Explore professional skincare, dermatologist-approved treatments, and premium formulas meticulously selected by Dr. Radwa Hassan.
          </p>
        </div>
      </section>

      {/* Main Body */}
      <section className="py-8 sm:py-16">
        <Container size="wide">
          {/* Desktop Grid Layout */}
          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-8">
            <aside aria-label="Product filters" className="hidden self-start rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm lg:col-span-1 lg:block">
              <FilterPanel
                categoryOptions={categoryOptions}
                selectedCategory={selectedCategory}
                setSelectedCategory={(category) => updateFilters({ category })}
                selectedRating={selectedRating}
                setSelectedRating={(ratingMin) => updateFilters({ ratingMin })}
                ratingsAvailable={ratingsAvailable}
                brands={brands}
                selectedBrandSlugs={selectedBrandSlugs}
                toggleBrand={toggleBrand}
                resetFilters={resetFilters}
              />
            </aside>

            <div className="min-w-0 lg:col-span-4">
              
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4 sm:mb-8 sm:pb-6">
                <div className="text-sm font-medium text-[var(--color-text-secondary)]">
                  Showing <strong className="text-[var(--color-text)]">{showingFrom}–{showingTo}</strong> of <strong className="text-[var(--color-text)]">{pagination.totalCount}</strong> products
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <button ref={filterButtonRef} type="button" onClick={openFilters} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text)] lg:hidden">
                    <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />Filters{filterCount > 0 && <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white">{filterCount}</span>}
                  </button>
                  <div className="min-w-0 flex-1 sm:w-56 sm:flex-none"><CustomSelect options={availableSortOptions} value={sortBy} onChange={(sort) => updateFilters({ sort })} placeholder="Sort by" /></div>
                </div>
              </div>

              {filteredProducts.length > 0 ? (
                <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5 2xl:grid-cols-5">
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)]">
                  <p className="font-editorial text-xl font-bold text-[var(--color-text)] mb-2">
                    {pagination.totalCount === 0 ? "No matching products found" : "No products on this page"}
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                    {pagination.totalCount === 0
                      ? "Try another search or adjust the selected filters."
                      : "Choose a different page to view more matching products."}
                  </p>
                  {(filters.query || filterCount > 0 || sortBy !== "featured") && (
                    <button
                      onClick={() => router.push("/shop", { scroll: false })}
                      className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-xs font-semibold text-white"
                    >
                      Reset Search and Filters
                    </button>
                  )}
                </div>
              )}

              {pagination.totalPages > 1 && (
                <nav aria-label="Shop pagination" className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  {pagination.hasPrevious ? (
                    <Link href={buildShopHref({ ...filters, page: pagination.page - 1 })} scroll={false} className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-border)] px-5 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">Previous</Link>
                  ) : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-border)] px-5 text-sm text-[var(--color-text-secondary)] opacity-50">Previous</span>}
                  <span aria-current="page" className="px-2 text-sm text-[var(--color-text-secondary)]">Page {pagination.page} of {pagination.totalPages}</span>
                  {pagination.hasNext ? (
                    <Link href={buildShopHref({ ...filters, page: pagination.page + 1 })} scroll={false} className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-border)] px-5 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">Next</Link>
                  ) : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-border)] px-5 text-sm text-[var(--color-text-secondary)] opacity-50">Next</span>}
                </nav>
              )}

            </div>

          </div>
        </Container>
      </section>

      <dialog
        ref={filterDialogRef}
        aria-labelledby="mobile-filter-title"
        aria-describedby="mobile-filter-description"
        data-sheet-state={filterSheetState}
        className="mobile-filter-sheet app-dialog lg:hidden"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeFilters();
        }}
        onClose={() => setFiltersOpen(false)}
      >
        <div className="mobile-filter-sheet__layout">
          <button type="button" aria-label={`Filter panel ${filterSheetState}. Tap to expand or drag to resize.`} onPointerDown={handleSheetPointerDown} onPointerUp={handleSheetPointerUp} onPointerCancel={() => { dragStartYRef.current = null; }} onClick={handleSheetHandleClick} className="mobile-filter-sheet__handle">
            <span aria-hidden="true" />
          </button>
          <header className="mobile-filter-sheet__header">
            <div>
              <h2 id="mobile-filter-title" className="font-editorial text-2xl font-semibold">Filters</h2>
              <p id="mobile-filter-description" className="mt-1 text-xs text-[var(--color-text-secondary)]">Choose categories, ratings, and brands.</p>
            </div>
            <button autoFocus type="button" aria-label="Close filters" onClick={closeFilters} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-[var(--color-primary-light)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </header>
          <div className="mobile-filter-sheet__content">
            <FilterPanel
              categoryOptions={categoryOptions}
              selectedCategory={selectedCategory}
              setSelectedCategory={(category) => updateFilters({ category })}
              selectedRating={selectedRating}
              setSelectedRating={(ratingMin) => updateFilters({ ratingMin })}
              ratingsAvailable={ratingsAvailable}
              brands={brands}
              selectedBrandSlugs={selectedBrandSlugs}
              toggleBrand={toggleBrand}
              resetFilters={resetFilters}
            />
          </div>
          <footer className="mobile-filter-sheet__footer">
            <button type="button" onClick={closeFilters} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--color-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] focus-visible:ring-offset-2">
              Show {pagination.totalCount} products
            </button>
          </footer>
        </div>
      </dialog>

    </div>
  );
}

export default function ShopCatalog({ products, categories, brands, filters, pagination, ratingsAvailable }) {
  return <ShopContent
    products={products}
    categories={categories}
    brands={brands}
    filters={filters}
    pagination={pagination}
    ratingsAvailable={ratingsAvailable}
  />;
}
