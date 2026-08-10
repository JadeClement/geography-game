import { useRef } from "react";

/**
 * Returns a ref whose `.current` always equals the latest `value`.
 *
 * This makes the common "mirror a piece of state into a ref" pattern explicit:
 * event handlers, timeouts, and other callbacks can read the up-to-date value
 * synchronously without re-subscribing, while the component still re-renders
 * from the underlying state.
 */
export function useSyncRef(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
