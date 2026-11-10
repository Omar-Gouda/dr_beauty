import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, isPolicyConsentCurrent, safePolicyReturnPath } from "../src/lib/legal/policy-versions.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("customer legal routes contain the complete site-specific policy sections and established contact", async () => {
  const [terms, privacy, legacyTerms, legacyPrivacy] = await Promise.all([
    read("../src/app/(store)/terms-and-conditions/page.js"),
    read("../src/app/(store)/privacy-policy/page.js"),
    read("../src/app/(store)/terms/page.js"),
    read("../src/app/(store)/privacy/page.js"),
  ]);
  for (const phrase of ["Products, prices and availability", "Cash on Delivery", "Shipping and delivery", "Cancellations, returns and refunds", "Promotions and customer rankings", "Reviews and submitted content", "WhatsApp communications", "intellectual property"]) {
    assert.ok(terms.toLowerCase().includes(phrase.toLowerCase()), `terms cover ${phrase}`);
  }
  for (const phrase of ["Information handled", "Promotions and public rankings", "Cookies and browser storage", "Service providers and safeguards", "international", "Retention and deletion", "privacy rights"]) {
    assert.ok(privacy.toLowerCase().includes(phrase.toLowerCase()), `privacy covers ${phrase}`);
  }
  assert.match(terms, /Effective date:|effectiveDate/);
  assert.match(privacy, /Effective date:|effectiveDate/);
  assert.match(privacy, /45 days/);
  assert.match(terms, /mailto:radwahassan968@gmail\.com/);
  assert.match(privacy, /mailto:radwahassan968@gmail\.com/);
  for (const document of [terms, privacy]) assert.doesNotMatch(document, /Owner Confirmation Required|TODO:|INSERT .* HERE/i);
  assert.match(terms, /sections=\{sections\.map/);
  assert.match(privacy, /sections=\{sections\.map/);
  assert.match(legacyTerms, /redirect\("\/terms-and-conditions"\)/);
  assert.match(legacyPrivacy, /redirect\("\/privacy-policy"\)/);
});

test("new account signup requires both policies server-side and stores version metadata", async () => {
  const [form, actions, migration] = await Promise.all([
    read("../src/components/account/AuthForm.jsx"),
    read("../src/app/(account)/actions.js"),
    read("../supabase/migrations/20261206000000_account_policy_consent.sql"),
  ]);
  assert.match(form, /name="policyConsent" type="checkbox" value="accepted" required/);
  assert.match(form, /href="\/terms-and-conditions" target="_blank"/);
  assert.match(form, /href="\/privacy-policy" target="_blank"/);
  assert.match(actions, /readText\(formData, "policyConsent"\) !== "accepted"/);
  assert.match(actions, /accepted_terms_version: CURRENT_TERMS_VERSION/);
  assert.match(actions, /accepted_privacy_version: CURRENT_PRIVACY_VERSION/);
  assert.match(migration, /create table private\.account_policy_acceptances/);
  assert.match(migration, /accepted_at timestamptz not null default pg_catalog\.clock_timestamp\(\)/);
  assert.match(migration, /after insert on auth\.users[\s\S]*?execute function private\.record_required_policy_consent/);
  assert.match(migration, /grant execute on function public\.accept_current_policy_versions\(\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.accept_current_policy_versions\(\)[\s\S]*?to anon/i);
});

test("policy version changes can be required again and return paths cannot escape the site", async () => {
  assert.equal(CURRENT_TERMS_VERSION, "terms-2026-11-10-r2");
  assert.equal(CURRENT_PRIVACY_VERSION, "privacy-2026-11-10-r2");
  assert.equal(isPolicyConsentCurrent({ needs_acceptance: false }), true);
  assert.equal(isPolicyConsentCurrent({ needs_acceptance: true }), false);
  assert.equal(safePolicyReturnPath("/orders/12?view=receipt"), "/orders/12?view=receipt");
  for (const path of ["//evil.test", "https://evil.test", "/accept-policies", "/\\evil.test"]) {
    assert.equal(safePolicyReturnPath(path), "/profile");
  }

  const [actions, gate, profile, addresses, orders, orderDetail, checkout, checkoutAction] = await Promise.all([
    read("../src/app/(account)/actions.js"),
    read("../src/lib/legal/consent-gate.js"),
    read("../src/app/(account)/profile/page.js"),
    read("../src/app/(account)/addresses/page.js"),
    read("../src/app/(account)/orders/page.js"),
    read("../src/app/(account)/orders/[orderNumber]/page.js"),
    read("../src/app/(checkout)/checkout/page.js"),
    read("../src/app/(checkout)/checkout/actions.js"),
  ]);
  assert.match(actions, /get_current_policy_consent_status/);
  assert.match(actions, /accept_current_policy_versions/);
  for (const page of [profile, addresses, orders, orderDetail, checkout]) assert.match(page, /redirectForPolicyAcceptance/);
  assert.match(checkoutAction, /redirectForPolicyAcceptance/);
  assert.match(gate, /safePolicyReturnPath/);
});
