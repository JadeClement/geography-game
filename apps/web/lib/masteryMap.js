import { GAME_MODES } from "@/lib/regions";
import { MASTERY_GRADUATION_THRESHOLD } from "@/lib/mastery";
import { buildLevelScoreMap, computeCountryScore } from "@/lib/worldlyScore";

// A country counts as "mastered" in a mode once its weighted blend across all
// four levels (same formula as %Worldly) clears the graduation bar.
export const MASTERY_MODE_THRESHOLD = MASTERY_GRADUATION_THRESHOLD;

export const MASTERY_MODES = [GAME_MODES.COUNTRIES, GAME_MODES.CAPITALS, GAME_MODES.FLAGS];

// Per-mode glow palette for the Conquest map. Each mode owns a hue.
export const MODE_VISUALS = {
  [GAME_MODES.COUNTRIES]: {
    label: "Countries",
    accent: "#22d3ee",
    soft: "rgba(34, 211, 238, 0.16)",
  },
  [GAME_MODES.CAPITALS]: {
    label: "Capitals",
    accent: "#c084fc",
    soft: "rgba(192, 132, 252, 0.16)",
  },
  [GAME_MODES.FLAGS]: {
    label: "Flags",
    accent: "#fbbf24",
    soft: "rgba(251, 191, 36, 0.16)",
  },
};

export const ALL_MODE = "all";

export const ALL_VISUAL = {
  label: "All three",
  accent: "#fcd34d",
  soft: "rgba(252, 211, 77, 0.16)",
};

// Tier colors for the combined "All" view: how many of the 3 modes are mastered.
export const TIER_COLORS = {
  1: "#c2763b", // bronze
  2: "#cbd5e1", // silver
  3: "#fcd34d", // gold
};

export function getModeVisual(mode) {
  if (mode === ALL_MODE) return ALL_VISUAL;
  return MODE_VISUALS[mode] ?? MODE_VISUALS[GAME_MODES.COUNTRIES];
}

/**
 * Collapse per-level mastery rows into a weighted per-country score, using
 * the same level weights and cascade rules as %Worldly.
 * @param {{countryId:string, level:string, masteryScore:number}[]} rows
 * @returns {Map<string,{score:number}>}
 */
export function buildModeMasteryMap(rows = []) {
  const levelMap = buildLevelScoreMap(rows);
  const map = new Map();
  for (const [countryId, levelScores] of levelMap) {
    map.set(countryId, { score: computeCountryScore(levelScores) });
  }
  return map;
}

export function isMastered(entry) {
  if (!entry) return false;
  return entry.score >= MASTERY_MODE_THRESHOLD;
}

export function getScore(modeMap, countryId) {
  return modeMap.get(countryId)?.score ?? 0;
}

export function countMastered(modeMap, countryIds) {
  let count = 0;
  for (const id of countryIds) {
    if (isMastered(modeMap.get(id))) count += 1;
  }
  return count;
}

/**
 * Per-country tier 0..3 = number of modes mastered.
 * @param {{countries:Map,capitals:Map,flags:Map}} maps
 */
export function buildTierMap(maps, countryIds) {
  const tiers = new Map();
  for (const id of countryIds) {
    let tier = 0;
    if (isMastered(maps[GAME_MODES.COUNTRIES].get(id))) tier += 1;
    if (isMastered(maps[GAME_MODES.CAPITALS].get(id))) tier += 1;
    if (isMastered(maps[GAME_MODES.FLAGS].get(id))) tier += 1;
    tiers.set(id, tier);
  }
  return tiers;
}

export function countTier(tierMap, countryIds, tier) {
  let count = 0;
  for (const id of countryIds) {
    if ((tierMap.get(id) ?? 0) === tier) count += 1;
  }
  return count;
}
