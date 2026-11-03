import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BATCH_SIZE = 25;
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 900;
const SUPPORTED_CHANNELS = new Set(["email", "whatsapp"]);
const SUPPORTED_DELIVERY_TYPES = new Set([
  "order_confirmation",
  "order_update",
]);
const SUPPORTED_ORDER_STATUSES = new Set([
  "pending_confirmation",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);
const FAILURE_CODES = new Set([
  "provider_timeout",
  "provider_unavailable",
  "rate_limited",
  "invalid_recipient",
  "consent_invalid",
  "provider_rejected",
  "invalid_message",
  "unknown_failure",
]);

function logEvent(event, fields = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...fields,
  }));
}

function inspectConfiguration(env) {
  const missingVariables = [];
  const invalidVariables = [];
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    missingVariables.push("NEXT_PUBLIC_SUPABASE_URL");
  } else {
    try {
      const parsed = new URL(supabaseUrl);
      const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
      if (
        (parsed.protocol !== "https:" && !(localHost && parsed.protocol === "http:"))
        || parsed.username
        || parsed.password
        || parsed.search
        || parsed.hash
      ) {
        invalidVariables.push("NEXT_PUBLIC_SUPABASE_URL");
      }
    } catch {
      invalidVariables.push("NEXT_PUBLIC_SUPABASE_URL");
    }
  }

  if (!secretKey) {
    missingVariables.push("SUPABASE_SECRET_KEY");
  } else if (!secretKey.startsWith("sb_secret_")) {
    invalidVariables.push("SUPABASE_SECRET_KEY");
  }

  return {
    configurationValid: missingVariables.length === 0 && invalidVariables.length === 0,
    missingVariables,
    invalidVariables,
  };
}

function requireWorkerConfiguration(env) {
  const diagnostics = inspectConfiguration(env);
  if (!diagnostics.configurationValid) {
    throw new Error("Worker configuration is incomplete or invalid.");
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  };
}

function createWorkerClient(env) {
  const { url, secretKey } = requireWorkerConfiguration(env);
  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createShutdownSignal() {
  const controller = new AbortController();
  const requestShutdown = () => controller.abort();
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);

  return {
    signal: controller.signal,
    dispose() {
      process.removeListener("SIGINT", requestShutdown);
      process.removeListener("SIGTERM", requestShutdown);
    },
  };
}

function validateClaim(notification) {
  if (!notification || typeof notification !== "object") return "invalid_message";
  if (
    !isUuid(notification.delivery_id)
    || !isUuid(notification.claim_token)
    || !isUuid(notification.order_id)
    || !SUPPORTED_CHANNELS.has(notification.channel)
    || !SUPPORTED_DELIVERY_TYPES.has(notification.delivery_type)
    || typeof notification.idempotency_key !== "string"
    || notification.idempotency_key.length < 1
    || notification.idempotency_key.length > 200
    || !Number.isInteger(notification.attempt_count)
    || notification.attempt_count < 1
    || notification.attempt_count > 5
    || (notification.order_status !== null && !SUPPORTED_ORDER_STATUSES.has(notification.order_status))
    || !notification.status_payload
    || typeof notification.status_payload !== "object"
    || Array.isArray(notification.status_payload)
  ) {
    return "invalid_message";
  }

  if (notification.channel === "email") {
    return typeof notification.recipient_email === "string"
      && notification.recipient_email.length >= 3
      && notification.recipient_email.length <= 320
      && notification.recipient_phone === null
      ? null
      : "invalid_recipient";
  }

  return typeof notification.recipient_phone === "string"
    && notification.recipient_phone.length >= 7
    && notification.recipient_phone.length <= 40
    && notification.recipient_email === null
    ? null
    : "invalid_recipient";
}

