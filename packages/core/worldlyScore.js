import {
  GAME_MODES,
  WORLDLY_WEIGHTS,
  LEVEL_WEIGHTS,
  WORLDLY_MILESTONES,
  WORLDLY_DOMAIN_WEIGHTS,
  WORLDLY_CURVE_BREAKPOINTS,
  SKILL_DOMAIN_LABELS,
} from "@worldly/constants";
import { getMasteryProvingLevels } from "./levels.js";
import { inferDomainFromMode } from "./learn/questionTypes.js";
import { domainScoresFromStats } from "./learn/masteryTiers.js";

export {
  WORLDLY_WEIGHTS,
  LEVEL_WEIGHTS,
  WORLDLY_MILESTONES,
  WORLDLY_DOMAIN_WEIGHTS,
  WORLDLY_CURVE_BREAKPOINTS,
  SKILL_DOMAIN_LABELS,
};

const WEIGHTED_LEVELS = Object.keys(LEVEL_WEIGHTS);
const DOMAIN_KEYS = Object.keys(WORLDLY_DOMAIN_WEIGHTS);

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Display percent for a raw 0–1 score. Currently the identity `raw × 100`
 * (the old piecewise curve is unused). Kept as a named helper so a future
 * curve can slot back in without rewriting call sites.
 *
 * @param {number} rawScore 0–1
 * @returns {number} 0–100 display value (unrounded)
 */
export function applyWorldlyCurve(rawScore) {
  return clamp01(rawScore) * 100;
}

/** Whole-number percent at every display scope: `round(raw × 100)`. */
export function displayPercent(rawScore) {
  return Math.round(applyWorldlyCurve(rawScore));
}

/**
 * Collapse per-(country) mastery rows for one mode into a per-country map of
 * per-level decay-adjusted scores.
 *
 * After `level` left the country_stats key there is one general-row score per
 * country. That score is projected into every LEVEL_WEIGHTS slot so
 * `computeCountryScore` (legacy countries/capitals/flags header) is unchanged
 * — a weighted average of the same number four times. Domain-level Learn rows
 * are ignored so the header stays Test/`general`-based.
 *
 * @param {{countryId:string, level:string, masteryScore:number}[]} rows
 * @returns {Map<string, Record<string, number>>} countryId -> { [level]: score }
 */
export function buildLevelScoreMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const domain = row.skillDomain ?? row.skill_domain ?? "general";
    if (domain !== "general") continue;
    const score = row.masteryScore ?? 0;
    let entry = map.get(row.countryId);
    if (!entry) {
      entry = {};
      map.set(row.countryId, entry);
    }
    for (const level of WEIGHTED_LEVELS) {
      entry[level] = Math.max(entry[level] ?? 0, score);
    }
  }
  return map;
}

/**
 * Effective score for a single level, cascading up any proving levels (the
 * harder no-fill tier proves the easier fill tier of the same section), so
 * mastering Find L2 credits Find L1 without replaying it.
 */
export function cascadedLevelScore(levelScores, level) {
  let best = levelScores?.[level] ?? 0;
  for (const proving of getMasteryProvingLevels(level)) {
    best = Math.max(best, levelScores?.[proving] ?? 0);
  }
  return best;
}

/**
 * Weighted per-country score within a mode, blending all four (cascaded)
 * level scores by LEVEL_WEIGHTS. Returns a value in [0, 1].
 */
export function computeCountryScore(levelScores) {
  let total = 0;
  for (const level of WEIGHTED_LEVELS) {
    total += cascadedLevelScore(levelScores, level) * LEVEL_WEIGHTS[level];
  }
  return total;
}

/**
 * Average per-country score for one mode across the full country universe.
 * Countries with no data contribute 0, so this is a true fraction of the
 * world, not just of what's been attempted.
 *
 * @param {Map<string, Record<string, number>>} levelScoreMap
 * @param {string[]} countryIds - the full country universe
 * @returns {number} average score in [0, 1]
 */
export function computeCategoryAverage(levelScoreMap, countryIds) {
  if (!countryIds || countryIds.length === 0) return 0;

  let sum = 0;
  for (const id of countryIds) {
    sum += computeCountryScore(levelScoreMap?.get(id));
  }
  return sum / countryIds.length;
}

function flattenMastery(mastery) {
  const rows = [];
  const add = (list, mode) => {
    for (const row of list ?? []) {
      rows.push({ ...row, mode: row.mode ?? mode });
    }
  };
  add(mastery?.countries, GAME_MODES.COUNTRIES);
  add(mastery?.capitals, GAME_MODES.CAPITALS);
  add(mastery?.flags, GAME_MODES.FLAGS);
  add(mastery?.neighbors, "neighbors");
  return rows;
}

function groupStatsByCountry(stats = []) {
  const byCountry = new Map();
  for (const stat of stats ?? []) {
    const countryId = stat?.countryId;
    if (!countryId) continue;
    if (!byCountry.has(countryId)) byCountry.set(countryId, []);
    byCountry.get(countryId).push(stat);
  }
  return byCountry;
}

/**
 * Weighted domain mix for one country. Stored EMA already includes the Learn
 * 0.8x write-rate on Test-mode domains, so this is a straight weight blend.
 */
