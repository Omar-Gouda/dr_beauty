const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const PROVIDER_TIMEOUT_MS = 20_000;

/**
 * Provider-neutral result contract used by the worker:
 * accepted: provider explicitly returned a message ID;
 * rejected: provider returned an explicit non-acceptance response;
 * retryable: explicit rate-limit rejection;
 * ambiguous: timeout, network failure, conflict, redirect, server error, or
 * malformed success response where provider acceptance cannot be established.
 */
export function createResendAdapter({ apiKey, fromAddress }) {
  return {
    async deliver(message, { idempotencyKey }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
      try {
        const response = await fetch(RESEND_EMAILS_URL, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });

        if (response.status === 429) return { kind: "retryable", errorCode: "rate_limited" };
        if (response.status === 408 || response.status === 409 || response.status >= 500) {
          return { kind: "ambiguous" };
        }
        if (response.status === 401 || response.status === 403) {
          return { kind: "retryable", errorCode: "unknown_failure" };
        }
        if (response.status >= 400 && response.status < 500) {
          return { kind: "rejected", errorCode: "provider_rejected" };
        }
        if (!response.ok) return { kind: "ambiguous" };

        const result = await response.json();
        if (
          !result
          || typeof result.id !== "string"
          || result.id.trim().length < 1
          || result.id.trim().length > 500
        ) {
          return { kind: "ambiguous" };
        }
        return { kind: "accepted", providerMessageId: result.id.trim() };
      } catch {
        return { kind: "ambiguous" };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
