import Link from "next/link";
import { LegalPage, LegalSection, OwnerConfirmation } from "@/components/legal/LegalPage";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro="These draft terms describe the main ways the Dr. Beauty website is used. Review the owner-confirmation notes and obtain appropriate legal review before treating this page as final."
    >
      <LegalSection title="1. Introduction and acceptance">
        <p>These draft terms describe proposed conditions for using the website and are subject to owner and legal review. The application does not record acceptance of these Terms through a registration or checkout checkbox.</p>
        <OwnerConfirmation>Confirm the contracting business identity, governing law, dispute process, effective date, and legally appropriate acceptance language and process before publication.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="2. Accounts and customer responsibilities">
        <p>You may create an account to use account features such as saved addresses and order history. Keep your sign-in details private and provide accurate information needed to process your requests.</p>
        <OwnerConfirmation>Confirm account eligibility, account closure process, and any customer responsibilities to include.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="3. Products, descriptions, and availability">
        <p>Product information, images, prices, and availability are presented on the site and may change. Availability is checked during shopping and checkout; an item is not guaranteed until the order is accepted through the store’s order process.</p>
        <p>Product information is general and does not replace advice from a qualified healthcare professional.</p>
      </LegalSection>
      <LegalSection title="4. Pricing and payment">
        <p>The current checkout supports Cash on Delivery and displays amounts in EGP. The order summary shows product, shipping, and discount amounts used for the order. Selecting gift packaging may add its configured fee to the order total.</p>
        <OwnerConfirmation>Confirm tax treatment, any additional charges, and whether payment methods beyond Cash on Delivery are offered.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="5. Orders and order confirmation">
        <p>Submitting checkout creates an order request that may begin in a pending-confirmation state. The store’s order status is available in the customer account. The business should confirm when an order is accepted, changed, or declined.</p>
        <OwnerConfirmation>Confirm the order acceptance process, cancellation rights, and how customers are notified of changes.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="6. Cash on Delivery">
        <p>When Cash on Delivery is selected, payment is handled in connection with delivery rather than through an online card payment in the checkout flow.</p>
        <OwnerConfirmation>Confirm the exact collection procedure, accepted payment forms, and what happens if delivery or collection cannot be completed.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="7. Shipping and delivery">
        <p>Checkout uses the delivery address and shipping configuration shown by the store. Delivery availability, fee, and timing can depend on the configured service.</p>
        <OwnerConfirmation>Publish confirmed delivery areas, fees, estimated timeframes, and delay or failed-delivery handling.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="8. Returns, refunds, and exchanges">
        <OwnerConfirmation>The repository does not establish a customer-facing return window, eligibility rules, refund method, or exchange procedure. Add the business-approved policy before publication.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="9. Promotions and discount codes">
        <p>Promotions may have a code, value, minimum order amount, eligibility, schedule, or redemption limit. The applicable terms and checkout calculation for a promotion govern its use.</p>
        <OwnerConfirmation>Confirm how promotion errors, combination with other offers, and changes or cancellation of an offer are handled.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="10. Intellectual property">
        <p>Do not copy or reuse website materials without permission from the relevant rights holder or another lawful basis.</p>
        <OwnerConfirmation>Identify the rights holder and confirm permitted use of the Dr. Beauty name, logo, product images, and other site materials.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="11. Limitation of liability">
        <OwnerConfirmation>Have qualified counsel draft and review any liability, warranty, or consumer-rights language. This draft does not establish or limit legal rights.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="12. Changes to these terms">
        <p>Updated terms can be published on this page. The date and notice process for changes have not been established in the project.</p>
        <OwnerConfirmation>Set the effective date and customer-notification approach for material changes.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="13. Contact">
        <p>For questions about an order or these draft terms, use <Link href="/support" className="font-semibold text-[var(--color-primary)] hover:underline">Customer Support</Link>.</p>
        <OwnerConfirmation>Add the business&apos;s approved contact details and response expectations.</OwnerConfirmation>
      </LegalSection>
    </LegalPage>
  );
}
