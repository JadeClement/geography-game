import { LEARN_RECENCY_HALF_LIFE_HOURS } from "@worldly/constants";
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

/**
 * Picks `count` ids, preferring countries that are not in a first-try-correct
 * recency cooldown. Used for Go leftover fillers.
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
