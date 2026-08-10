const TOUR_COMPLETED_STORAGE_KEY = "geography-game-tour-completed";
const LEGACY_COMPLETED_TOURS_STORAGE_KEY = "geography-completed-game-tours";

function readLegacyCompletedTours() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(LEGACY_COMPLETED_TOURS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function migrateLegacyTourCompletion() {
  if (typeof window === "undefined") return false;
  if (readLegacyCompletedTours()) {
    try {
      window.localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, "1");
      window.localStorage.removeItem(LEGACY_COMPLETED_TOURS_STORAGE_KEY);
    } catch {
      // ignore quota / private mode
    }
    return true;
  }
  return false;
}

/** Local (per-browser) check — does not consult the server. */
export function hasCompletedGameTourLocally() {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(TOUR_COMPLETED_STORAGE_KEY) === "1") {
      return true;
    }
  } catch {
    return false;
  }
  return migrateLegacyTourCompletion();
}

export function markGameTourCompletedLocally() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, "1");
    window.localStorage.removeItem(LEGACY_COMPLETED_TOURS_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}
