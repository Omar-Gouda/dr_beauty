import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  catalogPaginationSummary,
  DEFAULT_CATALOG_PAGE_SIZE,
  MAX_CATALOG_PAGE_SIZE,
  normalizeCatalogPageRequest,
} from "../src/lib/catalog-pagination.mjs";

const categories = [{ slug: "skin-care" }];
const brands = [{ slug: "brand-one" }, { slug: "brand-two" }];

test("shop pagination defaults to the first page and a bounded page size", () => {
  assert.deepEqual(normalizeCatalogPageRequest({}, { categories, brands }), {
    query: "",
    category: "all",
    brandSlugs: [],
    sort: "featured",
    ratingMin: null,
    page: 1,
    pageSize: DEFAULT_CATALOG_PAGE_SIZE,
  });
});

test("invalid, negative, and oversized page parameters normalize safely", () => {
  const filters = normalizeCatalogPageRequest({ page: "-2", pageSize: "999999" }, { categories, brands });
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, MAX_CATALOG_PAGE_SIZE);
  assert.equal(normalizeCatalogPageRequest({ page: "nope", pageSize: "0" }, { categories, brands }).pageSize, DEFAULT_CATALOG_PAGE_SIZE);
  assert.equal(normalizeCatalogPageRequest({ page: "1200", pageSize: "48" }, { categories, brands }).page, 1000);
});

test("search and allowlisted category, brand, sort, and rating filters normalize", () => {
  const filters = normalizeCatalogPageRequest({
    q: "  Cream\u0000 serum  ", category: "SKIN-CARE", brand: ["brand-one", "brand-one", "unknown"],
    sort: "price-high", rating: "4.5", page: "2", pageSize: "100",
  }, { categories, brands });
  assert.equal(filters.query, "Cream serum");
  assert.equal(filters.category, "skin-care");
  assert.deepEqual(filters.brandSlugs, ["brand-one"]);
  assert.equal(filters.sort, "price-high");
  assert.equal(filters.ratingMin, 4.5);
  assert.equal(filters.page, 2);
  assert.equal(filters.pageSize, MAX_CATALOG_PAGE_SIZE);
});

test("pagination metadata handles empty, final, and out-of-range pages", () => {
  assert.deepEqual(catalogPaginationSummary({ page: 9, pageSize: 24, totalCount: 0, itemCount: 0 }), {
    page: 1, pageSize: 24, totalCount: 0, totalPages: 0, firstItem: 0, lastItem: 0,
    hasPrevious: false, hasNext: false,
  });
  const finalPage = catalogPaginationSummary({ page: 8, pageSize: 24, totalCount: 50, itemCount: 2 });
  assert.equal(finalPage.page, 3);
  assert.equal(finalPage.firstItem, 49);
  assert.equal(finalPage.lastItem, 50);
  assert.equal(finalPage.hasPrevious, true);
  assert.equal(finalPage.hasNext, false);

  const cappedPage = catalogPaginationSummary({ page: 1400, pageSize: 24, totalCount: 30000, itemCount: 24 });
  assert.equal(cappedPage.page, 1000);
  assert.equal(cappedPage.totalPages, 1000);
  assert.equal(cappedPage.hasNext, false);
  assert.equal(catalogPaginationSummary({ page: -5, pageSize: 24, totalCount: 50, itemCount: 24 }).page, 1);
});

test("catalog filters are applied before server-side pagination with stable ordering", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261119000000_public_shop_catalog_pagination.sql", import.meta.url), "utf8");
  const numbered = sql.indexOf("numbered_products as (");
  for (const filter of ["category_row.slug = params.category_slug", "brand_row.slug = any", "strpos(", "base_products.rating >= params.rating_min"]) {
    assert.ok(sql.indexOf(filter) >= 0 && sql.indexOf(filter) < numbered, `${filter} must filter before pagination`);
  }
  assert.match(sql, /filtered_products\.created_at desc,\s*filtered_products\.id asc/);
  assert.match(sql, /least\(\s*pg_catalog\.ceil\(summary\.total_count::numeric \/ params\.page_size\),\s*1000\s*\)::integer as total_pages/);
  assert.match(sql, /else least\(params\.requested_page, page_counts\.total_pages\)/);
  assert.match(sql, /'totalPages', page_info\.total_pages/);
  assert.match(sql, /row_number > \(page_info\.current_page::bigint - 1\) \* page_info\.page_size::bigint/);
  assert.match(sql, /row_number <= page_info\.current_page::bigint \* page_info\.page_size::bigint/);
});

test("rating availability ignores the selected threshold but respects other filters", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261119000000_public_shop_catalog_pagination.sql", import.meta.url), "utf8");
  assert.match(sql, /filtered_products as \([\s\S]*?where params\.rating_min is null or base_products\.rating >= params\.rating_min/);
  assert.match(sql, /exists \(select 1 from base_products where base_products\.review_count > 0\) as ratings_available/);
  assert.match(sql, /ratings_available/);
  const ui = await readFile(new URL("../src/components/products/ShopCatalog.jsx", import.meta.url), "utf8");
  assert.match(ui, /disabled=\{!ratingsAvailable\}/);
  assert.match(ui, /setSelectedRating\(selectedRating === rating \? null : rating\)/);
});

test("Shop uses the bounded catalog RPC and does not fetch or filter all products in the browser", async () => {
  const page = await readFile(new URL("../src/app/(store)/shop/page.js", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../src/lib/catalog.js", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/products/ShopCatalog.jsx", import.meta.url), "utf8");
  assert.match(page, /getCatalogShopProducts\(filters\)/);
  assert.doesNotMatch(page, /getCatalogProducts\(/);
  assert.match(catalog, /rpc\("get_public_shop_catalog"/);
  assert.match(catalog, /Math\.min\(Math\.max\(requestedPageSize, 1\), MAX_CATALOG_PAGE_SIZE\)/);
  assert.match(component, /const filteredProducts = products;/);
  assert.doesNotMatch(component, /products\.filter\(/);
  assert.match(catalog, /products\.length > returnedPageSize/);
});

test("public RPC projection omits inventory and order/customer data and clamps page size", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261119000000_public_shop_catalog_pagination.sql", import.meta.url), "utf8");
  const projection = sql.slice(sql.indexOf("jsonb_build_object(", sql.indexOf("page_products as")));
  assert.doesNotMatch(projection, /product_inventory|quantity|orders|customer|email|phone/i);
  assert.match(sql, /least\(greatest\(coalesce\(p_page_size, 24\), 1\), 48\)/);
  assert.match(sql, /security invoker\s+set search_path = ''/i);
  assert.match(sql, /grant execute .*\s+to anon, authenticated/s);
});
