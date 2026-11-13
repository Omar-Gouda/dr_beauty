import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createRecoveryProof,
  getRecoveryProofSecret,
  readRecoveryProof,
  RECOVERY_PROOF_TTL_SECONDS,
  verifyRecoveryProof,
} from "../src/lib/auth/recovery-proof.server.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("recovery proof is signed, user-bound, time-limited, and rejects tampering", () => {
  const now = Date.UTC(2026, 10, 13, 12);
  const secret = "test-only-secret-that-is-long-enough-to-sign";
  const proof = createRecoveryProof("user-a", secret, now);
  assert.ok(proof);
  assert.match(proof.nonceDigest, /^[a-f0-9]{64}$/);
  assert.equal(verifyRecoveryProof(proof.value, "user-a", secret, now), true);
  assert.deepEqual(readRecoveryProof(proof.value, "user-a", secret, now), {
    nonceDigest: proof.nonceDigest,
    expiresAt: proof.expiresAt,
  });
  assert.equal(verifyRecoveryProof(proof.value, "user-b", secret, now), false);
  assert.equal(verifyRecoveryProof(proof.value, "user-a", `${secret}-changed`, now), false);
  assert.equal(verifyRecoveryProof(`${proof.value}x`, "user-a", secret, now), false);
  assert.equal(verifyRecoveryProof(proof.value, "user-a", secret, now + RECOVERY_PROOF_TTL_SECONDS * 1000), false);
  const [, , signature] = proof.value.split(".");
  assert.equal(readRecoveryProof(`1899900000.@@@.${signature}`, "user-a", secret, now), null);
  assert.equal(createRecoveryProof("user-a", "short", now), null);
});

test("recovery proof signing uses a separate server-only secret, never the service-role key", () => {
  const prior = process.env.AUTH_RECOVERY_PROOF_SECRET;
  const priorServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.AUTH_RECOVERY_PROOF_SECRET = "a-dedicated-server-secret-with-32-bytes-minimum";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-must-not-be-used-for-signing";
    assert.equal(getRecoveryProofSecret(), process.env.AUTH_RECOVERY_PROOF_SECRET);
    process.env.AUTH_RECOVERY_PROOF_SECRET = "too-short";
    assert.equal(getRecoveryProofSecret(), null);
    delete process.env.AUTH_RECOVERY_PROOF_SECRET;
    assert.equal(getRecoveryProofSecret(), null);
  } finally {
    if (prior === undefined) delete process.env.AUTH_RECOVERY_PROOF_SECRET;
    else process.env.AUTH_RECOVERY_PROOF_SECRET = prior;
    if (priorServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = priorServiceKey;
  }
});

