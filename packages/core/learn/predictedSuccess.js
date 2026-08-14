/**
 * predictedSuccess — heuristic estimate of how likely the learner is to get a
 * specific Learn question right (aka P(correct)). Used to keep sessions in the
 * flow zone and skip trivially easy association questions.
 */

import countriesManifest from "@worldly/constants/data/countries.json";
import {
  LEARN_PREDICTED_SUCCESS,
  LEARN_CHALLENGE,
  QUESTION_TIERS,
} from "@worldly/constants";
import { tierNumberFromString } from "./challengeLevel.js";

const MIN_COMPARE_RATIO = 1.5;
const MAX_COMPARE_RATIO = 4;

/** Very famous countries get a small association-question ease boost. */
const HOUSEHOLD_NAMES = new Set([
  "USA",
  "RUS",
  "CHN",
  "IND",
  "BRA",
  "GBR",
  "FRA",
  "DEU",
  "ITA",
  "ESP",
  "JPN",
  "AUS",
  "CAN",
  "MEX",
  "EGY",
  "ZAF",
  "TUR",
  "SAU",
  "KOR",
  "ARG",
]);

/** Coastal powers where "landlocked?" is nearly trivial. */
const OBVIOUS_COASTAL = new Set([
  "RUS",
  "USA",
  "CHN",
  "BRA",
  "AUS",
  "IND",
  "CAN",
  "MEX",
  "FRA",
  "GBR",
  "ITA",
  "ESP",
  "JPN",
  "ARG",
  "ZAF",
  "EGY",
  "TUR",
  "IDN",
  "THA",
  "PHL",
  "NOR",
  "SWE",
  "GRC",
  "PRT",
  "NLD",
  "BEL",
  "DNK",
  "IRL",
  "NZL",
  "CHL",
  "PER",
  "COL",
  "VEN",
  "MAR",
  "NGA",
  "KEN",
  "TZA",
  "GHA",
  "SEN",
  "AGO",
  "MOZ",
  "MDG",
  "LKA",
  "BGD",
  "MMR",
  "VNM",
  "MYS",
  "KOR",
  "PRK",
  "UKR",
  "POL",
  "ROU",
  "HRV",
  "FIN",
  "EST",
  "LVA",
  "LTU",
  "ISL",
  "CUB",
  "JAM",
  "PAN",
  "CRI",
  "URY",
  "ECU",
]);

/** Mid-size / less-famous landlocked-or-coastal ambiguity — harder yes/no. */
const AMBIGUOUS_LANDLOCKED = new Set([
  "SRB",
  "BIH",
  "MKD",
  "XKX",
  "MDA",
  "BLR",
  "SVK",
  "HUN",
  "AUT",
  "CZE",
  "CHE",
  "LUX",
  "AND",
  "LIE",
  "SMR",
  "VAT",
  "ARM",
  "AZE",
  "GEO",
  "KGZ",
  "TJK",
  "UZB",
  "TKM",
  "AFG",
  "NPL",
  "BTN",
  "LAO",
  "MNG",
  "MWI",
  "ZMB",
  "ZWE",
  "BWA",
  "LSO",
  "SWZ",
  "RWA",
  "BDI",
  "UGA",
  "SSD",
  "CAF",
  "TCD",
  "NER",
  "MLI",
  "BFA",
  "ETH",
  "PRY",
  "BOL",
]);

// Precompute log-population ranks within each region (0 = least famous … 1 = most).
const FAME_BY_ID = (() => {
  const byRegion = new Map();
  for (const country of countriesManifest.countries) {
    if (!country.enabled) continue;
    const region = country.region ?? "world";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(country);
  }

  const fame = new Map();
  for (const [, list] of byRegion) {
    const sorted = [...list].sort(
      (a, b) => Math.log1p(b.population || 0) - Math.log1p(a.population || 0)
    );
    const n = sorted.length;
    sorted.forEach((country, index) => {
      // Rank 1.0 = most populous in region.
      const rank = n <= 1 ? 1 : 1 - index / (n - 1);
      fame.set(country.iso3, rank);
    });
  }
  return fame;
})();

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function cid(record) {
  return record?.id ?? record?.iso3 ?? null;
}

export function getFameRank(countryId) {
  return FAME_BY_ID.get(countryId) ?? 0.35;
}

/**
 * Map compare ratio into an ease delta: near MAX_RATIO → easier, near MIN → harder.
 * @param {number} ratio
 * @returns {number} roughly -0.12 … +0.12
 */
export function compareRatioEase(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  const r = Math.max(ratio, 1);
  const t =
    (Math.min(Math.max(r, MIN_COMPARE_RATIO), MAX_COMPARE_RATIO) - MIN_COMPARE_RATIO) /
    (MAX_COMPARE_RATIO - MIN_COMPARE_RATIO);
  // t=0 (1.5×) harder, t=1 (4×) easier
  return (t - 0.5) * 0.24;
}

/**
 * Whether this candidate should be rejected as too easy for the current challenge.
 */
export function isTrivialPrediction(predictedSuccess, workingTier) {
  const wt =
    Number(workingTier) || LEARN_CHALLENGE.DEFAULT_WORKING_TIER;
  if (wt > LEARN_PREDICTED_SUCCESS.TRIVIAL_REJECT_AT_WORKING_TIER) {
    // Absolute beginners (working tier 4): still allow easy association.
    return false;
  }
  return predictedSuccess > LEARN_PREDICTED_SUCCESS.TRIVIAL_THRESHOLD;
}

