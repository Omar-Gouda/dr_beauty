import { Star } from "lucide-react";

export default function ProductRating({ rating = 0, reviews = 0, showCount = true, size = "sm" }) {
  const starSize = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";

  if (reviews === 0) {
    return <span className="text-xs text-[var(--color-text-secondary)]">No reviews yet</span>;
  }
  if (rating == null || reviews == null) {
    return <span className="text-xs text-[var(--color-text-secondary)]">Ratings unavailable</span>;
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= Math.floor(rating);
          const isHalf = star === Math.ceil(rating) && rating % 1 !== 0;

          return (
            <Star
              key={star}
              className={`${starSize} ${
                isFilled
                  ? "fill-[var(--color-warning)] text-[var(--color-warning)]"
                  : isHalf
                  ? "fill-[var(--color-warning)]/50 text-[var(--color-warning)]"
                  : "text-[var(--color-border)]"
              }`}
            />
          );
        })}
      </div>
      <span className="font-bold text-[var(--color-text)] text-xs sm:text-sm">{rating.toFixed(1)}</span>
      {showCount && (
        <span className="text-xs text-[var(--color-text-secondary)]">({reviews} reviews)</span>
      )}
    </div>
  );
}
