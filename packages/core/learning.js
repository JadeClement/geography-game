/**
 * Hybrid recency suppression — pre-implementation findings
 * (audit of mastery / learning / session / DB before this change).
 *
 * 1. country_stats row shape (CREATE TABLE + later ALTERs in
 *    apps/web/scripts/setup-db.js; mapped in apps/web/lib/db.js STAT_RETURNING):
 *      id, user_id, country_id, mode, level,
 *      first_try_correct, second_try_correct, needed_reveal,
 *      response_time_ms_sum, response_time_count,
 *      mastery_score, fast_streak, speed_baseline_ms, graduated,
 *      last_attempt_at TIMESTAMPTZ,
 *      last_outcome TEXT  — ALREADY EXISTED. Values are ROUND_OUTCOMES only:
 *        'first_try_correct' | 'second_try_correct' | 'needed_reveal' | 'incorrect'
 *        A miss without reveal is stored as 'incorrect' (see outcomeFromEvent).
 *        'second_try_correct' means they got it right after a miss.
 *      skill_domain TEXT NOT NULL DEFAULT 'general',
 *      updated_at, created_at
 *    last_correct_at and last_correct_session DID NOT exist before this change.
 *    last_outcome DID exist and was written on every upsert. Do not drop/recreate it.
 *
 * 2. Session counting (before this change):
 *    - users had NO session-counter column (no total_sessions).
 *    - practice_sessions is one row per user per calendar day
 *      (UNIQUE(user_id, practiced_at)), created by recordPracticeSession()
 *      via INSERT ... ON CONFLICT DO NOTHING. Called from POST /api/country-stats
 *      on every authenticated answer (daily streak, not per game).
 *    - GET/POST /api/streak read/write that daily table only.
 *    - No global session counter existed anywhere.
 *
 * 3. Sampling weight (before this change):
 *    getLearningWeight(stat) in packages/core/mastery.js:
 *      graduated → 0
 *      else ((1 - mastery)² + MASTERY_MIN_WEIGHT=0.05) * getRecencyMultiplier(...)
 *      floored at 0.01
 *    getRecencyMultiplier: 1 unless lastOutcome === first_try_correct and
 *      lastAttemptAt is set; then hours/(hours+halfLife). Hours-only, no sessions.
 *    Live Learn path does NOT call buildLearningQueue. It calls
 *      buildFullRegionLearningQueue(ids, masteryById, recencyById, sessionSize)
 *      with weight ((1-mastery)² + 0.01) * Learn half-life recency (24h).
 *    buildLearningQueue(eligibleStats, sessionSize) existed but was unused by
 *      GeographyGame; it used getLearningWeight (Go half-life 8h).
 *    Called from GeographyGame.buildLearnEngineData after fetchMasteryStats.
 *
 * 4. Learn session start (GeographyGame.buildLearnEngineData):
 *    fetchMasteryStats GET /api/mastery?mode= (all mode stats, once).
 *    Build masteryById via getOverallMastery; recencyById from latest lastAttemptAt.
 *    buildFullRegionLearningQueue → sampled country records → buildLearnSession
 *    (sequencer assigns question types; does not re-sample).
 *
 * 5. country_stats / mastery is fetched once at session start, not mid-session.
 *    Answers POST /api/country-stats; the in-session queue is not rebuilt.
 *
 * 6. No global session counter existed. practice_sessions is a daily streak log.
 */

import {
  GO_COOLED_RECENCY_THRESHOLD,
  GO_MIX_FLEX,
  GO_MIX_MIDDLE,
  GO_MIX_MIN_FOR_THIRDS,
  GO_MIX_NEAR,
  GO_MIX_NEW,
  GO_MIX_SPREAD_MIN,
  GO_MIX_WEAK,
  GO_SESSION_SIZE,
} from "@worldly/constants";
import { getRecencyMultiplier, isEligibleForLearning } from "./mastery.js";
import { getRecencyModifier, getSamplingWeight } from "./learn/recencySuppression.js";

export { isEligibleForLearning };
export { getRecencyModifier, getSamplingWeight } from "./learn/recencySuppression.js";

const MIN_SAMPLING_WEIGHT = 0.01;

/**
 * Picks `count` countries from `items` using weighted random sampling without
 * replacement, so higher-weight (weaker) countries appear more often without
 * fully crowding out the rest.
 *
 * @param {{ countryId: string, weight: number }[]} items
 * @param {number} count
 * @returns {string[]} selected country ids
 */
