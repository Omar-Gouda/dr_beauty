"use server";

import { revalidatePath } from "next/cache";
import { getAdminAccess } from "@/lib/admin";
import {
  createAdminOrderDiagnostic,
  getAdminOrderErrorCode,
  isAllowedAdminOrderTransition,
} from "@/lib/admin-order-status.mjs";
import { persistAdminOrderDiagnostic } from "@/lib/admin-order-diagnostics.server.mjs";
import { buildWhatsAppClickToChatUrl, normalizeWhatsAppPhoneNumber } from "@/lib/whatsapp/messages.mjs";
import { validateProductPricing } from "@/lib/products/pricing.mjs";
import { isSafeExternalImageUrl, normalizeCategoryInput } from "@/lib/image-url.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 240);
}

function text(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeImageReferences(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 10) return null;
  const references = images.map((image) => typeof image === "string" ? image.trim() : "");
  if (references.some((reference) => reference.length > 2048 ||
      (!(/^\/images\/[a-zA-Z0-9/_-]+\.(?:avif|gif|jpe?g|png|webp)$/i.test(reference) && !reference.includes("..")) &&
        !isSafeExternalImageUrl(reference)))) return null;
  return references;
}

async function authorizedClient() {
  const access = await getAdminAccess();
  return access.status === "authorized" ? access.supabase : null;
}

export async function saveProduct(input) {
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable. Sign in with an authorized account and verify the admin migration is applied." };

  if (!input || typeof input !== "object") return { ok: false, message: "Invalid product details." };
  const id = input.id ? text(input.id, 36) : null;
  const name = text(input.name, 240);
  const slug = slugify(text(input.slug || name, 240));
  const brandName = text(input.brandName, 120);
  const brandSlug = slugify(brandName);
  const categoryId = text(input.categoryId, 36);
  const pricing = validateProductPricing(input.price, input.compareAtPrice);
  const stockQuantity = Number(input.stockQuantity);
  const images = safeImageReferences(input.images);

  if ((id && !UUID_PATTERN.test(id)) || name.length < 1 || !SLUG_PATTERN.test(slug) ||
      brandName.length < 1 || !UUID_PATTERN.test(categoryId) || !pricing.ok ||
      !Number.isSafeInteger(stockQuantity) ||
      stockQuantity < 0 || stockQuantity > 2147483647 ||
      !images) {
    return { ok: false, message: pricing.ok ? "Check the product name, slug, price, category, stock, and image paths or HTTPS URLs." : pricing.message };
  }

  try {
    const { data, error } = await supabase.rpc("save_admin_product_with_compare_at", {
      p_product_id: id,
      p_name: name,
      p_slug: slug,
      p_brand_name: brandName,
      p_brand_slug: brandSlug,
      p_category_id: categoryId,
      p_price: pricing.price,
      p_description: text(input.description, 10000) || null,
      p_ingredients: text(input.ingredients, 10000) || null,
      p_stock_quantity: stockQuantity,
      p_image_urls: images,
      p_is_active: input.isActive === true,
      p_is_bestseller: input.isBestseller === true,
      p_compare_at_price: pricing.compareAtPrice,
    });
    if (error || typeof data !== "string" || !UUID_PATTERN.test(data)) {
      return { ok: false, message: id
        ? "Product could not be updated. Check its details and try again."
        : "Product could not be created. Check its details and try again." };
    }
  } catch {
    return { ok: false, message: id
      ? "Product could not be updated. Check its details and try again."
      : "Product could not be created. Check its details and try again." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");
  return { ok: true, message: id ? "Product updated." : "Product created." };
}

export async function setProductActive(productId, isActive) {
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };
  if (!UUID_PATTERN.test(String(productId)) || typeof isActive !== "boolean") return { ok: false, message: "Invalid product status." };
  const { error } = await supabase.from("products").update({ is_active: isActive }).eq("id", productId);
  if (error) return { ok: false, message: "Product status could not be changed." };
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");
  return { ok: true, message: isActive ? "Product activated." : "Product deactivated." };
}

export async function saveCategory(input) {
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };
  const id = input && typeof input === "object" && input.id ? text(input.id, 36) : null;
  if ((id && !UUID_PATTERN.test(id)) || !input || typeof input !== "object") {
    return { ok: false, message: "Invalid category details." };
  }
  const normalized = normalizeCategoryInput(input);
  if (!normalized.ok) {
    return { ok: false, message: normalized.reason === "image"
      ? "Enter a valid public HTTPS image URL, or leave it empty to use the existing category artwork."
      : "Enter a valid category name, slug, description, visibility, and display order." };
  }
  let result;
  try {
    result = id
      ? await supabase.from("categories").update(normalized.value).eq("id", id).select("id").maybeSingle()
      : await supabase.from("categories").insert(normalized.value).select("id").single();
  } catch {
    return { ok: false, message: "Category could not be saved. Please try again." };
  }
  if (result.error?.code === "23505") {
    return { ok: false, message: "That category slug is already in use. Choose a different slug." };
  }
  if (result.error || !result.data) return { ok: false, message: "Category could not be saved. Check its details and try again." };
  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  revalidatePath("/");
  return { ok: true, message: id ? "Category updated." : "Category created." };
}