/**
 * Distance from the flow target midpoint (lower is better).
 */
export function flowDistance(predictedSuccess) {
  return Math.abs(predictedSuccess - LEARN_PREDICTED_SUCCESS.FLOW_TARGET);
}

/**
 * Heuristic predictedSuccess for a generated (or candidate) question.
 *
 * @param {object} args
 * @param {number} args.workingTier
 * @param {object} args.question - { type, tier, countryId, comparisonCountryId?, compareRatio? }
 * @param {object} [args.country]
 * @param {object} [args.peerMeta] - { compareRatio? }
 * @param {number} [args.countryMastery]
 * @returns {number} 0..1
 */
export function predictedSuccess({
  workingTier,
  question,
  country = null,
  peerMeta = null,
  countryMastery = 0,
}) {
  const tier = question?.tier ?? QUESTION_TIERS.TIER_4;
  const tierNum = tierNumberFromString(tier) ?? 4;
  const wt = clamp(
    Number(workingTier) || LEARN_CHALLENGE.DEFAULT_WORKING_TIER,
    LEARN_CHALLENGE.MIN_WORKING_TIER,
    LEARN_CHALLENGE.MAX_WORKING_TIER
  );

  let score = LEARN_PREDICTED_SUCCESS.TIER_BASE[tier] ?? 0.65;

  // Harder than working tier → lower success; easier → higher.
  const tierDelta = tierNum - wt; // positive = easier format than working
  score += tierDelta * 0.07;

  const countryId = question?.countryId ?? cid(country);
  const fame = getFameRank(countryId);
  const household = HOUSEHOLD_NAMES.has(countryId) ? 0.06 : 0;
  const fameBoost = (fame - 0.5) * 0.14 + household;

  // Association / yes-no lean harder on fame.
  if (tier === QUESTION_TIERS.TIER_4) {
    score += fameBoost * 1.35;
  } else if (tier === QUESTION_TIERS.TIER_3) {
    score += fameBoost * 0.7;
  } else {
    score += fameBoost * 0.45;
  }

  const type = question?.type;
  const record = country;
  const neighbors = record?.neighbors ?? [];

  if (type === "landlocked_check") {
    if (OBVIOUS_COASTAL.has(countryId) && record?.landlocked === false) {
      score += 0.18;
    } else if (AMBIGUOUS_LANDLOCKED.has(countryId)) {
      score -= 0.14;
    } else if (record?.landlocked === true && fame > 0.7) {
      // Famous landlocked (e.g. Switzerland) — somewhat easy.
      score += 0.06;
    } else {
      score -= 0.04;
    }
  }

  if (type === "population_compare" || type === "area_compare") {
    const ratio =
      peerMeta?.compareRatio ??
      question?.compareRatio ??
      null;
    score += compareRatioEase(ratio);
    const peerId = question?.comparisonCountryId;
    if (peerId) {
      const peerFame = getFameRank(peerId);
      score += ((fame + peerFame) / 2 - 0.5) * 0.08;
    }
  }

  if (
    type === "neighbor_identification" ||
    type === "neighbor_confirm" ||
    type === "neighbor_select_all" ||
    type === "neighbor_free_recall" ||
    type === "neighbor_recall_all"
  ) {
    const count = neighbors.length;
    if (count >= 8) score -= 0.12;
    else if (count >= 5) score -= 0.06;
    else if (count <= 1) score += 0.04;
  }

  if (type === "binary_map_choice") {
    score += fameBoost * 0.3;
  }

  if (type === "language_family") {
    score += fame * 0.06 - 0.02;
  }

  if (type === "flag_identification" || type === "capital_matching") {
    score += fameBoost * 0.9;
  }

  if (
    type === "blank_map_click" ||
    type === "free_name_entry" ||
    type === "capital_free_recall"
  ) {
    // Free recall: fame helps a bit; still hard vs working tier.
    score += fameBoost * 0.35;
  }

  const mastery = Math.min(1, Math.max(0, Number(countryMastery) || 0));
  score += mastery * LEARN_PREDICTED_SUCCESS.MASTERY_BUMP_MAX;

  return clamp01(score);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Among scored candidates, pick the one closest to the flow target after
 * dropping trivial ones (when challenge warrants it). Falls back to the
 * least-trivial / closest flow candidate if everything was rejected.
 *
 * @param {Array<{ question: object, predictedSuccess: number }>} scored
 * @param {number} workingTier
 * @returns {object|null} question
 */
export function pickByPredictedSuccess(scored, workingTier) {
  if (!Array.isArray(scored) || scored.length === 0) return null;

  const nonTrivial = scored.filter(
    (entry) => !isTrivialPrediction(entry.predictedSuccess, workingTier)
  );
  const pool = nonTrivial.length > 0 ? nonTrivial : scored;

  let best = pool[0];
  let bestDist = flowDistance(best.predictedSuccess);
  for (let i = 1; i < pool.length; i += 1) {
    const dist = flowDistance(pool[i].predictedSuccess);
    if (dist < bestDist) {
      best = pool[i];
      bestDist = dist;
    }
  }
  return best.question;
}
