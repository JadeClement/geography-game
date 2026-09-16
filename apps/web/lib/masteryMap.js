import { inferDomainFromMode } from "@/lib/learn/questionTypes";
import { GAME_MODES } from "@/lib/regions";
import { MASTERY_GRADUATION_THRESHOLD } from "@/lib/mastery";
import { domainScoresFromStats } from "@/lib/masteryTiers";
import {
  buildLevelScoreMap,
  computeCountryDomainScore,
  computeCountryScore,
  countryDisplayPercent,
  displayPercent,
} from "@/lib/worldlyScore";
import {
  MASTERY_TIERS,
  MASTERY_TIER_COLORS,
  MASTERY_TIER_LABELS,
  SKILL_DOMAIN_LABELS,
  WORLDLY_DOMAIN_WEIGHTS,
} from "@worldly/constants";

export {
  MASTERY_TIERS,
  MASTERY_TIER_COLORS,
  MASTERY_TIER_LABELS,
  SKILL_DOMAIN_LABELS,
};

export const DOMAIN_COLUMNS = Object.keys(WORLDLY_DOMAIN_WEIGHTS);

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
 * Tooltip rows for a country on the active tab. All leads with the
 * domain-weighted EMA, then Countries / Capitals / Flags. Other tabs
 * show only that tab's domain. Started-but-zero scores display as 1%.
 */
export function tooltipRowsForTab(mode, domainScores = {}, stats = []) {
  const tabs = mode === ALL_MODE ? [ALL_MODE, ...MASTERY_MODES] : [mode];
  return tabs.map((tab) => {
    const visual = getModeVisual(tab);
    return {
      key: tab,
      label: tab === ALL_MODE ? "Worldly" : visual.label,
      pct: countryDisplayPercent(
        paintScoreForTab(tab, domainScores),
        countryStartedForTab(tab, stats)
      ),
      accent: visual.accent,
    };
  });
}

/**
 * Count countries whose active-tab score clears the located bar (0.9).
 * All uses the %Worldly domain blend; Countries / Capitals / Flags use
 * that tab's domain only. Not shown on the mastery map panel.
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

function rowDomain(row) {
  const domain = row?.skillDomain ?? row?.skill_domain ?? "general";
  if (domain === "general") return inferDomainFromMode(row?.mode);
  return domain;
}

/** True when the country has at least one country_stats row for this domain. */
export function countryStartedForDomain(domain, stats = []) {
  if (!domain) return false;
  return (stats ?? []).some((row) => rowDomain(row) === domain);
}

/** True when the country has at least one country_stats row for this tab. */
export function countryStartedForTab(mode, stats = []) {
  const rows = stats ?? [];
  if (rows.length === 0) return false;
  if (mode === ALL_MODE) return true;
  return countryStartedForDomain(DOMAIN_TAB_TO_DOMAIN[mode], rows);
}

/**
 * Countries with at least one row for the active tab's domain (any domain
 * on All). Unseen countries are not-started and contribute 0 to the average.
 */
export function countStartedForTab(mode, countryIds, statsByCountry) {
  let count = 0;
  for (const id of countryIds ?? []) {
    if (countryStartedForTab(mode, statsByCountry?.get(id))) count += 1;
  }
  return count;
}

/** Mean of `paintScoreForTab` over the full country universe (missing = 0). */
export function tabAverageRaw(mode, countryIds, domainScoresByCountry) {
  const ids = countryIds ?? [];
  if (!ids.length) return 0;
  let sum = 0;
  for (const id of ids) {
    sum += paintScoreForTab(mode, domainScoresByCountry?.get(id));
  }
  return sum / ids.length;
}

export function tabDisplayPercent(mode, countryIds, domainScoresByCountry) {
  return displayPercent(tabAverageRaw(mode, countryIds, domainScoresByCountry));
}

/**
 * Flatten /api/mastery/all buckets into per-country stats, matching the
 * mastery map. `mode` on a row is required so Test `general` cells infer a domain.
 */
export function collectStatsByCountry(mastery = {}) {
  const statsByCountry = new Map();
  const addRows = (rows, modeKey) => {
    for (const row of rows ?? []) {
      if (!row?.countryId) continue;
      if (!statsByCountry.has(row.countryId)) statsByCountry.set(row.countryId, []);
      statsByCountry.get(row.countryId).push({ ...row, mode: row.mode ?? modeKey });
    }
  };
  addRows(mastery.countries, GAME_MODES.COUNTRIES);
  addRows(mastery.capitals, GAME_MODES.CAPITALS);
  addRows(mastery.flags, GAME_MODES.FLAGS);
  addRows(mastery.neighbors, "neighbors");
  return statsByCountry;
}

/**
 * Region averages per skill domain. Displayed percent is `round(raw × 100)`.
 * @returns {Record<string, number>|null}
 */
export function regionDomainDisplayPcts(countryIds, statsByCountry) {
  if (!countryIds?.length) return null;
  const sums = Object.fromEntries(DOMAIN_COLUMNS.map((domain) => [domain, 0]));
  for (const id of countryIds) {
    const scores = domainScoresFromStats(statsByCountry?.get(id) ?? []);
    for (const domain of DOMAIN_COLUMNS) {
      sums[domain] += Number(scores[domain]) || 0;
    }
  }
  const n = countryIds.length;
  return Object.fromEntries(
    DOMAIN_COLUMNS.map((domain) => [
      domain,
      displayPercent(sums[domain] / n),
    ])
  );
}

/**
 * Average score per geographic region for the active mastery-map tab.
 * `world` is omitted — that's already the headline ring. `count` is the
 * country-universe size for that region so the ring can be checked as the
 * country-count-weighted average of these rows.
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
      pct: displayPercent(raw),
      count: ids.length,
    });
  }
  return rows;
}

/**
 * Collapse the single general-row score into a weighted per-country score.
 * After level left the country_stats key the score is projected into every
 * LEVEL_WEIGHTS slot, so this equals the cell mastery.
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
