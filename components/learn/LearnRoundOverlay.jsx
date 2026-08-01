"use client";

import { cn } from "@/lib/cn";
import LearnQuestionRenderer from "./LearnQuestionRenderer";

/**
 * Hosts a single Learn-mode mixed-engine question over the game map.
 *
 * Two layouts:
 * - "top": a compact prompt pinned to the top of the map stage, leaving the map
 *   visible (used for questions that reference the map — map clicks and
 *   "which country is highlighted?" style prompts).
 * - "center": a centered card for pure choice / comparison questions. The map
 *   stays visible behind the card, but this overlay captures pointer events so
 *   the user can't pan/zoom/click the map (navigation is also locked on the
 *   map itself for non-click Learn questions).
 */
export default function LearnRoundOverlay({
  question,
  variant = "center",
  emaScore = null,
  cardRef,
  ...rendererProps
}) {
  if (!question) return null;

  const isTop = variant === "top";

  return (
    <div
      className={cn(
        "absolute inset-0 z-30 flex px-3",
        // Top: click-through so map-click questions still reach the map; only
        // the card captures pointers. Center: capture the whole stage so the
        // map behind can't be dragged, while remaining visually visible.
        isTop
          ? "pointer-events-none items-start justify-center pt-3"
          : "pointer-events-auto items-center justify-center bg-surface/20 py-4 backdrop-blur-[2px]"
      )}
    >
      <div
        ref={cardRef}
        className={cn(
          "pointer-events-auto relative w-full rounded-xl border border-border bg-surface shadow-xl",
          isTop
            ? "max-w-md bg-surface/95 p-3 backdrop-blur"
            : "max-h-full max-w-lg overflow-y-auto p-5"
        )}
      >
        {/* TEST-ONLY: current country's EMA mastery score */}
        {emaScore != null && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-pill bg-meta px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-text-muted">
            EMA {Number(emaScore).toFixed(2)}
          </div>
        )}
        <LearnQuestionRenderer question={question} {...rendererProps} />
      </div>
    </div>
  );
}
