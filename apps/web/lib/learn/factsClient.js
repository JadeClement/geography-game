/**
 * Client helpers for the Learn-mode seen-fact tracking (Step 7). Thin wrappers
 * around /api/learn-facts. Both fail soft: the fact modal should still work for
 * signed-out users or when the DB isn't reachable.
 */

/** Fetch seen fact indices for a set of countries. Returns { [countryId]: number[] }. */
export async function fetchSeenFacts(countryIds = []) {
  try {
    const params = countryIds.length
      ? `?countryIds=${encodeURIComponent(countryIds.join(","))}`
      : "";
    const response = await fetch(`/api/learn-facts${params}`);
    if (!response.ok) return {};
    const data = await response.json().catch(() => ({}));
    return data.seen ?? {};
  } catch {
    return {};
  }
}

/** Mark a real fact (index >= 0) as seen. Synthetic facts (index null) are skipped. */
export async function markFactSeen(countryId, factIndex) {
  if (factIndex == null || factIndex < 0) return;
  try {
    await fetch("/api/learn-facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryId, factIndex }),
    });
  } catch {
    // best-effort; ignore
  }
}
