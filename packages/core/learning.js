import { getLearningWeight, isEligibleForLearning } from "./mastery.js";

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

/**
 * Builds an ordered queue of every country in the region, weighted toward
 * weaker mastery. Countries with no stats count as mastery 0; graduated
 * countries still appear (low weight) so the session covers the full region.
 *
 * @param {string[]} regionCountryIds
 * @param {Map<string, number>|Record<string, number>} masteryById - masteryScore 0–1
 * @returns {string[]}
 */
export function buildFullRegionLearningQueue(regionCountryIds, masteryById = new Map()) {
  const getMastery = (id) => {
    if (masteryById instanceof Map) return masteryById.get(id) ?? 0;
    return masteryById?.[id] ?? 0;
  };

  const weighted = (regionCountryIds ?? []).map((countryId) => {
    const mastery = Math.min(1, Math.max(0, Number(getMastery(countryId)) || 0));
    return {
      countryId,
      weight: (1 - mastery) ** 2 + MIN_SAMPLING_WEIGHT,
    };
  });

  return weightedSampleWithoutReplacement(weighted, weighted.length);
}
