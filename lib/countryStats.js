export const ROUND_OUTCOMES = {
  FIRST_TRY_CORRECT: "first_try_correct",
  SECOND_TRY_CORRECT: "second_try_correct",
  NEEDED_REVEAL: "needed_reveal",
};

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
    return { mastery: [], unauthorized: true };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load mastery data.");
  }

  return data;
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
