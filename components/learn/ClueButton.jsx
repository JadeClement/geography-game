"use client";

import { useState } from "react";
import { learnClueButton, learnClueText } from "@/lib/learnUi";

/**
 * Clue ladder for Tier 1 / Tier 2 Learn questions. Renders nothing for questions
 * that are not clue-eligible (Tier 3/4 are already simplified formats).
 *
 * The reveal itself is UI-only here; the mastery cost is applied by the ANSWER
 * handler, which reads `revealUsed` + the question `tier` from the onAnswer event
 * (Step 6) and looks up the matching LEARN_EMA_MULTIPLIERS key (e.g. tier_1_reveal
 * / tier_2_wrong). This component simply signals that a clue was used via
 * `onReveal(revealedCount)`.
 *
 * Props:
 * - question: the question object (must have clueEligible + tier)
 * - clues: string[] of progressively-revealed hints
 * - onReveal?: (revealedCount:number) => void
 * - disabled?: boolean
 */
export default function ClueButton({ question, clues = [], onReveal, disabled = false }) {
  const [revealedCount, setRevealedCount] = useState(0);

  // Only Tier 1/2 questions are clue-eligible, and there must be at least one
  // clue to reveal — otherwise render nothing rather than a dead button.
  if (!question?.clueEligible || clues.length === 0) return null;

  const hasMore = revealedCount < clues.length;

  const handleReveal = () => {
    if (!hasMore || disabled) return;
    const next = revealedCount + 1;
    setRevealedCount(next);
    onReveal?.(next);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        className={learnClueButton}
        onClick={handleReveal}
        disabled={disabled || !hasMore}
      >
        <span aria-hidden="true">💡</span>
        {revealedCount === 0 ? "Show a clue" : hasMore ? "Another clue" : "No more clues"}
      </button>

      {clues.slice(0, revealedCount).map((clue, index) => (
        <p key={index} className={learnClueText}>
          {clue}
        </p>
      ))}
    </div>
  );
}
