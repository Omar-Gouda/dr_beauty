export const BEAUTY_TIPS_CATEGORIES = [
  { value: "skincare", label: "Skincare and skin type" },
  { value: "haircare", label: "Haircare and hair type" },
  { value: "product_selection", label: "Choosing suitable products" },
  { value: "specific_product", label: "Question about a product" },
  { value: "other", label: "Other beauty question" },
];

export const SUPPORT_CATEGORIES = [
  { value: "order_cancellation", label: "Request an order cancellation" },
  { value: "refund_request", label: "Refund request" },
  { value: "delayed_order", label: "Delayed order" },
  { value: "missing_item", label: "Missing item" },
  { value: "incorrect_item", label: "Incorrect item" },
  { value: "general", label: "Other support" },
];

export const CONTACT_METHODS = [
  { value: "email", label: "Email on my account" },
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
];

export const ORDER_SUPPORT_CATEGORIES = new Set([
  "order_cancellation",
  "refund_request",
  "delayed_order",
  "missing_item",
  "incorrect_item",
]);
