import Link from "next/link";
import { LegalPage, LegalSection, OwnerConfirmation } from "@/components/legal/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This draft summarizes information handled by the current Dr. Beauty application. It is not final: the business identity, retention periods, privacy contact, and other owner decisions below require confirmation and appropriate legal review."
    >
      <LegalSection title="1. Who is responsible">
        <p>The website processes information to provide account, shopping, order, and support features.</p>
        <OwnerConfirmation>Identify the legal data controller/business, address, privacy contact, and policy effective date before publication.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="2. Information handled by the site">
        <ul className="list-disc space-y-2 pl-5">
          <li>Account information: the authentication account uses an email address; the customer profile can store a full name and primary phone number.</li>
          <li>Delivery information: saved addresses can include recipient name, phone, governorate, city, address, and delivery notes.</li>
          <li>Orders: checkout processes customer contact and delivery details, order items, prices, status, and order history. A gift order can also include the recipient&apos;s name and phone number, an additional phone number, a personal gift message, and a gift-packaging selection and fee.</li>
          <li>Reviews and support requests: submitted product ratings/review text, support or beauty-advice questions, request category, preferred contact method, and any associated product or order reference.</li>
          <li>WhatsApp Channel: the website may provide an optional external link. Following the Channel happens on WhatsApp; the website does not collect a phone number or record whether you follow through that link.</li>
          <li>Shopping and checkout data in this browser: cart and wishlist entries use localStorage so they can be available on that browser/device. Checkout attempt details use sessionStorage to resume or safely retry the current checkout attempt; they are not described here as cross-device account storage.</li>
          <li>Authentication and technical data: sign-in/session handling uses Supabase Auth and browser/server cookies as required by the application.</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. How information is used">
        <p>The application uses these details to authenticate customers, maintain profile and address-book features, validate and process orders, show order history, and provide requested support. Order and item details may be used to prepare transactional email confirmations and order-status notifications for customers, and separate new-order notifications for administrators.</p>
      </LegalSection>
      <LegalSection title="4. WhatsApp choices">
        <p>Checkout includes an optional choice relating to transactional communications about that order, not marketing. The application records the choice with the order workflow. When selected, the application can prepare a WhatsApp message for the customer to review and send manually. The website does not send WhatsApp messages automatically, and no withdrawal control for a recorded order choice was found in the website.</p>
        <p>If you open a prepared Click-to-Chat link, WhatsApp/Meta processes information according to its own service terms and privacy practices. The prepared draft may contain order-related details. You choose whether to send it.</p>
        <p>The website may also provide an optional link to the Dr. Beauty WhatsApp Channel. Following the Channel happens on WhatsApp. The website does not collect your phone number or record whether you follow the Channel through that link.</p>
        <OwnerConfirmation>Confirm the exact WhatsApp data flow, recipient, message contents, provider/processor roles, and an appropriate process for questions or consent withdrawal; do not describe a website withdrawal feature unless one is implemented.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="5. Service providers">
        <p>The application uses Supabase for authentication and database services. Its email worker uses Resend to deliver transactional customer order emails and separate administrator new-order notifications; those messages may include order and item details. WhatsApp/Meta is reached through external Channel and Click-to-Chat links. Following the Channel happens on WhatsApp and is not tracked by this website.</p>
        <OwnerConfirmation>Confirm which services are active in the deployed site, their applicable terms and contractual roles, deployment regions, and whether hosting, delivery, or other providers also process data. The repository does not establish those deployment details.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="6. Storage and protection">
        <p>Account, address, support, and order records are stored in the application database. The project source includes authentication and database access policies intended to scope customer data. This summary does not guarantee that any system is free from risk.</p>
        <p>Cart and wishlist entries use localStorage in the browser. Checkout attempt data uses sessionStorage to support resuming or safely retrying a checkout in that browser session. Availability can depend on the browser/device and its storage settings.</p>
      </LegalSection>
      <LegalSection title="7. Cookies, analytics, and similar technologies">
        <p>Cookies are used as part of the Supabase session flow. No analytics or advertising-tracking integration was identified in the application source reviewed; this does not verify scripts, cookies, or logs added by the deployed hosting environment.</p>
        <OwnerConfirmation>Review the production deployment, hosting/CDN, and installed scripts to confirm all cookies, logs, analytics, and tracking before publication.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="8. Retention and deletion">
        <p>The website provides an option to delete a saved delivery address. No account-deletion feature was found, and deleting an address is not the same as deleting an account or its order records.</p>
        <OwnerConfirmation>Database retention periods, account deletion handling, order-record retention, backup expiry, and the process for privacy requests are not established by the reviewed application source. Set and publish the approved rules. The current storefront offers an optional external WhatsApp Channel link, not an email newsletter signup or website-managed newsletter opt-out.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="9. Your choices and questions">
        <p>You can choose whether to open the optional WhatsApp Channel link and whether to select the separate WhatsApp order-communication choice shown at checkout. Channel activity takes place on WhatsApp and is not recorded by the website through that link. For account or privacy questions, contact the team through <Link href="/support" className="font-semibold text-[var(--color-primary)] hover:underline">Customer Support</Link>.</p>
        <OwnerConfirmation>Confirm the process for access, correction, deletion, objection, consent withdrawal, and privacy requests, plus the responsible contact.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="10. Changes to this policy">
        <p>Revisions can be published on this page. No effective-date or change-notification policy has been established in the application.</p>
        <OwnerConfirmation>Set the effective date and customer notice method before the policy is finalized.</OwnerConfirmation>
      </LegalSection>
    </LegalPage>
  );
}
