import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Owns the game stopwatch: elapsed time, the final time captured when a game
 * ends, and pause/resume accounting (so paused stretches don't count toward the
 * elapsed total).
 *
 * @param {boolean} running - Whether the 1s tick should update `elapsedMs`.
 */
export function useGameTimer(running) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalElapsedMs, setFinalElapsedMs] = useState(0);

  const startTimeRef = useRef(null);
  const pausedMsRef = useRef(0);
  const pauseStartedAtRef = useRef(null);

  const getElapsedMs = useCallback(() => {
    if (startTimeRef.current == null) return 0;
    let pausedMs = pausedMsRef.current;
    if (pauseStartedAtRef.current != null) {
      pausedMs += Date.now() - pauseStartedAtRef.current;
    }
    return Math.max(0, Date.now() - startTimeRef.current - pausedMs);
  }, []);

  const resetPause = useCallback(() => {
    pausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
  }, []);

  const pause = useCallback(() => {
    if (pauseStartedAtRef.current != null) return;
    pauseStartedAtRef.current = Date.now();
  }, []);

  const resume = useCallback(() => {
    if (pauseStartedAtRef.current == null) return;
    pausedMsRef.current += Date.now() - pauseStartedAtRef.current;
    pauseStartedAtRef.current = null;
  }, []);

  // Begin a fresh run from zero.
  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    pausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    setElapsedMs(0);
    setFinalElapsedMs(0);
  }, []);

  // Freeze the clock and remember the final time.
  const stop = useCallback(() => {
    const elapsed = getElapsedMs();
    setFinalElapsedMs(elapsed);
    setElapsedMs(elapsed);
    return elapsed;
  }, [getElapsedMs]);

  // Clear the clock entirely (e.g. returning to the menu).
  const reset = useCallback(() => {
    startTimeRef.current = null;
    setElapsedMs(0);
    setFinalElapsedMs(0);
  }, []);

  useEffect(() => {
    if (!running) return;

    const tick = () => setElapsedMs(getElapsedMs());
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [running, getElapsedMs]);

  return {
    elapsedMs,
    finalElapsedMs,
    getElapsedMs,
    resetPause,
    pause,
    resume,
    start,
    stop,
    reset,
  };
}
