/**
 * A country is "weak" if the user has ever missed on first try or needed a reveal.
 */
export function isWeakCountryStat(stat) {
  return (stat.secondTryCorrect ?? 0) > 0 || (stat.neededReveal ?? 0) > 0;
}

export function getTotalAttempts(stat) {
  return (
    (stat.firstTryCorrect ?? 0) +
    (stat.secondTryCorrect ?? 0) +
    (stat.neededReveal ?? 0)
  );
}

export function getFirstTryRate(stat) {
  const total = getTotalAttempts(stat);
  if (total === 0) return 0;
  return (stat.firstTryCorrect ?? 0) / total;
}

export function getAverageResponseMs(stat) {
  const count = stat.responseTimeCount ?? 0;
  if (count === 0) return 0;
  return (stat.responseTimeMsSum ?? 0) / count;
}

/** Higher = more worth reviewing. */
export function getWeaknessWeight(stat) {
  const total = getTotalAttempts(stat);
  if (total === 0) return 0;

  const missRate = 1 - getFirstTryRate(stat);
  const revealPenalty = (stat.neededReveal ?? 0) / total;
  const avgMs = getAverageResponseMs(stat);
  const slowness = avgMs > 0 ? Math.min(avgMs / 15000, 1) : 0.3;

  return missRate * 2 + revealPenalty * 1.5 + slowness + 0.1;
}

export function weightedSampleWithoutReplacement(items, count) {
  if (items.length === 0 || count <= 0) return [];

  const pool = items.map((item) => ({ ...item, weight: Math.max(item.weight, 0.01) }));
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

export function buildLearningQueue(weakStats, sessionSize) {
  const weighted = weakStats.map((stat) => ({
    countryId: stat.countryId,
    weight: getWeaknessWeight(stat),
  }));

  const count =
    sessionSize === "all" ? weighted.length : Math.min(sessionSize, weighted.length);

  const ids = weightedSampleWithoutReplacement(weighted, count);
  return ids;
}
