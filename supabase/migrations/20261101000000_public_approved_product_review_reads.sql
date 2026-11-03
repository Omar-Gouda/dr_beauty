-- Allow storefront review queries to read only the fields they render.
-- product_reviews_public_read continues to restrict anon rows to status = 'approved'.
grant select (id, product_id, rating, title, body, status, created_at)
  on table public.product_reviews to anon;
