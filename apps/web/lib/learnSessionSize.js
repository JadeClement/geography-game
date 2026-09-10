import {
  DEFAULT_LEARN_SESSION_SIZE,
  MAX_LEARN_SESSION_SIZE,
  MIN_LEARN_SESSION_SIZE,
} from "@worldly/constants";

export const LEARN_SESSION_SIZE_STORAGE_KEY = "worldly:learnSessionSize";
const LEARN_SESSION_SIZE_EVENT = "geography:learn-session-size-change";

export {
  DEFAULT_LEARN_SESSION_SIZE,
  MAX_LEARN_SESSION_SIZE,
  MIN_LEARN_SESSION_SIZE,
};

export function clampLearnSessionSize(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_LEARN_SESSION_SIZE;
  return Math.min(MAX_LEARN_SESSION_SIZE, Math.max(MIN_LEARN_SESSION_SIZE, n));
}

export function getLearnSessionSize() {
  if (typeof window === "undefined") return DEFAULT_LEARN_SESSION_SIZE;
  try {
    const raw = window.localStorage.getItem(LEARN_SESSION_SIZE_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_LEARN_SESSION_SIZE;
    return clampLearnSessionSize(raw);
  } catch {
    return DEFAULT_LEARN_SESSION_SIZE;
  }
}

export function setLearnSessionSize(size) {
  if (typeof window === "undefined") return DEFAULT_LEARN_SESSION_SIZE;
  const next = clampLearnSessionSize(size);
  try {
    window.localStorage.setItem(LEARN_SESSION_SIZE_STORAGE_KEY, String(next));
    window.dispatchEvent(new Event(LEARN_SESSION_SIZE_EVENT));
  } catch {
    // ignore quota / private mode
  }
  return next;
}

export function subscribeLearnSessionSize(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LEARN_SESSION_SIZE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(LEARN_SESSION_SIZE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function formatLearnSessionSizeLabel(size = getLearnSessionSize()) {
  const count = clampLearnSessionSize(size);
  return `Up to ${count} questions from this region.`;
}
