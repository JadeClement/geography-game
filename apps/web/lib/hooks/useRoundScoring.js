import { useCallback, useRef, useState } from "react";

/**
 * Tracks per-game scoring: the right/wrong counts (mirrored into refs for
 * synchronous reads in event handlers and timeouts), whether the current round
 * has already been counted wrong, and the set of countries the player missed
 * (used to offer a "review incorrect" session afterwards).
 */
export function useRoundScoring() {
  const [rightCount, setRightCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

  const rightCountRef = useRef(0);
  const wrongCountRef = useRef(0);
  const roundMarkedIncorrectRef = useRef(false);
  const incorrectTargetsRef = useRef([]);

  // Clear all scoring for a brand-new game.
  const reset = useCallback(() => {
    rightCountRef.current = 0;
    wrongCountRef.current = 0;
    incorrectTargetsRef.current = [];
    setRightCount(0);
    setWrongCount(0);
  }, []);

  // Mark the start of a round so it can be scored at most once.
  const beginRound = useCallback(() => {
    roundMarkedIncorrectRef.current = false;
  }, []);

  const markRoundCorrect = useCallback(() => {
    if (roundMarkedIncorrectRef.current) return;
    rightCountRef.current += 1;
    setRightCount(rightCountRef.current);
  }, []);

  const markRoundIncorrect = useCallback((target) => {
    if (roundMarkedIncorrectRef.current) return;
    roundMarkedIncorrectRef.current = true;
    wrongCountRef.current += 1;
    setWrongCount(wrongCountRef.current);

    if (
      target &&
      !incorrectTargetsRef.current.some((country) => country.id === target.id)
    ) {
      incorrectTargetsRef.current = [...incorrectTargetsRef.current, target];
    }
  }, []);

  return {
    rightCount,
    wrongCount,
    rightCountRef,
    wrongCountRef,
    roundMarkedIncorrectRef,
    incorrectTargetsRef,
    reset,
    beginRound,
    markRoundCorrect,
    markRoundIncorrect,
  };
}
