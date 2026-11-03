"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { normalizeProductAvailability } from "@/lib/products/cart-availability.mjs";
import { validateProductReview } from "@/lib/review-safety.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function field(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : null;
}

export async function submitProductReview(_previousState, formData) {
  if (!(formData instanceof FormData)) {
    return { ok: false, message: "Review details could not be submitted. Please try again." };
  }

  const productId = field(formData, "productId");
  const ratingValue = field(formData, "rating");
  const title = field(formData, "title");
  const body = field(formData, "body");
  const rating = Number(ratingValue);

  const reviewValidation = validateProductReview({ rating, title: title ?? "", body: body ?? "" });
  if (!productId || !UUID_PATTERN.test(productId) || reviewValidation) {
    if (reviewValidation === "prohibited_content") {
      return { ok: false, message: "Please remove threatening language and submit a respectful product review." };
    }
    return { ok: false, message: "Enter a rating from 1 to 5 and a review of up to 5,000 characters." };
  }

  if (getMissingSupabaseEnv().length) {
    return { ok: false, message: "Reviews are temporarily unavailable. Please try again later." };
  }

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return { ok: false, code: "unauthenticated", message: "Sign in to submit a review." };
    }

    // Verify through the customer's own RLS-scoped order data. The insert RLS
    // policy independently enforces the same delivered-and-paid purchase rule.
    const { data: purchase, error: purchaseError } = await supabase
      .from("order_items")
      .select("id,orders!inner(order_status,payment_status,user_id)")
      .eq("product_id", productId)
      .eq("orders.user_id", authData.user.id)
      .eq("orders.order_status", "delivered")
      .eq("orders.payment_status", "paid")
      .limit(1)
      .maybeSingle();

    if (purchaseError) {
      return { ok: false, message: "Your purchase eligibility could not be checked. Please try again later." };
    }
    if (!purchase) {
      return { ok: false, message: "Reviews are available to customers with a delivered and paid order for this product." };
    }

    const { error: insertError } = await supabase.from("product_reviews").insert({
      user_id: authData.user.id,
      product_id: productId,
      rating,
      title: title || null,
      body,
    });

    if (insertError?.code === "23505") {
      return { ok: false, message: "You have already submitted a review for this product." };
    }
    if (insertError?.code === "42501") {
      return { ok: false, message: "This account is not eligible to submit this review." };
    }
    if (insertError) {
      return { ok: false, message: "Your review could not be submitted. Please try again later." };
    }

    revalidatePath("/products/[slug]", "page");
    return { ok: true, message: "Thank you. Your review is now visible to customers." };
  } catch {
    return { ok: false, message: "Reviews are temporarily unavailable. Please try again later." };
  }
}

export async function getProductAvailability(productIds) {
  if (!Array.isArray(productIds) || productIds.length < 1 || productIds.length > 500 ||
      productIds.some((productId) => typeof productId !== "string" || !UUID_PATTERN.test(productId))) {
    return { verified: false, availability: {} };
  }
  if (getMissingSupabaseEnv().length) return { verified: false, availability: {} };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_product_availability", {
      p_product_ids: productIds,
    });
    if (error) return { verified: false, availability: {} };
    return normalizeProductAvailability(productIds, data);
  } catch {
    return { verified: false, availability: {} };
  }
}

export async function checkProductAvailability(productId) {
  if (typeof productId !== "string" || !UUID_PATTERN.test(productId)) {
    return { available: false, verified: true };
  }
  const result = await getProductAvailability([productId]);
  if (!result.verified) return { available: false, verified: false };
  return { available: result.availability[productId] === true, verified: productId in result.availability };
}
