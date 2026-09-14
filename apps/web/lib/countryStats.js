import { ROUND_OUTCOMES } from "@worldly/constants";
export { ROUND_OUTCOMES };

export async function recordCountryStat(event) {
  const response = await fetch("/api/country-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to save progress.");
  }

  return response.json();
}

export async function fetchMasteryStats({ mode }) {
  const params = new URLSearchParams({ mode });
  const response = await fetch(`/api/mastery?${params}`);

  if (response.status === 401) {
    return { mastery: [], unauthorized: true, totalSessions: 0 };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load mastery data.");
  }

  return data;
}

export async function completeSession() {
  const response = await fetch("/api/streak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (response.status === 401) {
    return { unauthorized: true, totalSessions: 0 };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to record session.");
  }

  return data;
}

const EMPTY_MASTERY_BY_MODE = {
  countries: [],
  capitals: [],
  flags: [],
  neighbors: [],
};

export async function fetchAllMasteryStats() {
  const response = await fetch("/api/mastery/all");

  if (response.status === 401) {
    return { mastery: EMPTY_MASTERY_BY_MODE, unauthorized: true };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load mastery data.");
  }

  return {
    mastery: {
      ...EMPTY_MASTERY_BY_MODE,
      ...data.mastery,
    },
    score: data.score,
    percent: data.percent,
    categories: data.categories,
    byDomain: data.byDomain,
  };
}

export async function fetchWeakCountryStats({ mode, level, region }) {
  const params = new URLSearchParams({ mode, level: String(level), region });
  const response = await fetch(`/api/country-stats?${params}`);

  if (response.status === 401) {
    return { weakCount: 0, stats: [], unauthorized: true };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load learning data.");
  }

  return data;
}

/** deprecated — superseded by per-country EMA tier selection. */
export async function fetchLearnChallenge({ mode, region }) {
  const params = new URLSearchParams({ mode, region });
  const response = await fetch(`/api/learn-challenge?${params}`);

  if (response.status === 401) {
    return {
      challenge: { workingTier: 4, momentum: 0, recentOutcomes: [] },
      unauthorized: true,
    };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Soft-fail: Learn can still run with default challenge.
    return {
      challenge: data.challenge ?? { workingTier: 4, momentum: 0, recentOutcomes: [] },
      error: data.error,
    };
  }

  return data;
}

/** deprecated — superseded by per-country EMA tier selection. */
export async function saveLearnChallenge(body) {
  const response = await fetch("/api/learn-challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to save learn challenge.");
  }
  return data;
}
