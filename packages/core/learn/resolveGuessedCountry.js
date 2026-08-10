import { normalizeName } from "../nameUtils.js";

/**
 * Resolve a learner guess (typed name or iso3) to a country on the current
 * regional map. Exact / normalized match only — no fuzzy spelling.
 *
 * @param {unknown} selectedValue
 * @param {{ allCountriesById: Map<string, { id: string, name: string }>, activeCountries: Array<{ id: string, name: string }>, excludeIds?: Iterable<string> }} opts
 * @returns {{ id: string, name: string } | null}
 */
export function resolveGuessedCountryInRegion(
  selectedValue,
  { allCountriesById, activeCountries, excludeIds = [] } = {}
) {
  if (typeof selectedValue !== "string" || !selectedValue.trim()) return null;
  if (!allCountriesById || !Array.isArray(activeCountries)) return null;

  const excluded = new Set(excludeIds);
  const activeIds = new Set(activeCountries.map((country) => country.id));

  let match = null;
  if (allCountriesById.has(selectedValue)) {
    match = allCountriesById.get(selectedValue);
  } else {
    const normalized = normalizeName(selectedValue);
    if (!normalized) return null;
    for (const country of activeCountries) {
      if (normalizeName(country.name) === normalized) {
        match = country;
        break;
      }
    }
    // Typed name might match a known country outside the region — still resolve
    // by world list, then fail the region check below (no paint / no pan).
    if (!match) {
      for (const country of allCountriesById.values()) {
        if (normalizeName(country.name) === normalized) {
          match = country;
          break;
        }
      }
    }
  }

  if (!match?.id || !match.name) return null;
  if (excluded.has(match.id)) return null;
  if (!activeIds.has(match.id)) return null;

  return { id: match.id, name: match.name };
}
