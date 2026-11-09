"use server";

import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { normalizeWhatsAppPhoneNumber } from "@/lib/whatsapp/messages.mjs";
import { calculateShippingBreakdownCents, parseMoneyCents } from "@/lib/promotions.mjs";
import { calculateEligiblePromotionAmounts, calculateEligiblePromotionDiscountCents } from "@/lib/promotion-targeting.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 50;

function logCheckoutDiagnostic(stage, error, fallbackCode = "unknown") {
  const code = typeof error?.code === "string" && /^[A-Z0-9]{3,12}$/.test(error.code)
    ? error.code
    : fallbackCode;
  console.error(`[checkout] ${stage} failed code=${code}`);
}

function text(value, maxLength, required = true) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITEMS) return null;
  const seen = new Set();
  const items = [];

  for (const item of value) {
    const productId = typeof item?.id === "string" ? item.id : "";
    const quantity = item?.quantity;
    if (!UUID_PATTERN.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return null;
    }
    if (seen.has(productId)) return null;
    seen.add(productId);
    items.push({ product_id: productId, quantity });
  }

  return items;
}

function moneyFromCents(value) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export async function previewPromotionCode(codeInput, inputItems) {
  const code = typeof codeInput === "string" ? codeInput.trim().toUpperCase() : "";
  const items = normalizeItems(inputItems);
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code) || !items) {
    return { ok: false, message: "Enter a valid discount code and review your bag." };
  }
  if (getMissingSupabaseEnv().length) return { ok: false, message: "Discount codes are temporarily unavailable." };

  try {
    const supabase = await createClient();
    const { data: { user } = {}, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sign in again to check this discount code." };

    const productIds = items.map((item) => item.product_id);
    const [{ data: products, error: productError }, { data: promotions, error: promotionError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from("products").select("id,price,category_id").eq("is_active", true).in("id", productIds),
      supabase.from("promotions")
        .select("id,code,discount_type,discount_value,maximum_discount,minimum_subtotal,maximum_redemptions,is_active,starts_at,ends_at,first_purchase_only,application_scope")
        .ilike("code", code.replace(/[\\%_]/g, "\\$&"))
        .limit(2),
      supabase.from("shipping_settings").select("is_shipping_enabled,default_fee,free_shipping_minimum_subtotal").eq("id", true).maybeSingle(),
    ]);
    if (productError || promotionError || !Array.isArray(products) || products.length !== productIds.length ||
        settingsError || !settings?.is_shipping_enabled || !Array.isArray(promotions) || promotions.length !== 1) {
      return { ok: false, message: "This code is not available for the current bag." };
    }

    const promotion = promotions[0];
    if (!promotion.is_active || promotion.code.toUpperCase() !== code) return { ok: false, message: "This code is not available for the current bag." };
    const now = Date.now();
    if ((promotion.starts_at && Date.parse(promotion.starts_at) > now) ||
        (promotion.ends_at && Date.parse(promotion.ends_at) <= now)) {
      return { ok: false, message: "This code is not available for the current bag." };
    }
    const { data: eligibilityRows, error: eligibilityError } = await supabase.rpc(
      "get_promotion_preview_eligibility",
      { p_promotion_id: promotion.id },
    );
    const eligibility = Array.isArray(eligibilityRows) ? eligibilityRows[0] : null;
    if (eligibilityError || typeof eligibility?.global_capacity_available !== "boolean" ||
        typeof eligibility?.account_capacity_available !== "boolean" ||
        typeof eligibility?.first_purchase_eligible !== "boolean" ||
        typeof eligibility?.first_purchase_only !== "boolean" ||
        !Array.isArray(eligibility?.product_target_ids) || !Array.isArray(eligibility?.category_target_ids) ||
        !["order", "products", "categories", "product_and_category"].includes(eligibility?.application_scope)) {
      return { ok: false, message: "Promotion eligibility could not be verified. Please try again." };
    }
    if (!eligibility.global_capacity_available) {
      return { ok: false, message: "This code has reached its total redemption limit." };
    }
    if (!eligibility.account_capacity_available) {
      return { ok: false, message: "You have reached this code's redemption limit for your account." };
    }
    if (eligibility.first_purchase_only && !eligibility.first_purchase_eligible) {
      return { ok: false, message: "This offer is available for your first purchase only." };
    }
    const amounts = calculateEligiblePromotionAmounts({
      items,
      products,
      scope: eligibility.application_scope,
      productTargetIds: eligibility.product_target_ids,
      categoryTargetIds: eligibility.category_target_ids,
    });
    if (!amounts) return { ok: false, message: "Current product prices could not be verified." };
    const discountCents = calculateEligiblePromotionDiscountCents(amounts, promotion);
    if (discountCents === null) return { ok: false, message: "This code is not eligible for the current bag or eligible subtotal." };
    const shipping = calculateShippingBreakdownCents(amounts.subtotalCents, settings);
    if (!shipping) {
      return { ok: false, message: "Shipping is temporarily unavailable. Please try again later." };
    }
    return {
      ok: true,
      quote: {
        code: promotion.code,
        subtotal: moneyFromCents(amounts.subtotalCents),
        eligibleSubtotal: moneyFromCents(amounts.eligibleSubtotalCents),
        shippingFee: moneyFromCents(shipping.shippingFeeCents),
        shippingDiscountAmount: moneyFromCents(shipping.shippingDiscountCents),
        shippingAmount: moneyFromCents(shipping.shippingAmountCents),
        discountAmount: moneyFromCents(discountCents),
        totalAmount: moneyFromCents(shipping.totalAmountCents - discountCents),
        finalCheckRequired: true,
      },
    };
  } catch {
    return { ok: false, message: "Discount codes are temporarily unavailable." };
  }
}

