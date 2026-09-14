"use client";

import { cn } from "@/lib/cn";
import { giveUpBtn } from "@/lib/ui";

/**
 * Quiet "I have no idea" control. Scoring and teaching match a wrong answer.
 */
export default function GiveUpButton({ onClick, disabled = false, className }) {
  return (
    <button
      type="button"
      className={cn(giveUpBtn, className)}
      onClick={onClick}
      disabled={disabled}
      aria-label="Give up and mark this question incorrect"
    >
      Give up
    </button>
  );
}
