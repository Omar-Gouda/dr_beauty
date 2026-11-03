const ORDER_TRANSITIONS = Object.freeze({
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
});

const INTERNAL_FAILURE_CODES = new Set([
  "not_found",
  "stale_state",
  "transport",
  "invalid_response",
  "unknown",
]);

export function isAllowedAdminOrderTransition(currentStatus, nextStatus) {
  return ORDER_TRANSITIONS[currentStatus]?.includes(nextStatus) === true;
}

export function getAdminOrderErrorCode(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (/^[A-Z0-9]{5}$/.test(code) || /^PGRST[0-9]{3}$/.test(code)) return code;
  return INTERNAL_FAILURE_CODES.has(code) ? code : "unknown";
}

export function createAdminOrderDiagnostic(operation, errorCode, correlationId) {
  const safeOperation = ["lookup", "transition_check", "rpc", "payment_rpc", "history_rpc"].includes(operation)
    ? operation
    : "unknown";
  const safeCode = /^[A-Z0-9]{5}$/.test(errorCode)
    ? errorCode
    : INTERNAL_FAILURE_CODES.has(errorCode) ? errorCode : "unknown";
  const safeCorrelationId = typeof correlationId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlationId)
    ? correlationId
    : "unavailable";

  return {
    event: "admin_order_status_failed",
    operation: safeOperation,
    code: safeCode,
    correlation_id: safeCorrelationId,
  };
}

export function canCollectCodPayment(order) {
  return order?.payment_method === "cod"
    && order?.order_status === "delivered"
    && order?.payment_status === "pending";
}