export function weightedSampleWithoutReplacement(items, count) {
  if (items.length === 0 || count <= 0) return [];

  const pool = items.map((item) => ({
    countryId: item.countryId,
    weight: Math.max(item.weight, MIN_SAMPLING_WEIGHT),
  }));
  const selected = [];

  while (selected.length < count && pool.length > 0) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;

    let pickedIndex = 0;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= pool[i].weight;
      if (roll <= 0) {
        pickedIndex = i;
        break;
      }
    }

    selected.push(pool[pickedIndex].countryId);
    pool.splice(pickedIndex, 1);
  }

  return selected;
}

function lookupMapOrRecord(store, id) {
  if (!store) return undefined;
  if (store instanceof Map) return store.get(id);
  return store[id];
}

function weightedSampleEntries(weighted, count) {
  const pickedIds = weightedSampleWithoutReplacement(
    weighted.map((entry) => ({
      countryId: entry.stat.countryId,
      weight: entry.weight,
    })),
    count
  );
  const byId = new Map(weighted.map((entry) => [entry.stat.countryId, entry]));
  return pickedIds.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Eligible (weight > 0) weighted sample, then oldest-attempt backfill if the
 * pool is smaller than sessionSize. Modifier 0 (mastery ≥ 0.90 band) is excluded.
 */
export function buildSampledPool(
  stats,
  sessionSize,
  currentSessionNumber,
  now
) {
  const weighted = (stats ?? []).map((stat) => ({
    stat,
    weight: getSamplingWeight(stat, currentSessionNumber, now),
  }));

  const eligible = weighted.filter((entry) => entry.weight > 0);
  const requested =
    sessionSize === "all" || sessionSize == null
      ? eligible.length
      : Math.floor(Number(sessionSize));
  const count = Number.isFinite(requested)
    ? Math.min(Math.max(0, requested), eligible.length)
    : eligible.length;

  const sampled = weightedSampleEntries(eligible, count);

  if (Number.isFinite(requested) && sampled.length < requested) {
    const sampledIds = new Set(sampled.map((entry) => entry.stat.countryId));
    const backfillCandidates = weighted
      .filter(
        (entry) =>
          entry.weight > 0 && !sampledIds.has(entry.stat.countryId)
      )
      .sort((a, b) => {
        const aTime = a.stat.lastAttemptAt
          ? new Date(a.stat.lastAttemptAt).getTime()
          : 0;
        const bTime = b.stat.lastAttemptAt
          ? new Date(b.stat.lastAttemptAt).getTime()
          : 0;
        return aTime - bTime;
      });

    const needed = requested - sampled.length;
    sampled.push(...backfillCandidates.slice(0, needed));
  }

  return sampled.map((entry) => entry.stat);
}

/**
 * Builds the ordered list of country ids for a learning session, weighted
 * toward weaker countries. `sessionSize` is either a positive number or "all".
 *
 * @param {object[]} eligibleStats - cascaded stats already filtered to the level
 * @param {number|"all"} sessionSize
 * @param {number} [currentSessionNumber]
 * @param {number} [now]
 * @returns {string[]}
 */
export function buildLearningQueue(
  eligibleStats,
  sessionSize,
  currentSessionNumber = 0,
  now = Date.now()
) {
  return buildSampledPool(
    eligibleStats,
    sessionSize,
    currentSessionNumber,
    now
  ).map((stat) => stat.countryId);
}

/**
 * Builds an ordered queue of every country in the region, weighted toward
 * weaker mastery. Countries with no stats count as mastery 0. Countries in the
 * mastery ≥ 0.90 suppression band (modifier 0) are excluded from the pool.
 *
 * Optional `recencyById` maps countryId → recency fields (lastAttemptAt,
 * lastOutcome, lastCorrectAt, lastCorrectSession).
 * `sessionSize` caps how many countries are drawn (`"all"` keeps eligible).
 *
 * @param {string[]} regionCountryIds
 * @param {Map<string, number>|Record<string, number>} masteryById
 * @param {Map<string, object>|Record<string, object>|null} [recencyById]
 * @param {number|"all"} [sessionSize]
 * @param {number} [currentSessionNumber]
 * @param {number} [now]
 * @returns {string[]}
 */
export function buildFullRegionLearningQueue(
  regionCountryIds,
  masteryById = new Map(),
  recencyById = null,
  sessionSize = "all",
  currentSessionNumber = 0,
  now = Date.now()
) {
  const stats = (regionCountryIds ?? []).map((countryId) => {
    const mastery = Math.min(
      1,
      Math.max(0, Number(lookupMapOrRecord(masteryById, countryId)) || 0)
    );
    const recencyStat = lookupMapOrRecord(recencyById, countryId) ?? {};
    return {
      countryId,
      masteryScore: mastery,
      graduated: Boolean(recencyStat.graduated),
      lastAttemptAt: recencyStat.lastAttemptAt ?? null,
      lastOutcome: recencyStat.lastOutcome ?? null,
      lastCorrectAt: recencyStat.lastCorrectAt ?? null,
      lastCorrectSession: recencyStat.lastCorrectSession ?? null,
    };
  });

  return buildSampledPool(
    stats,
    sessionSize,
    currentSessionNumber,
    now
  ).map((stat) => stat.countryId);
}

function pickUniform(ids, count) {
  return weightedSampleWithoutReplacement(
    (ids ?? []).map((countryId) => ({ countryId, weight: 1 })),
    count
  );
}

function masteryOf(stat) {
  return Math.min(1, Math.max(0, Number(stat?.masteryScore) || 0));
}

function samplingWeightOf(stat, currentSessionNumber, now) {
  return getSamplingWeight(stat, currentSessionNumber, now);
}

function isHot(stat, currentSessionNumber, now) {
  return (
    getRecencyModifier(stat, currentSessionNumber, now) >=
    GO_COOLED_RECENCY_THRESHOLD
  );
}

function splitThirds(stats) {
  const sorted = [...stats].sort((a, b) => masteryOf(a) - masteryOf(b));
  const n = sorted.length;
  const t1 = Math.ceil(n / 3);
  const t2 = Math.ceil((2 * n) / 3);
  return {
    weak: sorted.slice(0, t1),
    middle: sorted.slice(t1, t2),
    near: sorted.slice(t2),
  };
}

function shouldSplitThirds(stats) {
  if (stats.length < GO_MIX_MIN_FOR_THIRDS) return false;
  const scores = stats.map(masteryOf);
  return Math.max(...scores) - Math.min(...scores) >= GO_MIX_SPREAD_MIN;
}

function sampleHot(stats, count, currentSessionNumber, now, have) {
  const pool = (stats ?? []).filter(
    (stat) =>
      stat?.countryId &&
      !have.has(stat.countryId) &&
      isHot(stat, currentSessionNumber, now) &&
      samplingWeightOf(stat, currentSessionNumber, now) > 0
  );
  if (pool.length === 0 || count <= 0) return [];
  return weightedSampleWithoutReplacement(
    pool.map((stat) => ({
      countryId: stat.countryId,
      weight: samplingWeightOf(stat, currentSessionNumber, now),
    })),
    count
  );
}

function pickDue(stats, currentSessionNumber, now, have) {
  const pool = (stats ?? []).filter(
    (stat) =>
      stat?.countryId &&
      !have.has(stat.countryId) &&
      isHot(stat, currentSessionNumber, now) &&
      samplingWeightOf(stat, currentSessionNumber, now) > 0 &&
      stat.lastAttemptAt
  );
  pool.sort(
    (a, b) =>
      new Date(a.lastAttemptAt).getTime() - new Date(b.lastAttemptAt).getTime()
  );
  return pool[0]?.countryId ?? null;
}

/**
 * Builds a Go! session as a mix of this user's weak / middle / near-mastered
 * countries plus a never-seen one. Ranks are percentiles of the player's own
 * in-play EMA range. Recently-correct countries are skipped inside a bucket
 * via getSamplingWeight / getRecencyModifier; a fully suppressed bucket
 * donates its slots instead of repeating.
 *
 * @param {object} params
 * @param {string[]} params.regionCountryIds
 * @param {object[]} [params.inPlayStats]
 * @param {number} [params.sessionSize]
 * @param {number} [params.now]
 * @param {number} [params.currentSessionNumber]
 * @returns {string[]}
 */
export function buildGoQueue({
  regionCountryIds,
  inPlayStats = [],
  sessionSize = GO_SESSION_SIZE,
  now = Date.now(),
  currentSessionNumber = 0,
} = {}) {
  const region = [...new Set((regionCountryIds ?? []).filter(Boolean))];
  const inPlay = (inPlayStats ?? []).filter(
    (stat) =>
      stat?.countryId &&
      region.includes(stat.countryId) &&
      !stat.graduated &&
      samplingWeightOf(stat, currentSessionNumber, now) > 0
  );
  const inPlayIds = new Set(inPlay.map((stat) => stat.countryId));
  const neverSeen = region.filter((id) => !inPlayIds.has(id));

  const chosen = [];
  const have = new Set();

  const take = (ids) => {
    for (const id of ids ?? []) {
      if (!id || have.has(id)) continue;
      have.add(id);
      chosen.push(id);
      if (chosen.length >= sessionSize) return true;
    }
    return false;
  };

  const split = shouldSplitThirds(inPlay)
    ? splitThirds(inPlay)
    : { weak: inPlay, middle: [], near: [] };

  const needed = () => sessionSize - chosen.length;

  if (shouldSplitThirds(inPlay)) {
    if (take(sampleHot(split.weak, GO_MIX_WEAK, currentSessionNumber, now, have))) {
      return chosen;
    }
    if (take(sampleHot(split.middle, GO_MIX_MIDDLE, currentSessionNumber, now, have))) {
      return chosen;
    }
    if (take(sampleHot(split.near, GO_MIX_NEAR, currentSessionNumber, now, have))) {
      return chosen;
    }
  } else {
    const inPlaySlots = Math.max(0, sessionSize - GO_MIX_NEW - GO_MIX_FLEX);
    if (take(sampleHot(inPlay, inPlaySlots, currentSessionNumber, now, have))) {
      return chosen;
    }
  }

  if (take(pickUniform(neverSeen.filter((id) => !have.has(id)), GO_MIX_NEW))) {
    return chosen;
  }

  const leftoverNever = neverSeen.filter((id) => !have.has(id));
  if (leftoverNever.length > 0) {
    if (take(pickUniform(leftoverNever, GO_MIX_FLEX))) return chosen;
  } else {
    const dueId = pickDue(inPlay, currentSessionNumber, now, have);
    if (dueId && take([dueId])) return chosen;
    if (take(sampleHot(split.weak, GO_MIX_FLEX, currentSessionNumber, now, have))) {
      return chosen;
    }
  }

  if (take(sampleHot(split.middle, needed(), currentSessionNumber, now, have))) {
    return chosen;
  }
  if (take(sampleHot(split.weak, needed(), currentSessionNumber, now, have))) {
    return chosen;
  }
  if (take(sampleHot(split.near, needed(), currentSessionNumber, now, have))) {
    return chosen;
  }
  if (take(pickUniform(neverSeen.filter((id) => !have.has(id)), needed()))) {
    return chosen;
  }
  if (take(sampleHot(inPlay, needed(), currentSessionNumber, now, have))) {
    return chosen;
  }

  // Last resort: oldest eligible from the full region pool (backfill).
  if (chosen.length < sessionSize) {
    const regionStats = region.map((countryId) => {
      const existing = inPlay.find((stat) => stat.countryId === countryId);
      return (
        existing ?? {
          countryId,
          masteryScore: 0,
          lastAttemptAt: null,
          lastOutcome: null,
          lastCorrectAt: null,
          lastCorrectSession: null,
        }
      );
    });
    const backfill = buildSampledPool(
      regionStats,
      sessionSize,
      currentSessionNumber,
      now
    )
      .map((stat) => stat.countryId)
      .filter((id) => !have.has(id));
    take(backfill);
  }

  take(region.filter((id) => !have.has(id)));
  return chosen;
}

/**
 * Picks `count` ids, preferring countries that are not in a first-try-correct
 * recency cooldown.
 *
 * @param {string[]} countryIds
 * @param {Map<string, object>|Record<string, object>|null} recencyById
 * @param {number} count
 * @param {number} halfLifeHours
 * @param {number} [now]
 * @returns {string[]}
 */
export function pickRecencyWeightedIds(
  countryIds,
  recencyById,
  count,
  halfLifeHours,
  now = Date.now()
) {
  const weighted = (countryIds ?? []).map((countryId) => ({
    countryId,
    weight: getRecencyMultiplier(
      lookupMapOrRecord(recencyById, countryId) ?? {},
      halfLifeHours,
      now
    ),
  }));
  return weightedSampleWithoutReplacement(weighted, count);
}
