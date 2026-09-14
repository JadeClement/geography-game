"use client";

import { cn } from "@/lib/cn";
import { promptActionGroup, promptSubmitBtn } from "@/lib/ui";
import GiveUpButton from "@/components/GiveUpButton";

/**
 * Compact Submit + Give up pair that sits beside a country prompt or text box
 * so the host header/card stays one row tall.
 */
export default function PromptActions({
  showSubmit = false,
  onSubmit,
  submitLabel = "Submit",
  submitDisabled = false,
  submitType = "button",
  showGiveUp = false,
  onGiveUp,
  giveUpDisabled = false,
  className,
}) {
  if (!showSubmit && !showGiveUp) return null;

  return (
    <div className={cn(promptActionGroup, className)}>
      {showSubmit ? (
        <button
          type={submitType}
          className={promptSubmitBtn}
          onClick={submitType === "submit" ? undefined : onSubmit}
          disabled={submitDisabled}
        >
          {submitLabel}
        </button>
      ) : null}
      {showGiveUp ? (
        <GiveUpButton onClick={onGiveUp} disabled={giveUpDisabled} />
      ) : null}
    </div>
  );
}
