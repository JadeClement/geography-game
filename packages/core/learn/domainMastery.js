import { WORLDLY_DOMAIN_WEIGHTS } from "@worldly/constants";
import { SKILL_DOMAINS, DEFAULT_SKILL_DOMAIN } from "./questionTypes.js";

export { SKILL_DOMAINS, DEFAULT_SKILL_DOMAIN, WORLDLY_DOMAIN_WEIGHTS };

const LEGACY_DOMAIN = "general";

const DOMAIN_WEIGHTS = WORLDLY_DOMAIN_WEIGHTS;

function scoreOf(stat) {
  const value = Number(stat?.masteryScore ?? stat?.mastery);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function domainOf(stat) {
  return stat?.skillDomain || stat?.skill_domain || LEGACY_DOMAIN;
}

function countryIdOf(stat) {
  return stat?.countryId ?? stat?.id ?? stat?.iso3 ?? null;
}

/**
 * One score per (country, skill_domain). After collapsing `level` out of the
 * country_stats key there is a single row per cell; `.set` is then identity,
 * not last-write-across-levels. Duplicates (shouldn't exist) last-write.
 *
 * @param {Array<{ countryId: string, skillDomain?: string, masteryScore?: number }>} stats
 * @returns {Map<string, Map<string, number>>}
 */
export function buildDomainMasteryMap(stats) {
  const map = new Map();
  for (const stat of stats ?? []) {
    const countryId = countryIdOf(stat);
    if (!countryId) continue;
    if (!map.has(countryId)) map.set(countryId, new Map());
    map.get(countryId).set(domainOf(stat), scoreOf(stat));
  }
  return map;
}

export function getDomainMastery(domainMap, countryId, domain, fallback = 0) {
  const countryDomains = domainMap?.get(countryId);
  // No rows for this country at all: tests/session builders may pass a single
  // overall mastery as the 4th argument. Do not use that fallback when other
  // domain rows already exist — a missing domain is unseen (0), not "average".
  if (!countryDomains || countryDomains.size === 0) {
    return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  }
  const key = domain || DEFAULT_SKILL_DOMAIN;
  if (countryDomains.has(key)) return countryDomains.get(key);
  if (countryDomains.has(LEGACY_DOMAIN)) return countryDomains.get(LEGACY_DOMAIN);
  return 0;
}

export function hasDomainRow(domainMap, countryId, domain) {
  const countryDomains = domainMap?.get(countryId);
  if (!countryDomains) return false;
  return countryDomains.has(domain);
}

export function getOverallMastery(domainMap, countryId) {
  const countryDomains = domainMap?.get(countryId);
  if (!countryDomains || countryDomains.size === 0) return 0;

  if (countryDomains.size === 1 && countryDomains.has(LEGACY_DOMAIN)) {
    return countryDomains.get(LEGACY_DOMAIN) ?? 0;
  }

  let total = 0;
  let weightSum = 0;
  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    const score = countryDomains.get(domain) ?? 0;
    total += score * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? total / weightSum : 0;
}

/** Coerce sequencer masteryStats (Map / array / object) into a domain map. */
export function coerceDomainMasteryMap(masteryStats) {
  if (!masteryStats) return new Map();
  if (masteryStats instanceof Map) {
    const values = [...masteryStats.values()];
    if (values[0] instanceof Map) return masteryStats;
    const rows = [];
    for (const [countryId, value] of masteryStats) {
      if (value instanceof Map) {
        for (const [domain, score] of value) {
          rows.push({ countryId, skillDomain: domain, masteryScore: score });
        }
        continue;
      }
      rows.push({
        countryId: value?.countryId ?? countryId,
        skillDomain: domainOf(value),
        masteryScore:
          typeof value === "number" ? value : scoreOf(value),
      });
    }
    return buildDomainMasteryMap(rows);
  }
  if (Array.isArray(masteryStats)) return buildDomainMasteryMap(masteryStats);
  if (typeof masteryStats === "object") {
    return buildDomainMasteryMap(
      Object.entries(masteryStats).map(([countryId, value]) => ({
        countryId,
        skillDomain: domainOf(value),
        masteryScore: typeof value === "number" ? value : scoreOf(value),
      }))
    );
  }
  return new Map();
}
