begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, service_role;
grant usage on schema private to authenticated;
grant usage on schema public to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or length(full_name) <= 160),
  phone text check (phone is null or length(phone) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Customers have no row here. Only a trusted project owner can grant admin access.
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role = 'admin'),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique check (length(name) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  brand_id uuid not null references public.brands (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 240),
  description text,
  ingredients text,
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= price),
  currency text not null default 'EGP' check (currency = 'EGP'),
  is_active boolean not null default false,
  is_bestseller boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kept separate so public catalog reads cannot reveal stock levels.
create table public.product_inventory (
  product_id uuid primary key references public.products (id) on delete cascade,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  image_url text not null check (
    length(image_url) between 1 and 2048 and image_url ~ '^(https?://|/)'
  ),
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, sort_order)
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipient_name text not null check (length(recipient_name) between 1 and 160),
  phone text not null check (length(phone) between 1 and 40),
  governorate text not null check (length(governorate) between 1 and 120),
  city text not null check (length(city) between 1 and 120),
  address_line text not null check (length(address_line) between 1 and 1000),
  delivery_notes text check (delivery_notes is null or length(delivery_notes) <= 1000),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = btrim(code) and length(code) between 1 and 64),
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount')),
  discount_value numeric(12, 2) not null check (discount_value > 0),
  maximum_discount numeric(12, 2) check (maximum_discount is null or maximum_discount > 0),
  minimum_subtotal numeric(12, 2) not null default 0 check (minimum_subtotal >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  maximum_redemptions integer check (maximum_redemptions is null or maximum_redemptions > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (discount_type <> 'percentage' or discount_value <= 100)
);

create unique index promotions_code_lower_uidx on public.promotions (lower(code));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  user_id uuid references auth.users (id) on delete set null,
  promotion_id uuid references public.promotions (id) on delete restrict,
  promotion_code_snapshot text,
  customer_name text not null check (length(customer_name) between 1 and 160),
  customer_email text check (customer_email is null or length(customer_email) <= 320),
  customer_phone text not null check (length(customer_phone) between 1 and 40),
  governorate text not null check (length(governorate) between 1 and 120),
  city text not null check (length(city) between 1 and 120),
  address_line text not null check (length(address_line) between 1 and 1000),
  delivery_notes text check (delivery_notes is null or length(delivery_notes) <= 1000),
  payment_method text not null default 'cod' check (payment_method = 'cod'),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  order_status text not null default 'pending_confirmation'
    check (order_status in ('pending_confirmation', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  shipping_amount numeric(12, 2) not null default 0 check (shipping_amount >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0 and discount_amount <= subtotal),
  total_amount numeric(14, 2) generated always as (subtotal + shipping_amount - discount_amount) stored,
  currency text not null default 'EGP' check (currency = 'EGP'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name_snapshot text not null check (length(product_name_snapshot) between 1 and 240),
  product_slug_snapshot text not null check (length(product_slug_snapshot) between 1 and 240),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 999),
  line_total numeric(14, 2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or length(title) <= 160),
  body text not null check (length(body) between 1 and 5000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table public.wishlist_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 320),
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'active', 'unsubscribed')),
  consent_at timestamptz not null,
  consent_source text check (consent_source is null or length(consent_source) <= 120),
  consent_version text check (consent_version is null or length(consent_version) <= 80),
  confirmation_token_hash text unique,
  unsubscribe_token_hash text not null unique,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email),
  check ((status = 'unsubscribed') = (unsubscribed_at is not null))
);

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  campaign_type text not null check (campaign_type in ('newsletter', 'transactional')),
  subject text not null check (length(subject) between 1 and 300),
  template_key text not null check (length(template_key) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.email_campaigns (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  subscriber_id uuid references public.newsletter_subscribers (id) on delete restrict,
  delivery_type text not null check (delivery_type in ('order_confirmation', 'order_update', 'newsletter_campaign')),
  recipient_email text not null check (length(recipient_email) between 3 and 320),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 200),
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  provider_message_id text,
  last_error text check (last_error is null or length(last_error) <= 4000),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (order_id is not null and campaign_id is null and subscriber_id is null
      and delivery_type in ('order_confirmation', 'order_update'))
    or
    (order_id is null and subscriber_id is not null and campaign_id is not null
      and delivery_type = 'newsletter_campaign')
  )
);

create unique index email_deliveries_order_type_uidx
  on public.email_deliveries (order_id, delivery_type) where order_id is not null;
create unique index email_deliveries_campaign_subscriber_uidx
  on public.email_deliveries (campaign_id, subscriber_id) where campaign_id is not null;
create index email_deliveries_retry_idx
  on public.email_deliveries (next_attempt_at, created_at)
  where status in ('queued', 'failed');