test("password recovery proof is minted only after a verified recovery callback and required to reset", async () => {
  const [route, page, actions, proof, migration] = await Promise.all([
    read("../src/app/auth/confirm/route.js"),
    read("../src/app/(account)/reset-password/page.js"),
    read("../src/app/(account)/actions.js"),
    read("../src/lib/auth/recovery-proof.server.mjs"),
    read("../supabase/migrations/20261210000000_one_time_password_recovery_proofs.sql"),
  ]);
  assert.match(route, /type === "recovery"[\s\S]*?establishRecoveryProof\(supabase, data\?\.session\?\.access_token\)/);
  assert.match(route, /next === "\/reset-password"[\s\S]*?establishRecoveryProof\(supabase, data\?\.session\?\.access_token\)/);
  assert.match(route, /getClaims\(accessToken\)/);
  assert.match(route, /method\?\.method === "recovery"/);
  assert.match(route, /claims\.sub !== user\.id/);
  assert.match(route, /rpc\("register_auth_recovery_proof"/);
  assert.ok(route.indexOf('rpc("register_auth_recovery_proof"') < route.indexOf("cookieStore.set(RECOVERY_PROOF_COOKIE"));
  assert.match(route, /registration\.error \|\| registration\.data !== true/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(page, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(actions, /verifyRecoveryProof\(recoveryProof, user\.id, process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(proof, /httpOnly: true/);
  assert.match(proof, /sameSite: "lax"/);
  assert.match(proof, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(page, /verifyRecoveryProof\(recoveryProof, user\.id/);
  const resetAction = actions.match(/export async function updatePassword[\s\S]*?(?=export async function changePassword)/)?.[0] ?? "";
  assert.match(resetAction, /readRecoveryProof\(recoveryProof, user\.id/);
  assert.match(resetAction, /rpc\("consume_auth_recovery_proof"/);
  const consumePosition = resetAction.indexOf('rpc("consume_auth_recovery_proof"');
  assert.ok(consumePosition < resetAction.indexOf("supabase.auth.updateUser({ password })"));
  assert.ok(consumePosition < resetAction.indexOf("cookieStore.delete(RECOVERY_PROOF_COOKIE)", consumePosition));
  assert.match(resetAction, /consumed, but the password could not be updated[\s\S]*Request a new password reset email/);
  assert.match(proof, /timingSafeEqual/);
  assert.match(proof, /randomBytes\(32\)/);
  assert.match(proof, /createHash\("sha256"\)/);
  assert.match(migration, /alter table private\.auth_recovery_proofs enable row level security/i);
  assert.match(migration, /revoke all privileges on table private\.auth_recovery_proofs[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /create index auth_recovery_proofs_expiry_idx/i);
  for (const functionName of ["register_auth_recovery_proof", "consume_auth_recovery_proof"]) {
    const body = migration.match(new RegExp(`create function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = ''/i);
    assert.match(body, /auth\.uid\(\)/);
    assert.match(body, /auth\.jwt\(\)/);
    assert.match(body, /method' = 'recovery'/);
    assert.match(migration, new RegExp(`alter function public\\.${functionName}\\([^;]* owner to postgres`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}\\([^;]*from public, anon, authenticated, service_role`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}\\([^;]*to authenticated`, "i"));
  }
  assert.match(migration, /limit 100\s+for update skip locked/i);
  assert.match(migration, /set consumed_at = pg_catalog\.clock_timestamp\(\)[\s\S]*?proof\.consumed_at is null[\s\S]*?returning true into v_consumed/i);
});

test("recovery callback and reset fail closed when nonce registration or consumption fails", async () => {
  const [route, actions] = await Promise.all([
    read("../src/app/auth/confirm/route.js"),
    read("../src/app/(account)/actions.js"),
  ]);
  const establish = route.match(/async function establishRecoveryProof[\s\S]*?\n}\n/)?.[0] ?? "";
  const resetAction = actions.match(/export async function updatePassword[\s\S]*?(?=export async function changePassword)/)?.[0] ?? "";
  assert.match(establish, /catch \{\s*return false;\s*\}/);
  assert.match(establish, /registration\.error \|\| registration\.data !== true/);
  assert.ok(establish.indexOf("registration.error") < establish.indexOf("cookieStore.set("));
  assert.match(resetAction, /consumption\.error \|\| consumption\.data !== true/);
  assert.match(resetAction, /catch \{[\s\S]*Request a new password reset email/);
});

test("signup and ordinary auth callbacks cannot register a recovery nonce", async () => {
  const route = await read("../src/app/auth/confirm/route.js");
  const establish = route.match(/async function establishRecoveryProof[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.match(establish, /method\?\.method === "recovery"/);
  const otpBranch = route.match(/if \(tokenHash && \["signup", "email", "recovery"\][\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(otpBranch, /if \(type === "recovery"\)/);
  assert.doesNotMatch(otpBranch.slice(0, otpBranch.indexOf('if (type === "recovery")')), /register_auth_recovery_proof/);
});

test("repeated registration replaces the user's previous unconsumed proof and cleans expired rows in bounded batches", async () => {
  const migration = await read("../supabase/migrations/20261210000000_one_time_password_recovery_proofs.sql");
  const register = migration.match(/create function public\.register_auth_recovery_proof[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(migration, /create unique index auth_recovery_proofs_one_unconsumed_per_user_idx\s+on private\.auth_recovery_proofs \(user_id\)\s+where consumed_at is null/i);
  assert.match(register, /delete from private\.auth_recovery_proofs as expired[\s\S]*?limit 100\s+for update skip locked/i);
  assert.match(register, /delete from private\.auth_recovery_proofs as previous\s+where previous\.user_id = v_user_id\s+and previous\.consumed_at is null/i);
  assert.ok(register.indexOf("previous.consumed_at is null") < register.indexOf("insert into private.auth_recovery_proofs"));
  assert.match(register, /on conflict \(nonce_digest\) do nothing/i);
});

test("concurrent registrations use a transaction-scoped per-user lock and unique-index invariant", async () => {
  const migration = await read("../supabase/migrations/20261210000000_one_time_password_recovery_proofs.sql");
  const register = migration.match(/create function public\.register_auth_recovery_proof[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  const lockAt = register.indexOf("pg_catalog.pg_advisory_xact_lock(");
  const invalidateAt = register.indexOf("delete from private.auth_recovery_proofs as previous");
  const insertAt = register.indexOf("insert into private.auth_recovery_proofs");
  assert.ok(lockAt >= 0 && lockAt < invalidateAt && invalidateAt < insertAt);
  assert.match(register, /hashtextextended\('dr-beauty:auth-recovery-proof:' \|\| v_user_id::text, 0\)/);
  assert.match(migration, /create unique index auth_recovery_proofs_one_unconsumed_per_user_idx/);
  assert.match(register, /on conflict \(nonce_digest\) do nothing/i);
});

test("authenticated password change passes the current password to Supabase for verification", async () => {
  const [actions, form, profile] = await Promise.all([
    read("../src/app/(account)/actions.js"),
    read("../src/components/account/ChangePasswordForm.jsx"),
    read("../src/app/(account)/profile/page.js"),
  ]);
  const changeAction = actions.match(/export async function changePassword[\s\S]*?(?=export async function updateProfile)/)?.[0] ?? "";
  assert.match(changeAction, /supabase\.auth\.getUser\(\)/);
  assert.match(changeAction, /updateUser\(\{[\s\S]*?password,[\s\S]*?current_password: currentPassword/);
  assert.match(changeAction, /password !== passwordConfirmation/);
  assert.match(form, /currentPassword/);
  assert.match(form, /submittingRef/);
  assert.match(form, /disabled=\{pending\}/);
  assert.match(profile, /<ChangePasswordForm email=\{user\.email \?\? ""\}\s*\/>/);
});

test("logged-in users leave login/register pages and server actions protect against accidental account switching", async () => {
  const [loginPage, registerPage, actions] = await Promise.all([
    read("../src/app/(account)/login/page.js"),
    read("../src/app/(account)/register/page.js"),
    read("../src/app/(account)/actions.js"),
  ]);
  assert.match(loginPage, /access\.status === "forbidden"\) redirect[\s\S]*?"\/profile"/);
  assert.match(registerPage, /supabase\.auth\.getUser\(\)/);
  assert.match(registerPage, /if \(authenticated\) redirect\("\/profile"\)/);
  assert.match(actions, /already signed in\. Sign out before using a different account/);
  assert.match(actions, /already signed in\. Sign out before creating another account/);
});

test("desktop navbar keeps the account icon without adding logged-out text buttons", async () => {
  const [navbar, footer] = await Promise.all([
    read("../src/components/layout/Navbar.jsx"),
    read("../src/components/layout/Footer.jsx"),
  ]);
  const desktop = navbar.slice(navbar.indexOf("{/* Desktop Navigation Links */}"), navbar.indexOf("<div className=\"lg:hidden\">"));
  const mobile = navbar.slice(navbar.indexOf("{mobileMenuOpen &&"));
  assert.doesNotMatch(desktop, /Sign In|Create Account/);
  assert.match(desktop, /href=\{accountHref\}[\s\S]*?<User aria-hidden="true"/);
  assert.match(navbar, /const accountHref = authenticated \? "\/profile" : "\/login"/);
  assert.match(mobile, /Sign In[\s\S]*?Create Account/);
  assert.match(footer, /href: "\/login", label: "My Account"/);
  assert.match(footer, /href: "\/register", label: "Create Account"/);
});

test("email change remains unavailable rather than bypassing Supabase verification", async () => {
  const [profile, actions] = await Promise.all([
    read("../src/components/account/ProfileEditor.jsx"),
    read("../src/app/(account)/actions.js"),
  ]);
  assert.match(profile, /Email is managed by Supabase Auth and cannot be changed here/);
  assert.doesNotMatch(actions, /updateUser\(\{\s*email:/);
});