function getKnownFailureCode(error) {
  if (
    !error
    || error.deliveryAccepted !== false
    || typeof error.code !== "string"
    || !FAILURE_CODES.has(error.code)
    || error.code === "unknown_failure"
  ) {
    return null;
  }

  return error.code;
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasAdapters(adapters) {
  return adapters
    && typeof adapters.email?.deliver === "function"
    && typeof adapters.whatsapp?.deliver === "function";
}

/**
 * Provider adapter contract:
 * - expose async deliver(notification, { idempotencyKey })
 * - use the queued recipient snapshot; email must load and verify persisted
 *   order/item snapshots using order_id before composing a message
 * - use status_payload for lifecycle facts and never turn these notices into marketing
 * - return { accepted: true, providerMessageId?: string | null } only after
 *   explicit provider acceptance
 * - throw { code, deliveryAccepted: false } only when the provider confirms the
 *   message was not accepted; use an allowlisted database failure code
 * - ambiguous outcomes must not be marked failed; the lease is left for recovery
 * - do not log recipient data or message content
 *
 * There are intentionally no provider adapters in this phase. This function
 * cannot claim work until trusted server code supplies both channel adapters.
 */
export async function runNotificationBatch({
  adapters,
  env = process.env,
  batchSize = 10,
  leaseSeconds = 120,
  signal,
}) {
  if (!hasAdapters(adapters)) {
    throw new Error("Both notification provider adapters must be configured before claiming work.");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error("The notification batch size is invalid.");
  }
  if (
    !Number.isInteger(leaseSeconds)
    || leaseSeconds < MIN_LEASE_SECONDS
    || leaseSeconds > MAX_LEASE_SECONDS
  ) {
    throw new Error("The notification lease duration is invalid.");
  }
  if (signal?.aborted) return { claimed: 0, completed: 0, failed: 0, deferred: 0 };

  const supabase = createWorkerClient(env);
  let claimed;
  let claimError;
  try {
    ({ data: claimed, error: claimError } = await supabase.rpc(
      "claim_order_notifications",
      { p_batch_size: batchSize, p_lease_seconds: leaseSeconds },
    ));
  } catch {
    throw new Error("Notification claim failed; database details were suppressed.");
  }
  if (claimError || !Array.isArray(claimed)) {
    throw new Error("Notification claim failed; database details were suppressed.");
  }

  const result = { claimed: claimed.length, completed: 0, failed: 0, deferred: 0 };

  for (const notification of claimed) {
    if (signal?.aborted) {
      result.deferred += 1;
      continue;
    }

    const invalidClaimCode = validateClaim(notification);
    if (invalidClaimCode) {
      if (isUuid(notification?.delivery_id) && isUuid(notification?.claim_token)) {
        try {
          const { error } = await supabase.rpc("fail_order_notification", {
            p_delivery_id: notification.delivery_id,
            p_claim_token: notification.claim_token,
            p_error_code: invalidClaimCode,
          });
          if (!error) result.failed += 1;
          else result.deferred += 1;
        } catch {
          result.deferred += 1;
        }
      }
      logEvent("notification_rejected", { reason: invalidClaimCode });
      continue;
    }

    let deliveryResult;
    try {
      deliveryResult = await adapters[notification.channel].deliver(notification, {
        idempotencyKey: notification.idempotency_key,
      });
    } catch (error) {
      const errorCode = getKnownFailureCode(error);
      if (!errorCode) {
        result.deferred += 1;
        logEvent("notification_outcome_unconfirmed", {
          channel: notification.channel,
          deliveryType: notification.delivery_type,
          reason: "ambiguous_provider_result",
        });
        continue;
      }

      let failureStatus;
      let failureError;
      try {
        ({ data: failureStatus, error: failureError } = await supabase.rpc(
          "fail_order_notification",
          {
            p_delivery_id: notification.delivery_id,
            p_claim_token: notification.claim_token,
            p_error_code: errorCode,
          },
        ));
      } catch {
        failureError = true;
      }

      if (failureError) {
        result.deferred += 1;
        logEvent("notification_failure_unconfirmed", {
          channel: notification.channel,
          deliveryType: notification.delivery_type,
          errorCode,
        });
        continue;
      }

      result.failed += 1;
      const safeFailureStatus = ["failed", "terminal_failed"].includes(failureStatus)
        ? failureStatus
        : "unknown";
      logEvent("notification_failed", {
        channel: notification.channel,
        deliveryType: notification.delivery_type,
        errorCode,
        status: safeFailureStatus,
      });
      continue;
    }

    if (!deliveryResult || deliveryResult.accepted !== true) {
      result.deferred += 1;
      logEvent("notification_outcome_unconfirmed", {
        channel: notification.channel,
        deliveryType: notification.delivery_type,
        reason: "provider_acceptance_not_confirmed",
      });
      continue;
    }

    const providerMessageId = deliveryResult.providerMessageId ?? null;
    if (
      providerMessageId !== null
      && (typeof providerMessageId !== "string"
        || providerMessageId.trim().length < 1
        || providerMessageId.trim().length > 500)
    ) {
      result.deferred += 1;
      logEvent("notification_completion_unconfirmed", {
        channel: notification.channel,
        deliveryType: notification.delivery_type,
        reason: "invalid_provider_reference",
      });
      continue;
    }

    let completionError;
    try {
      ({ error: completionError } = await supabase.rpc(
        "complete_order_notification",
        {
          p_delivery_id: notification.delivery_id,
          p_claim_token: notification.claim_token,
          p_provider_message_id: providerMessageId?.trim() ?? null,
        },
      ));
    } catch {
      completionError = true;
    }

    if (completionError) {
      result.deferred += 1;
      logEvent("notification_completion_unconfirmed", {
        channel: notification.channel,
        deliveryType: notification.delivery_type,
        reason: "claim_or_database_result_unconfirmed",
      });
      continue;
    }

    result.completed += 1;
    logEvent("notification_completed", {
      channel: notification.channel,
      deliveryType: notification.delivery_type,
    });
  }

  logEvent("notification_batch_finished", result);
  return result;
}

function runDryRun(env) {
  const diagnostics = inspectConfiguration(env);
  logEvent("notification_worker_dry_run", {
    ...diagnostics,
    providerAdaptersConfigured: false,
    databaseAccessed: false,
    jobsClaimed: false,
    providerCalls: false,
  });
  return diagnostics.configurationValid ? 0 : 1;
}

async function main(args) {
  if (args.length > 1 || (args.length === 1 && !["--dry-run", "--live"].includes(args[0]))) {
    logEvent("notification_worker_usage", { usage: "node scripts/notification-worker.mjs [--dry-run|--live]" });
    return 2;
  }

  if (args[0] === "--live") {
    logEvent("notification_worker_live_disabled", {
      reason: "No provider adapters are configured; no jobs were claimed.",
      databaseAccessed: false,
      jobsClaimed: false,
      providerCalls: false,
    });
    return 1;
  }

  return runDryRun(process.env);
}

const directRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directRun) {
  main(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      logEvent("notification_worker_failed", {
        reason: "Worker failed; sensitive details were suppressed.",
      });
      process.exitCode = 1;
    });
}
