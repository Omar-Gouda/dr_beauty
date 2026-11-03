import { createResendAdapter } from "./resend.js";
import { processAdminOrderEmailClaim } from "./admin-templates.mjs";
import { renderOrderEmail, validateClaim, validateSnapshot } from "./templates.js";

const CLAIM_BATCH_SIZE = 1;
const CLAIM_LEASE_SECONDS = 120;
const ADMIN_CLAIM_LEASE_SECONDS = 120;
const DATABASE_TIMEOUT_MS = 10_000;
const ALLOWED_FAILURE_CODES = new Set([
  "rate_limited",
  "provider_rejected",
  "invalid_message",
  "unknown_failure",
]);

function logEvent(event, fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

function getJwtRole(authorization) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  try {
    const parts = authorization.slice(7).split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(base64UrlDecode(parts[1]), (character) => character.charCodeAt(0)),
    ));
    return payload?.role ?? null;
  } catch {
    return null;
  }
}

function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function validSupabaseUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.pathname === "/"
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

function loadConfiguration() {
  const env = Deno.env;
  const url = env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const schedulerToken = env.get("NOTIFICATION_SCHEDULER_TOKEN") ?? "";
  const resendApiKey = env.get("RESEND_API_KEY") ?? "";
  const fromAddress = env.get("RESEND_FROM_EMAIL") ?? "";
  const fromAddressValid = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(fromAddress);

  if (
    !validSupabaseUrl(url)
    || serviceRoleKey.length === 0
    || schedulerToken.length < 32
    || resendApiKey.length === 0
    || !fromAddressValid
  ) return null;

  return { url, serviceRoleKey, schedulerToken, resendApiKey, fromAddress };
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function rpc(config, functionName, args) {
  const endpoint = new URL(`/rest/v1/rpc/${functionName}`, config.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DATABASE_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // Do not inspect or log PostgREST error bodies.
      }
      throw new Error("Database RPC outcome is unavailable.");
    }
    const responseText = await response.text();
    return responseText.length === 0 ? null : JSON.parse(responseText);
  } catch {
    throw new Error("Database RPC outcome is unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}

function isAuthorizedSchedulerRequest(request, token) {
  // Supabase's gateway verifies the JWT because verify_jwt remains enabled.
  // The role check and separate scheduler token restrict this worker further.
  return getJwtRole(request.headers.get("Authorization")) === "service_role"
    && constantTimeEqual(request.headers.get("x-notification-scheduler-token") ?? "", token);
}

async function failClaim(config, claim, errorCode) {
  if (!ALLOWED_FAILURE_CODES.has(errorCode)) return false;
  try {
    const status = await rpc(config, "fail_order_notification", {
      p_delivery_id: claim.delivery_id,
      p_claim_token: claim.claim_token,
      p_error_code: errorCode,
    });
    return status === "failed" || status === "terminal_failed";
  } catch {
    return false;
  }
}

async function failAdminClaim(config, claim, errorCode) {
  if (!ALLOWED_FAILURE_CODES.has(errorCode)) return false;
  try {
    const status = await rpc(config, "fail_admin_order_email_notification", {
      p_delivery_id: claim.delivery_id,
      p_claim_token: claim.claim_token,
      p_error_code: errorCode,
    });
    return status === "failed" || status === "terminal_failed";
  } catch {
    return false;
  }
}

async function processAdminClaim(config, claim) {
  const adapter = createResendAdapter({
    apiKey: config.resendApiKey,
    fromAddress: config.fromAddress,
  });
  return processAdminOrderEmailClaim(claim, {
    deliver: (message, options) => adapter.deliver(message, options),
    fail: (failedClaim, errorCode) => failAdminClaim(config, failedClaim, errorCode),
    complete: (completedClaim, providerMessageId) => rpc(config, "complete_admin_order_email_notification", {
      p_delivery_id: completedClaim.delivery_id,
      p_claim_token: completedClaim.claim_token,
      p_provider_message_id: providerMessageId,
    }),
    log: (reason) => logEvent("admin_order_email_deferred", { phase: reason }),
  });
}

async function claimAdminOrderEmail(config) {
  const claims = await rpc(config, "claim_admin_order_email_notifications", {
    p_lease_seconds: ADMIN_CLAIM_LEASE_SECONDS,
  });
  if (!Array.isArray(claims) || claims.length > 1) {
    throw new Error("Admin notification claim outcome is unavailable.");
  }
  return claims[0] ?? null;
}

async function processClaim(config, claim) {
  if (claim?.channel !== "email") {
    logEvent("notification_claim_rejected", { reason: "unexpected_channel" });
    return "deferred";
  }
  if (!validateClaim(claim)) {
    if (isUuid(claim?.delivery_id) && isUuid(claim?.claim_token)) {
      return await failClaim(config, claim, "invalid_message") ? "failed" : "deferred";
    }
    logEvent("notification_claim_rejected", { reason: "invalid_claim" });
    return "deferred";
  }

  let snapshotRows;
  try {
    snapshotRows = await rpc(config, "resolve_order_email_snapshot", {
      p_delivery_id: claim.delivery_id,
      p_claim_token: claim.claim_token,
    });
  } catch {
    // Read errors and expired claims remain leased for normal recovery.
    logEvent("notification_deferred", { phase: "snapshot_resolution" });
    return "deferred";
  }

  let message;
  try {
    const snapshot = validateSnapshot(snapshotRows, claim);
    message = renderOrderEmail(snapshot);
  } catch {
    return await failClaim(config, claim, "invalid_message") ? "failed" : "deferred";
  }

  const adapter = createResendAdapter({
    apiKey: config.resendApiKey,
    fromAddress: config.fromAddress,
  });
  let result;
  try {
    result = await adapter.deliver({ ...message, to: claim.recipient_email }, {
      idempotencyKey: claim.idempotency_key,
    });
  } catch {
    result = { kind: "ambiguous" };
  }

  if (result.kind === "ambiguous") {
    logEvent("notification_deferred", { phase: "provider_outcome" });
    return "deferred";
  }
  if (result.kind === "retryable" || result.kind === "rejected") {
    const failureRecorded = await failClaim(config, claim, result.errorCode);
    if (!failureRecorded) {
      logEvent("notification_deferred", { phase: "failure_recording" });
      return "deferred";
    }
    return "failed";
  }
  if (result.kind !== "accepted") {
    logEvent("notification_deferred", { phase: "provider_result" });
    return "deferred";
  }

  try {
    await rpc(config, "complete_order_notification", {
      p_delivery_id: claim.delivery_id,
      p_claim_token: claim.claim_token,
      p_provider_message_id: result.providerMessageId,
    });
    return "sent";
  } catch {
    // The provider may have accepted the email; let the lease recover and
    // reuse the same provider idempotency key on a later attempt.
    logEvent("notification_deferred", { phase: "completion_recording" });
    return "deferred";
  }
}

export async function handleRequest(request) {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  if (getJwtRole(request.headers.get("Authorization")) !== "service_role") {
    return jsonResponse(401, { error: "Unauthorized." });
  }
  const configuration = loadConfiguration();
  if (!configuration) {
    logEvent("notification_worker_unavailable", { reason: "configuration_missing_or_invalid" });
    return jsonResponse(503, { error: "Notification worker is unavailable." });
  }
  if (!isAuthorizedSchedulerRequest(request, configuration.schedulerToken)) {
    return jsonResponse(401, { error: "Unauthorized." });
  }

  let claims;
  try {
    claims = await rpc(configuration, "claim_order_email_notifications", {
      p_batch_size: CLAIM_BATCH_SIZE,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    });
  } catch {
    logEvent("notification_worker_unavailable", { reason: "claim_outcome_unavailable" });
    return jsonResponse(503, { error: "Notification worker is unavailable." });
  }

  if (!Array.isArray(claims)) {
    logEvent("notification_worker_unavailable", { reason: "claim_response_invalid" });
    return jsonResponse(503, { error: "Notification worker is unavailable." });
  }
  if (claims.length > 1) {
    // The database contract guarantees one result. Unexpected extra claims
    // are left for lease recovery rather than silently processing a batch.
    logEvent("notification_worker_unavailable", { reason: "claim_batch_size_mismatch" });
    return jsonResponse(503, { error: "Notification worker is unavailable." });
  }

  const summary = { claimed: 0, sent: 0, failed: 0, deferred: 0 };
  if (claims.length === 1) {
    const outcome = await processClaim(configuration, claims[0]);
    summary.claimed += 1;
    summary.sent += outcome === "sent" ? 1 : 0;
    summary.failed += outcome === "failed" ? 1 : 0;
    summary.deferred += outcome === "deferred" ? 1 : 0;
  }

  let adminClaim;
  try {
    adminClaim = await claimAdminOrderEmail(configuration);
  } catch {
    logEvent("admin_order_email_worker_unavailable", { reason: "claim_outcome_unavailable" });
    return jsonResponse(503, { error: "Notification worker is unavailable.", ...summary });
  }
  if (adminClaim) {
    const outcome = await processAdminClaim(configuration, adminClaim);
    summary.claimed += 1;
    summary.sent += outcome === "sent" ? 1 : 0;
    summary.failed += outcome === "failed" ? 1 : 0;
    summary.deferred += outcome === "deferred" ? 1 : 0;
  }

  logEvent("notification_batch_finished", summary);
  return jsonResponse(200, summary);
}

Deno.serve(handleRequest);
