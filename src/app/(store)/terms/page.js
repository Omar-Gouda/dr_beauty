import { redirect } from "next/navigation";

export default function LegacyTermsPage() {
  redirect("/terms-and-conditions");
}
