import Link from 'next/link';
import Image from "next/image";

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[58svh] w-full items-center justify-start bg-cover bg-center bg-no-repeat px-4 py-14 sm:min-h-[75vh] sm:px-[7%] sm:py-20"
      style={{ 
        height: 'auto',
        backgroundColor: 'var(--color-background)'
      }}
    >
      <Image
        src="/images/branding/hero-banner.jpg"
        alt=""
        fill
        sizes="100vw"
        preload
        className="object-cover object-center"
      />
      {/* Overlay خفيف لضمان وضوح النص على الموبايل */}
      <div className="absolute inset-0 bg-[var(--color-background)]/40 sm:bg-transparent" />
      
      {/* Text Container */}
      <div className="relative z-10 max-w-xl text-left flex flex-col items-start sm:-translate-y-10">
        
        {/* Your beauty journey - Italic & Styled */}
        <span className="font-editorial text-xl sm:text-2xl italic font-semibold text-[var(--color-primary)] mb-2 inline-block tracking-wide"
          style={{ transform: 'rotate(-6deg)', textShadow: '0 2px 4px rgba(215, 123, 142, 0.2)' }}
        >
          Your beauty journey
        </span>

        {/* Healthy Skin, Happy You */}
        <h1 className="font-editorial text-4xl sm:text-6xl font-bold text-[var(--color-text)] leading-[1.1] mb-4 tracking-tight">
          Healthy Skin, <br />
          <span className="font-editorial italic text-[var(--color-rose)] relative inline-block pb-1">
            Happy You!
          </span>
        </h1>

        {/* Sub-features with Glow effect */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-sans text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] mb-6 sm:mb-8 tracking-wide">
          <span className="transition-all duration-300" style={{ textShadow: '0 0 8px rgba(215, 123, 142, 0.4)' }}>
            Curated beauty products
          </span>
          <span className="text-[var(--color-primary)]">•</span>
          <span className="transition-all duration-300" style={{ textShadow: '0 0 8px rgba(215, 123, 142, 0.4)' }}>
            Expert advice
          </span>
          <span className="text-[var(--color-primary)]">•</span>
          <span className="transition-all duration-300" style={{ textShadow: '0 0 8px rgba(215, 123, 142, 0.4)' }}>
            Real results
          </span>
        </div>

        {/* Shop Now Button */}
        <Link href="/shop" className="inline-flex items-center gap-2 bg-[var(--color-primary)] text-white px-8 sm:px-9 py-3 sm:py-3.5 rounded-full text-sm font-semibold font-sans shadow-lg shadow-[var(--color-primary)]/30 transition-all hover:bg-[var(--color-primary-hover)]">
          Shop Now →
        </Link>

      </div>
    </section>
  );
}
