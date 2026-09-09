/**
 * Religion pie-chart Learn questions: slice building, boundary drags, scoring.
 *
 * Slices are largest-first, renormalized to 100%. Tiny groups (< MIN_SHARE) are
 * dropped so the pie stays readable. Scoring allows a few percentage points of
 * drag error on each slice.
 */

export const RELIGION_PIE_MIN_SLICES = 2;
export const RELIGION_PIE_MAX_SLICES = 4;
export const RELIGION_PIE_MIN_SHARE = 8;
export const RELIGION_PIE_MIN_SLICE = 1;
export const RELIGION_PIE_TOLERANCE = 8;

function parseReligionEntries(country) {
  if (!Array.isArray(country?.religions)) return [];
  return country.religions
    .map((entry) => {
      if (typeof entry === "string") return { name: entry, percent: null };
      const name = typeof entry?.name === "string" ? entry.name.trim() : "";
      const percent = Number(entry?.percent);
      if (!name) return null;
      return { name, percent: Number.isFinite(percent) ? percent : null };
    })
    .filter(Boolean);
}

/** Round values to 1 decimal so they still sum to 100 (largest remainder). */
export function roundPercentsTo100(values) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const tenths = values.map((value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n * 10 : 0;
  });
  const total = tenths.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  const scaled = tenths.map((value) => (value / total) * 1000);
  const floors = scaled.map((value) => Math.floor(value));
  let remain = 1000 - floors.reduce((sum, value) => sum + value, 0);
  const order = scaled
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (remain <= 0) break;
    floors[index] += 1;
    remain -= 1;
  }
  return floors.map((value) => value / 10);
}

/**
 * Build labeled pie slices for a country, or null when a pie would be
 * uninteresting (one dominant religion, missing percents, …).
 *
 * @returns {Array<{ name: string, percent: number }>|null}
 */
export function buildReligionPieSlices(country) {
  const entries = parseReligionEntries(country).filter(
    (entry) => entry.percent != null && entry.percent >= RELIGION_PIE_MIN_SHARE
  );
  if (entries.length < RELIGION_PIE_MIN_SLICES) return null;

  const slices = entries.slice(0, RELIGION_PIE_MAX_SLICES);
  const total = slices.reduce((sum, entry) => sum + entry.percent, 0);
  if (total < 50) return null;

  const rounded = roundPercentsTo100(
    slices.map((entry) => (entry.percent / total) * 100)
  );
  return slices.map((entry, index) => ({
    name: entry.name,
    percent: rounded[index],
  }));
}

/** Starting sizes — deliberately not 50/50 so a true split still needs a drag. */
export function startingPiePercents(count) {
  if (count === 2) return [25, 75];
  if (count === 3) return [20, 50, 30];
  if (count === 4) return [15, 35, 30, 20];
  return roundPercentsTo100(Array.from({ length: count }, () => 100 / count));
}

/** Prefer a start that would not already score as correct. */
export function startingPercentsForSlices(slices) {
  const count = slices?.length ?? 0;
  const candidates = [
    startingPiePercents(count),
    count === 2 ? [15, 85] : count === 3 ? [12, 58, 30] : [10, 40, 30, 20],
  ];
  for (const percents of candidates) {
    if (percents.length !== count) continue;
    const guessed = slices.map((slice, index) => ({
      name: slice.name,
      percent: percents[index],
    }));
    if (!scoreReligionPie(guessed, slices)) return percents;
  }
  return candidates[0] ?? [];
}

export function pieCumulative(percents) {
  const ends = [];
  let sum = 0;
  for (const percent of percents) {
    sum += percent;
    ends.push(sum);
  }
  return ends;
}

/**
 * Drag the boundary after slice `boundaryIndex` (0 … n-2). Slice 0 stays
 * pinned at 12 o'clock; the last slice absorbs whatever remains to 100.
 *
 * @param {number[]} percents
 * @param {number} boundaryIndex
 * @param {number} nextCumulative
 * @returns {number[]}
 */
export function movePieBoundary(percents, boundaryIndex, nextCumulative) {
  const n = percents.length;
  if (n < 2 || boundaryIndex < 0 || boundaryIndex > n - 2) {
    return percents;
  }

  const pair = percents[boundaryIndex] + percents[boundaryIndex + 1];
  const prev = percents.slice(0, boundaryIndex).reduce((sum, value) => sum + value, 0);
  const min = RELIGION_PIE_MIN_SLICE;
  const clamped = Math.min(prev + pair - min, Math.max(prev + min, nextCumulative));
  const first = Math.round((clamped - prev) * 10) / 10;
  const next = [...percents];
  next[boundaryIndex] = first;
  next[boundaryIndex + 1] = Math.round((pair - first) * 10) / 10;
  return next;
}

export function nudgePieSlice(percents, index, delta) {
  const n = percents.length;
  if (!n || index < 0 || index >= n || delta === 0) return percents;
  const ends = pieCumulative(percents);
  if (index < n - 1) {
    return movePieBoundary(percents, index, ends[index] + delta);
  }
  return movePieBoundary(percents, n - 2, ends[n - 2] - delta);
}

export function scoreReligionPie(
  guessed,
  correct,
  { tolerance = RELIGION_PIE_TOLERANCE } = {}
) {
  if (!Array.isArray(guessed) || !Array.isArray(correct)) return false;
  if (guessed.length !== correct.length || correct.length === 0) return false;
  const byName = new Map(
    correct.map((slice) => [slice.name, Number(slice.percent)])
  );
  for (const slice of guessed) {
    const target = byName.get(slice.name);
    const percent = Number(slice.percent);
    if (!Number.isFinite(target) || !Number.isFinite(percent)) return false;
    if (Math.abs(percent - target) > tolerance) return false;
  }
  return true;
}