export function computeCountryDomainScore(domainScores) {
  let total = 0;
  let weightSum = 0;
  for (const domain of DOMAIN_KEYS) {
    const weight = WORLDLY_DOMAIN_WEIGHTS[domain] ?? 0;
    total += (Number(domainScores?.[domain]) || 0) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? total / weightSum : 0;
}

function emptyByDomain() {
  return Object.fromEntries(DOMAIN_KEYS.map((domain) => [domain, 0]));
}

/**
 * Domain-weighted %Worldly plus the legacy countries/capitals/flags breakdown.
 *
 * @param {{countries:Map,capitals:Map,flags:Map}} maps - maps from buildLevelScoreMap
 * @param {string[]} countryIds
 * @param {object[]} [stats] - flat country_stats (with skillDomain + mode)
 */
export function computeWorldlyScore(maps, countryIds, stats = null) {
  const categories = {
    [GAME_MODES.COUNTRIES]: computeCategoryAverage(
      maps?.[GAME_MODES.COUNTRIES],
      countryIds
    ),
    [GAME_MODES.CAPITALS]: computeCategoryAverage(
      maps?.[GAME_MODES.CAPITALS],
      countryIds
    ),
    [GAME_MODES.FLAGS]: computeCategoryAverage(
      maps?.[GAME_MODES.FLAGS],
      countryIds
    ),
  };

  const byCountry = groupStatsByCountry(stats ?? []);
  const domainSums = emptyByDomain();
  let domainTotal = 0;
  const n = countryIds?.length ?? 0;

  if (n > 0) {
    for (const id of countryIds) {
      const domainScores = domainScoresFromStats(byCountry.get(id) ?? []);
      domainTotal += computeCountryDomainScore(domainScores);
      for (const domain of DOMAIN_KEYS) {
        domainSums[domain] += domainScores[domain] ?? 0;
      }
    }
  }

  const rawScore = n > 0 ? domainTotal / n : 0;
  const byDomain = emptyByDomain();
  if (n > 0) {
    for (const domain of DOMAIN_KEYS) {
      byDomain[domain] = domainSums[domain] / n;
    }
  }

  return {
    score: rawScore,
    percent: displayPercent(rawScore),
    categories,
    byDomain,
  };
}

/**
 * Convenience wrapper that builds the per-mode level-score maps from a raw
 * mastery payload (the `{ countries: [], capitals: [], flags: [] }` shape
 * returned by `fetchAllMasteryStats`) before computing the score.
 *
 * @param {{countries?:object[], capitals?:object[], flags?:object[], neighbors?:object[]}} mastery
 * @param {string[]} countryIds - the full country universe (denominator)
 */
export function computeWorldlyScoreFromMastery(mastery, countryIds) {
  const maps = {
    [GAME_MODES.COUNTRIES]: buildLevelScoreMap(mastery?.countries ?? []),
    [GAME_MODES.CAPITALS]: buildLevelScoreMap(mastery?.capitals ?? []),
    [GAME_MODES.FLAGS]: buildLevelScoreMap(mastery?.flags ?? []),
  };
  return computeWorldlyScore(maps, countryIds, flattenMastery(mastery));
}

/**
 * The highest %Worldly milestone strictly crossed going from `beforePercent`
 * to `afterPercent`, or null if none. Both inputs are displayed percents (0-100).
 */
export function getCrossedWorldlyMilestone(beforePercent, afterPercent) {
  let crossed = null;
  for (const threshold of WORLDLY_MILESTONES) {
    if (beforePercent < threshold && afterPercent >= threshold) {
      crossed = threshold;
    }
  }
  return crossed;
}

/**
 * Compute the %Worldly score before and after a single game, given the
 * post-game mastery snapshot and the round's per-country before/after records.
 *
 * @returns {{ beforePercent:number, afterPercent:number }} display-scale (0-100)
 */
export function computeWorldlyBeforeAfter({
  mastery,
  countryIds,
  mode,
  level,
  statRecords,
}) {
  const after = computeWorldlyScoreFromMastery(mastery, countryIds);
  const afterPercent = after.percent;

  const playedDomain = inferDomainFromMode(mode);
  const byCountry = groupStatsByCountry(flattenMastery(mastery));
  const total = countryIds?.length ?? 0;
  const weight = WORLDLY_DOMAIN_WEIGHTS[playedDomain] ?? 0;

  let beforePercent = afterPercent;
  if (total > 0 && statRecords && weight > 0) {
    let deltaSum = 0;
    for (const [countryId, record] of Object.entries(statRecords)) {
      const rows = byCountry.get(countryId) ?? [];
      const afterDomains = domainScoresFromStats(rows);
      const afterCountry = computeCountryDomainScore(afterDomains);
      const beforeDomains = {
        ...afterDomains,
        [playedDomain]: clamp01(record?.beforeMastery ?? afterDomains[playedDomain] ?? 0),
      };
      const beforeCountry = computeCountryDomainScore(beforeDomains);
      deltaSum += afterCountry - beforeCountry;
    }
    const afterRaw = after.score;
    const beforeRaw = afterRaw - deltaSum / total;
    beforePercent = displayPercent(clamp01(beforeRaw));
  }

  return { beforePercent, afterPercent };
}
