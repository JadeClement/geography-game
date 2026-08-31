"use client";

import { cn } from "@/lib/cn";
import { primaryBtn } from "@/lib/ui";
import { isShapeLearnQuestion } from "@/lib/learn/wrongReveal";
import MapFeedback from "@/components/MapFeedback";
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
 *
 * After a wrong answer the host can pass `awaitingContinue` + `onContinue` so
 * the learner reviews feedback before advancing. Map-focused wrongs (highlight /
 * borders) may hide this card and show only bottom Continue chrome instead.
 *
 * Map-click soft misses use `awaitingRetry` + `onTryAgain` instead — show which
 * country was clicked and let the learner try again without scoring yet.
 *
 * Outcome toasts (Correct / Incorrect) render beneath the question card.
 */

export default function LearnRoundOverlay({
  question,
  variant = "center",
  emaScore = null,
  cardRef,
  awaitingContinue = false,
  continueMessage = null,
  continueLabel = "Continue",
  onContinue,
  awaitingRetry = false,
  retryMessage = null,
  onTryAgain,
  feedbackText = null,
  feedbackType = null,
  feedbackDetail = null,
  ...rendererProps
}) {
  if (!question) return null;

  // Highlight prompts must stay top-pinned even if the host passes "center" —
  // a middle card covers the yellow country and fights the region backdrop.
  const forceTop = question.mapConfig?.display === "highlight";
  const isTop = forceTop || variant === "top";
  const heavierMapBlur = question.type === "landlocked_check";
  const shapeQuestion = isShapeLearnQuestion(question);
  const highlightMapPrompt = question.mapConfig?.display === "highlight";
  // Shape cards already mark correct/wrong in-place (check / X), so skip the
  // bottom Correct/Incorrect pill that would duplicate that feedback.
  const showOutcomeFeedback = Boolean(feedbackText) && !shapeQuestion;
  // Highlight free-recall: Continue lives in-form (arrow). Correct answers
  // auto-advance unless a teaching note sets awaitingContinue.
  const inlineContinue =
    question.answerType === "text_entry" &&
    question.mapConfig?.display === "highlight";
  const showFooter =
    (awaitingContinue || awaitingRetry) && !(inlineContinue && awaitingContinue);

  return (
    <div
      className={cn(
        "absolute inset-0 z-30 flex px-3",
        // Top: click-through so map-click questions still reach the map; only
        // the card captures pointers. Center: capture the whole stage so the
        // map behind can't be dragged, while remaining visually visible.
        isTop
          ? "pointer-events-none items-start justify-center pt-3"
          : shapeQuestion
            ? "pointer-events-auto items-center justify-center bg-background/85 py-4 backdrop-blur-xl"
            : heavierMapBlur
              ? "pointer-events-auto items-center justify-center bg-surface/40 py-4 backdrop-blur-[6px]"
              : "pointer-events-auto items-center justify-center bg-surface/20 py-4 backdrop-blur-[2px]"
      )}
    >
      <div
        className={cn(
          "relative flex w-full flex-col items-center",
          isTop
            ? "max-w-md"
            : question.type === "shape_name_entry"
              ? "max-h-full max-w-3xl"
              : shapeQuestion
                ? "max-h-full max-w-2xl"
                : "max-h-full max-w-lg"
        )}
      >
        <div
          ref={cardRef}
          className={cn(
            "pointer-events-auto relative w-full rounded-xl border border-border bg-surface shadow-xl",
            isTop
              ? cn(
                  "bg-surface/95 backdrop-blur",
                  highlightMapPrompt ? "p-2.5" : "p-3"
                )
              : "max-h-full overflow-y-auto p-5"
          )}
        >
          {/* TEST-ONLY: current country's EMA mastery score */}
          {emaScore != null && (
            <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-pill bg-meta px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-text-muted">
              EMA {Number(emaScore).toFixed(2)}
            </div>
          )}
          <LearnQuestionRenderer
            question={question}
            onContinue={onContinue}
            awaitingContinue={awaitingContinue}
            {...rendererProps}
          />
          {showFooter && (
            <div className="mt-4 flex flex-col items-center gap-3 border-t border-border-subtle pt-4">
              {(awaitingRetry ? retryMessage : continueMessage) && (
                <p className="m-0 text-center text-sm font-semibold leading-snug text-text">
                  {awaitingRetry ? retryMessage : continueMessage}
                </p>
              )}
              {awaitingContinue && question.continueNote && (
                <p className="m-0 max-w-prose text-center text-sm leading-snug text-text-muted">
                  {question.continueNote}
                </p>
              )}
              {awaitingRetry ? (
                <button type="button" className={primaryBtn} onClick={onTryAgain} autoFocus>
                  Try again
                </button>
              ) : (
                <button type="button" className={primaryBtn} onClick={onContinue} autoFocus>
                  {continueLabel}
                </button>
              )}
            </div>
          )}
        </div>
        {showOutcomeFeedback && (
          <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2">
            <MapFeedback
              text={feedbackText}
              type={feedbackType}
              detail={feedbackDetail}
            />
          </div>
        )}
      </div>
    </div>
  );
}
