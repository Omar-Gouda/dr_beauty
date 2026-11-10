import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Terms & Conditions",
  description: "The terms for using the Dr. Beauty website and placing an order.",
  alternates: { canonical: "/terms-and-conditions" },
};

const effectiveDate = "10 November 2026";
const sections = [
  ["scope", "1. Scope and eligibility"],
  ["accounts", "2. Customer accounts"],
  ["products", "3. Products, prices and availability"],
  ["orders", "4. Orders and acceptance"],
  ["payment", "5. Cash on Delivery"],
  ["delivery", "6. Shipping and delivery"],
  ["cancellations", "7. Cancellations, returns and refunds"],
  ["promotions", "8. Promotions and customer rankings"],
  ["content", "9. Reviews and submitted content"],
  ["marketing", "10. Email and marketing"],
  ["whatsapp", "11. WhatsApp communications"],
  ["use", "12. Website use and availability"],
  ["intellectual-property", "13. Website content and intellectual property"],
  ["liability", "14. Responsibility and consumer rights"],
  ["changes-contact", "15. Changes and contact"],
];

export default function TermsAndConditionsPage() {
  return <LegalPage
    title="Terms & Conditions"
    intro="These terms explain how to use the Dr. Beauty website, create an account, and place an order. Please read them before shopping."
    effectiveDate={effectiveDate}
    alternateLanguageHref="/ar/terms-and-conditions"
    alternateLanguageLabel="العربية"
    sections={sections.map(([id, title]) => ({ id, title }))}
  >
    <LegalSection id="scope" title={sections[0][1]}>
      <p>These terms apply to your use of the Dr. Beauty website and its shopping, account, support, review, and promotional features. Dr. Beauty is the trading name used by an individually operated store. The owner/operator is Dr. Radwa Hassan; Dr. Beauty is not represented here as a registered company or separate legal entity. By creating an account or placing an order, you acknowledge the applicable terms. Nothing here removes a right that cannot lawfully be waived.</p>
      <p>You must be legally able to enter into the transaction. Information you provide must be accurate and must not violate another person&apos;s rights.</p>
    </LegalSection>

    <LegalSection id="accounts" title={sections[1][1]}>
      <p>An account lets you manage profile details, saved delivery addresses, wishlist items, and order history. Keep access to your email account and password secure, and tell us promptly if you believe someone else has accessed your account.</p>
      <p>You are responsible for keeping contact and delivery details current. Do not impersonate another person or use an account you are not authorized to access. The website does not currently provide a self-service account deletion control; contact us if you need help with an account privacy request.</p>
    </LegalSection>

    <LegalSection id="products" title={sections[2][1]}>
      <p>Product pages provide the names, descriptions, ingredients, images, prices, and availability information available to the store. Images are intended to illustrate products; packaging and appearance may vary. Read the product information and any supplied instructions before use.</p>
      <p>Prices and stock can change. The catalog and cart are informational until checkout confirms current prices and availability. The order total is calculated by the website using its current product, shipping, and promotion information. Amounts are shown in Egyptian pounds (EGP).</p>
      <p>Product information is general shopping information and is not individualized medical advice. Ask a qualified healthcare professional about a health concern or whether a product is suitable for you.</p>
    </LegalSection>

    <LegalSection id="orders" title={sections[3][1]}>
      <p>Before submission, review your products and quantities, recipient and delivery details, delivery charge, discounts, and final total. You can correct the checkout fields before selecting “Place COD Order.” Submitting the form sends a purchase request. The website validates stock and recalculates prices, delivery, and discounts from current database records. The store confirms the request through its existing order process. The order is not represented as paid when it is placed.</p>
      <p>The confirmation email is queued by the website after order creation; queueing does not prove email delivery. Your account shows the saved order details while the operational order record remains available. Consumer Protection Law Article 38 also provides a distance-contract correction period after acceptance in the circumstances prescribed by law; contact support promptly if you need to correct an accepted order.</p>
    </LegalSection>

    <LegalSection id="payment" title={sections[4][1]}>
      <p>The website checkout currently supports Cash on Delivery (COD); it does not take card payment in the checkout flow. The configured delivery charge and total due in Egyptian pounds (EGP) are shown before submission. Payment is due upon delivery and the order remains pending payment until payment is actually collected and recorded. An administrator may record a COD collection after delivery where applicable. An order number, delivered status, or message draft is not proof of payment.</p>
      <p>Do not send card details or passwords through the support form or WhatsApp. If a payment or collection record appears incorrect, contact Customer Support with your order details.</p>
    </LegalSection>

    <LegalSection id="delivery" title={sections[5][1]}>
      <p>The current estimated delivery window is 5–7 days. This is an estimate, not an unconditional guarantee, and the store has not defined it as business days or calendar days. Actual timing varies with order traffic and workload, carrier availability and operating speed, delivery location, and handling conditions.</p>
      <p>Checkout shows the destination you selected, the configured delivery charge, and the order total before you submit the request. The website does not calculate a more specific delivery date at present. Keep your delivery contact information available for coordination, and contact Customer Support if you need help.</p>
    </LegalSection>

    <LegalSection id="cancellations" title={sections[6][1]}>
      <p>You may return or exchange a product within 14 days of receiving it without giving a reason, subject only to the exceptions and conditions established by Egyptian law. Do not read this as an unconditional right to return every product in every condition. An exception must apply to the specific product and circumstances under the law. We do not treat every cosmetic or skincare product as automatically excluded. Whether an opened or used product, or a product with a removed protective seal, falls within a statutory exception depends on the particular goods, hygiene and packaging circumstances, and applicable law.</p>
      <p>Products damaged by the customer after delivery or through misuse attributable to the customer are not returnable on that basis. This does not apply to damage present on delivery, a defect, non-conformity, or an issue that may have occurred during carrier handling. Reports of incorrect packaging or shipping damage will be reviewed; the customer is not automatically presumed responsible.</p>
      <p>If a product is defective, expired, or otherwise non-conforming, contact Customer Support. The Consumer Protection Law provides a 30-day period from receipt for replacement or return of defective goods, subject to the law and its implementing rules. The appropriate remedy, including repair, replacement, or refund where applicable, will be arranged without a charge prohibited by law. A statutory remedy is not restricted to a defect that was immediately visible.</p>
      <p>The website does not currently provide an automated return, exchange, or refund workflow. Contact Customer Support promptly and identify the order and item. Support is the intake channel, not a condition that removes or delays a statutory right. Do not ship an item back until you receive return instructions. The store will investigate carrier or packaging issues, explain the next step, and arrange any legally required remedy. Under Article 40, a refund for a returned commodity is due by the same payment method unless otherwise agreed and within no more than seven days from return of the product, subject to the statutory terms and exceptions. The website does not impose a longer period or require a payment method contrary to law. The current COD system does not yet provide a self-service refund or payment-reversal feature.</p>
    </LegalSection>

    <LegalSection id="promotions" title={sections[7][1]}>
      <p>Discount codes and offers may be limited by dates, minimum eligible subtotal, products or categories, first-purchase eligibility, overall or per-account redemption limits, and other conditions shown with the offer. Entered codes are checked again by the checkout service; a preview is an estimate until the order is placed.</p>
      <p>Where an offer has discount tiers, the highest qualifying tier for that promotion applies; tiers from the same promotion are not cumulative. Discounts cannot exceed their eligible amount. Unless an offer expressly says otherwise, a promotion has no cash value and cannot be transferred. Attempts to bypass eligibility or usage limits may result in the offer being refused.</p>
      <p>First-purchase eligibility is determined from account purchase records maintained by the store. DR. Beauty Elites and other customer rankings are recognition features based on qualifying order records; they are not a separate membership, discount, or promise of benefits.</p>
    </LegalSection>

    <LegalSection id="content" title={sections[8][1]}>
      <p>You may submit a product review or a Beauty Tips or support request through the available forms. Keep submissions relevant, truthful, and respectful. Do not include another person&apos;s private information, unlawful material, threats, or content that you do not have the right to share.</p>
      <p>Reviews may be checked before publication and can be approved, rejected, or moderated under the website&apos;s review process. Submitted content does not replace medical advice, and the store may use a review to display customer feedback about a product.</p>
    </LegalSection>

    <LegalSection id="marketing" title={sections[9][1]}>
      <p>The website sends account and order-related communications needed to confirm an account, process an order, or provide an order update. These service messages are distinct from marketing.</p>
      <p>The current public website provides a link to the Dr. Beauty WhatsApp Channel, but does not show a public email newsletter sign-up form. If you separately subscribe to a store email campaign through a channel made available by the store, you may unsubscribe using the option in the message where provided or contact us.</p>
    </LegalSection>

    <LegalSection id="whatsapp" title={sections[10][1]}>
      <p>Following the optional WhatsApp Channel takes place on WhatsApp, under WhatsApp&apos;s terms and privacy practices. The website does not receive a list of people who follow the Channel through the link.</p>
      <p>At checkout, you may make a separate optional choice to prepare a one-time order-related WhatsApp draft. It may contain your name, order number and date, product names, quantities and unit prices, subtotal, promotion and delivery discounts, delivery charge, total due, COD payment status, delivery destination and notes, and the estimated delivery window. The draft is shown to you for review; you decide whether to open WhatsApp and press Send. The website does not send it automatically. This choice is not marketing consent and does not replace an invoice, receipt, or required order record. WhatsApp processes information you choose to send under its own terms and privacy practices.</p>
    </LegalSection>

    <LegalSection id="use" title={sections[11][1]}>
      <p>Use the website for lawful personal shopping and related account or support activities. Do not interfere with the site, probe or bypass security controls, submit malicious code, scrape protected data, misuse another customer&apos;s account, or attempt to manipulate stock, order, review, or promotion rules.</p>
      <p>The website and individual features may be changed, interrupted, or unavailable. We may restrict activity that threatens the service, customers, or the integrity of orders and promotions.</p>
    </LegalSection>

    <LegalSection id="intellectual-property" title={sections[12][1]}>
      <p>The website&apos;s layout, text, graphics, and other materials are provided for browsing and shopping. Product names, logos, and product images may belong to their respective owners or licensors. Do not copy, republish, or commercially use website material without permission from the relevant rights holder or another lawful basis.</p>
    </LegalSection>

    <LegalSection id="liability" title={sections[13][1]}>
      <p>We take reasonable care in operating the website and processing orders, but online information and services cannot be guaranteed to be uninterrupted or error-free. To the extent the law permits, Dr. Beauty is not responsible for indirect loss arising from inability to use the website or from circumstances outside its reasonable control.</p>
      <p>Nothing in these terms limits liability or a consumer right where doing so would be unlawful. If a term cannot be enforced, the remaining terms continue to apply to the extent permitted.</p>
    </LegalSection>

    <LegalSection id="changes-contact" title={sections[14][1]}>
      <p>We may update these terms as the website and its services change. The effective date at the top identifies the current version. Material changes will be presented through the website when appropriate; where renewed account consent is required, the account flow can ask you to accept the current version.</p>
      <p>Dr. Beauty is operated by Dr. Radwa Hassan as an individual. For questions about these terms, returns, or an order, email <a className="font-semibold text-[var(--color-rose)] underline-offset-4 hover:underline" href="mailto:radwahassan968@gmail.com">Dr. Beauty</a> or use <Link href="/support" className="font-semibold text-[var(--color-rose)] underline-offset-4 hover:underline">Customer Support</Link>.</p>
    </LegalSection>
  </LegalPage>;
}
