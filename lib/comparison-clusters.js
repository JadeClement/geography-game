/**
 * Comparison clusters for the Learn mode question engine (Tier 3 comparative
 * questions: population/area "which is bigger" and neighbor-count comparisons).
 *
 * ── Audit notes (why this file exists / key decisions) ─────────────────────────
 * - Country data lives in `data/countries.json` (keyed by `iso3`). Relevant
 *   fields per country: name, capital, population, area (km²), landlocked,
 *   languages[], neighbors[] (iso3 codes), region, enabled, facts[].
 * - `area` and `landlocked` were NOT originally present; they were added
 *   additively via `scripts/enrich-country-geodata.js` (source: mledoze/countries,
 *   the same dataset generate-countries.js already uses). All 200 enabled
 *   countries have both fields. Without area, `areaPeers` / AREA_COMPARE cannot
 *   work, hence that prerequisite.
 * - Clusters are pre-computed ONCE at module load (static JSON input) and cached
 *   as module-level constants, per spec — never recomputed per question.
 * - Peers are always drawn from the SAME REGION as the target, so comparisons
 *   stay within a familiar geographic group (e.g. a European country is only
 *   compared against other European countries).
 * - Within that region, peers are chosen by RATIO, not absolute difference.
 *   "Which is bigger?" difficulty is driven by the larger/smaller ratio
 *   (scale-invariant), not the raw gap: a 1.05× pair is a coin flip, a 20× pair
 *   is obvious. We target a "distinguishable but fair" window [MIN_RATIO,
 *   MAX_RATIO] so pairs are neither near-identical (too hard) nor wildly
 *   lopsided (trivial).
 * - The comparative generator picks RANDOMLY among the in-band peers (see
 *   questionGenerator) so the same country yields varied opponents.
 * - Outliers with no in-band same-region peer fall back to the same-region
 *   countries whose ratio is closest to the band, so a question can always be
 *   generated as long as the region has another country with the metric.
 * - BLOCKED_PAIRS are filtered out of the peer lists entirely, so a blocked
 *   comparison can never surface even if two countries are population/area peers.
 */

import countriesManifest from "@/data/countries.json";

// "Distinguishable but fair" ratio window (larger value / smaller value). Tune
// here to make comparisons harder (narrower) or easier (wider).
const MIN_RATIO = 1.5;
const MAX_RATIO = 4;

// How many fallback peers to keep when NO country falls within the ratio band
// (extreme outliers). These are the closest-to-band countries by ratio distance.
const FALLBACK_PEER_COUNT = 4;

/**
 * Pairs of countries that must never be directly compared, for
 * political/sensitivity reasons. Order does not matter. Add pairs as needed.
 * @type {Array<[string, string]>}
 */
const BLOCKED_PAIRS = [
  // ['ISO3_A', 'ISO3_B'],
];

function blockedPairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const BLOCKED_PAIR_SET = new Set(
  BLOCKED_PAIRS.map(([a, b]) => blockedPairKey(a, b))
);

/**
 * @param {string} countryIdA
 * @param {string} countryIdB
 * @returns {boolean}
 */
export function isBlockedPair(countryIdA, countryIdB) {
  if (!countryIdA || !countryIdB) return false;
  return BLOCKED_PAIR_SET.has(blockedPairKey(countryIdA, countryIdB));
}

// Only enabled countries with a usable numeric value participate in a cluster.
const ENABLED_COUNTRIES = countriesManifest.countries.filter(
  (country) => country.enabled
);

// Larger / smaller ratio of two positive values (always >= 1).
function ratioOf(a, b) {
  return a >= b ? a / b : b / a;
}

// 0 when `ratio` is inside [MIN_RATIO, MAX_RATIO], otherwise how far outside it
// is (used only to order the outlier fallback).
function distanceToBand(ratio) {
  if (ratio < MIN_RATIO) return MIN_RATIO - ratio;
  if (ratio > MAX_RATIO) return ratio - MAX_RATIO;
  return 0;
}

/**
 * Builds, for every country that has a positive numeric `metric`, the list of
 * candidate opponent ids whose value forms a "distinguishable but fair" ratio
 * with the target (within [MIN_RATIO, MAX_RATIO]). Blocked pairs are excluded.
 *
 * The in-band list is returned in full (deterministically ordered by id) so the
 * generator can sample uniformly for variety. If a target has NO in-band peer
 * (an extreme outlier), the FALLBACK_PEER_COUNT countries closest to the band by
 * ratio distance are returned instead, so a question can always be generated.
 *
 * @param {(country: object) => number|null|undefined} getMetric
 * @returns {Map<string, string[]>}
 */
function buildClusters(getMetric) {
  const points = ENABLED_COUNTRIES.map((country) => ({
    id: country.iso3,
    region: country.region,
    value: getMetric(country),
  })).filter((point) => typeof point.value === "number" && point.value > 0);

  const clusters = new Map();

  for (const target of points) {
    const candidates = points
      .filter(
        (other) =>
          other.id !== target.id &&
          other.region === target.region &&
          !isBlockedPair(target.id, other.id)
      )
      .map((other) => ({ id: other.id, ratio: ratioOf(other.value, target.value) }));

    const inBand = candidates
      .filter((c) => c.ratio >= MIN_RATIO && c.ratio <= MAX_RATIO)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => c.id);

    if (inBand.length > 0) {
      clusters.set(target.id, inBand);
      continue;
    }

    // Outlier fallback: nearest-to-band by ratio distance (tie-break by id).
    const fallback = candidates
      .sort((a, b) => {
        const da = distanceToBand(a.ratio);
        const db = distanceToBand(b.ratio);
        if (da !== db) return da - db;
        return a.id.localeCompare(b.id);
      })
      .slice(0, FALLBACK_PEER_COUNT)
      .map((c) => c.id);

    clusters.set(target.id, fallback);
  }

  return clusters;
}

// Computed once, at module load, and reused for every question generation.
const POPULATION_CLUSTERS = buildClusters((country) => country.population);
const AREA_CLUSTERS = buildClusters((country) => country.area);

/**
 * @param {string} countryId
 * @returns {string[]} same-region opponent ids within the population ratio band
 *   (or the nearest-to-band same-region fallback for outliers)
 */
export function getPopulationPeers(countryId) {
  return POPULATION_CLUSTERS.get(countryId) ?? [];
}

/**
 * @param {string} countryId
 * @returns {string[]} same-region opponent ids within the land-area ratio band
 *   (or the nearest-to-band same-region fallback for outliers)
 */
export function getAreaPeers(countryId) {
  return AREA_CLUSTERS.get(countryId) ?? [];
}
