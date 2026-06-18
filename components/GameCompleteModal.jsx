"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AuthModal from "@/components/AuthModal";
import { DEFAULT_LEVEL, saveScore } from "@/lib/scores";

export default function GameCompleteModal({
  open,
  score,
  rightCount,
  wrongCount,
  mode,
  region,
  modeLabel,
  regionLabel,
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
    if (!open || !signedIn) return;

    let cancelled = false;

    async function attemptSave() {
      setSaveState({ loading: true, result: null, error: null });
      try {
        const result = await saveScore({
          mode,
          region,
          score,
          level: DEFAULT_LEVEL,
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
  }, [open, signedIn, mode, region, score]);

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
      level: DEFAULT_LEVEL,
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
        : `New personal best! Previous best: ${saveState.result.previousBest}`;
    }
    if (saveState.result && !saveState.result.isPersonalBest) {
      return `Your best for this game is still ${saveState.result.previousBest}.`;
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
            Congrats!
          </h2>
          <p className="modal-score">You scored {score}</p>
          <p className="modal-subtitle">
            {rightCount} correct · {wrongCount} needed help · {modeLabel} · {regionLabel}
          </p>

          {message && (
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
            <button type="button" className="secondary-btn" onClick={onPlayAgain}>
              Play again
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
