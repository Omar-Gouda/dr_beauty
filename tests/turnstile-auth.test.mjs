import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTurnstileToken } from "../src/lib/auth/turnstile-token.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function formDataFor(value) {
  return { get: (name) => (name === "captchaToken" ? value : null) };
}

test("server token reader rejects missing, empty, non-string, and oversized CAPTCHA values", () => {
  assert.equal(getTurnstileToken(formDataFor(null)), null);
  assert.equal(getTurnstileToken(formDataFor("")), null);
  assert.equal(getTurnstileToken(formDataFor("  \n ")), null);
  assert.equal(getTurnstileToken(formDataFor(new File([], "token"))), null);
  assert.equal(getTurnstileToken(formDataFor("x".repeat(4097))), null);
});

test("verified CAPTCHA token is passed to signup, password login, and recovery email without changing generic Auth errors", async () => {
  const actions = await read("../src/app/(account)/actions.js");
  const login = actions.match(/export async function login[\s\S]*?(?=export async function register)/)?.[0] ?? "";
  const register = actions.match(/export async function register[\s\S]*?(?=export async function requestPasswordReset)/)?.[0] ?? "";
  const forgot = actions.match(/export async function requestPasswordReset[\s\S]*?(?=export async function updatePassword)/)?.[0] ?? "";

  for (const action of [login, register, forgot]) {
    assert.match(action, /getTurnstileToken\(formData\)/);
    assert.match(action, /if \(!captchaToken\) return \{ error: TURNSTILE_TOKEN_ERROR \}/);
  }
  assert.match(login, /signInWithPassword\(\{ email, password, options: \{ captchaToken \} \}\)/);
  assert.match(register, /captchaToken,/);
  assert.match(register, /We could not complete registration right now\. Please try again\./);
  assert.match(forgot, /resetPasswordForEmail\(email, \{ redirectTo, captchaToken \}\)/);
  assert.match(forgot, /If an account matches that address, a password reset email will arrive shortly\./);
  assert.match(register, /registrationSensitiveValues = \[[^\]]*captchaToken/);
});

test("auth forms submit only a widget token, block while unverified, and reset after an action response", async () => {
  const [form, widget] = await Promise.all([
    read("../src/components/account/AuthForm.jsx"),
    read("../src/components/account/TurnstileChallenge.jsx"),
  ]);
  assert.match(form, /name="captchaToken" value=\{captchaToken\}/);
  assert.match(form, /disabled=\{pending \|\| \(requiresCaptcha && !captchaToken\)\}/);
  assert.match(form, /if \(wasPending\.current\)/);
  assert.match(form, /captchaRef\.current\?\.reset\(\)/);
  assert.match(widget, /process\.env\.NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(widget, /onSuccess=\{handleSuccess\}/);
  assert.match(widget, /onExpire=\{\(\) => clearToken\("expired"\)\}/);
  assert.match(widget, /onError=\{\(\) => clearToken\("error"\)\}/);
  assert.match(widget, /refreshExpired: "auto"/);
  assert.doesNotMatch(widget, /secret|SUPABASE_SERVICE_ROLE_KEY/);
});

test("CAPTCHA rejection does not expose account existence or alter password and consent validation", async () => {
  const actions = await read("../src/app/(account)/actions.js");
  const register = actions.match(/export async function register[\s\S]*?(?=export async function requestPasswordReset)/)?.[0] ?? "";
  const login = actions.match(/export async function login[\s\S]*?(?=export async function register)/)?.[0] ?? "";
  const forgot = actions.match(/export async function requestPasswordReset[\s\S]*?(?=export async function updatePassword)/)?.[0] ?? "";
  assert.match(login, /if \(error\) return \{ error: "Email or password is incorrect\. Please try again\." \}/);
  assert.match(register, /if \(error\)[\s\S]*?We could not complete registration right now\. Please try again\./);
  assert.match(register, /password !== passwordConfirmation/);
  assert.match(register, /readText\(formData, "policyConsent"\) !== "accepted"/);
  assert.match(forgot, /catch \{[\s\S]*?Keep the response the same for existing and unknown addresses/);
});

test("Turnstile is limited to login, signup, and forgot password; recovery proof action stays independent", async () => {
  const [form, actions] = await Promise.all([
    read("../src/components/account/AuthForm.jsx"),
    read("../src/app/(account)/actions.js"),
  ]);
  assert.match(form, /mode === "login" \|\| mode === "register" \|\| mode === "forgot"/);
  const reset = actions.match(/export async function updatePassword[\s\S]*?(?=export async function changePassword)/)?.[0] ?? "";
  assert.match(reset, /readRecoveryProof\(recoveryProof, user\.id/);
  assert.match(reset, /rpc\("consume_auth_recovery_proof"/);
  assert.doesNotMatch(reset, /getTurnstileToken/);
});
