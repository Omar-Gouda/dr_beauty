import Link from "next/link";
import { LegalPage, LegalSection, OwnerConfirmation } from "@/components/legal/LegalPage";

export default function AboutPage() {
  return (
    <LegalPage
      title="A more considered way to shop beauty"
      intro="Dr. Beauty is an online skincare and beauty store built to make browsing, comparing product information, and getting help with an order straightforward."
      notice={null}
    >
      <LegalSection title="Our purpose">
        <p>We bring the store experience together in one place: browse the catalog, review the details provided for each product, and use the available support and account tools when you need them.</p>
        <p>Product pages and checkout are intended to help you make an informed purchase. They are not a substitute for individualized medical advice.</p>
      </LegalSection>
      <LegalSection title="A thoughtful product experience">
        <p>The catalog presents product names, descriptions, images, prices, and availability information where provided. We aim to keep those details useful and easy to review before you order.</p>
        <OwnerConfirmation>Publish the verified product-selection and sourcing standards the business wants customers to understand. No certification, clinical approval, or partnership is asserted here.</OwnerConfirmation>
      </LegalSection>
      <LegalSection title="Here to help">
        <p>You can review order information through your account and contact the team using the existing support page.</p>
        <Link href="/support" className="inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)] hover:underline">Visit customer support</Link>
      </LegalSection>
      <LegalSection title="About the business">
        <OwnerConfirmation>Add the verified business/legal name, founding or operating background, service area, and any approved brand story before publication.</OwnerConfirmation>
      </LegalSection>
    </LegalPage>
  );
}
