"use client";

import Image from "next/image";
import { useState } from "react";

export default function ImageWithFallback({ src, fallbackSrc, alt, fill = true, className = "", sizes }) {
  const [failedSources, setFailedSources] = useState([]);
  const candidates = [...new Set([src, fallbackSrc].filter(Boolean))];
  const currentSrc = candidates.find((candidate) => !failedSources.includes(candidate));

  if (!currentSrc) {
    return <span role="img" aria-label={alt} className={`flex items-center justify-center bg-[var(--color-primary-light)] text-xs text-[var(--color-text-secondary)] ${className}`}>Image unavailable</span>;
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      fill={fill}
      unoptimized={!currentSrc.startsWith("/")}
      sizes={sizes}
      className={className}
      onError={() => setFailedSources((failed) => failed.includes(currentSrc) ? failed : [...failed, currentSrc])}
    />
  );
}
