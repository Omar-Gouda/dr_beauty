import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20261105000000_admin_order_email_outbox.sql",
  import.meta.url,
);
const schemaPath = new URL(
  "../supabase/migrations/20261021000000_initial_schema.sql",
  import.meta.url,
);

async function loadSql() {
  const [migration, schema] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  return { migration, schema };
}

function extractFunction(sql, functionName, nextFunctionName) {
  const start = sql.indexOf(`create function public.${functionName}(`);
  assert.notEqual(start, -1, `expected ${functionName} definition`);
  const end = sql.indexOf(`create function public.${nextFunctionName}(`, start);
  assert.notEqual(end, -1, `expected function after ${functionName}`);
  return sql.slice(start, end);
}

test("admin email claims require a current role row without multiplying candidates", async () => {
  const { migration, schema } = await loadSql();
  const claim = extractFunction(
    migration,
    "claim_admin_order_email_notifications",
    "complete_admin_order_email_notification",
  );
  const picked = claim.match(/with picked as materialized\s*\(([\s\S]*?)\), claimed as/i)?.[1];

  assert.ok(picked, "expected materialized claim candidate query");
  assert.match(picked, /and exists\s*\([\s\S]*?from public\.user_roles as role_row/i);
  assert.match(picked, /role_row\.user_id\s*=\s*delivery\.recipient_user_id/i);
  assert.match(picked, /role_row\.role\s*=\s*'admin'/i);
  assert.doesNotMatch(picked, /join public\.user_roles/i);
  assert.match(picked, /for update of delivery skip locked/i);
  assert.match(schema, /create table public\.user_roles\s*\([\s\S]*?user_id uuid primary key/i);

  // EXISTS admits a candidate with an admin row, excludes recipients with no
  // current admin row (including demoted users), and cannot duplicate a row if
  // role data is ever non-unique. These are source-contract checks, not SQL execution.
  const rolePredicate = (roles, recipientId) => roles.some(
    (role) => role.user_id === recipientId && role.role === "admin",
  );
  assert.equal(rolePredicate([{ user_id: "admin-1", role: "admin" }], "admin-1"), true);
  assert.equal(rolePredicate([{ user_id: "admin-1", role: "customer" }], "admin-1"), false);
  assert.equal(rolePredicate([], "admin-1"), false);
  assert.equal(rolePredicate([
    { user_id: "admin-1", role: "admin" },
    { user_id: "admin-1", role: "admin" },
  ], "admin-1"), true);
});

test("admin email claims retain retry, lease recovery, and claim-token fencing", async () => {
  const { migration } = await loadSql();
  const claim = extractFunction(
    migration,
    "claim_admin_order_email_notifications",
    "complete_admin_order_email_notification",
  );
  const complete = extractFunction(
    migration,
    "complete_admin_order_email_notification",
    "fail_admin_order_email_notification",
  );
  const fail = migration.slice(migration.indexOf("create function public.fail_admin_order_email_notification("));

  assert.match(claim, /v_max_attempts constant integer := 5/i);
  assert.match(claim, /attempt_count\s*<\s*v_max_attempts/i);
  assert.match(claim, /attempt_count\s*>=\s*v_max_attempts/i);
  assert.match(claim, /locked_until\s*<=\s*v_now/i);
  assert.match(claim, /claim_token\s*=\s*pg_catalog\.gen_random_uuid\(\)/i);
  assert.match(claim, /attempt_count\s*=\s*delivery\.attempt_count\s*\+\s*1/i);

  assert.match(complete, /delivery\.claim_token\s*=\s*p_claim_token/i);
  assert.match(complete, /delivery\.locked_until\s*>\s*pg_catalog\.clock_timestamp\(\)/i);
  assert.match(fail, /delivery\.claim_token\s*=\s*p_claim_token/i);
  assert.match(fail, /v_lease\s*<=\s*pg_catalog\.clock_timestamp\(\)/i);
  assert.match(fail, /for update/i);
  assert.match(fail, /v_error_code in \('rate_limited', 'unknown_failure'\)/i);
});
