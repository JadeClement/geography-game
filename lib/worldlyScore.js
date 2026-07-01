import { GAME_MODES } from "@/lib/regions";
import { GAME_LEVELS, getMasteryProvingLevels } from "@/lib/levels";

// The %Worldly Score is a single headline number blending the three modes.
// Countries dominate, capitals matter less, flags least. Weights sum to 1.
export const WORLDLY_WEIGHTS = {
  [GAME_MODES.COUNTRIES]: 0.5,
  [GAME_MODES.CAPITALS]: 0.35,
  [GAME_MODES.FLAGS]: 0.15,
};

// %Worldly boundaries worth celebrating when a game pushes a user across them.
export const WORLDLY_MILESTONES = [25, 50, 75, 90, 100];

// Within a mode, a country's score is a weighted blend of its four levels:
// harder levels are worth more. Weights sum to 1 so a country fully mastered
// at every level scores 1.0.
export const LEVEL_WEIGHTS = {
  [GAME_LEVELS.FIND_FILL]: 0.15, // Find It · Level 1
  [GAME_LEVELS.FIND_FLASH]: 0.25, // Find It · Level 2
  [GAME_LEVELS.NAME_FILL]: 0.25, // Name It · Level 1
  [GAME_LEVELS.NAME_FLASH]: 0.35, // Name It · Level 2
};

const WEIGHTED_LEVELS = Object.keys(LEVEL_WEIGHTS);

/**
 * Collapse per-(level) mastery rows for one mode into a per-country map of
 * per-level decay-adjusted scores. Duplicate rows for the same country+level
 * keep the higher score.
 *
 * @param {{countryId:string, level:string, masteryScore:number}[]} rows
 * @returns {Map<string, Record<string, number>>} countryId -> { [level]: score }
 */
export function buildLevelScoreMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!(row.level in LEVEL_WEIGHTS)) continue;
    const score = row.masteryScore ?? 0;
    let entry = map.get(row.countryId);
    if (!entry) {
      entry = {};
      map.set(row.countryId, entry);
    }
    entry[row.level] = Math.max(entry[row.level] ?? 0, score);
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

/**
 * Weighted %Worldly Score from already-built per-mode level-score maps.
 *
 * @param {{countries:Map,capitals:Map,flags:Map}} maps - maps from buildLevelScoreMap
 * @param {string[]} countryIds - the full country universe (denominator)
 * @returns {{
 *   score: number,           // weighted blend in [0, 1]
 *   percent: number,         // score * 100, rounded to 1 decimal
 *   categories: { countries: number, capitals: number, flags: number } // each in [0, 1]
 * }}
 */
export function computeWorldlyScore(maps, countryIds) {
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

  const score =
    categories[GAME_MODES.COUNTRIES] * WORLDLY_WEIGHTS[GAME_MODES.COUNTRIES] +
    categories[GAME_MODES.CAPITALS] * WORLDLY_WEIGHTS[GAME_MODES.CAPITALS] +
    categories[GAME_MODES.FLAGS] * WORLDLY_WEIGHTS[GAME_MODES.FLAGS];

  return {
    score,
    percent: Math.round(score * 1000) / 10,
    categories,
  };
}

/**
 * Convenience wrapper that builds the per-mode level-score maps from a raw
 * mastery payload (the `{ countries: [], capitals: [], flags: [] }` shape
 * returned by `fetchAllMasteryStats`) before computing the score.
 *
 * @param {{countries?:object[], capitals?:object[], flags?:object[]}} mastery
 * @param {string[]} countryIds - the full country universe (denominator)
 */
export function computeWorldlyScoreFromMastery(mastery, countryIds) {
  const maps = {
    [GAME_MODES.COUNTRIES]: buildLevelScoreMap(mastery?.countries ?? []),
    [GAME_MODES.CAPITALS]: buildLevelScoreMap(mastery?.capitals ?? []),
    [GAME_MODES.FLAGS]: buildLevelScoreMap(mastery?.flags ?? []),
  };
  return computeWorldlyScore(maps, countryIds);
}

/**
 * The highest %Worldly milestone strictly crossed going from `beforePercent`
 * to `afterPercent`, or null if none. Both inputs are full-precision (0-100).
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
 * "After" is authoritative (from the fetched mastery). "Before" is
 * reconstructed by reverting only the played mode+level changes for the
 * countries answered this round — every other country is identical between
 * the two, so only the delta needs adjusting. Cascade is handled naturally
 * because we revert the actual changed level and recompute the country's score.
 *
 * @param {object} params
 * @param {{countries?:object[],capitals?:object[],flags?:object[]}} params.mastery
 * @param {string[]} params.countryIds - full country universe (denominator)
 * @param {string} params.mode - the mode played this game
 * @param {string} params.level - the level played this game
 * @param {Record<string,{beforeMastery?:number}>} params.statRecords
 * @returns {{ beforePercent:number, afterPercent:number }} full-precision (0-100)
 */
export function computeWorldlyBeforeAfter({
  mastery,
  countryIds,
  mode,
  level,
  statRecords,
}) {
  const maps = {
    [GAME_MODES.COUNTRIES]: buildLevelScoreMap(mastery?.countries ?? []),
    [GAME_MODES.CAPITALS]: buildLevelScoreMap(mastery?.capitals ?? []),
    [GAME_MODES.FLAGS]: buildLevelScoreMap(mastery?.flags ?? []),
  };

  const afterPercent = computeWorldlyScore(maps, countryIds).score * 100;

  const total = countryIds?.length ?? 0;
  const weight = WORLDLY_WEIGHTS[mode];
  const playedMap = maps[mode];

  let beforePercent = afterPercent;
  if (playedMap && weight != null && total > 0 && statRecords) {
    let deltaSum = 0;
    for (const [countryId, record] of Object.entries(statRecords)) {
      const afterLevels = playedMap.get(countryId);
      if (!afterLevels) continue;
      const afterScore = computeCountryScore(afterLevels);
      const beforeScore = computeCountryScore({
        ...afterLevels,
        [level]: record?.beforeMastery ?? 0,
      });
      deltaSum += afterScore - beforeScore;
    }
    beforePercent = afterPercent - (weight * deltaSum * 100) / total;
  }

  return { beforePercent, afterPercent };
}
