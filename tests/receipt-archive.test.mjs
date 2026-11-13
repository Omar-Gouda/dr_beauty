import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import test from "node:test";
import { createReceiptArchiveWorkbook, getReceiptArchiveWorkbookColumns } from "../src/lib/receipt-archive-xlsx.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function unzipLocalFiles(buffer) {
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const compressedLength = buffer.readUInt32LE(offset + 18);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    files.set(name, inflateRawSync(buffer.subarray(dataStart, dataStart + compressedLength)).toString("utf8"));
    offset = dataStart + compressedLength;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "ZIP central directory follows its local entries");
  return files;
}

test("receipt workbook is a valid two-sheet XLSX with exact snapshot values and spreadsheet-safe customer text", () => {
  const workbook = createReceiptArchiveWorkbook([{
    archiveId: "archive-uuid", archiveSource: "retention", snapshotVersion: 1,
    archivedAt: "2026-11-10T11:15:00.000Z",
    snapshot: {
      internal_archive_reference: "ARCHIVE-123", order_number: "123", customer_name: "=HYPERLINK(\"https://bad.test\")",
      customer_email: "customer@example.test", customer_phone: "201000000000", created_at: "2026-11-01T10:00:00.000Z",
      delivered_at: "2026-11-08T10:00:00.000Z", order_status: "delivered", payment_method: "cod", payment_status: "paid",
      promotion_code: "SAVE10", currency: "EGP", subtotal: "1000.00", discount_amount: "100.00", shipping_fee_amount: "50.00",
      shipping_discount_amount: "0.00", gift_packaging_fee_amount: "0.00", total_amount: "950.00", governorate: "Cairo",
      city: "Nasr City", address_line: "5 Test Street", delivery_notes: null,
      items: [{ product_name: "Historical cream", product_slug: "cream-snapshot", product_id: null, quantity: 2, unit_price: "500.00", line_total: "1000.00", promotion_discount_amount: "100.00" }],
    },
  }]);
  assert.equal(workbook.readUInt32LE(0), 0x04034b50);
  const files = unzipLocalFiles(workbook);
  assert.ok(files.has("xl/workbook.xml"));
  assert.ok(files.has("xl/worksheets/sheet1.xml"));
  assert.ok(files.has("xl/worksheets/sheet2.xml"));
  const receipts = files.get("xl/worksheets/sheet1.xml");
  const items = files.get("xl/worksheets/sheet2.xml");
  assert.match(receipts, /Internal archive reference/);
  assert.match(receipts, /Archive record ID/);
  assert.match(receipts, /archive-uuid/);
  assert.match(receipts, /Final order total/);
  assert.match(receipts, /ARCHIVE-123/);
  assert.ok(receipts.includes('&quot;https://bad.test&quot;'));
  assert.match(receipts, /t="inlineStr"/);
  assert.doesNotMatch(receipts + items, /<f(?:\s|>)/i);
  assert.match(items, /Historical line total/);
  assert.match(items, /Final item total/);
  assert.match(items, /<v>500\.00<\/v>/);
  assert.match(items, /<v>900\.00<\/v>/);
});

test("archive workbook column sets include transaction identity, customer and historical item detail", () => {
  const columns = getReceiptArchiveWorkbookColumns();
  for (const value of ["Archive record ID", "Internal archive reference", "Customer name", "Customer email", "Customer phone", "Order date (UTC)", "Delivery date (UTC)", "Subtotal", "Promotion discount", "Delivery charge", "Final order total"]) assert.ok(columns.receipts.includes(value));
  for (const value of ["Product name", "Quantity", "Unit price", "Historical line total", "Promotion discount", "Final item total"]) assert.ok(columns.items.includes(value));
});

