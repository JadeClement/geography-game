"use client";

import { cn } from "@/lib/cn";
import { primaryBtn } from "@/lib/ui";
import { isNeighborLearnQuestion, isShapeLearnQuestion } from "@/lib/learn/wrongReveal";
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
 *   map itself for those non-map Learn questions). Highlight prompts use the
 *   top layout so pan/zoom still reach the map.
 *
 * After a wrong answer the host can pass `awaitingContinue` + `onContinue` so
 * the learner reviews feedback before advancing. Map-focused wrongs (highlight /
 * borders) may hide this card and show only bottom Continue chrome instead.
 *
 * Map-click soft misses use `awaitingRetry` + `onTryAgain` instead — show which
 * country was clicked and let the learner try again without scoring yet.
 *
 * Outcome toasts and the Continue bar hang under the question card so they
 * never shift the centered prompt.
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
  const heavierMapBlur =
    question.type === "landlocked_check" || isNeighborLearnQuestion(question);
  const shapeQuestion = isShapeLearnQuestion(question);
  const highlightMapPrompt = question.mapConfig?.display === "highlight";
  // Shape cards already mark correct/wrong in-place (check / X), so skip the
  // bottom Correct/Incorrect pill that would duplicate that feedback.
  const showOutcomeFeedback = Boolean(feedbackText) && !shapeQuestion;
  // Text-entry: Continue replaces Submit in-form (arrow on highlight prompts,
  // full-width button on centered cards). Correct answers auto-advance unless
  // a teaching note sets awaitingContinue.
  const inlineContinue = question.answerType === "text_entry";
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
          : heavierMapBlur
            ? "pointer-events-auto items-center justify-center bg-surface/60 py-4 backdrop-blur-[16px]"
            : "pointer-events-auto items-center justify-center bg-surface/20 py-4 backdrop-blur-[2px]"
      )}
    >
      <div
        className={cn(
          "relative flex w-full flex-col items-center",
          isTop
            ? "max-w-md"
            : "max-h-full max-w-lg"
        )}
      >
        <div
          ref={cardRef}
          className={cn(
            "pointer-events-auto relative w-full border border-border bg-surface shadow-xl",
            showFooter ? "rounded-t-xl border-b-0" : "rounded-xl",
            isTop
              ? cn(
                  "bg-surface/95 backdrop-blur",
                  highlightMapPrompt ? "p-2.5" : "p-3"
                )
              : showFooter
                ? "max-h-full overflow-y-auto px-5 pt-5 pb-4"
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
        </div>
        {(showFooter || showOutcomeFeedback) && (
          <div className="absolute left-0 right-0 top-full z-10 flex flex-col items-center">
            {showFooter && (
              <div
                className={cn(
                  "pointer-events-auto w-full rounded-b-xl border-x border-b border-border bg-surface shadow-xl",
                  isTop
                    ? cn(
                        "bg-surface/95 backdrop-blur",
                        highlightMapPrompt ? "px-2.5 pb-2.5" : "px-3 pb-3"
                      )
                    : "px-5 pb-5"
                )}
              >
                <div className="flex flex-col items-center gap-3 border-t border-border-subtle pt-4">
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
              </div>
            )}
            {showOutcomeFeedback && (
              <div className="pointer-events-none mt-2">
                <MapFeedback
                  text={feedbackText}
                  type={feedbackType}
                  detail={feedbackDetail}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
