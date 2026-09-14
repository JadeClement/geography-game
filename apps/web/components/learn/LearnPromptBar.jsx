"use client";

import { cn } from "@/lib/cn";
import { learnPrompt, learnPromptBar, learnPromptSubtext } from "@/lib/learnUi";
import PromptActions from "@/components/PromptActions";

/**
 * One-row Learn prompt: question text with Submit / Give up beside it so the
 * top overlay doesn't grow an extra action row on every question.
 */
export default function LearnPromptBar({
  prompt,
  promptClassName,
  subtext,
  children,
  ...actionProps
}) {
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <div className={learnPromptBar}>
        {children ?? (
          <p className={cn(learnPrompt, "min-w-0", promptClassName)}>{prompt}</p>
        )}
        <PromptActions {...actionProps} />
      </div>
      {subtext ? <p className={learnPromptSubtext}>{subtext}</p> : null}
    </div>
  );
}
