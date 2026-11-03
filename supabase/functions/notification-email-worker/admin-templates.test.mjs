import test from "node:test";
import assert from "node:assert/strict";
import {
  processAdminOrderEmailClaim,
  renderAdminOrderEmail,
  validateAdminOrderEmailClaim,
} from "./admin-templates.mjs";

const validClaim = {
  delivery_id: "9f4f5d63-bfd4-4a75-9557-4e374fc658fb",
  claim_token: "04ad3658-60e9-46f2-9e1d-c3b76bd9f24e",
  notification_type: "admin_order_created",
  recipient_email: "admin@example.com",
  idempotency_key: "admin-order-created:dbf2c7ed-bbec-4f4e-8d11-5098863fa7c4:04ad3658-60e9-46f2-9e1d-c3b76bd9f24e",
  attempt_count: 1,
  lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  order_number: "100042",
  order_created_at: "2026-10-21T10:30:00.000Z",
  customer_name: "Amina <script>alert(1)</script>",
  total_amount: "1250.00",
  currency: "EGP",
};

test("admin email validates only the distinct admin event and trusted fields", () => {
  assert.equal(validateAdminOrderEmailClaim(validClaim), true);
  assert.equal(validateAdminOrderEmailClaim({ ...validClaim, notification_type: "order_confirmation" }), false);
  assert.equal(validateAdminOrderEmailClaim({ ...validClaim, recipient_email: "bad\r\nBcc: victim@example.com" }), false);
});

test("admin email escapes customer text and does not include recipient or internal order ID", () => {
  const message = renderAdminOrderEmail(validClaim);
  assert.match(message.subject, /New COD order #100042/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.doesNotMatch(message.html, /admin@example\.com/);
  assert.doesNotMatch(message.html, /dbf2c7ed-bbec-4f4e-8d11-5098863fa7c4/);
});

test("confirmed provider acceptance completes the exact fenced admin delivery", async () => {
  let completed;
  let deliveryOptions;
  const outcome = await processAdminOrderEmailClaim(validClaim, {
    deliver: async (message, options) => {
      assert.equal(message.to, validClaim.recipient_email);
      deliveryOptions = options;
      return { kind: "accepted", providerMessageId: "resend-message-1" };
    },
    complete: async (claim, providerMessageId) => {
      completed = { deliveryId: claim.delivery_id, claimToken: claim.claim_token, providerMessageId };
    },
    fail: async () => assert.fail("Accepted delivery must not be failed."),
  });

  assert.equal(outcome, "sent");
  assert.equal(deliveryOptions.idempotencyKey, validClaim.idempotency_key);
  assert.deepEqual(completed, {
    deliveryId: validClaim.delivery_id,
    claimToken: validClaim.claim_token,
    providerMessageId: "resend-message-1",
  });
});

test("ambiguous provider outcome defers without completion or immediate retry", async () => {
  let completions = 0;
  let failures = 0;
  const outcome = await processAdminOrderEmailClaim(validClaim, {
    deliver: async () => ({ kind: "ambiguous" }),
    complete: async () => { completions += 1; },
    fail: async () => { failures += 1; return true; },
  });
  assert.equal(outcome, "deferred");
  assert.equal(completions, 0);
  assert.equal(failures, 0);
});

test("explicit permanent rejection uses the fenced failure operation", async () => {
  let failure;
  const outcome = await processAdminOrderEmailClaim(validClaim, {
    deliver: async () => ({ kind: "rejected", errorCode: "provider_rejected" }),
    complete: async () => assert.fail("Rejected delivery must not complete."),
    fail: async (claim, errorCode) => {
      failure = { deliveryId: claim.delivery_id, claimToken: claim.claim_token, errorCode };
      return true;
    },
  });
  assert.equal(outcome, "failed");
  assert.deepEqual(failure, {
    deliveryId: validClaim.delivery_id,
    claimToken: validClaim.claim_token,
    errorCode: "provider_rejected",
  });
});
