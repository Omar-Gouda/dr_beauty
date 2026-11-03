import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20261118000000_customer_support_request_cooldown.sql",
  import.meta.url,
);
const baseMigrationPath = new URL(
  "../supabase/migrations/20261103000000_customer_service_requests.sql",
  import.meta.url,
);
const actionPath = new URL("../src/app/(store)/actions.js", import.meta.url);
const formPath = new URL("../src/components/requests/CustomerRequestForm.jsx", import.meta.url);

async function loadSources() {
  return Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(baseMigrationPath, "utf8"),
    readFile(actionPath, "utf8"),
    readFile(formPath, "utf8"),
  ]);
}

test("new support submissions use a 15-minute per-account transactional cooldown", async () => {
  const [migration] = await loadSources();
  const fn = migration.match(/create or replace function public\.submit_customer_service_request\([\s\S]*?\n\$\$;/i)?.[0];

  assert.ok(fn, "expected key-aware request RPC");
  assert.match(fn, /v_customer_id uuid := auth\.uid\(\)/i);
  assert.match(fn, /pg_catalog\.pg_advisory_xact_lock\([\s\S]*?v_customer_id::text/i);
  assert.match(fn, /if p_request_type = 'support' and exists/i);
  assert.match(fn, /existing_request\.customer_id = v_customer_id/i);
  assert.match(fn, /existing_request\.request_type = 'support'/i);
  assert.match(fn, /created_at > v_now - interval '15 minutes'/i);
  assert.match(fn, /errcode = 'PZ001'/i);
  assert.doesNotMatch(fn, /ip_address|x_forwarded_for|client_addr/i);
});

test("committed retries return their original request before cooldown or notifications", async () => {
  const [migration, base] = await loadSources();
  const fn = migration.match(/create or replace function public\.submit_customer_service_request\([\s\S]*?\n\$\$;/i)?.[0];
  const keyLookup = fn.indexOf("from private.customer_service_request_submissions");
  const cooldown = fn.indexOf("if p_request_type = 'support' and exists");
  const insertRequest = fn.indexOf("insert into public.customer_service_requests");
  const insertBinding = fn.indexOf("insert into private.customer_service_request_submissions");
  assert.ok(keyLookup >= 0 && cooldown > keyLookup && insertRequest > cooldown && insertBinding > insertRequest);
  assert.match(fn, /return v_existing_request\.id/i);
  assert.match(fn, /v_existing_request\.question is distinct from pg_catalog\.btrim\(p_question\)/i);
  assert.match(migration, /primary key \(customer_id, submission_key\)/i);
  assert.match(migration, /request_id uuid not null unique[\s\S]*references public\.customer_service_requests \(id\) on delete cascade/i);

  assert.match(base, /create function private\.notify_admin_of_customer_service_request\([\s\S]*?on conflict do nothing/i);
  assert.match(base, /create trigger customer_service_requests_notify_admin\s+after insert on public\.customer_service_requests/i);
  assert.match(migration, /revoke all on table private\.customer_service_request_submissions\s+from public, anon, authenticated, service_role/i);
});

test("per-account lock precedes the fresh cooldown lookup and other users are excluded", async () => {
  const [migration] = await loadSources();
  const fn = migration.match(/create or replace function public\.submit_customer_service_request\([\s\S]*?\n\$\$;/i)?.[0];
  const lock = fn.indexOf("pg_catalog.pg_advisory_xact_lock");
  const cooldown = fn.indexOf("if p_request_type = 'support' and exists");
  assert.ok(lock >= 0 && cooldown > lock);
  assert.match(fn, /language plpgsql\s+volatile/i);
  assert.match(fn, /existing_request\.customer_id = v_customer_id/i);
  assert.match(fn, /order_row\.user_id = v_customer_id/i);
  assert.match(fn, /if v_customer_id is null[\s\S]*?errcode = '28000'/i);
});

test("validation, ownership, admin notification and RPC privilege boundaries are preserved", async () => {
  const [migration, base, action] = await loadSources();
  const fn = migration.match(/create or replace function public\.submit_customer_service_request\([\s\S]*?\n\$\$;/i)?.[0];

  assert.match(fn, /category not in \([\s\S]*?'order_cancellation'[\s\S]*?'general'/i);
  assert.match(fn, /selected order is unavailable/i);
  assert.match(fn, /order_row\.id = p_order_id and order_row\.user_id = v_customer_id/i);
  assert.match(fn, /product_row\.id = p_product_id and product_row\.is_active/i);
  assert.match(migration, /grant execute on function public\.submit_customer_service_request\([\s\S]*?uuid\n\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.submit_customer_service_request\([\s\S]*?uuid\n\) from public, anon, service_role/i);
  assert.match(migration, /create or replace function public\.submit_customer_service_request\([\s\S]*?p_contact_value text\n\)[\s\S]*?pg_catalog\.gen_random_uuid\(\)/i);
  assert.match(base, /create trigger customer_service_requests_notify_admin\s+after insert/i);
  assert.match(action, /p_submission_key: submissionKey/i);
  assert.match(action, /error\.code === "PZ001"[\s\S]*?code: "cooldown"/i);
});

test("form keeps a submission key across ambiguous retries and clears it after success", async () => {
  const [, , , form] = await loadSources();
  assert.match(form, /sessionStorage\.getItem\(storageKey\)/i);
  assert.match(form, /window\.crypto\.randomUUID\(\)/i);
  assert.match(form, /formData\.set\("submissionKey", submissionKey\)/i);
  assert.match(form, /window\.sessionStorage\.removeItem\(storageKey\)/i);
  assert.match(form, /result\?\.code === "request_conflict"/i);
});

