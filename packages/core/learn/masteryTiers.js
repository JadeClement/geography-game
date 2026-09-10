/**
 * Per-country map tiers: Unseen → Spotted → Located → Worldly.
 *
 * Located still means Test-mode graduation on a legacy `general` row.
 * Worldly means location, capital, and neighbors are all strong.
 */

import {
  MASTERY_TIERS,
  MASTERY_TIER_COLORS,
  MASTERY_TIER_LABELS,
  WORLDLY_DOMAIN_THRESHOLD,
  SKILL_DOMAIN_LABELS,
  WORLDLY_DOMAIN_WEIGHTS,
} from "@worldly/constants";
import { SKILL_DOMAINS, inferDomainFromMode } from "./questionTypes.js";

export {
  MASTERY_TIERS,
  MASTERY_TIER_COLORS,
  MASTERY_TIER_LABELS,
  WORLDLY_DOMAIN_THRESHOLD,
  SKILL_DOMAIN_LABELS,
};

const TIER_RANK = {
  [MASTERY_TIERS.NONE]: 0,
  [MASTERY_TIERS.SPOTTED]: 1,
  [MASTERY_TIERS.LOCATED]: 2,
  [MASTERY_TIERS.WORLDLY]: 3,
};

function domainOf(stat) {
  return stat?.skillDomain || stat?.skill_domain || "general";
}

function scoreOf(stat) {
  const value = Number(stat?.masteryScore ?? stat?.mastery);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function isGeneralRow(stat) {
  return domainOf(stat) === "general";
}

/**
 * Best per-domain scores for one country, with Test `general` rows filling
 * the matching mode's domain when a dedicated domain row is missing.
 *
 * @param {object[]} stats
 * @returns {Record<string, number>}
 */
export function domainScoresFromStats(stats = []) {
  const explicit = {};
  const fromGeneral = {};
  for (const stat of stats ?? []) {
    const score = scoreOf(stat);
    const domain = domainOf(stat);
    if (domain === "general") {
      const inferred = inferDomainFromMode(stat.mode);
      fromGeneral[inferred] = Math.max(fromGeneral[inferred] ?? 0, score);
      continue;
    }
    explicit[domain] = Math.max(explicit[domain] ?? 0, score);
  }
  const out = {};
  for (const domain of Object.keys(WORLDLY_DOMAIN_WEIGHTS)) {
    out[domain] = explicit[domain] ?? fromGeneral[domain] ?? 0;
  }
  return out;
}

function hasGeneralGraduation(stats = []) {
  return (stats ?? []).some(
    (stat) => isGeneralRow(stat) && Boolean(stat.graduated)
  );
}

/**
 * @param {object} args
 * @param {object[]} [args.stats] - all country_stats rows for one country
 * @param {number} [args.neighborCount] - land neighbors; 0 waives the neighbors bar
 * @returns {string} MASTERY_TIERS value
 */
export function getMasteryTier({ stats = [], neighborCount } = {}) {
  const rows = (stats ?? []).filter(Boolean);
  if (rows.length === 0) return MASTERY_TIERS.NONE;

  const domains = domainScoresFromStats(rows);
  const location = domains[SKILL_DOMAINS.LOCATION] ?? 0;
  const capital = domains[SKILL_DOMAINS.CAPITAL] ?? 0;
  const neighbors =
    neighborCount === 0
      ? 1
      : (domains[SKILL_DOMAINS.NEIGHBORS] ?? 0);

  if (
    location >= WORLDLY_DOMAIN_THRESHOLD &&
    capital >= WORLDLY_DOMAIN_THRESHOLD &&
    neighbors >= WORLDLY_DOMAIN_THRESHOLD
  ) {
    return MASTERY_TIERS.WORLDLY;
  }

  if (hasGeneralGraduation(rows)) return MASTERY_TIERS.LOCATED;
  return MASTERY_TIERS.SPOTTED;
}

export function masteryTierRank(tier) {
  return TIER_RANK[tier] ?? 0;
}

export function getWeakestDomain(domainScores = {}) {
  let weakest = null;
  let lowest = Infinity;
  for (const domain of Object.keys(WORLDLY_DOMAIN_WEIGHTS)) {
    const score = Number(domainScores[domain]) || 0;
    if (score < lowest) {
      lowest = score;
      weakest = domain;
    }
  }
  return weakest;
}
