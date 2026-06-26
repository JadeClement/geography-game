const COMPLETED_TOURS_STORAGE_KEY = "geography-completed-game-tours";

function readCompletedTours() {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COMPLETED_TOURS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeCompletedTours(tours) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COMPLETED_TOURS_STORAGE_KEY,
      JSON.stringify([...tours])
    );
  } catch {
    // ignore quota / private mode
  }
}

export function hasCompletedGameTour(tourId) {
  if (!tourId) return true;
  return readCompletedTours().has(tourId);
}

export function markGameTourCompleted(tourId) {
  if (!tourId) return;
  const tours = readCompletedTours();
  tours.add(tourId);
  writeCompletedTours(tours);
}
