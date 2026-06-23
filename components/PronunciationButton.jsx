"use client";

import { playCountryPronunciation } from "@/lib/pronunciation";
import { cn } from "@/lib/cn";
import { gameControlBtn } from "@/lib/ui";

export default function PronunciationButton({ iso3, label, className, inline = false }) {
  if (!iso3) return null;

  return (
    <button
      type="button"
      className={cn(
        gameControlBtn,
        inline && "h-8 w-8 shrink-0 [&_svg]:h-4 [&_svg]:w-4",
        className
      )}
      onClick={(event) => {
        event.stopPropagation();
        playCountryPronunciation(iso3);
      }}
      aria-label={label ? `Play pronunciation of ${label}` : "Play pronunciation"}
      title="Listen"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M3 9v6h4l5 5V4L7 9H3zm7 0c0 1.66-1.34 3-3 3v2c2.76 0 5-2.24 5-5h-2zm0 4c0 1.1-.9 2-2 2v2c2.21 0 4-1.79 4-4h-2zm0 4c0 .55-.45 1-1 1v2c1.66 0 3-1.34 3-3h-2z" />
      </svg>
    </button>
  );
}
