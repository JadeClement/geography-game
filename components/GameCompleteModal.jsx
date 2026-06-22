"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import AuthModal from "@/components/AuthModal";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import { detectMilestone } from "@/lib/milestones";
import { formatGameScore } from "@/lib/regions";
import { saveScore } from "@/lib/scores";
import { formatElapsedTime } from "@/lib/time";
import { cn } from "@/lib/cn";
import {
  gameCompleteStats,
  gameTimer,
  gameTimerModal,
  modalActions,
  modalCard,
  modalGameContext,
  modalMessage,
  modalOverlay,
  modalScore,
  modalTitle,
  primaryBtn,
  secondaryBtn,
} from "@/lib/ui";

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
  milestoneStats,
  canReviewIncorrect = false,
  onReviewIncorrect,
  onPlayAgain,
  onBackToMenu,
}) {
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [saveState, setSaveState] = useState({ loading: false, result: null, error: null });
  const [pendingSave, setPendingSave] = useState(null);
  const [streakMessage, setStreakMessage] = useState(null);
  const [milestone, setMilestone] = useState(null);
  const milestoneResolvedRef = useRef(false);

  const signedIn = status === "authenticated" && session?.user;

  useEffect(() => {
    if (!open) {
      setSaveState({ loading: false, result: null, error: null });
      setPendingSave(null);
      setStreakMessage(null);
      setMilestone(null);
      milestoneResolvedRef.current = false;
    }
  }, [open]);

  // Detect a milestone once both the score save and the mastery snapshot have
  // settled, so the priority ordering uses complete data.
  useEffect(() => {
    if (!open || milestoneResolvedRef.current) return;

    const saveSettled =
      !signedIn ||
      isReview ||
      isLearning ||
      saveState.result != null ||
      saveState.error != null;
    const masterySettled = milestoneStats !== undefined;
    if (!saveSettled || !masterySettled) return;

    const perfectGame =
      !isReview && !isLearning && total > 0 && rightCount === total && wrongCount === 0;

    milestoneResolvedRef.current = true;
    setMilestone(
      detectMilestone({
        saveResult: saveState.result,
        perfectGame,
        milestoneStats,
        regionLabel,
        modeLabel,
      })
    );
  }, [
    open,
    signedIn,
    isReview,
    isLearning,
    saveState.result,
    saveState.error,
    milestoneStats,
    total,
    rightCount,
    wrongCount,
    regionLabel,
    modeLabel,
  ]);

  useEffect(() => {
    if (!open || !signedIn) return;

    let cancelled = false;

    // The practice session for today was already recorded server-side while
    // playing, so this reflects the post-game ("after") streak. Compare it with
    // the last value we showed to detect when the streak just incremented.
    fetch("/api/streak")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const current = data.currentStreak || 0;
        if (current <= 0) return;

        let previous = null;
        try {
          const stored = window.localStorage.getItem("worldly:lastStreakSeen");
          previous = stored == null ? null : Number(stored);
        } catch {
          previous = null;
        }

        if (previous == null || current > previous) {
          setStreakMessage(`🔥 ${current} day streak!`);
        }

        try {
          window.localStorage.setItem("worldly:lastStreakSeen", String(current));
        } catch {
          // Ignore storage errors — the message is a non-critical nicety.
        }
      })
      .catch(() => {
        // Network error — just don't show the streak message.
      });

    return () => {
      cancelled = true;
    };
  }, [open, signedIn]);

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

  function getCompletionHeading() {
    if (isLearning) return "Learning complete!";
    if (isReview) return "Review complete!";
    const pct = total > 0 ? rightCount / total : 0;
    if (pct === 1) return "Perfect!";
    if (pct >= 0.8) return "Nice work!";
    if (pct >= 0.5) return "Keep it up!";
    return "Keep practicing";
  }

  return (
    <>
      <div className={modalOverlay}>
        <div
          className={modalCard}
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-complete-title"
        >
          <h2 id="game-complete-title" className={modalTitle}>
            {getCompletionHeading()}
          </h2>
          <p className={modalScore}>
            You scored {rightCount}/{total}
          </p>
          <p className={modalGameContext}>
            {isLearning ? "Learning · " : isReview ? "Review · " : ""}
            {modeLabel} of {regionLabel} · {levelLabel}
          </p>
          <div className={gameCompleteStats}>
            <span className={cn(gameTimer, gameTimerModal)}>
              🕐 {formatElapsedTime(totalElapsedMs)}
            </span>
          </div>

          {message && !isReview && !isLearning && (
            <p
              className={modalMessage({
                success: saveState.result?.isPersonalBest,
                error: Boolean(saveState.error),
              })}
            >
              {message}
            </p>
          )}

          {streakMessage && (
            <p className={modalMessage({ className: "text-center font-semibold" })}>
              {streakMessage}
            </p>
          )}

          <div className={modalActions}>
            {!signedIn && (
              <button
                type="button"
                className={primaryBtn}
                onClick={() => setAuthOpen(true)}
              >
                Sign in / Create account
              </button>
            )}
            {signedIn && (
              <Link href="/results" className={secondaryBtn}>
                View results
              </Link>
            )}
            {canReviewIncorrect && (
              <button
                type="button"
                className={primaryBtn}
                onClick={onReviewIncorrect}
              >
                Review incorrect answers ({wrongCount})
              </button>
            )}
            <button type="button" className={secondaryBtn} onClick={onPlayAgain}>
              {isLearning ? "Practice again" : "Play again"}
            </button>
            <button type="button" className={secondaryBtn} onClick={onBackToMenu}>
              Back to menu
            </button>
          </div>
        </div>
      </div>

      <CelebrationOverlay
        milestone={milestone}
        onDismiss={() => setMilestone(null)}
      />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
