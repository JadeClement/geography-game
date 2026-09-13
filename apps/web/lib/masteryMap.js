import { GAME_MODES } from "@/lib/regions";
import { MASTERY_GRADUATION_THRESHOLD } from "@/lib/mastery";
import { applyWorldlyCurve, buildLevelScoreMap, computeCountryDomainScore, computeCountryScore } from "@/lib/worldlyScore";
import {
  MASTERY_TIERS,
  MASTERY_TIER_COLORS,
  MASTERY_TIER_LABELS,
} from "@worldly/constants";

export {
  MASTERY_TIERS,
  MASTERY_TIER_COLORS,
  MASTERY_TIER_LABELS,
};

// A country counts as "located" in a mode once its weighted blend across all
// four levels (same formula as the category header) clears the graduation bar.
export const MASTERY_MODE_THRESHOLD = MASTERY_GRADUATION_THRESHOLD;

export const MASTERY_MODES = [
  GAME_MODES.COUNTRIES,
  GAME_MODES.CAPITALS,
  GAME_MODES.FLAGS,
];

export const DOMAIN_TAB_TO_DOMAIN = {
  [GAME_MODES.COUNTRIES]: "location",
  [GAME_MODES.CAPITALS]: "capital",
  [GAME_MODES.FLAGS]: "flag",
};

// Per-mode glow palette for intensity (domain) tabs.
export const MODE_VISUALS = {
  [GAME_MODES.COUNTRIES]: {
    label: "Countries",
    accent: MASTERY_TIER_COLORS.worldly,
    soft: "rgba(45, 212, 191, 0.16)",
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
  label: "All",
  accent: MASTERY_TIER_COLORS.worldly,
  soft: "rgba(94, 234, 212, 0.16)",
};

/** Numeric feature-state for map paint: 0 unseen, 1 spotted, 2 located, 3 worldly. */
export const TIER_STATE = {
  [MASTERY_TIERS.NONE]: 0,
  [MASTERY_TIERS.SPOTTED]: 1,
  [MASTERY_TIERS.LOCATED]: 2,
  [MASTERY_TIERS.WORLDLY]: 3,
};

export const TIER_COLORS = {
  1: MASTERY_TIER_COLORS.spotted,
  2: MASTERY_TIER_COLORS.located,
  3: MASTERY_TIER_COLORS.worldly,
};

export function getModeVisual(mode) {
  if (mode === ALL_MODE) return ALL_VISUAL;
  return MODE_VISUALS[mode] ?? MODE_VISUALS[GAME_MODES.COUNTRIES];
}

/**
 * Continuous 0–1 paint score for a mastery-map tab.
 * All uses the same domain blend as %Worldly; other tabs use that domain.
 */
export function paintScoreForTab(mode, domainScores = {}) {
  if (mode === ALL_MODE) return computeCountryDomainScore(domainScores);
  const domainKey = DOMAIN_TAB_TO_DOMAIN[mode];
  return Number(domainScores?.[domainKey]) || 0;
}

/**
 * Count countries whose active-tab score clears the located bar (0.9).
 * All uses the %Worldly domain blend; Countries / Capitals / Flags use
 * that tab's domain only.
 */
export function countLocatedForTab(mode, countryIds, domainScoresByCountry) {
  let count = 0;
  for (const id of countryIds ?? []) {
    if (paintScoreForTab(mode, domainScoresByCountry?.get(id)) >= MASTERY_MODE_THRESHOLD) {
      count += 1;
    }
  }
  return count;
}

/**
 * Curved average score per geographic region for the active mastery-map tab.
 * `world` is omitted — that's already the headline ring.
 */
export function regionScoresForTab(mode, regions, getCountryIds, domainScoresByCountry) {
  const rows = [];
  for (const region of regions ?? []) {
    if (!region || region.id === "world") continue;
    const ids = getCountryIds?.(region.id) ?? [];
    let sum = 0;
    for (const id of ids) {
      sum += paintScoreForTab(mode, domainScoresByCountry?.get(id));
    }
    const raw = ids.length ? sum / ids.length : 0;
    rows.push({
      id: region.id,
      label: region.label,
      pct: Math.round(applyWorldlyCurve(raw)),
    });
  }
  return rows;
}

/**
 * Collapse per-level mastery rows into a weighted per-country score, using
 * the same level weights and cascade rules as the category header.
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

export function countTierLabel(tierMap, countryIds, tier) {
  let count = 0;
  for (const id of countryIds) {
    if ((tierMap.get(id) ?? MASTERY_TIERS.NONE) === tier) count += 1;
  }
  return count;
}

/** @deprecated bronze/silver/gold helper — kept for share-image fallbacks */
export function buildTierMap(maps, countryIds) {
  const tiers = new Map();
  for (const id of countryIds) {
    let tier = 0;
    if (isMastered(maps[GAME_MODES.COUNTRIES]?.get(id))) tier += 1;
    if (isMastered(maps[GAME_MODES.CAPITALS]?.get(id))) tier += 1;
    if (isMastered(maps[GAME_MODES.FLAGS]?.get(id))) tier += 1;
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