create index products_category_active_idx on public.products (category_id, created_at desc);
create index products_brand_active_idx on public.products (brand_id, created_at desc);
create index user_roles_granted_by_idx on public.user_roles (granted_by) where granted_by is not null;
create index product_inventory_updated_idx on public.product_inventory (updated_at desc);
create index product_images_product_sort_idx on public.product_images (product_id, sort_order);
create index customer_addresses_user_idx on public.customer_addresses (user_id, created_at desc);
create unique index customer_addresses_one_default_uidx
  on public.customer_addresses (user_id) where is_default;
create index orders_user_created_idx on public.orders (user_id, created_at desc) where user_id is not null;
create index orders_status_created_idx on public.orders (order_status, created_at desc);
create index orders_promotion_idx on public.orders (promotion_id) where promotion_id is not null;
create index order_items_product_idx on public.order_items (product_id);
create index product_reviews_approved_product_idx
  on public.product_reviews (product_id, created_at desc) where status = 'approved';
create index product_reviews_product_fk_idx on public.product_reviews (product_id);
create index product_reviews_user_idx on public.product_reviews (user_id, created_at desc);
create index wishlist_items_product_idx on public.wishlist_items (product_id);
create index newsletter_subscribers_status_idx on public.newsletter_subscribers (status, created_at desc);
create index email_campaigns_status_schedule_idx on public.email_campaigns (status, scheduled_at);
create index email_campaigns_created_by_idx on public.email_campaigns (created_by) where created_by is not null;
create index email_deliveries_subscriber_idx on public.email_deliveries (subscriber_id) where subscriber_id is not null;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'
  );
$$;

create function private.has_purchased_product(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders as o
    join public.order_items as oi on oi.order_id = o.id
    where o.user_id = (select auth.uid())
      and oi.product_id = p_product_id
      and o.order_status = 'delivered'
      and o.payment_status = 'paid'
  );
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(btrim(new.raw_user_meta_data ->> 'full_name')) > 160 then
    insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
    return new;
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create function private.create_inventory_for_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_inventory (product_id, stock_quantity)
  values (new.id, 0)
  on conflict (product_id) do nothing;
  return new;
end;
$$;

create function private.prevent_order_snapshot_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.user_id, new.promotion_id, new.promotion_code_snapshot,
    new.customer_name, new.customer_email, new.customer_phone,
    new.governorate, new.city, new.address_line, new.delivery_notes,
    new.payment_method, new.subtotal, new.shipping_amount,
    new.discount_amount, new.currency, new.created_at
  ) is distinct from row(
    old.user_id, old.promotion_id, old.promotion_code_snapshot,
    old.customer_name, old.customer_email, old.customer_phone,
    old.governorate, old.city, old.address_line, old.delivery_notes,
    old.payment_method, old.subtotal, old.shipping_amount,
    old.discount_amount, old.currency, old.created_at
  ) then
    raise exception 'Order purchase snapshots are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.prevent_order_item_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Order item snapshots are immutable' using errcode = '23514';
end;
$$;

create function private.assert_order_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_order_id uuid;
  stored_subtotal numeric(14, 2);
  item_subtotal numeric(14, 2);
  item_count bigint;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'DELETE' then
      target_order_id := old.id;
    else
      target_order_id := new.id;
    end if;
  else
    if tg_op = 'DELETE' then
      target_order_id := old.order_id;
    else
      target_order_id := new.order_id;
    end if;
  end if;

  select o.subtotal into stored_subtotal
  from public.orders as o
  where o.id = target_order_id;

  if not found then
    return null;
  end if;

  select count(*), coalesce(sum(oi.line_total), 0)::numeric(14, 2)
  into item_count, item_subtotal
  from public.order_items as oi
  where oi.order_id = target_order_id;

  if item_count = 0 or item_subtotal <> stored_subtotal then
    raise exception 'Order subtotal must equal the immutable order item totals'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create trigger auth_user_profile_created
  after insert on auth.users
  for each row execute function private.create_profile_for_auth_user();

create trigger product_inventory_created
  after insert on public.products
  for each row execute function private.create_inventory_for_product();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger brands_set_updated_at before update on public.brands
  for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger product_inventory_set_updated_at before update on public.product_inventory
  for each row execute function private.set_updated_at();
create trigger customer_addresses_set_updated_at before update on public.customer_addresses
  for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger product_reviews_set_updated_at before update on public.product_reviews
  for each row execute function private.set_updated_at();
create trigger promotions_set_updated_at before update on public.promotions
  for each row execute function private.set_updated_at();
create trigger newsletter_subscribers_set_updated_at before update on public.newsletter_subscribers
  for each row execute function private.set_updated_at();
create trigger email_campaigns_set_updated_at before update on public.email_campaigns
  for each row execute function private.set_updated_at();
