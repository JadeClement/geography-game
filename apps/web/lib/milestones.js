// Milestone detection for the post-game celebration overlay.
//
// All detection runs on data the game flow already has: the score-save response
// (personal best), the session counts (perfect game), and the per-round mastery
// snapshot captured from the country-stat responses (region mastered, level-up).
// No extra API calls are made.

// Average region mastery crosses these on the way up.
const MASTERY_THRESHOLDS = [
  { value: 1, pct: 100 },
  { value: 0.75, pct: 75 },
  { value: 0.5, pct: 50 },
  { value: 0.25, pct: 25 },
];

// A tiny epsilon avoids float noise making 0.7499999 miss the 75% line.
const EPSILON = 1e-9;

// Flavor lines for each %Worldly boundary celebration.
const WORLDLY_SUBTITLES = {
  25: "A quarter of the world under your belt.",
  50: "Halfway around the globe.",
  75: "Three quarters of the world mastered.",
  90: "Almost the entire world.",
  100: "You've mastered every country on Earth.",
};

function regionMasteryAverages(milestoneStats) {
  const { statRecords = {}, preCreditedIds = [], regionCountryIds = [] } =
    milestoneStats ?? {};

  if (regionCountryIds.length === 0) return null;

  const preCredited = new Set(preCreditedIds);
  let beforeSum = 0;
  let afterSum = 0;
  let allBeforeGraduated = true;
  let allAfterGraduated = true;

  for (const id of regionCountryIds) {
    // Pre-credited countries were already mastered before this game, so they
    // count as fully mastered and graduated both before and after.
    if (preCredited.has(id)) {
      beforeSum += 1;
      afterSum += 1;
      continue;
    }

    const record = statRecords[id];
    beforeSum += record?.beforeMastery ?? 0;
    afterSum += record?.afterMastery ?? 0;
    if (!record?.beforeGraduated) allBeforeGraduated = false;
    if (!record?.afterGraduated) allAfterGraduated = false;
  }

  const count = regionCountryIds.length;
  return {
    count,
    beforeAvg: beforeSum / count,
    afterAvg: afterSum / count,
    allBeforeGraduated,
    allAfterGraduated,
  };
}

/**
 * Decide which single milestone (if any) to celebrate.
 *
 * Priority: region mastered > personal best > perfect game > level-up.
 *
 * @param {object} params
 * @param {object|null} params.saveResult - response from saveScore (or null)
 * @param {boolean} params.perfectGame - every country correct on first try
 * @param {object|undefined} params.milestoneStats - region mastery snapshot
 * @param {number|null} [params.worldlyMilestone] - %Worldly boundary just crossed
 * @param {string} [params.regionLabel]
 * @param {string} [params.modeLabel]
 * @returns {{id, emoji, headline, subtitle}|null}
 */
export function detectMilestone({
  saveResult,
  perfectGame,
  milestoneStats,
  worldlyMilestone = null,
  regionLabel = "this region",
  modeLabel = "this mode",
}) {
  if (worldlyMilestone != null) {
    return {
      id: `worldly-${worldlyMilestone}`,
      emoji: worldlyMilestone === 100 ? "🌏" : "🌍",
      headline: `You're now ${worldlyMilestone}% Worldly!`,
      subtitle: WORLDLY_SUBTITLES[worldlyMilestone] ?? "Your world is filling in.",
    };
  }

  const averages = milestoneStats ? regionMasteryAverages(milestoneStats) : null;

  if (averages && averages.allAfterGraduated && !averages.allBeforeGraduated) {
    return {
      id: "region-mastered",
      emoji: "🏆",
      headline: "Region Mastered!",
      subtitle: `You've graduated every country in ${regionLabel}.`,
    };
  }

  if (saveResult?.isPersonalBest && saveResult.previousBest != null) {
    return {
      id: "personal-best",
      emoji: "🎯",
      headline: "New Personal Best!",
      subtitle: `A new high score for ${modeLabel} · ${regionLabel}.`,
    };
  }

  if (perfectGame) {
    return {
      id: "perfect-game",
      emoji: "🎉",
      headline: "Perfect Game!",
      subtitle: `Every country right on the first try in ${regionLabel}.`,
    };
  }

  if (averages) {
    const crossed = MASTERY_THRESHOLDS.find(
      (threshold) =>
        averages.beforeAvg < threshold.value - EPSILON &&
        averages.afterAvg >= threshold.value - EPSILON
    );
    if (crossed) {
      return {
        id: `level-up-${crossed.pct}`,
        emoji: "🚀",
        headline: `${crossed.pct}% Mastery!`,
        subtitle: `Your ${regionLabel} mastery just passed ${crossed.pct}%.`,
      };
    }
  }

  return null;
}
