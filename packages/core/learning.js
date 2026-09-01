import {
  GO_COOLED_RECENCY_THRESHOLD,
  GO_MIX_FLEX,
  GO_MIX_MIDDLE,
  GO_MIX_MIN_FOR_THIRDS,
  GO_MIX_NEAR,
  GO_MIX_NEW,
  GO_MIX_SPREAD_MIN,
  GO_MIX_WEAK,
  GO_RECENCY_HALF_LIFE_HOURS,
  GO_SESSION_SIZE,
  LEARN_RECENCY_HALF_LIFE_HOURS,
} from "@worldly/constants";
import {
  getLearningWeight,
  getRecencyMultiplier,
  isEligibleForLearning,
} from "./mastery.js";

export { isEligibleForLearning };

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

/**
 * Builds the ordered list of country ids for a learning session, weighted
 * toward weaker countries. `sessionSize` is either a positive number or "all".
 *
 * @param {object[]} eligibleStats - cascaded stats already filtered to the level
 * @param {number|"all"} sessionSize
 * @returns {string[]}
 */
export function buildLearningQueue(eligibleStats, sessionSize) {
  const weighted = eligibleStats
    .map((stat) => ({
      countryId: stat.countryId,
      weight: getLearningWeight(stat),
    }))
    .filter((item) => item.weight > 0);

  const count =
    sessionSize === "all" ? weighted.length : Math.min(sessionSize, weighted.length);

  return weightedSampleWithoutReplacement(weighted, count);
}

function lookupMapOrRecord(store, id) {
  if (!store) return undefined;
  if (store instanceof Map) return store.get(id);
  return store[id];
}

/**
 * Builds an ordered queue of every country in the region, weighted toward
 * weaker mastery. Countries with no stats count as mastery 0; graduated
 * countries still appear (low weight) so the session covers the full region.
 *
 * Optional `recencyById` maps countryId → `{ lastAttemptAt, lastOutcome }` so
 * recent first-try corrects sink toward the end of the queue.
 *
 * @param {string[]} regionCountryIds
 * @param {Map<string, number>|Record<string, number>} masteryById - masteryScore 0–1
 * @param {Map<string, object>|Record<string, object>|null} [recencyById]
 * @returns {string[]}
 */
export function buildFullRegionLearningQueue(
  regionCountryIds,
  masteryById = new Map(),
  recencyById = null
) {
  const weighted = (regionCountryIds ?? []).map((countryId) => {
    const mastery = Math.min(
      1,
      Math.max(0, Number(lookupMapOrRecord(masteryById, countryId)) || 0)
    );
    const recencyStat = lookupMapOrRecord(recencyById, countryId) ?? {};
    const recency = getRecencyMultiplier(recencyStat, LEARN_RECENCY_HALF_LIFE_HOURS);
    return {
      countryId,
      weight: ((1 - mastery) ** 2 + MIN_SAMPLING_WEIGHT) * recency,
    };
  });

  return weightedSampleWithoutReplacement(weighted, weighted.length);
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

function recencyOf(stat, now) {
  return getRecencyMultiplier(stat, GO_RECENCY_HALF_LIFE_HOURS, now);
}

function isHot(stat, now) {
  return recencyOf(stat, now) >= GO_COOLED_RECENCY_THRESHOLD;
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

function sampleHot(stats, count, now, have) {
  const pool = (stats ?? []).filter(
    (stat) => stat?.countryId && !have.has(stat.countryId) && isHot(stat, now)
  );
  if (pool.length === 0 || count <= 0) return [];
  return weightedSampleWithoutReplacement(
    pool.map((stat) => ({
      countryId: stat.countryId,
      weight: recencyOf(stat, now),
    })),
    count
  );
}

function pickDue(stats, now, have) {
  const pool = (stats ?? []).filter(
    (stat) =>
      stat?.countryId &&
      !have.has(stat.countryId) &&
      isHot(stat, now) &&
      stat.lastAttemptAt
  );
  pool.sort(
    (a, b) => new Date(a.lastAttemptAt).getTime() - new Date(b.lastAttemptAt).getTime()
  );
  return pool[0]?.countryId ?? null;
}

/**
 * Builds a Go! session as a mix of this user's weak / middle / near-mastered
 * countries plus a never-seen one. Ranks are percentiles of the player's own
 * in-play EMA range. Recent first-tries are skipped inside a bucket; a fully
 * cooled bucket donates its slots instead of repeating.
 *
 * @param {object} params
 * @param {string[]} params.regionCountryIds
 * @param {object[]} [params.inPlayStats] - non-graduated attempted stats
 * @param {number} [params.sessionSize]
 * @param {number} [params.now]
 * @returns {string[]}
 */
export function buildGoQueue({
  regionCountryIds,
  inPlayStats = [],
  sessionSize = GO_SESSION_SIZE,
  now = Date.now(),
} = {}) {
  const region = [...new Set((regionCountryIds ?? []).filter(Boolean))];
  const inPlay = (inPlayStats ?? []).filter(
    (stat) => stat?.countryId && region.includes(stat.countryId) && !stat.graduated
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
    if (take(sampleHot(split.weak, GO_MIX_WEAK, now, have))) return chosen;
    if (take(sampleHot(split.middle, GO_MIX_MIDDLE, now, have))) return chosen;
    if (take(sampleHot(split.near, GO_MIX_NEAR, now, have))) return chosen;
  } else {
    const inPlaySlots = Math.max(0, sessionSize - GO_MIX_NEW - GO_MIX_FLEX);
    if (take(sampleHot(inPlay, inPlaySlots, now, have))) return chosen;
  }

  if (take(pickUniform(neverSeen.filter((id) => !have.has(id)), GO_MIX_NEW))) {
    return chosen;
  }

  const leftoverNever = neverSeen.filter((id) => !have.has(id));
  if (leftoverNever.length > 0) {
    if (take(pickUniform(leftoverNever, GO_MIX_FLEX))) return chosen;
  } else {
    const dueId = pickDue(inPlay, now, have);
    if (dueId && take([dueId])) return chosen;
    if (take(sampleHot(split.weak, GO_MIX_FLEX, now, have))) return chosen;
  }

  if (take(sampleHot(split.middle, needed(), now, have))) return chosen;
  if (take(sampleHot(split.weak, needed(), now, have))) return chosen;
  if (take(sampleHot(split.near, needed(), now, have))) return chosen;
  if (take(pickUniform(neverSeen.filter((id) => !have.has(id)), needed()))) return chosen;
  if (take(sampleHot(inPlay, needed(), now, have))) return chosen;
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
