import Container from "@/components/ui/Container";
import { Truck, ShieldCheck, Sparkles, Headphones } from "lucide-react";

const benefits = [
  {
    icon: Truck,
    title: "Fast Delivery",
    description: "Across Egypt",
  },
  {
    icon: ShieldCheck,
    title: "100% Original",
    description: "Trusted Brands",
  },
  {
    icon: Sparkles,
    title: "Scientifically Selected",
    description: "Real needs",
  },
  {
    icon: Headphones,
    title: "Expert Support",
    description: "Here for you",
  },
];

export default function BenefitsSection() {
  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] py-6 sm:py-8">
      <Container size="wide">
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          {benefits.map((item, index) => {
            const IconComponent = item.icon;
            return (
              <div key={index} className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 sm:gap-3 sm:border-0 sm:bg-transparent">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] sm:h-12 sm:w-12">
                  <IconComponent className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="break-words text-xs font-bold text-[var(--color-text)] sm:text-sm">
                    {item.title}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)]">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