export async function getShippingQuote(subtotalInput) {
  const subtotalCents = parseMoneyCents(subtotalInput);
  if (subtotalCents === null) return { ok: false, message: "Shipping could not be calculated." };
  if (getMissingSupabaseEnv().length) return { ok: false, message: "Shipping is temporarily unavailable." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("shipping_settings")
      .select("is_shipping_enabled,default_fee,free_shipping_minimum_subtotal")
      .eq("id", true)
      .maybeSingle();
    if (error || !data?.is_shipping_enabled) return { ok: false, message: "Shipping is temporarily unavailable." };

    const shipping = calculateShippingBreakdownCents(subtotalCents, data);
    if (!shipping) {
      return { ok: false, message: "Shipping is temporarily unavailable." };
    }
    return {
      ok: true,
      quote: {
        shippingFee: moneyFromCents(shipping.shippingFeeCents),
        shippingDiscountAmount: moneyFromCents(shipping.shippingDiscountCents),
        shippingAmount: moneyFromCents(shipping.shippingAmountCents),
        freeShippingMinimumSubtotal: shipping.freeShippingMinimumCents === null ? null : moneyFromCents(shipping.freeShippingMinimumCents),
        totalAmount: moneyFromCents(shipping.totalAmountCents),
      },
    };
  } catch {
    return { ok: false, message: "Shipping is temporarily unavailable." };
  }
}

function safeRpcMessage(error) {
  if (error?.code === "28000") return "Your session has expired. Please log in again to continue.";
  if (error?.code === "PZ001") {
    return "You have reached the limit of open cash-on-delivery orders. " +
      "Please wait for an existing order to be delivered, or contact support for help.";
  }

  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  if (message.includes("already used for a different checkout request")) {
    return "This checkout attempt is already bound to different order details. We kept it to prevent a duplicate order. Check your Orders before trying again, or contact support if the order is not listed.";
  }
  if (message.includes("different whatsapp consent choice")) {
    return "This checkout attempt has a different saved WhatsApp choice. We kept the original attempt to prevent a duplicate order.";
  }
  if (message.includes("first purchase only")) return "This offer is available for your first purchase only.";
  if (message.includes("sufficient stock") || message.includes("stock changed") || message.includes("unavailable")) {
    return "One or more items are no longer available in the requested quantity. Review your cart and try again.";
  }
  if (message.includes("promotion")) return "This promotion is unavailable, ineligible, or has reached its usage limit. Review the code and try again.";
  if (message.includes("shipping is not currently available")) return "Shipping is currently unavailable. Please contact support before placing this order.";
  if (message.includes("invalid") || error?.code === "22023") {
    return "Some checkout details are invalid. Review them and try again.";
  }
  return "We could not place this order. Review your details and try again.";
}

