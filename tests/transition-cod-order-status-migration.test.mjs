import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const originalMigrationPath = new URL(
  "../supabase/migrations/20261027000000_order_lifecycle.sql",
  import.meta.url,
);
const correctiveMigrationPath = new URL(
  "../supabase/migrations/20261107000000_transition_cod_order_status_variable_resolution.sql",
  import.meta.url,
);

function extractTransitionFunction(sql) {
  const matches = sql.match(
    /create(?: or replace)? function public\.transition_cod_order_status\([\s\S]*?\n\$\$;/gi,
  );
  assert.equal(matches?.length, 1, "expected one transition function definition");
  return matches[0];
}

function normalizeLineEndings(value) {
  return value.replaceAll("\r\n", "\n");
}

test("corrective migration changes only PL/pgSQL variable resolution", async () => {
  const [originalSql, correctiveSql] = await Promise.all([
    readFile(originalMigrationPath, "utf8"),
    readFile(correctiveMigrationPath, "utf8"),
  ]);
  const originalFunction = extractTransitionFunction(originalSql);
  const expectedFunction = originalFunction
    .replace(/^create function/i, "create or replace function")
    .replace(/(as \$\$)\r?\n/i, "$1\n#variable_conflict use_column\n");
  const replacementFunction = extractTransitionFunction(correctiveSql);

  assert.equal(normalizeLineEndings(replacementFunction), normalizeLineEndings(expectedFunction));
  assert.match(replacementFunction, /returns table\s*\([\s\S]*?order_status text/i);
  assert.match(replacementFunction, /security definer/i);
  assert.match(replacementFunction, /set search_path = ''/i);
  assert.equal(
    (replacementFunction.match(/on conflict \(order_id, delivery_type, channel, order_status\)/gi) ?? []).length,
    2,
  );
  assert.match(correctiveSql.trimEnd(), /commit;$/i);
  assert.doesNotMatch(correctiveSql, /\b(?:grant|revoke)\b/i);
});
