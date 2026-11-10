import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("manual order deletion is server-authorized and calls the secure RPC", async () => {
  const [actions, manager, originalMigration, retention] = await Promise.all([
    source("../src/app/admin/actions.js"),
    source("../src/components/admin/AdminOrdersManager.jsx"),
    source("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql"),
    source("../supabase/migrations/20261209000000_receipt_archive_before_order_retention.sql"),
  ]);
  const action = actions.match(/export async function deleteAdminOrder[\s\S]*?(?=\nexport async function|$)/)?.[0] ?? "";
  assert.match(action, /authorizedClient\(\)/);
  assert.match(action, /rpc\("delete_admin_order_with_archive", \{ p_order_id: orderId \}\)/);
  assert.match(action, /blocked_by_archive/);
  assert.match(action, /42501/);
  assert.match(action, /revalidatePath\("\/admin\/orders"\)/);
  assert.match(manager, /<ConfirmationDialog/);
  assert.match(manager, /setIsConfirmOpen\(true\)/);
  assert.match(manager, /deleteAdminOrder\(order\.id\)/);
  assert.match(manager, /router\.refresh\(\)/);
  const rpc = originalMigration.match(/create function public\.delete_admin_order[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(rpc, /auth\.uid\(\) is null or not coalesce\(private\.is_admin\(\), false\)/i);
  const archivalRpc = retention.match(/create function public\.delete_admin_order_with_archive[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(archivalRpc, /private\.hard_delete_order_rows\(p_order_id\)/);
  assert.match(archivalRpc, /receipt_archive_failures/);
  assert.match(retention, /private\.archive_order_snapshot\(p_order_id, 'admin_delete'\)/);
  assert.match(retention, /create or replace function private\.run_order_retention_cleanup/);
  assert.match(retention, /private\.archive_order_snapshot\(v_candidate\.id, 'retention'\)/);
  assert.match(retention, /receipt archival failed verification; order deletion was blocked/i);
});

test("order hard deletion preserves immutable snapshots and clears restrictive dependencies safely", async () => {
  const [initial, retention, followup] = await Promise.all([
    source("../supabase/migrations/20261021000000_initial_schema.sql"),
    source("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql"),
    source("../supabase/migrations/20261122000000_safe_order_hard_delete.sql"),
  ]);
  assert.match(initial, /order_id uuid not null references public\.orders \(id\) on delete restrict/i);
  assert.match(retention, /foreign key \(order_id\) references public\.orders \(id\) on delete cascade/i);
  assert.match(followup, /pg_catalog\.pg_trigger_depth\(\) > 1[\s\S]*?not exists \([\s\S]*?public\.orders[\s\S]*?order_row\.id = old\.order_id/i);
  assert.match(followup, /order items are[\s\S]*?removed by their established on delete cascade/i);
  const helper = followup.match(/create or replace function private\.hard_delete_order_rows[\s\S]*?\$\$;/i)?.[0] ?? "";
  for (const table of [
    "public.admin_notifications",
    "public.email_deliveries",
    "private.admin_order_email_deliveries",
    "private.order_inventory_restorations",
    "private.cod_order_idempotency",
    "private.order_status_events",
  ]) assert.match(helper, new RegExp(`delete from ${table.replaceAll(".", "\\.")}`, "i"));
  assert.match(helper, /delete from public\.orders/i);
  assert.match(retention, /order_id uuid unique references public\.orders \(id\) on delete set null/i);
  assert.match(retention, /order_row\.order_status in \('delivered', 'cancelled'\)/i);
  assert.match(retention, /retention_started_at <= v_started_at - interval '45 days'/i);
});

test("account and storefront layouts put shared announcements before their visible navbar", async () => {
  const [account, store, profile, announcement] = await Promise.all([
    source("../src/app/(account)/layout.js"),
    source("../src/components/layout/StoreLayout.jsx"),
    source("../src/app/(account)/profile/layout.js"),
    source("../src/components/layout/AnnouncementBar.jsx"),
  ]);
  assert.ok(account.indexOf("<StoreAnnouncement />") < account.indexOf("<SessionAwareNavbar mobileOnly"));
  assert.ok(store.indexOf("<StoreAnnouncement />") < store.indexOf("<SessionAwareNavbar desktopOnly"));
  assert.match(store, /!desktopChromeOnly && <StoreAnnouncement\s*\/>/);
  assert.match(profile, /<StoreLayout desktopChromeOnly>/);
  assert.match(announcement, /if \(!loading && announcements\.length === 0\) return null/);
  assert.match(store, /getPublicDiscountAnnouncements/);
});

test("mobile navbar shows both brand lines while preserving compact header sizing", async () => {
  const navbar = await source("../src/components/layout/Navbar.jsx");
  assert.match(navbar, /min-h-16/);
  assert.match(navbar, /DR\. Beauty/);
  assert.match(navbar, /by Dr\. Radwa Hassan/);
  assert.match(navbar, /text-\[9px\]/);
  assert.match(navbar, /hidden lg:block/);
});

test("toasts stay inside mobile safe margins, wrap long text, and retain desktop anchoring", async () => {
  const toast = await source("../src/constants/ToastContext.js");
  assert.match(toast, /fixed inset-x-3 bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(toast, /sm:bottom-6 sm:right-6/);
  assert.match(toast, /min-w-0 break-words \[overflow-wrap:anywhere\]/);
  assert.match(toast, /shrink-0 rounded-full p-1/);
});

test("notification panel is viewport-safe on mobile and remains anchored with scrolling on desktop", async () => {
  const notifications = await source("../src/components/admin/NotificationCenter.jsx");
  assert.match(notifications, /fixed left-\[max\(0\.75rem,env\(safe-area-inset-left\)\)\] right-\[max\(0\.75rem,env\(safe-area-inset-right\)\)\]/);
  assert.match(notifications, /sm:absolute sm:left-auto sm:right-0 sm:top-full/);
  assert.match(notifications, /max-h-\[calc\(100dvh-6rem-env\(safe-area-inset-bottom\)\)\] overflow-y-auto overscroll-contain/);
  assert.match(notifications, /overflow-y-auto sm:max-h-\[min\(56vh,25rem\)\]/);
});
