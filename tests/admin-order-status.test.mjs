import test from "node:test";
import assert from "node:assert/strict";
import {
  createAdminOrderDiagnostic,
  canCollectCodPayment,
  getAdminOrderErrorCode,
  isAllowedAdminOrderTransition,
} from "../src/lib/admin-order-status.mjs";

test("admin order transition helper preserves the lifecycle allowlist", () => {
  assert.equal(isAllowedAdminOrderTransition("pending_confirmation", "confirmed"), true);
  assert.equal(isAllowedAdminOrderTransition("pending_confirmation", "cancelled"), true);
  assert.equal(isAllowedAdminOrderTransition("confirmed", "cancelled"), true);
  assert.equal(isAllowedAdminOrderTransition("processing", "cancelled"), true);
  assert.equal(isAllowedAdminOrderTransition("processing", "shipped"), true);
  assert.equal(isAllowedAdminOrderTransition("pending_confirmation", "delivered"), false);
  assert.equal(isAllowedAdminOrderTransition("cancelled", "confirmed"), false);
});

test("COD collection is offered only for delivered, unpaid COD orders", () => {
  assert.equal(canCollectCodPayment({ payment_method: "cod", order_status: "delivered", payment_status: "pending" }), true);
  assert.equal(canCollectCodPayment({ payment_method: "cod", order_status: "shipped", payment_status: "pending" }), false);
  assert.equal(canCollectCodPayment({ payment_method: "card", order_status: "delivered", payment_status: "pending" }), false);
  assert.equal(canCollectCodPayment({ payment_method: "cod", order_status: "delivered", payment_status: "paid" }), false);
});

test("diagnostics retain SQLSTATE while excluding raw database messages", () => {
  const correlationId = "f8ecf5d0-f390-4cc8-a84a-26894be25014";
  const rawError = { code: "42P10", message: "sensitive SQL detail and customer data" };
  const diagnostic = createAdminOrderDiagnostic("rpc", getAdminOrderErrorCode(rawError), correlationId);

  assert.deepEqual(diagnostic, {
    event: "admin_order_status_failed",
    operation: "rpc",
    code: "42P10",
    correlation_id: correlationId,
  });
  assert.equal(JSON.stringify(diagnostic).includes(rawError.message), false);
});

test("order history diagnostics preserve safe PostgREST and internal failure codes", () => {
  assert.equal(getAdminOrderErrorCode({ code: "PGRST202" }), "PGRST202");
  assert.equal(getAdminOrderErrorCode({ code: "transport" }), "transport");
  assert.equal(getAdminOrderErrorCode({ code: "invalid_response" }), "invalid_response");
  assert.equal(getAdminOrderErrorCode({ code: "email@example.invalid" }), "unknown");
});

test("diagnostics reject unsafe operation, error, and correlation values", () => {
  const diagnostic = createAdminOrderDiagnostic("unexpected customer input", "email@example.com", "not-a-uuid");
  assert.deepEqual(diagnostic, {
    event: "admin_order_status_failed",
    operation: "unknown",
    code: "unknown",
    correlation_id: "unavailable",
  });
});
