import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Account Security shows one masked password status and opens a themed dialog only on request", async () => {
  const [profilePage, profileEditor, form, dialog] = await Promise.all([
    read("../src/app/(account)/profile/page.js"),
    read("../src/components/account/ProfileEditor.jsx"),
    read("../src/components/account/ChangePasswordForm.jsx"),
    read("../src/components/ui/AccessibleDialog.jsx"),
  ]);

  assert.match(profilePage, /<ChangePasswordForm email=\{user\.email \?\? ""\}\s*\/>/);
  assert.doesNotMatch(profilePage, /href="\/forgot-password"/);
  assert.doesNotMatch(profileEditor, /ChangePasswordForm/);
  assert.match(form, /aria-label="Password is set"[\s\S]*?••••••••••••/);
  assert.match(form, /setDialogOpen\(true\)/);
  assert.match(form, />Change Password<\/Button>/);
  assert.match(form, /dialogOpen &&\s*\(/);
  assert.match(form, /<AccessibleDialog/);
  assert.match(form, /labelledBy="account-password-dialog-title"/);
  assert.match(dialog, /dialog\.showModal\(\)/);
  assert.match(dialog, /closeRef\.current\?\.\(\)/);
});

test("password dialog provides labeled show-hide fields, inline validation feedback, save and cancel", async () => {
  const [form, actions] = await Promise.all([
    read("../src/components/account/ChangePasswordForm.jsx"),
    read("../src/app/(account)/actions.js"),
  ]);
  const change = actions.match(/export async function changePassword[\s\S]*?(?=export async function updateProfile)/)?.[0] ?? "";
  assert.match(form, /label="Current Password"/);
  assert.match(form, /label="New Password"/);
  assert.match(form, /label="Confirm New Password"/);
  assert.match(form, /Save Changes/);
  assert.match(form, /onClick=\{closeDialog\}>Cancel/);
  assert.match(form, /Forgot your current password\?/);
  assert.match(form, /<PasswordField/);
  assert.match(form, /role=\{message\.ok \? "status" : "alert"\}/);
  assert.match(form, /setDialogOpen\(false\)/);
  assert.match(form, /form\.reset\(\)/);
  assert.match(change, /if \(!currentPassword \|\| currentPassword\.length > 256\)/);
  assert.match(change, /password !== passwordConfirmation/);
  assert.match(change, /currentPassword === password/);
  assert.match(change, /supabase\.auth\.getUser\(\)/);
  assert.match(change, /current_password: currentPassword/);
  assert.match(change, /We could not verify your current password or update your password/);
});

test("forgot-current-password uses the existing CAPTCHA-protected recovery action", async () => {
  const [form, actions, widget] = await Promise.all([
    read("../src/components/account/ChangePasswordForm.jsx"),
    read("../src/app/(account)/actions.js"),
    read("../src/components/account/TurnstileChallenge.jsx"),
  ]);
  const recoveryAction = actions.match(/export async function requestPasswordReset[\s\S]*?(?=export async function updatePassword)/)?.[0] ?? "";
  assert.match(form, /need access to that inbox/);
  assert.match(form, /formData\.set\("email", email \?\? ""\)/);
  assert.match(form, /formData\.set\("captchaToken", captchaToken\)/);
  assert.match(form, /runSubmission\(requestPasswordReset, formData/);
  assert.match(form, /<TurnstileChallenge ref=\{captchaRef\}/);
  assert.match(form, /disabled=\{pending \|\| !captchaToken\}/);
  assert.match(form, /captchaRef\.current\?\.reset\(\)/);
  assert.match(recoveryAction, /getTurnstileToken\(formData\)/);
  assert.match(recoveryAction, /resetPasswordForEmail\(email, \{ redirectTo, captchaToken \}\)/);
  assert.match(recoveryAction, /If an account matches that address, a password reset email will arrive shortly\./);
  assert.match(widget, /onExpire=\{\(\) => clearToken\("expired"\)\}/);
  assert.match(widget, /onError=\{\(\) => clearToken\("error"\)\}/);
});

test("existing recovery proof protections remain in place", async () => {
  const actions = await read("../src/app/(account)/actions.js");
  const reset = actions.match(/export async function updatePassword[\s\S]*?(?=export async function changePassword)/)?.[0] ?? "";
  assert.match(reset, /readRecoveryProof\(recoveryProof, user\.id/);
  assert.match(reset, /rpc\("consume_auth_recovery_proof"/);
  assert.ok(reset.indexOf('rpc("consume_auth_recovery_proof"') < reset.indexOf("supabase.auth.updateUser({ password })"));
  assert.match(reset, /consumed, but the password could not be updated[\s\S]*Request a new password reset email/);
});
