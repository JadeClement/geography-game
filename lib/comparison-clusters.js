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
 * - Peers are the N countries with the closest population / land area. The goal
 *   is comparisons that are genuinely uncertain (close values) rather than
 *   obviously one-sided, so the comparative generator draws an opponent from
 *   these peer pools.
 * - BLOCKED_PAIRS are filtered out of the peer lists entirely, so a blocked
 *   comparison can never surface even if two countries are population/area peers.
 */

import countriesManifest from "@/data/countries.json";

const PEER_COUNT = 8;

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

/**
 * Builds, for every country that has a numeric `metric`, the ordered list of up
 * to PEER_COUNT other country ids with the closest metric value (by absolute
 * difference). Blocked pairs are excluded. Ties break by smaller value then id
 * so the output is deterministic.
 *
 * @param {(country: object) => number|null|undefined} getMetric
 * @returns {Map<string, string[]>}
 */
function buildClusters(getMetric) {
  const points = ENABLED_COUNTRIES.map((country) => ({
    id: country.iso3,
    value: getMetric(country),
  })).filter((point) => typeof point.value === "number" && point.value >= 0);

  const clusters = new Map();

  for (const target of points) {
    const peers = points
      .filter((other) => other.id !== target.id && !isBlockedPair(target.id, other.id))
      .map((other) => ({
        id: other.id,
        distance: Math.abs(other.value - target.value),
        value: other.value,
      }))
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        if (a.value !== b.value) return a.value - b.value;
        return a.id.localeCompare(b.id);
      })
      .slice(0, PEER_COUNT)
      .map((peer) => peer.id);

    clusters.set(target.id, peers);
  }

  return clusters;
}

// Computed once, at module load, and reused for every question generation.
const POPULATION_CLUSTERS = buildClusters((country) => country.population);
const AREA_CLUSTERS = buildClusters((country) => country.area);

/**
 * @param {string} countryId
 * @returns {string[]} up to 8 country ids with the closest population
 */
export function getPopulationPeers(countryId) {
  return POPULATION_CLUSTERS.get(countryId) ?? [];
}

/**
 * @param {string} countryId
 * @returns {string[]} up to 8 country ids with the closest land area
 */
export function getAreaPeers(countryId) {
  return AREA_CLUSTERS.get(countryId) ?? [];
}