export async function createCodOrderAttempt(input) {
  const missing = getMissingSupabaseEnv();
  if (missing.length) {
    return { ok: false, code: "configuration", message: "Checkout is temporarily unavailable." };
  }

  const items = normalizeItems(input?.items);
  const idempotencyKey = typeof input?.idempotencyKey === "string" ? input.idempotencyKey : "";
  const customerName = text(input?.customerName, 160);
  const customerPhone = text(input?.customerPhone, 40);
  const governorate = text(input?.governorate, 120);
  const city = text(input?.city, 120);
  const addressLine = text(input?.addressLine, 1000);
  const deliveryNotes = text(input?.deliveryNotes ?? "", 1000, false);
  const additionalPhoneInput = text(input?.additionalPhone ?? "", 40, false);
  const additionalPhone = additionalPhoneInput ? normalizeWhatsAppPhoneNumber(additionalPhoneInput) : null;
  const addressId = input?.addressId == null || input.addressId === "" ? null : input.addressId;
  const isGift = input?.isGift ?? false;
  const giftRecipientName = text(input?.giftRecipientName ?? "", 160, false);
  const giftRecipientPhoneInput = text(input?.giftRecipientPhone ?? "", 40, false);
  const giftRecipientPhone = giftRecipientPhoneInput ? normalizeWhatsAppPhoneNumber(giftRecipientPhoneInput) : null;
  const giftMessage = text(input?.giftMessage ?? "", 500, false);
  const giftPackagingSelected = input?.giftPackagingSelected ?? false;
  const saveNewAddress = input?.saveNewAddress ?? false;
  const whatsappConsent = input?.whatsappConsent;
  const promotionCode = input?.promotionCode == null || input?.promotionCode === ""
    ? null
    : typeof input.promotionCode === "string" ? input.promotionCode.trim().toUpperCase() : undefined;

  if (
    !items || !UUID_PATTERN.test(idempotencyKey) || !customerName || !customerPhone ||
    !governorate || !city || !addressLine || deliveryNotes === null || typeof whatsappConsent !== "boolean" ||
    additionalPhoneInput === null || (additionalPhoneInput && !additionalPhone) ||
    (addressId !== null && (typeof addressId !== "string" || !UUID_PATTERN.test(addressId))) ||
    typeof isGift !== "boolean" || typeof giftPackagingSelected !== "boolean" || typeof saveNewAddress !== "boolean" ||
    giftRecipientName === null || giftRecipientPhoneInput === null || giftMessage === null ||
    (isGift && (!giftRecipientName || !giftRecipientPhone)) ||
    (!isGift && (giftRecipientName || giftRecipientPhoneInput || giftMessage || giftPackagingSelected)) ||
    (saveNewAddress && addressId !== null) ||
    (promotionCode !== null && (typeof promotionCode !== "string" || !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(promotionCode)))
  ) {
    return {
      ok: false,
      code: "validation",
      retrySameAttempt: false,
      message: "Check the required delivery details and cart items, then try again.",
    };
  }

  let supabase;
  let authenticatedUserId = null;
  try {
    supabase = await createClient();
    const { data: { user } = {}, error: authError } = await supabase.auth.getUser();
    if (authError) logCheckoutDiagnostic("authenticate", authError);
    if (authError || !user) {
      return {
        ok: false,
        code: "unauthenticated",
        message: "Please log in again to continue checkout.",
      };
    }
    authenticatedUserId = user.id;

    if (addressId) {
      const { data: savedAddress, error: addressError } = await supabase.from("customer_addresses")
        .select("id")
        .eq("id", addressId)
        .eq("user_id", authenticatedUserId)
        .maybeSingle();
      if (addressError || !savedAddress) {
        return { ok: false, code: "validation", retrySameAttempt: false, message: "That saved address is unavailable. Choose another address or add a new one." };
      }
    }
  } catch {
    logCheckoutDiagnostic("auth-client", null);
    return {
      ok: false,
      code: "temporarily_unavailable",
      retrySameAttempt: true,
      message: "We could not confirm your session. Retry this checkout in a moment.",
    };
  }

  let data;
  let error;
  try {
    ({ data, error } = await supabase.rpc("create_cod_order_with_whatsapp_consent", {
      p_items: items,
      p_idempotency_key: idempotencyKey,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_governorate: governorate,
      p_city: city,
      p_address_line: addressLine,
      p_whatsapp_consent: whatsappConsent,
      p_delivery_notes: deliveryNotes || null,
      p_promotion_code: promotionCode,
      p_address_id: addressId,
      p_additional_phone: additionalPhone,
      p_is_gift: isGift,
      p_gift_recipient_name: isGift ? giftRecipientName : null,
      p_gift_recipient_phone: isGift ? giftRecipientPhone : null,
      p_gift_message: isGift ? giftMessage || null : null,
      p_gift_packaging_selected: giftPackagingSelected,
      p_save_new_address: saveNewAddress,
    }));
  } catch {
    // A transport failure can happen after the database commits. Keep the key for a safe retry.
    logCheckoutDiagnostic("create-order-transport", null, "transport");
    return {
      ok: false,
      code: "temporarily_unavailable",
      retrySameAttempt: true,
      message: "We could not confirm whether the order was saved. Retry this same checkout to safely check its status.",
    };
  }

  if (error) {
    logCheckoutDiagnostic("create-order-rpc", error);
    const consentMismatch = typeof error?.message === "string" &&
      error.message.toLowerCase().includes("different whatsapp consent choice");
    const payloadMismatch = typeof error?.message === "string" &&
      error.message.toLowerCase().includes("already used for a different checkout request");
    const outstandingOrderLimit = error?.code === "PZ001";
    const responseCode = error.code === "28000"
      ? "unauthenticated"
      : consentMismatch
        ? "consent_conflict"
        : payloadMismatch
          ? "payload_conflict"
          : outstandingOrderLimit
            ? "outstanding_order_limit"
            : "rejected";
    return {
      ok: false,
      code: responseCode,
      retrySameAttempt: consentMismatch || payloadMismatch,
      message: safeRpcMessage(error),
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const orderNumber = result?.order_number;
  const totalAmount = result?.total_amount;
  const validOrderNumber = typeof orderNumber === "number"
    ? Number.isSafeInteger(orderNumber) && orderNumber > 0
    : typeof orderNumber === "string" && /^\d{1,18}$/.test(orderNumber);
  const validTotal = (typeof totalAmount === "number" || typeof totalAmount === "string") &&
    /^\d{1,12}(?:\.\d{1,2})?$/.test(String(totalAmount));
  const allowedStatuses = new Set(["pending_confirmation", "confirmed", "processing", "shipped", "delivered", "cancelled"]);

  if (!validOrderNumber || !validTotal || !allowedStatuses.has(result?.order_status) || result?.currency !== "EGP") {
    logCheckoutDiagnostic("create-order-response", null, "invalid_response");
    return {
      ok: false,
      code: "temporarily_unavailable",
      retrySameAttempt: true,
      message: "We could not confirm the saved order. Retry this same checkout to check it safely.",
    };
  }

  let confirmationDetails = null;
  if (whatsappConsent) {
    try {
      const { data: savedOrder, error: savedOrderError } = await supabase
        .from("orders")
        .select("id,customer_name,is_gift,gift_recipient_name,gift_recipient_phone,gift_message,gift_packaging_selected,gift_packaging_fee_amount")
        .eq("user_id", authenticatedUserId)
        .eq("order_number", String(orderNumber))
        .maybeSingle();

      if (!savedOrderError && savedOrder) {
        const { data: savedItems, error: savedItemsError } = await supabase
          .from("order_items")
          .select("product_name_snapshot,quantity")
          .eq("order_id", savedOrder.id)
          .order("created_at", { ascending: true });
        const validSavedItems = Array.isArray(savedItems) && savedItems.length > 0 && savedItems.length <= 50 &&
          savedItems.every((item) => typeof item.product_name_snapshot === "string" &&
            item.product_name_snapshot.trim().length > 0 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 999);

        if (!savedItemsError && validSavedItems && typeof savedOrder.customer_name === "string" && savedOrder.customer_name.trim()) {
          confirmationDetails = {
            customerName: savedOrder.customer_name,
            isGift: savedOrder.is_gift,
            giftRecipientName: savedOrder.gift_recipient_name,
            giftRecipientPhone: savedOrder.gift_recipient_phone,
            giftMessage: savedOrder.gift_message,
            giftPackagingSelected: savedOrder.gift_packaging_selected,
            giftPackagingFeeAmount: String(savedOrder.gift_packaging_fee_amount),
            items: savedItems.map((item) => ({ name: item.product_name_snapshot, quantity: item.quantity })),
          };
        }
      }
    } catch {
      // Order creation already succeeded. A confirmation-detail read failure must not report the order as failed.
    }
  }

  return {
    ok: true,
    confirmation: {
      orderNumber: String(orderNumber),
      status: result.order_status,
      totalAmount: String(totalAmount),
      currency: "EGP",
      customerName: confirmationDetails?.customerName ?? null,
      items: confirmationDetails?.items ?? null,
      isGift,
      giftRecipientName: confirmationDetails?.giftRecipientName ?? giftRecipientName,
      giftRecipientPhone: confirmationDetails?.giftRecipientPhone ?? giftRecipientPhone,
      giftMessage: confirmationDetails?.giftMessage ?? giftMessage,
      giftPackagingSelected: confirmationDetails?.giftPackagingSelected ?? giftPackagingSelected,
      giftPackagingFeeAmount: confirmationDetails?.giftPackagingFeeAmount ?? "0",
    },
  };
}
