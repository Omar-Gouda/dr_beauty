"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { getAuthCallbackUrl } from "@/lib/site-url.mjs";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policy-versions.mjs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(email) {
  return email.length <= 320 && emailPattern.test(email);
}

function normalizeSignupPhone(value) {
  if (!value || value.length > 40) return null;

  const asciiDigits = value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  const compact = asciiDigits.trim().replace(/[\s().-]/g, "");
  let normalized;

  if (/^00\d+$/.test(compact)) normalized = `+${compact.slice(2)}`;
  else if (/^\+\d+$/.test(compact)) normalized = compact;
  else if (/^0\d+$/.test(compact)) normalized = `+20${compact.slice(1)}`;
  else if (/^20\d+$/.test(compact)) normalized = `+${compact}`;
  else return null;

  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function missingConfigurationMessage() {
  const missing = getMissingSupabaseEnv();
  return missing.length
    ? `Authentication is not configured. Missing: ${missing.join(", ")}.`
    : null;
}

function registrationErrorDetails(error, sensitiveValues = []) {
  const code = typeof error?.code === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(error.code)
    ? error.code
    : "unavailable";
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599
    ? error.status
    : null;
  let message = typeof error?.message === "string" ? error.message : "Unexpected error";
  for (const value of sensitiveValues) {
    if (typeof value === "string" && value.length >= 3) message = message.split(value).join("[redacted]");
  }
  message = message
    .replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[redacted email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted phone]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[redacted id]")
    .replace(/\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}(?:\.[a-zA-Z0-9_-]{8,})?\b/g, "[redacted token]")
    .replace(/\b(?=[a-zA-Z0-9_-]{32,}\b)(?=[a-zA-Z0-9_-]*[a-zA-Z])(?=[a-zA-Z0-9_-]*\d)[a-zA-Z0-9_-]+\b/g, "[redacted credential]")
    .replace(/[\r\n\t\0-\x1f\x7f]+/g, " ")
    .slice(0, 240)
    .trim();
  return { code, status, message: message || "Unexpected error" };
}

// Temporary registration diagnostics. Remove after the production failure is identified.
function logRegistrationStage(stage, outcome, details) {
  const label = `[auth-register] stage=${stage} outcome=${outcome}`;
  if (details) {
    console.error(label, details);
  } else {
    console.info(label);
  }
}

async function runRegistrationStage(stage, operation, sensitiveValues) {
  logRegistrationStage(stage, "start");
  try {
    const result = await operation();
    logRegistrationStage(stage, "complete");
    return result;
  } catch (error) {
    logRegistrationStage(stage, "threw", registrationErrorDetails(error, sensitiveValues));
    throw error;
  }
}

function safePath(value, fallback = "/profile") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://dr-beauty.invalid");
    if (url.origin !== "https://dr-beauty.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function hasSafeNext(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const url = new URL(value, "https://dr-beauty.invalid");
    return url.origin === "https://dr-beauty.invalid" && url.pathname !== "/login";
  } catch {
    return false;
  }
}

