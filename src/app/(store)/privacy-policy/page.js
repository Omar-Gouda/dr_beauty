import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Privacy Policy",
  description: "How Dr. Beauty handles account, order, support, and website information.",
  alternates: { canonical: "/privacy-policy" },
};

const effectiveDate = "10 November 2026";
const sections = [
  ["responsible", "1. Who is responsible"], ["information", "2. Information handled"],
  ["purposes", "3. Why information is used"], ["accounts-orders", "4. Accounts and orders"],
  ["promotions-rankings", "5. Promotions and public rankings"], ["reviews-requests", "6. Reviews and requests"],
  ["marketing", "7. Marketing choices"], ["whatsapp", "8. WhatsApp"],
  ["analytics-storage", "9. Cookies and browser storage"], ["providers", "10. Service providers and safeguards"],
  ["sharing-transfers", "11. Sharing and international processing"], ["retention", "12. Retention and deletion"],
  ["rights", "13. Your privacy rights"], ["children-updates", "14. Children and policy updates"],
];

export default function PrivacyPolicyPage() {
  return <LegalPage title="Privacy Policy" intro="This policy explains information handled when you browse, create an account, shop, contact support, or use public community features." effectiveDate={effectiveDate} alternateLanguageHref="/ar/privacy-policy" alternateLanguageLabel="العربية" sections={sections.map(([id, title]) => ({ id, title }))}>
    <LegalSection id="responsible" title={sections[0][1]}>
      <p>Dr. Beauty is the trading name of an individually operated store. The operator is Dr. Radwa Hassan; Dr. Beauty is not described as a separate company. For privacy questions, email <a className="font-semibold text-[var(--color-rose)] underline-offset-4 hover:underline" href="mailto:radwahassan968@gmail.com">Dr. Beauty</a> or use <Link href="/support" className="font-semibold text-[var(--color-rose)] underline-offset-4 hover:underline">Customer Support</Link>.</p>
    </LegalSection>
    <LegalSection id="information" title={sections[1][1]}>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong className="text-[var(--color-text)]">Account and profile:</strong> email address, profile name, phone number, account identifier, and your public-ranking preference.</li>
        <li><strong className="text-[var(--color-text)]">Delivery and orders:</strong> recipient name and phone, governorate, city, street address, delivery notes, items, quantities, prices, discounts, shipping, order and payment status. Gift orders may contain recipient name and phone, an extra contact number, gift message, and packaging choice.</li>
        <li><strong className="text-[var(--color-text)]">Saved shopping data:</strong> saved addresses, wishlist items, and cart contents. Cart and wishlist data are stored in your browser; wishlist records may also be account-linked.</li>
        <li><strong className="text-[var(--color-text)]">Promotions and consent:</strong> promotion codes, eligibility and redemption records, required policy versions and acceptance timestamps, and the optional WhatsApp order-draft choice.</li>
        <li><strong className="text-[var(--color-text)]">Reviews and requests:</strong> review rating and text, support or Beauty Tips request, selected category, order or product reference, reply method, and any contact information or details you submit.</li>
        <li><strong className="text-[var(--color-text)]">Technical and usage information:</strong> a first-party visitor identifier transformed by the server into a secret-keyed daily pseudonymous value for aggregate visitor counts, plus standard request and security information processed by website infrastructure.</li>
      </ul>
    </LegalSection>
    <LegalSection id="purposes" title={sections[2][1]}>
      <p>Account details are used to create and secure your account. Delivery and order details are used to calculate and fulfil purchases and provide order support. Request details are used to respond to the request you submit. Review details are moderated and may be displayed if approved. Technical information helps operate and protect the website. Order, promotion, consent, and security records may also be processed to meet applicable legal, accounting, or dispute-resolution duties.</p>
      <p>Optional public ranking and WhatsApp draft choices are separate from account registration and legal-policy acknowledgement. The website does not use policy acceptance as blanket marketing consent.</p>
    </LegalSection>
    <LegalSection id="accounts-orders" title={sections[3][1]}>
      <p>Account authentication manages sign-in sessions. The application stores profile details and saved addresses with your account. Checkout currently supports Cash on Delivery. The database records order items and financial snapshots, delivery details, and payment and order status. Transactional email may be queued for account or order purposes; queueing does not prove delivery.</p>
      <p>Your account shows the saved operational order summary while that order record exists. The current operational deletion policy can remove it as described below.</p>
    </LegalSection>
    <LegalSection id="promotions-rankings" title={sections[4][1]}>
      <p>Promotion records are used to check dates, eligible products or categories, minimum amounts, first-purchase qualifications, global capacity, and per-account limits. A private redemption ledger and purchase-history records may remain after the related operational order has been deleted.</p>
      <p>Public customer ranking is optional. If you turn it on in your profile, the site may show a name in rankings based on qualifying delivered orders or paid-and-delivered purchase value. Turning it off stops future public name display; the public list uses “Private member.” Ranking calculations can still be used for store administration. Email, phone, and account ID are not displayed.</p>
    </LegalSection>
    <LegalSection id="reviews-requests" title={sections[5][1]}>
      <p>Reviews and support or Beauty Tips requests are stored so they can be moderated and answered. A review may be public only if approved. Support requests may be linked to an order or product when relevant. Staff-only handling notes are not part of the customer-visible request.</p>
    </LegalSection>
    <LegalSection id="marketing" title={sections[6][1]}>
      <p>The current public website does not display an email newsletter signup. The application has administrator-managed subscriber and campaign records, but a public subscription and confirmation flow and active campaign-delivery path were not identified in the reviewed application. Account registration, policy acceptance, a purchase, and an order-related WhatsApp choice are not marketing consent. Direct marketing requires a separate explicit choice and an effective unsubscribe route. Existing customers are not automatically treated as marketing subscribers.</p>
      <p>Account verification, password recovery, and order-service notices are operational communications, not newsletter marketing.</p>
    </LegalSection>
    <LegalSection id="whatsapp" title={sections[7][1]}>
      <p>The WhatsApp Channel link and Click-to-Chat links open an external service. The website does not receive a list of Channel followers through the link. The optional checkout choice prepares a one-time order draft containing the order information described beside that choice. You review and decide whether to send it; the website does not automatically send it. If you send the draft, the information is received and processed by WhatsApp under its terms.</p>
    </LegalSection>
    <LegalSection id="analytics-storage" title={sections[8][1]}>
      <p>Authentication uses session cookies. Cart, wishlist, and checkout retry details may be kept in local or session storage in your browser. A first-party HttpOnly visitor cookie may support aggregate visitor counts; the stored daily value is pseudonymous rather than the raw visitor identifier. Admin routes are excluded from visitor counting. No advertising or cross-site tracking integration was identified in the application source reviewed.</p>
      <p>You can clear or block browser storage, although this may sign you out or remove saved cart, wishlist, or retry state.</p>
    </LegalSection>
    <LegalSection id="providers" title={sections[9][1]}>
      <p>Service-provider categories may include website hosting and infrastructure, database and account services, transactional email delivery, security and operational services, and a communication platform you choose to use. Delivery or other fulfilment providers may receive the contact, destination, and order information needed to perform their service.</p>
      <p>Application safeguards identified in source include authenticated sessions, database row-level access policies, server-side administrative authorization, and pseudonymous visitor counting. These measures reduce risk but do not guarantee that a service is completely secure. The full deployed environment has not had an independent security assessment.</p>
    </LegalSection>
    <LegalSection id="sharing-transfers" title={sections[10][1]}>
      <p>Service providers process information only as needed to operate the site, authenticate accounts, store records, deliver transactional email, support fulfilment, prepare or send a communication you choose to send, or meet a legal obligation.</p>
      <p>Provider routing and infrastructure may process data in or outside Egypt. The local project files do not establish every temporary and final processing location, destination country, onward recipient, or cross-border permit and safeguard. We therefore cannot state that data stays in Egypt or that all applicable transfer authorizations have been obtained. Those locations and arrangements must be verified before the service can be represented as compliant with Egyptian cross-border data requirements.</p>
    </LegalSection>
    <LegalSection id="retention" title={sections[11][1]}>
      <p>Active operational orders are retained while active. After an order enters Delivered or Cancelled, the system is configured to permanently delete the operational order and item records 45 days after that status begins. An administrator can also permanently delete an order. Order summaries in customer accounts are available only while those operational records exist.</p>
      <p>No separate accounting or tax-invoice archive was identified that guarantees preservation of required evidence after operational deletion. The store must verify statutory retention periods and implement a separate, purpose-limited accounting archive where required. Promotion redemption history, first-purchase evidence, and ranking analytics may remain in separate records and are not all removed by order deletion. This is not a statement that all personal data is deleted after 45 days.</p>
      <p>The site does not provide self-service account deletion. Requests are reviewed against legal, accounting, promotion, security, and dispute-related retention needs. Backups and independent records may follow separate retention schedules.</p>
    </LegalSection>
    <LegalSection id="rights" title={sections[12][1]}>
      <p>Subject to applicable law and retention duties, you may request access to your information, a copy, correction or updating, withdrawal of consent where processing depends on consent, objection or restriction where available, or erasure where legally permitted. You may also complain to the competent data-protection authority. Contact <a className="font-semibold text-[var(--color-rose)] underline-offset-4 hover:underline" href="mailto:radwahassan968@gmail.com">radwahassan968@gmail.com</a> or <Link href="/support" className="font-semibold text-[var(--color-rose)] underline-offset-4 hover:underline">Customer Support</Link>. Identify the relevant account or order, but never send a password or payment-card credentials.</p>
      <p>We will verify and assess a request under the applicable law. We cannot promise deletion of information that must be kept for a legal, accounting, security, or dispute purpose.</p>
    </LegalSection>
    <LegalSection id="children-updates" title={sections[13][1]}>
      <p>The current website does not ask for a customer&apos;s age or implement a parental-consent flow. It therefore does not verify age or record guardian consent. A parent or guardian who believes a child has submitted information may contact us. The age threshold and any required safeguards need legal confirmation and implementation; this policy does not claim that guardian consent is collected.</p>
      <p>This policy may change as the site or its data practices change. The effective date above identifies this policy version. When a change requires renewed acknowledgement, the account flow can ask you to review the current policy.</p>
    </LegalSection>
  </LegalPage>;
}
