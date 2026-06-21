export const DEFAULT_LEVEL = "F1";
export const LEVELS = ["F1", "F2", "N1", "N2"];

export async function saveScore({ mode, region, score, level = DEFAULT_LEVEL }) {
  const response = await fetch("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, region, score, level }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to save score.");
  }

  return response.json();
}

export async function fetchScores() {
  const response = await fetch("/api/scores");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load scores.");
  }
  return data.scores ?? [];
}
