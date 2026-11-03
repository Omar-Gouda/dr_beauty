"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { BEAUTY_TIPS_CATEGORIES, ORDER_SUPPORT_CATEGORIES, SUPPORT_CATEGORIES } from "@/constants/customerRequests";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = {
  beauty_tips: new Set(BEAUTY_TIPS_CATEGORIES.map(({ value }) => value)),
  support: new Set(SUPPORT_CATEGORIES.map(({ value }) => value)),
};

function formText(formData, key, maximum) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : null;
}

function validContactNumber(value) {
  return value.length >= 7 && value.length <= 40 && /[0-9]/.test(value) && /^[0-9+(). -]+$/.test(value);
}

export async function submitCustomerServiceRequest(_previousState, formData) {
  const missing = getMissingSupabaseEnv();
  if (missing.length) return { ok: false, message: "Request submission is temporarily unavailable." };

  const requestType = formText(formData, "requestType", 20);
  const category = formText(formData, "category", 40);
  const question = formText(formData, "question", 4000);
  const productId = formText(formData, "productId", 36);
  const orderId = formText(formData, "orderId", 36);
  const contactMethod = formText(formData, "contactMethod", 20);
  const contactValue = formText(formData, "contactValue", 320);
  const submissionKey = formText(formData, "submissionKey", 36);

  if (!requestType || !CATEGORIES[requestType]?.has(category) || !question || question.length < 10 ||
      (productId && !UUID_PATTERN.test(productId)) || (orderId && !UUID_PATTERN.test(orderId)) ||
      !submissionKey || !UUID_PATTERN.test(submissionKey) ||
      !["email", "phone", "whatsapp"].includes(contactMethod) ||
      (contactMethod !== "email" && (!contactValue || !validContactNumber(contactValue)))) {
    return { ok: false, message: "Review the required fields and try again." };
  }
  if (requestType === "beauty_tips" && orderId) return { ok: false, message: "Please remove the order details from your beauty advice request and try again." };
  if (requestType === "support" && productId) return { ok: false, message: "Please remove the product selection from your support request and try again." };
  if (requestType === "support" && ORDER_SUPPORT_CATEGORIES.has(category) && !orderId) {
    return { ok: false, message: "Select the order related to this request." };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Please sign in again before submitting your request." };

    const { data, error } = await supabase.rpc("submit_customer_service_request", {
      p_request_type: requestType,
      p_category: category,
      p_question: question,
      p_product_id: productId || null,
      p_order_id: orderId || null,
      p_contact_method: contactMethod,
      p_contact_value: contactMethod === "email" ? null : contactValue,
      p_submission_key: submissionKey,
    });
    if (error) {
      const code = typeof error.code === "string" && /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : "unknown";
      console.error(`[customer-request] submit failed type=${requestType} code=${code}`);
      if (error.code === "PZ001") {
        return { ok: false, code: "cooldown", message: "Please wait 15 minutes before submitting another support request." };
      }
      if (error.code === "PZ003") {
        return { ok: false, code: "request_conflict", message: "This submission attempt was used for different details. Review the request and submit again." };
      }
      return { ok: false, message: error.code === "22023" ? "Some details could not be verified. Review your selections and try again." : "Your request could not be saved. Please try again." };
    }
    if (!UUID_PATTERN.test(String(data ?? ""))) {
      console.error(`[customer-request] submission response invalid type=${requestType}`);
      return { ok: false, message: "We could not confirm that your request was saved. Please retry or contact support." };
    }

    revalidatePath("/admin/requests");
    revalidatePath("/beauty-tips");
    revalidatePath("/support");
    return { ok: true, message: "Your request was received. The team will review it and contact you through your selected channel. No message has been sent automatically." };
  } catch {
    console.error(`[customer-request] submission unavailable type=${requestType}`);
    return { ok: false, message: "Your request could not be confirmed. Please try again." };
  }
}
