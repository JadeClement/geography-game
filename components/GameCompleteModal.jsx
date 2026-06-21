"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AuthModal from "@/components/AuthModal";
import { formatGameScore } from "@/lib/regions";
import { saveScore } from "@/lib/scores";
import { formatElapsedTime } from "@/lib/time";

export default function GameCompleteModal({
  open,
  score,
  rightCount,
  wrongCount,
  total,
  mode,
  region,
  level,
  modeLabel,
  regionLabel,
  levelLabel,
  totalElapsedMs = 0,
  isReview = false,
  isLearning = false,
  canReviewIncorrect = false,
  onReviewIncorrect,
  onPlayAgain,
  onBackToMenu,
}) {
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [saveState, setSaveState] = useState({ loading: false, result: null, error: null });
  const [pendingSave, setPendingSave] = useState(null);

  const signedIn = status === "authenticated" && session?.user;

  useEffect(() => {
    if (!open) {
      setSaveState({ loading: false, result: null, error: null });
      setPendingSave(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !signedIn || isReview || isLearning) return;

    let cancelled = false;

    async function attemptSave() {
      setSaveState({ loading: true, result: null, error: null });
      try {
        const result = await saveScore({
          mode,
          region,
          score,
          level,
        });
        if (!cancelled) {
          setSaveState({ loading: false, result, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setSaveState({
            loading: false,
            result: null,
            error: error.message || "Could not save score.",
          });
        }
      }
    }

    attemptSave();
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, isReview, isLearning, mode, region, score, level]);

  useEffect(() => {
    if (!open || !signedIn || !pendingSave) return;

    let cancelled = false;

    async function savePending() {
      setSaveState({ loading: true, result: null, error: null });
      try {
        const result = await saveScore(pendingSave);
        if (!cancelled) {
          setSaveState({ loading: false, result, error: null });
          setPendingSave(null);
          onBackToMenu();
        }
      } catch (error) {
        if (!cancelled) {
          setSaveState({
            loading: false,
            result: null,
            error: error.message || "Could not save score.",
          });
        }
      }
    }

    savePending();
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, pendingSave, onBackToMenu]);

  if (!open) return null;

  const handleAuthSuccess = () => {
    setPendingSave({
      mode,
      region,
      score,
      level,
    });
    setAuthOpen(false);
  };

  const saveMessage = () => {
    if (!signedIn) {
      return "Sign in or create an account to save your score and track progress.";
    }
    if (saveState.loading) {
      return "Saving your score…";
    }
    if (saveState.error) {
      return saveState.error;
    }
    if (saveState.result?.isPersonalBest) {
      return saveState.result.previousBest == null
        ? "Score saved — your first result for this game!"
        : `New personal best! Previous best: ${formatGameScore(saveState.result.previousBest, region)}`;
    }
    if (saveState.result && !saveState.result.isPersonalBest) {
      return `Your best for this game is still ${formatGameScore(saveState.result.previousBest, region)}.`;
    }
    return null;
  };

  const message = saveMessage();

  return (
    <>
      <div className="modal-overlay">
        <div
          className="modal-card game-complete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-complete-title"
        >
          <h2 id="game-complete-title" className="modal-title">
            {isLearning ? "Learning complete!" : isReview ? "Review complete!" : "Congrats!"}
          </h2>
          <p className="modal-score">
            You scored {rightCount}/{total}
          </p>
          <p className="modal-game-context">
            {isLearning ? "Learning · " : isReview ? "Review · " : ""}
            {modeLabel} of {regionLabel} · {levelLabel}
          </p>
          <div className="game-complete-stats">
            <span className="score-correct">
              correct: {rightCount}/{total}
            </span>
            <span className="score-incorrect">
              incorrect: {wrongCount}/{total}
            </span>
            <span className="game-timer game-timer--modal">
              time: {formatElapsedTime(totalElapsedMs)}
            </span>
          </div>

          {message && !isReview && !isLearning && (
            <p
              className={`modal-message ${
                saveState.result?.isPersonalBest
                  ? "success"
                  : saveState.error
                    ? "error"
                    : ""
              }`}
            >
              {message}
            </p>
          )}

          <div className="modal-actions">
            {!signedIn && (
              <button
                type="button"
                className="primary-btn"
                onClick={() => setAuthOpen(true)}
              >
                Sign in / Create account
              </button>
            )}
            {signedIn && (
              <Link href="/results" className="secondary-btn">
                View results
              </Link>
            )}
            {canReviewIncorrect && (
              <button
                type="button"
                className="primary-btn"
                onClick={onReviewIncorrect}
              >
                Review incorrect answers ({wrongCount})
              </button>
            )}
            <button type="button" className="secondary-btn" onClick={onPlayAgain}>
              {isLearning ? "Practice again" : "Play again"}
            </button>
            <button type="button" className="secondary-btn" onClick={onBackToMenu}>
              Back to menu
            </button>
          </div>
        </div>
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