export async function login(_previousState, formData) {
  const configurationMessage = missingConfigurationMessage();
  if (configurationMessage) return { error: configurationMessage };

  const email = readText(formData, "email").toLowerCase();
  const password = typeof formData.get("password") === "string" ? formData.get("password") : "";
  if (!validEmail(email) || password.length < 1 || password.length > 256) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email or password is incorrect. Please try again." };

  const requestedNext = readText(formData, "next");
  let fallback = "/profile";
  if (!hasSafeNext(requestedNext)) {
    const { data: isAdmin, error: roleError } = await supabase.rpc("is_current_user_admin");
    if (!roleError && isAdmin === true) fallback = "/admin";
  }
  const destination = safePath(requestedNext, fallback);
  const { data: consentStatus, error: consentError } = await supabase.rpc("get_current_policy_consent_status");
  if (consentError || typeof consentStatus?.needs_acceptance !== "boolean" || consentStatus.needs_acceptance) {
    redirect(`/accept-policies?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}

export async function register(_previousState, formData) {
  const configurationMessage = missingConfigurationMessage();
  if (configurationMessage) return { error: configurationMessage };

  const firstName = readText(formData, "firstName");
  const lastName = readText(formData, "lastName");
  const fullName = `${firstName} ${lastName}`.trim();
  const phoneInput = readText(formData, "phone");
  const phone = normalizeSignupPhone(phoneInput);
  const email = readText(formData, "email").toLowerCase();
  const password = typeof formData.get("password") === "string" ? formData.get("password") : "";
  const passwordConfirmation = typeof formData.get("passwordConfirmation") === "string"
    ? formData.get("passwordConfirmation")
    : "";

  if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80 || fullName.length > 160) {
    return { error: "Enter a first and last name using no more than 160 characters combined." };
  }
  if (!phone) return { error: "Enter a valid phone number: use an Egyptian number beginning with 0 or an international number with its +country code." };
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  if (password.length < 8 || password.length > 128) {
    return { error: "Choose a password between 8 and 128 characters." };
  }
  if (password !== passwordConfirmation) return { error: "The passwords do not match." };
  if (readText(formData, "policyConsent") !== "accepted") {
    return { error: "Please accept the Terms & Conditions and Privacy Policy to create an account." };
  }

  const registrationSensitiveValues = [email, phoneInput, phone, fullName, firstName, lastName, password, passwordConfirmation];
  const supabase = await runRegistrationStage("create_client", () => createClient(), registrationSensitiveValues);
  let emailRedirectTo;
  logRegistrationStage("callback_url", "start");
  try {
    emailRedirectTo = getAuthCallbackUrl("/profile");
    logRegistrationStage("callback_url", "complete");
  } catch (error) {
    logRegistrationStage("callback_url", "threw", registrationErrorDetails(error, registrationSensitiveValues));
    return { error: "Registration is temporarily unavailable. Please try again later." };
  }
  const { data, error } = await runRegistrationStage("sign_up", () => supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone,
        policy_consent: true,
        accepted_terms_version: CURRENT_TERMS_VERSION,
        accepted_privacy_version: CURRENT_PRIVACY_VERSION,
      },
      emailRedirectTo,
    },
  }), registrationSensitiveValues);

  if (error) {
    logRegistrationStage("sign_up", "error_returned", {
      hasUser: Boolean(data?.user),
      hasSession: Boolean(data?.session),
      ...registrationErrorDetails(error, registrationSensitiveValues),
    });
    return { error: "We could not complete registration right now. Please try again." };
  }
  logRegistrationStage("sign_up", "result", {
    hasUser: Boolean(data?.user),
    hasSession: Boolean(data?.session),
  });
  if (data.session) {
    const { data: authData, error: authError } = await runRegistrationStage(
      "get_user_after_sign_up",
      () => supabase.auth.getUser(),
      registrationSensitiveValues,
    );
    logRegistrationStage("get_user_after_sign_up", authError ? "error_returned" : "result", {
      hasUser: Boolean(authData?.user),
      ...(authError ? registrationErrorDetails(authError, registrationSensitiveValues) : {}),
    });
    if (authError || !authData.user || authData.user.id !== data.user?.id) {
      return { error: "Your account was created, but we could not verify the session. Sign in to continue." };
    }
    const { data: profile, error: profileError } = await runRegistrationStage("profile_phone_update", () => supabase
      .from("profiles")
      .update({ phone })
      .eq("id", authData.user.id)
      .select("id")
      .maybeSingle(), registrationSensitiveValues);
    logRegistrationStage("profile_phone_update", profileError ? "error_returned" : "result", {
      hasProfile: Boolean(profile),
      ...(profileError ? registrationErrorDetails(profileError, registrationSensitiveValues) : {}),
    });
    if (profileError || !profile) {
      return { error: "Your account was created, but your phone could not be saved. Sign in and add it in your profile." };
    }
    redirect("/profile?notice=welcome");
  }

  return {
    success: "If this address can be registered, you will receive an email with the next steps.",
  };
}

export async function requestPasswordReset(_previousState, formData) {
  const configurationMessage = missingConfigurationMessage();
  if (configurationMessage) return { error: configurationMessage };

  const email = readText(formData, "email").toLowerCase();
  if (!validEmail(email)) return { error: "Enter a valid email address." };

  let redirectTo;
  try {
    redirectTo = getAuthCallbackUrl("/reset-password");
  } catch {
    return { error: "Password reset is temporarily unavailable. Please try again later." };
  }

  try {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Keep the response the same for existing and unknown addresses.
  }

  return {
    success: "If an account matches that address, a password reset email will arrive shortly.",
  };
}

export async function updatePassword(_previousState, formData) {
  const configurationMessage = missingConfigurationMessage();
  if (configurationMessage) return { error: configurationMessage };

  const password = typeof formData.get("password") === "string" ? formData.get("password") : "";
  const passwordConfirmation = typeof formData.get("passwordConfirmation") === "string"
    ? formData.get("passwordConfirmation")
    : "";
  if (password.length < 8 || password.length > 128) {
    return { error: "Choose a password between 8 and 128 characters." };
  }
  if (password !== passwordConfirmation) return { error: "The passwords do not match." };

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Your reset session has expired. Request a new reset email." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "We could not update your password. Please try again." };

  redirect("/profile?notice=password-updated");
}

export async function updateProfile(_previousState, formData) {
  const configurationMessage = missingConfigurationMessage();
  if (configurationMessage) return { error: configurationMessage };

  const fullName = readText(formData, "fullName");
  const phone = readText(formData, "phone");
  const showPublicRankingValue = formData.get("showPublicRanking");
  if (showPublicRankingValue !== "true" && showPublicRankingValue !== "false") {
    return { error: "Choose whether your name may appear in customer rankings." };
  }
  const showPublicRanking = showPublicRankingValue === "true";
  if (fullName.length < 1 || fullName.length > 160) {
    return { error: "Enter your name using 1 to 160 characters." };
  }
  if (phone.length > 40) return { error: "Phone number must be 40 characters or fewer." };

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Your sign-in session has expired. Sign in again to update your profile." };

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null, show_public_ranking: showPublicRanking })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "We could not save your profile. Please try again." };
  }

  return { success: "Your profile has been updated." };
}

async function getAccountClient() {
  if (getMissingSupabaseEnv().length) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

function addressFields(formData) {
  const values = {
    recipient_name: readText(formData, "recipientName"),
    phone: readText(formData, "phone"),
    governorate: readText(formData, "governorate"),
    city: readText(formData, "city"),
    address_line: readText(formData, "addressLine"),
    delivery_notes: readText(formData, "deliveryNotes"),
  };
  const lengths = {
    recipient_name: 160,
    phone: 40,
    governorate: 120,
    city: 120,
    address_line: 1000,
    delivery_notes: 1000,
  };

  if (!values.recipient_name || !values.phone || !values.governorate || !values.city || !values.address_line ||
      Object.entries(lengths).some(([key, max]) => values[key].length > max)) {
    return null;
  }
  values.delivery_notes ||= null;
  return values;
}

export async function saveCustomerAddress(formData) {
  if (!(formData instanceof FormData)) return { ok: false, message: "Address details are invalid." };
  const account = await getAccountClient();
  if (!account) return { ok: false, message: "Sign in again to manage your saved addresses." };

  const addressId = readText(formData, "addressId");
  const isDefault = formData.get("isDefault") === "true" || formData.get("isDefault") === "on";
  const fields = addressFields(formData);
  if (!fields || (addressId && !uuidPattern.test(addressId))) {
    return { ok: false, message: "Complete the required address fields and check their lengths." };
  }

  const supabase = account.supabase;
  if (addressId) {
    const { data: ownedAddress, error: lookupError } = await supabase.from("customer_addresses")
      .select("id").eq("id", addressId).eq("user_id", account.user.id).maybeSingle();
    if (lookupError || !ownedAddress) return { ok: false, message: "This address is unavailable in your account." };
  }

  if (isDefault) {
    const { error: clearError } = await supabase.from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", account.user.id)
      .eq("is_default", true)
      .neq("id", addressId || "00000000-0000-0000-0000-000000000000");
    if (clearError) return { ok: false, message: "The default address could not be changed. Please refresh and retry." };
  }

  const result = addressId
    ? await supabase.from("customer_addresses").update({ ...fields, is_default: isDefault })
      .eq("id", addressId).eq("user_id", account.user.id).select("id").maybeSingle()
    : await supabase.from("customer_addresses").insert({ ...fields, user_id: account.user.id, is_default: isDefault })
      .select("id").maybeSingle();

  if (result.error) {
    return { ok: false, message: result.error.code === "23505"
      ? "Another default address was selected at the same time. Refresh and retry."
      : "The address could not be saved. Please check the details and try again." };
  }
  if (!result.data) return { ok: false, message: "This address is unavailable in your account. Refresh and retry." };
  return { ok: true, message: addressId ? "Address updated." : "Address added." };
}

export async function deleteCustomerAddress(formData) {
  if (!(formData instanceof FormData)) return { ok: false, message: "Address selection is invalid." };
  const addressId = readText(formData, "addressId");
  if (!uuidPattern.test(addressId)) return { ok: false, message: "Address selection is invalid." };
  const account = await getAccountClient();
  if (!account) return { ok: false, message: "Sign in again to manage your saved addresses." };

  const { data, error } = await account.supabase.from("customer_addresses").delete()
    .eq("id", addressId).eq("user_id", account.user.id).select("id").maybeSingle();
  if (error) return { ok: false, message: "The address could not be deleted. Please try again." };
  if (!data) return { ok: false, message: "This address is unavailable in your account. Refresh the page." };
  return { ok: true, message: "Address deleted." };
}

export async function setDefaultCustomerAddress(formData) {
  if (!(formData instanceof FormData)) return { ok: false, message: "Address selection is invalid." };
  const addressId = readText(formData, "addressId");
  if (!uuidPattern.test(addressId)) return { ok: false, message: "Address selection is invalid." };
  const account = await getAccountClient();
  if (!account) return { ok: false, message: "Sign in again to manage your saved addresses." };

  const { data: ownedAddress, error: lookupError } = await account.supabase.from("customer_addresses")
    .select("id").eq("id", addressId).eq("user_id", account.user.id).maybeSingle();
  if (lookupError || !ownedAddress) return { ok: false, message: "This address is unavailable in your account." };

  const { error: clearError } = await account.supabase.from("customer_addresses")
    .update({ is_default: false }).eq("user_id", account.user.id).eq("is_default", true).neq("id", addressId);
  if (clearError) return { ok: false, message: "The default address could not be changed. Please refresh and retry." };

  const { data, error } = await account.supabase.from("customer_addresses").update({ is_default: true })
    .eq("id", addressId).eq("user_id", account.user.id).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "The default address could not be saved. Please refresh and retry." };
  return { ok: true, message: "Default address updated." };
}

export async function logout() {
  let failed = getMissingSupabaseEnv().length > 0;

  if (!failed) {
    let supabase;
    try {
      supabase = await createClient();
      const { error } = await supabase.auth.signOut();
      failed = Boolean(error);
    } catch {
      failed = true;
    }
  }

  redirect(failed ? "/login?notice=sign-out-failed" : "/login?notice=signed-out");
}

export async function acceptCurrentPolicies(_previousState, formData) {
  if (readText(formData, "policyConsent") !== "accepted") {
    return { error: "Please confirm that you accept both current policies." };
  }

  const configurationMessage = missingConfigurationMessage();
  if (configurationMessage) return { error: configurationMessage };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Sign in to record your policy acceptance." };

  const { error } = await supabase.rpc("accept_current_policy_versions");
  if (error) return { error: "We could not save your acceptance. Please try again." };

  const next = safePath(readText(formData, "next"), "/profile");
  redirect(next);
}
