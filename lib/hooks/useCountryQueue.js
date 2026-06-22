import { useCallback, useRef, useState } from "react";

/**
 * Manages the shuffled queue of countries for a game and which country is the
 * current target. The target is mirrored into a ref so handlers can read it
 * synchronously; the queue and its cursor live entirely in refs since they
 * never need to trigger a render.
 */
export function useCountryQueue() {
  const [targetCountry, setTargetCountry] = useState(null);

  const targetCountryRef = useRef(null);
  const queueRef = useRef([]);
  const indexRef = useRef(0);

  const setTarget = useCallback((country) => {
    targetCountryRef.current = country;
    setTargetCountry(country);
  }, []);

  // Load a new queue and rewind the cursor to the start.
  const loadQueue = useCallback((countries) => {
    queueRef.current = countries;
    indexRef.current = 0;
  }, []);

  // Advance to (and return) the next country in the queue.
  const advance = useCallback(() => {
    const next = queueRef.current[indexRef.current] ?? null;
    indexRef.current += 1;
    setTarget(next);
    return next;
  }, [setTarget]);

  const reset = useCallback(() => {
    queueRef.current = [];
    indexRef.current = 0;
    setTarget(null);
  }, [setTarget]);

  const remaining = useCallback(
    () => queueRef.current.length,
    []
  );

  return {
    targetCountry,
    targetCountryRef,
    queueRef,
    indexRef,
    setTarget,
    loadQueue,
    advance,
    reset,
    remaining,
  };
}
