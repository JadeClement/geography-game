import { useCallback, useEffect, useRef, useState } from "react";
import { IDLE_PROMPT_MS, IDLE_RETURN_MS } from "@/lib/constants";
import { useSyncRef } from "@/lib/hooks/useSyncRef";

/**
 * Handles "are you still there?" idle detection during an active game.
 *
 * After {@link IDLE_PROMPT_MS} of no user activity the game timer is paused and
 * a prompt is opened; if the player keeps ignoring it for {@link IDLE_RETURN_MS}
 * they are sent back to the menu via `onIdleReturn`.
 *
 * @param {object}   params
 * @param {boolean}  params.active          - Game is running and not finished.
 * @param {boolean}  params.paused          - Game is manually paused.
 * @param {Function} params.pauseTimer      - Pause the game stopwatch.
 * @param {Function} params.resumeTimer     - Resume the game stopwatch.
 * @param {Function} params.resetTimerPause - Clear pause accounting.
 * @param {Function} params.onIdleReturn    - Called when the player times out.
 */
export function useIdleDetection({
  active,
  paused,
  pauseTimer,
  resumeTimer,
  resetTimerPause,
  onIdleReturn,
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const promptOpenRef = useRef(false);
  const promptTimeoutRef = useRef(null);
  const returnTimeoutRef = useRef(null);

  // Keep the latest callback without re-subscribing the activity listeners.
  const onIdleReturnRef = useSyncRef(onIdleReturn);

  const closePrompt = useCallback(() => {
    setPromptOpen(false);
    promptOpenRef.current = false;
  }, []);

  const clearIdleTimers = useCallback(() => {
    if (promptTimeoutRef.current) {
      clearTimeout(promptTimeoutRef.current);
      promptTimeoutRef.current = null;
    }
    if (returnTimeoutRef.current) {
      clearTimeout(returnTimeoutRef.current);
      returnTimeoutRef.current = null;
    }
  }, []);

  // Full teardown for starting/leaving a game.
  const resetIdleState = useCallback(() => {
    clearIdleTimers();
    closePrompt();
    resetTimerPause();
  }, [clearIdleTimers, closePrompt, resetTimerPause]);

  // The player came back: hide the prompt and resume the clock.
  const dismissIdlePrompt = useCallback(() => {
    if (returnTimeoutRef.current) {
      clearTimeout(returnTimeoutRef.current);
      returnTimeoutRef.current = null;
    }
    closePrompt();
    resumeTimer();
  }, [closePrompt, resumeTimer]);

  const scheduleIdlePrompt = useCallback(() => {
    clearIdleTimers();
    promptTimeoutRef.current = setTimeout(() => {
      pauseTimer();
      setPromptOpen(true);
      promptOpenRef.current = true;
      returnTimeoutRef.current = setTimeout(() => {
        closePrompt();
        onIdleReturnRef.current?.();
      }, IDLE_RETURN_MS);
    }, IDLE_PROMPT_MS);
  }, [clearIdleTimers, closePrompt, onIdleReturnRef, pauseTimer]);

  const handleIdleContinue = useCallback(() => {
    dismissIdlePrompt();
    scheduleIdlePrompt();
  }, [dismissIdlePrompt, scheduleIdlePrompt]);

  useEffect(() => {
    if (!active || paused) {
      clearIdleTimers();
      closePrompt();
      return;
    }

    const onActivity = () => {
      if (promptOpenRef.current) {
        dismissIdlePrompt();
      }
      scheduleIdlePrompt();
    };

    const events = ["pointerdown", "keydown", "touchstart"];
    for (const eventName of events) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    scheduleIdlePrompt();

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, onActivity);
      }
      clearIdleTimers();
    };
  }, [
    active,
    paused,
    clearIdleTimers,
    closePrompt,
    dismissIdlePrompt,
    scheduleIdlePrompt,
  ]);

  return {
    promptOpen,
    resetIdleState,
    dismissIdlePrompt,
    scheduleIdlePrompt,
    handleIdleContinue,
    clearIdleTimers,
    closePrompt,
  };
}