create trigger email_deliveries_set_updated_at before update on public.email_deliveries
  for each row execute function private.set_updated_at();

create trigger orders_snapshot_immutable before update on public.orders
  for each row execute function private.prevent_order_snapshot_update();
create trigger order_items_immutable before update or delete on public.order_items
  for each row execute function private.prevent_order_item_mutation();

create constraint trigger orders_totals_consistent
  after insert or update on public.orders
  deferrable initially deferred
  for each row execute function private.assert_order_totals();
create constraint trigger order_items_totals_consistent
  after insert or update or delete on public.order_items
  deferrable initially deferred
  for each row execute function private.assert_order_totals();

revoke all on function private.is_admin() from public;
revoke all on function private.has_purchased_product(uuid) from public;
revoke all on function private.set_updated_at() from public;
revoke all on function private.create_profile_for_auth_user() from public;
revoke all on function private.create_inventory_for_product() from public;
revoke all on function private.prevent_order_snapshot_update() from public;
revoke all on function private.prevent_order_item_mutation() from public;
revoke all on function private.assert_order_totals() from public;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_purchased_product(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_inventory enable row level security;
alter table public.product_images enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.promotions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.product_reviews enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_deliveries enable row level security;

create policy profiles_read_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_active);
create policy categories_admin_manage on public.categories
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy brands_public_read on public.brands
  for select to anon, authenticated using (is_active);
create policy brands_admin_manage on public.brands
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy products_public_read on public.products
  for select to anon, authenticated using (is_active);
create policy products_admin_manage on public.products
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy product_inventory_admin_manage on public.product_inventory
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (exists (
    select 1 from public.products as p
    where p.id = product_id and p.is_active
  ));
create policy product_images_admin_manage on public.product_images
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy customer_addresses_own_manage on public.customer_addresses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy promotions_public_read on public.promotions
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= (select now()))
    and (ends_at is null or ends_at > (select now()))
  );
create policy promotions_admin_manage on public.promotions
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy orders_read_own on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy orders_admin_read on public.orders
  for select to authenticated using ((select private.is_admin()));
create policy orders_admin_update_status on public.orders
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy order_items_read_own_order on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders as o
    where o.id = order_id and o.user_id = (select auth.uid())
  ));
create policy order_items_admin_read on public.order_items
  for select to authenticated using ((select private.is_admin()));

create policy product_reviews_public_read on public.product_reviews
  for select to anon, authenticated using (status = 'approved');
create policy product_reviews_read_own on public.product_reviews
  for select to authenticated using (user_id = (select auth.uid()));
create policy product_reviews_insert_verified_purchase on public.product_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and (select private.has_purchased_product(product_id))
  );
create policy product_reviews_update_own_pending on public.product_reviews
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy product_reviews_delete_own_pending on public.product_reviews
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');
create policy product_reviews_admin_manage on public.product_reviews
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy wishlist_items_own_manage on public.wishlist_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy newsletter_subscribers_admin_read on public.newsletter_subscribers
  for select to authenticated using ((select private.is_admin()));

create policy email_campaigns_admin_manage on public.email_campaigns
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy email_deliveries_admin_read on public.email_deliveries
  for select to authenticated using ((select private.is_admin()));

revoke all privileges on table
  public.profiles, public.user_roles, public.categories, public.brands,
  public.products, public.product_inventory, public.product_images,
  public.customer_addresses, public.promotions, public.orders, public.order_items,
  public.product_reviews, public.wishlist_items, public.newsletter_subscribers,
  public.email_campaigns, public.email_deliveries
from anon, authenticated;

grant select on public.categories, public.brands, public.products,
  public.product_images, public.promotions to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant insert, update, delete on public.categories, public.brands, public.products,
  public.product_images, public.promotions to authenticated;
grant select, insert, update, delete on public.product_inventory to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select, update (order_status, payment_status) on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select, delete on public.product_reviews to authenticated;
grant insert (user_id, product_id, rating, title, body)
  on public.product_reviews to authenticated;
grant update (rating, title, body, status)
  on public.product_reviews to authenticated;
grant select, insert, delete on public.wishlist_items to authenticated;
grant select on public.newsletter_subscribers, public.email_deliveries to authenticated;
grant select, insert, update, delete on public.email_campaigns to authenticated;

grant all privileges on table
  public.profiles, public.user_roles, public.categories, public.brands,
  public.products, public.product_inventory, public.product_images,
  public.customer_addresses, public.promotions, public.orders, public.order_items,
  public.product_reviews, public.wishlist_items, public.newsletter_subscribers,
  public.email_campaigns, public.email_deliveries
to service_role;
grant usage, select on sequence public.orders_order_number_seq to service_role;

commit;
