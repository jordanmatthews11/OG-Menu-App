
"use client";

import * as React from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  starSize?: 'sm' | 'default';
}

export function StarRating({ value, onChange, max = 5, starSize = 'default' }: StarRatingProps) {
  const [hoverValue, setHoverValue] = React.useState<number | null>(null);

  const getColor = (rating: number) => {
    const currentRating = hoverValue || value;
    if (rating > currentRating) return "text-muted-foreground/50";
    if (currentRating >= 5) return "text-red-500 fill-red-500";
    if (currentRating >= 3) return "text-orange-400 fill-orange-400";
    return "text-yellow-400 fill-yellow-400";
  };

  const sizeClasses = starSize === 'sm' ? 'h-5 w-5' : 'h-6 w-6';


  return (
    <div className="flex items-center gap-1">
      {[...Array(max)].map((_, index) => {
        const ratingValue = index + 1;
        return (
          <button
            type="button"
            key={ratingValue}
            onClick={() => onChange(ratingValue)}
            onMouseEnter={() => setHoverValue(ratingValue)}
            onMouseLeave={() => setHoverValue(null)}
            className="cursor-pointer p-1"
            aria-label={`Rate ${ratingValue} out of ${max}`}
          >
            <Star
              className={cn(
                "transition-colors",
                sizeClasses,
                getColor(ratingValue)
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
