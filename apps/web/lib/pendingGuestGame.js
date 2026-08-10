import { recordCountryStat } from "@/lib/countryStats";
import { saveScore } from "@/lib/scores";

const STORAGE_KEY = "worldly:pendingGuestGame";

let syncPromise = null;
const roundListeners = new Set();

function readPending() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePending(data) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors — sync can still proceed in-memory for this tab.
  }
}

export function getPendingGuestGame() {
  const data = readPending();
  if (!data) return null;
  return {
    rounds: Array.isArray(data.rounds) ? data.rounds : [],
    score: data.score ?? null,
  };
}

export function clearPendingGuestGame() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function appendGuestRound(round) {
  const current = getPendingGuestGame() ?? { rounds: [], score: null };
  current.rounds.push(round);
  writePending(current);
}

export function setPendingGuestScore(score) {
  const current = getPendingGuestGame() ?? { rounds: [], score: null };
  current.score = score;
  writePending(current);
}

/**
 * Replay guest-round outcomes and save the finished-game score after sign-in.
 * @param {{ onRoundRecorded?: (stat: object) => void }} [options]
 */
export async function syncPendingGuestGame({ onRoundRecorded } = {}) {
  if (onRoundRecorded) {
    roundListeners.add(onRoundRecorded);
  }

  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    const pending = getPendingGuestGame();
    if (!pending) {
      return { synced: false, saveResult: null };
    }

    const hasRounds = pending.rounds.length > 0;
    const hasScore = pending.score != null;
    if (!hasRounds && !hasScore) {
      clearPendingGuestGame();
      return { synced: false, saveResult: null };
    }

    for (const round of pending.rounds) {
      const response = await recordCountryStat(round);
      if (response?.stat) {
        for (const listener of roundListeners) {
          listener(response.stat);
        }
      }
    }

    let saveResult = null;
    if (hasScore) {
      saveResult = await saveScore(pending.score);
    }

    clearPendingGuestGame();
    return { synced: true, saveResult };
  })();

  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
    roundListeners.clear();
  }
}