export async function deleteCategory(categoryId) {
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };
  if (!UUID_PATTERN.test(String(categoryId ?? ""))) return { ok: false, message: "Choose a valid category." };

  let result;
  try {
    result = await supabase.from("categories").delete().eq("id", categoryId).select("id").maybeSingle();
  } catch {
    return { ok: false, message: "Category could not be deleted. Please try again." };
  }
  if (result.error?.code === "23503") {
    return { ok: false, message: "This category is still used by one or more products. Move those products to another category before deleting it." };
  }
  if (result.error || !result.data) return { ok: false, message: "Category could not be deleted. It may no longer exist." };

  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  revalidatePath("/");
  return { ok: true, message: "Category deleted." };
}

export async function setCategoryActive(categoryId, isActive) {
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };
  if (!UUID_PATTERN.test(String(categoryId)) || typeof isActive !== "boolean") return { ok: false, message: "Invalid category status." };
  if (!isActive) {
    const { data, error: productLookupError } = await supabase.from("products")
      .select("id").eq("category_id", categoryId).eq("is_active", true).limit(1);
    if (productLookupError) return { ok: false, message: "Active products using this category could not be checked." };
    if (data?.length) return { ok: false, message: "Deactivate or move active products before deactivating this category." };
  }
  const { error } = await supabase.from("categories").update({ is_active: isActive }).eq("id", categoryId);
  if (error) return { ok: false, message: "Category status could not be changed." };
  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  return { ok: true, message: isActive ? "Category activated." : "Category deactivated." };
}

function promotionTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export async function savePromotion(input) {
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };
  if (!input || typeof input !== "object") return { ok: false, message: "Invalid discount details." };

  const id = input.id ? text(input.id, 36) : null;
  const rawCode = typeof input.code === "string" ? input.code.trim() : "";
  const code = rawCode.toUpperCase();
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const discountType = input.discountType;
  const discountValue = typeof input.discountValue === "string" ? input.discountValue.trim() : "";
  const maximumDiscount = input.maximumDiscount === "" || input.maximumDiscount == null ? null : String(input.maximumDiscount).trim();
  const minimumSubtotal = typeof input.minimumSubtotal === "string" ? input.minimumSubtotal.trim() : "";
  const maximumRedemptions = input.maximumRedemptions === "" || input.maximumRedemptions == null ? null : Number(input.maximumRedemptions);
  const rawPerAccountRedemptionLimit = input.perAccountRedemptionLimit;
  const perAccountRedemptionLimit = rawPerAccountRedemptionLimit === undefined
    ? 1
    : rawPerAccountRedemptionLimit === "" || rawPerAccountRedemptionLimit === null
      ? null
      : typeof rawPerAccountRedemptionLimit === "number"
        ? rawPerAccountRedemptionLimit
        : typeof rawPerAccountRedemptionLimit === "string" && /^\d+$/.test(rawPerAccountRedemptionLimit.trim())
          ? Number(rawPerAccountRedemptionLimit)
          : Number.NaN;
  const isFeatured = input.isFeatured === true;
  const isAnnouncement = input.isAnnouncement === true;
  const displayPriority = input.displayPriority === "" || input.displayPriority == null ? 0 : Number(input.displayPriority);
  const announcementPriority = input.announcementPriority === "" || input.announcementPriority == null ? 0 : Number(input.announcementPriority);
  const targetPath = typeof input.targetPath === "string" ? input.targetPath.trim() : "/shop";
  const startsAt = promotionTimestamp(input.startsAt);
  const endsAt = promotionTimestamp(input.endsAt);
  const decimal = (value, allowZero = false) => new RegExp(`^${allowZero ? "" : "(?=.*[1-9])"}\\d{1,10}(?:\\.\\d{1,2})?$`).test(value);

  if ((id && !UUID_PATTERN.test(id)) || rawCode.length > 64 || !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code) ||
      title.length > 160 || (isFeatured && !title) || description.length > 1000 ||
      !Number.isSafeInteger(displayPriority) || displayPriority < -1000000 || displayPriority > 1000000 ||
      !Number.isSafeInteger(announcementPriority) || announcementPriority < -1000000 || announcementPriority > 1000000 ||
      !(targetPath === "/shop" || /^\/(products|categories)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(targetPath)) ||
      typeof input.isFeatured !== "boolean" || typeof input.isAnnouncement !== "boolean" || !["percentage", "fixed_amount"].includes(discountType) ||
      !decimal(discountValue) || (discountType === "percentage" && Number(discountValue) > 100) ||
      (maximumDiscount !== null && !decimal(maximumDiscount)) || !decimal(minimumSubtotal, true) ||
      (maximumRedemptions !== null && (!Number.isSafeInteger(maximumRedemptions) || maximumRedemptions < 1 || maximumRedemptions > 2147483647)) ||
      (perAccountRedemptionLimit !== null && (!Number.isSafeInteger(perAccountRedemptionLimit) || perAccountRedemptionLimit < 1 || perAccountRedemptionLimit > 2147483647)) ||
      startsAt === undefined || endsAt === undefined || (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) ||
      typeof input.isActive !== "boolean") {
    return { ok: false, message: "Check the code, discount amount, limits, and date range." };
  }

  const values = {
    code,
    title: title || null,
    description: description || null,
    discount_type: discountType,
    discount_value: discountValue,
    maximum_discount: maximumDiscount,
    minimum_subtotal: minimumSubtotal || "0",
    starts_at: startsAt,
    ends_at: endsAt,
    maximum_redemptions: maximumRedemptions,
    per_account_redemption_limit: perAccountRedemptionLimit,
    is_active: input.isActive,
    is_featured: isFeatured,
    display_priority: displayPriority,
    target_path: targetPath,
    is_announcement: isAnnouncement,
    announcement_priority: announcementPriority,
  };
  const savedPromotionFields = "id,code,title,description,discount_type,discount_value,maximum_discount,minimum_subtotal,maximum_redemptions,per_account_redemption_limit,starts_at,ends_at,target_path,is_active,is_featured";
  const result = id
    ? await supabase.from("promotions").update(values).eq("id", id).select(savedPromotionFields).maybeSingle()
    : await supabase.from("promotions").insert(values).select(savedPromotionFields).single();
  if (result.error || !result.data) return { ok: false, message: "Discount code could not be saved. The code may already exist." };

  revalidatePath("/admin/promotions");
  revalidatePath("/checkout");
  revalidatePath("/admin");
  revalidatePath("/shop");
  revalidatePath("/");
  return {
    ok: true,
    message: id ? "Discount code updated." : "Discount code created.",
    savedPromotion: result.data.is_active ? result.data : null,
  };
}

export async function setPromotionActive(promotionId, isActive) {
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };
  if (!UUID_PATTERN.test(String(promotionId ?? "")) || typeof isActive !== "boolean") {
    return { ok: false, message: "Choose a valid discount code." };
  }
  const { data, error } = await supabase.from("promotions")
    .update({ is_active: isActive }).eq("id", promotionId).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Discount code status could not be changed." };
  revalidatePath("/admin/promotions");
  revalidatePath("/checkout");
  revalidatePath("/shop");
  revalidatePath("/");
  return { ok: true, message: isActive ? "Discount code activated." : "Discount code deactivated." };
}

export async function saveShippingSettings(input) {
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };
  const decimal = (value, allowZero = true) => typeof value === "string" &&
    new RegExp(`^${allowZero ? "" : "(?=.*[1-9])"}\\d{1,10}(?:\\.\\d{1,2})?$`).test(value.trim());
  const enabled = input?.isShippingEnabled;
  const fee = typeof input?.defaultFee === "string" ? input.defaultFee.trim() : "";
  const rawMinimum = input?.freeShippingMinimumSubtotal;
  const minimum = rawMinimum === "" || rawMinimum == null ? null : String(rawMinimum).trim();
  const rawGiftPackagingFee = input?.giftPackagingFee;
  const giftPackagingFee = rawGiftPackagingFee === "" || rawGiftPackagingFee == null
    ? null
    : String(rawGiftPackagingFee).trim();
  if (typeof enabled !== "boolean" || !decimal(fee) || (minimum !== null && !decimal(minimum, false)) ||
      (giftPackagingFee !== null && !decimal(giftPackagingFee, false))) {
    return { ok: false, message: "Enter valid shipping settings and an optional positive gift-packaging fee." };
  }

  const { data, error } = await supabase.from("shipping_settings").upsert({
    id: true,
    is_shipping_enabled: enabled,
    default_fee: fee,
    free_shipping_minimum_subtotal: minimum,
    gift_packaging_fee: giftPackagingFee,
  }, { onConflict: "id" }).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Shipping settings could not be saved." };

  revalidatePath("/admin/promotions");
  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { ok: true, message: "Shipping settings saved." };
}

const ORDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKING_URL_PATTERN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?([/?#][^\s]*)?$/i;

async function logOrderStatusFailure(operation, errorCode, correlationId) {
  const diagnostic = createAdminOrderDiagnostic(operation, errorCode, correlationId);
  console.error(JSON.stringify(diagnostic));
  await persistAdminOrderDiagnostic(diagnostic);
}

function orderStatusFailureMessage(correlationId) {
  return `The order could not be updated. Refresh before retrying. Reference ${correlationId}.`;
}

function formText(formData, key, maxLength) {
  const value = formData.get(key);
  if (value === null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : null;
}

export async function transitionAdminOrderStatus(formData) {
  if (!(formData instanceof FormData)) return { ok: false, message: "Invalid order update." };
  const orderId = formText(formData, "orderId", 36);
  const newStatus = formText(formData, "newStatus", 32);
  const carrier = formText(formData, "shippingCarrier", 120);
  const trackingNumber = formText(formData, "trackingNumber", 160);
  const trackingUrl = formText(formData, "trackingUrl", 2048);

  if (!orderId || !ORDER_UUID_PATTERN.test(orderId) || !newStatus ||
      carrier === null || trackingNumber === null || trackingUrl === null) {
    return { ok: false, message: "Check the order and shipment details, then try again." };
  }

  const correlationId = crypto.randomUUID();

  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable. Sign in with an authorized account." };

  const { data: currentOrder, error: lookupError } = await supabase
    .from("orders")
    .select("order_status,order_number,customer_phone")
    .eq("id", orderId)
    .maybeSingle();
  if (lookupError || !currentOrder) {
    await logOrderStatusFailure("lookup", lookupError ? getAdminOrderErrorCode(lookupError) : "not_found", correlationId);
    return { ok: false, message: orderStatusFailureMessage(correlationId) };
  }
  if (!isAllowedAdminOrderTransition(currentOrder.order_status, newStatus)) {
    await logOrderStatusFailure("transition_check", "stale_state", correlationId);
    return { ok: false, message: orderStatusFailureMessage(correlationId) };
  }

  const shipmentFieldsProvided = Boolean(carrier || trackingNumber || trackingUrl);
  if (newStatus === "shipped") {
    if (!trackingNumber || (trackingUrl && !TRACKING_URL_PATTERN.test(trackingUrl))) {
      return { ok: false, message: "Provide a tracking number and a valid HTTPS URL if you include one." };
    }
  } else if (shipmentFieldsProvided) {
    return { ok: false, message: "Shipment details can only be submitted when marking an order shipped." };
  }

  let data;
  let error;
  try {
    ({ data, error } = await supabase.rpc("transition_cod_order_status", {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_shipping_carrier: newStatus === "shipped" ? carrier || null : null,
      p_tracking_number: newStatus === "shipped" ? trackingNumber : null,
      p_tracking_url: newStatus === "shipped" ? trackingUrl || null : null,
    }));
  } catch {
    await logOrderStatusFailure("rpc", "transport", correlationId);
    return { ok: false, message: orderStatusFailureMessage(correlationId) };
  }

  const confirmation = Array.isArray(data) ? data[0] : null;
  if (error || !confirmation || confirmation.order_status !== newStatus) {
    await logOrderStatusFailure("rpc", error ? getAdminOrderErrorCode(error) : "unknown", correlationId);
    return { ok: false, message: orderStatusFailureMessage(correlationId) };
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  let whatsappUrl = null;
  let whatsappUnavailableReason = null;
  const customerPhone = normalizeWhatsAppPhoneNumber(currentOrder.customer_phone);
  if (!currentOrder.customer_phone) whatsappUnavailableReason = "missing_phone";
  else if (!customerPhone) whatsappUnavailableReason = "invalid_phone";
  try {
    if (customerPhone) {
      whatsappUrl = buildWhatsAppClickToChatUrl(customerPhone, "admin.order_status", {
        orderReference: String(currentOrder.order_number),
        orderStatus: newStatus.replaceAll("_", " "),
      });
    }
  } catch {
    whatsappUnavailableReason = "template_unavailable";
  }
  return {
    ok: true,
    message: "Order status updated. Eligible customer notifications were queued; delivery is not confirmed.",
    whatsappUrl,
    whatsappUnavailableReason,
  };
}

export async function markCodPaymentCollected(formData) {
  if (!(formData instanceof FormData)) return { ok: false, message: "Invalid payment update." };
  const orderId = formText(formData, "orderId", 36);
  if (!orderId || !ORDER_UUID_PATTERN.test(orderId)) {
    return { ok: false, message: "Select a valid order." };
  }

  const correlationId = crypto.randomUUID();
  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable. Sign in with an authorized account." };

  let data;
  let error;
  try {
    ({ data, error } = await supabase.rpc("mark_cod_order_paid", { p_order_id: orderId }));
  } catch {
    await logOrderStatusFailure("payment_rpc", "transport", correlationId);
    return { ok: false, message: orderStatusFailureMessage(correlationId) };
  }

  const result = Array.isArray(data) ? data[0] : null;
  if (error || !result || result.payment_status !== "paid" || result.order_status !== "delivered") {
    await logOrderStatusFailure("payment_rpc", error ? getAdminOrderErrorCode(error) : "unknown", correlationId);
    return { ok: false, message: orderStatusFailureMessage(correlationId) };
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return {
    ok: true,
    message: result.newly_paid ? "Cash payment recorded as collected." : "Cash payment was already recorded as collected.",
  };
}

export async function moderateProductReview(formData) {
  if (!(formData instanceof FormData)) return { ok: false, message: "Invalid review update." };
  const reviewId = formText(formData, "reviewId", 36);
  const status = formText(formData, "status", 16);
  if (!reviewId || !UUID_PATTERN.test(reviewId) || !["approved", "rejected"].includes(status)) {
    return { ok: false, message: "Choose a valid review action." };
  }

  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };

  const { data, error } = await supabase
    .from("product_reviews")
    .update({ status })
    .eq("id", reviewId)
    .in("status", status === "approved" ? ["pending"] : ["pending", "approved"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, message: "The review could not be updated. Please refresh and retry." };
  if (!data) return { ok: false, message: "This review is no longer pending. Refresh the list." };

  revalidatePath("/admin/reviews");
  revalidatePath("/products/[slug]", "page");
  return { ok: true, message: status === "approved" ? "Review published." : "Review removed from the storefront." };
}

export async function markAdminNotificationRead(notificationId) {
  if (!UUID_PATTERN.test(String(notificationId ?? ""))) {
    return { ok: false, message: "This notification could not be updated." };
  }

  const access = await getAdminAccess();
  if (access.status !== "authorized") return { ok: false, message: "Admin access is unavailable." };

  const { data, error } = await access.supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", access.user.id)
    .is("read_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    const code = typeof error.code === "string" && /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : "unknown";
    console.error(`[admin-notifications] mark-read failed code=${code}`);
    return { ok: false, message: "The notification could not be marked as read." };
  }
  if (!data) return { ok: false, message: "This notification is already read or is unavailable." };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Notification marked as read." };
}

export async function markAllAdminNotificationsRead() {
  const access = await getAdminAccess();
  if (access.status !== "authorized") return { ok: false, message: "Admin access is unavailable." };

  const { error } = await access.supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_user_id", access.user.id)
    .is("read_at", null);

  if (error) {
    const code = typeof error.code === "string" && /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : "unknown";
    console.error(`[admin-notifications] mark-all-read failed code=${code}`);
    return { ok: false, message: "Notifications could not be marked as read." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "All notifications marked as read." };
}

export async function updateCustomerServiceRequest(input) {
  const requestId = typeof input?.requestId === "string" ? input.requestId.trim() : "";
  const status = typeof input?.status === "string" ? input.status.trim() : "";
  const notes = typeof input?.adminNotes === "string" ? input.adminNotes.trim() : "";
  const allowedStatuses = new Set(["new", "in_review", "awaiting_customer", "resolved", "closed"]);

  if (!UUID_PATTERN.test(requestId) || !allowedStatuses.has(status) || notes.length > 4000) {
    return { ok: false, message: "Check the request status and internal notes, then try again." };
  }

  const supabase = await authorizedClient();
  if (!supabase) return { ok: false, message: "Admin access is unavailable." };

  const { data, error } = await supabase.rpc("update_customer_service_request", {
    p_request_id: requestId,
    p_status: status,
    p_admin_notes: notes || null,
  });

  if (error) {
    const code = typeof error.code === "string" && /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : "unknown";
    console.error(`[admin-service-requests] update failed code=${code}`);
    return { ok: false, message: "The request could not be updated. Refresh and retry." };
  }
  if (data !== requestId) return { ok: false, message: "This request is unavailable. Refresh the list." };

  revalidatePath("/admin/requests");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Request updated. Contact the customer manually through their selected channel." };
}