test("archive schema is private, immutable, independent of operational foreign keys, and chronologically ordered", async () => {
  const [migration, migrations] = await Promise.all([
    read("../supabase/migrations/20261209000000_receipt_archive_before_order_retention.sql"),
    readdir(new URL("../supabase/migrations/", import.meta.url)),
  ]);
  const ordered = migrations.filter((name) => name.endsWith(".sql")).sort();
  assert.ok(ordered.indexOf("20261209000000_receipt_archive_before_order_retention.sql") < ordered.indexOf("20261210000000_one_time_password_recovery_proofs.sql"));
  assert.match(migration, /create table private\.receipt_archive[\s\S]*?original_order_id uuid not null unique[\s\S]*?original_order_number bigint not null unique/);
  const archiveDdl = migration.match(/create table private\.receipt_archive \([\s\S]*?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(archiveDdl, /references\s+(?:public\.)?(?:orders|order_items|products|profiles)/i);
  for (const table of ["receipt_archive", "receipt_archive_failures", "receipt_archive_exports", "receipt_archive_settings"]) {
    assert.match(migration, new RegExp(`alter table private\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all privileges on table private\\.${table} from public, anon, authenticated, service_role`, "i"));
  }
  assert.match(migration, /before update or delete on private\.receipt_archive/);
  assert.match(migration, /raise exception 'Receipt archive records are immutable'/);
});

test("hard-delete and daily retention paths archive and verify snapshots before deleting operational rows", async () => {
  const migration = await read("../supabase/migrations/20261209000000_receipt_archive_before_order_retention.sql");
  const snapshot = migration.match(/create function private\.archive_order_snapshot[\s\S]*?\$\$;/i)?.[0] ?? "";
  const helper = migration.match(/create or replace function private\.hard_delete_order_rows[\s\S]*?\$\$;/i)?.[0] ?? "";
  const cleanup = migration.match(/create or replace function private\.run_order_retention_cleanup[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(snapshot, /public\.orders/);
  assert.match(snapshot, /public\.order_items/);
  assert.match(snapshot, /product_name_snapshot/);
  assert.match(snapshot, /promotion_discount_amount/);
  assert.match(snapshot, /shipping_fee_amount/);
  assert.match(snapshot, /delivered_at/);
  assert.match(snapshot, /status_history/);
  assert.match(snapshot, /inventory_restored_at/);
  assert.match(snapshot, /on conflict \(original_order_id\) do nothing/);
  assert.match(snapshot, /v_existing_snapshot is distinct from v_snapshot/);
  assert.doesNotMatch(snapshot, /from public\.products/);
  assert.ok(helper.indexOf("private.archive_order_snapshot") < helper.indexOf("delete from public.orders"));
  assert.match(helper, /Receipt archival failed verification; order deletion was blocked/);
  assert.match(cleanup, /order_row\.order_status in \('delivered', 'cancelled'\)/);
  assert.match(cleanup, /interval '45 days'/);
  assert.match(cleanup, /pg_advisory_xact_lock/);
  assert.match(cleanup, /private\.archive_order_snapshot\(v_candidate\.id, 'retention'\)/);
  assert.match(cleanup, /receipt_archive_failures/);
});

test("export RPCs are admin-guarded, keyset-paged, incremental, and auditable", async () => {
  const [migration, route, page, dashboard, summary] = await Promise.all([
    read("../supabase/migrations/20261209000000_receipt_archive_before_order_retention.sql"),
    read("../src/app/admin/orders/receipts/export/route.js"),
    read("../src/app/admin/orders/receipts/page.js"),
    read("../src/components/admin/AdminDashboard.jsx"),
    read("../src/components/admin/AdminReceiptArchiveSummary.jsx"),
  ]);
  for (const name of ["begin_admin_receipt_archive_export", "get_admin_receipt_archive_export_page", "finish_admin_receipt_archive_export", "admin_receipt_archive_overview"]) {
    const fn = migration.match(new RegExp(`create function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(fn, /auth\.uid\(\) is null or not coalesce\(private\.is_admin\(\), false\)/i);
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(`, "i"));
  }
  assert.match(migration, /export\.export_mode = 'incremental' and export\.result = 'succeeded'/);
  assert.match(migration, /create table private\.receipt_archive_export_items/);
  assert.match(migration, /-- Freeze membership at export start/);
  assert.match(migration, /previous_export\.export_mode = 'incremental'[\s\S]*?previous_export\.result = 'succeeded'/);
  assert.match(migration, /v_staged_count is distinct from p_record_count/);
  assert.doesNotMatch(migration, /archive\.archived_at <= v_export\.through_archived_at/);
  assert.match(route, /getAdminRequestAccess\(\)/);
  assert.match(route, /get_admin_receipt_archive_export_page/);
  assert.match(route, /finish_admin_receipt_archive_export/);
  assert.match(route, /no customer data was written to application logs/);
  assert.match(page, /AdminReceiptArchiveManager/);
  assert.match(dashboard, /AdminReceiptArchiveSummary/);
  assert.match(summary, /Download Receipt Archive/);
});
