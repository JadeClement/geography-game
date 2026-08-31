import { normalizeName } from "../nameUtils.js";

function toMatch(country) {
  if (!country?.id || !country.name) return null;
  return { id: country.id, name: country.name };
}

/**
 * Resolve a learner guess (typed name or iso3) to any known country.
 * Exact / normalized match only — no fuzzy spelling.
 *
 * @param {unknown} selectedValue
 * @param {{ allCountriesById: Map<string, { id: string, name: string }> }} opts
 * @returns {{ id: string, name: string } | null}
 */
export function resolveGuessedCountry(
  selectedValue,
  { allCountriesById } = {}
) {
  if (typeof selectedValue !== "string" || !selectedValue.trim()) return null;
  if (!allCountriesById) return null;

  if (allCountriesById.has(selectedValue)) {
    return toMatch(allCountriesById.get(selectedValue));
  }

  const normalized = normalizeName(selectedValue);
  if (!normalized) return null;
  for (const country of allCountriesById.values()) {
    if (normalizeName(country.name) === normalized) {
      return toMatch(country);
    }
  }
  return null;
}

/**
 * Resolve a learner guess to a country on the current regional map.
 * World-list matches that aren't in the region return null (no paint / no pan).
 *
 * @param {unknown} selectedValue
 * @param {{ allCountriesById: Map<string, { id: string, name: string }>, activeCountries: Array<{ id: string, name: string }>, excludeIds?: Iterable<string> }} opts
 * @returns {{ id: string, name: string } | null}
 */
export function resolveGuessedCountryInRegion(
  selectedValue,
  { allCountriesById, activeCountries, excludeIds = [] } = {}
) {
  if (!Array.isArray(activeCountries)) return null;

  const match = resolveGuessedCountry(selectedValue, { allCountriesById });
  if (!match) return null;

  const excluded = new Set(excludeIds);
  if (excluded.has(match.id)) return null;

  const activeIds = new Set(activeCountries.map((country) => country.id));
  if (!activeIds.has(match.id)) return null;

  return match;
}

/**
 * Shape-name miss: if the typed guess is a different real country, return it
 * so the UI can show both outlines. Nonsense / the correct country → null.
 *
 * @param {unknown} typedValue
 * @param {{ questionCountryId?: string, allCountriesById: Map<string, { id: string, name: string }> }} opts
 * @returns {{ id: string, name: string } | null}
 */
export function resolveShapeNameCompare(
  typedValue,
  { questionCountryId, allCountriesById } = {}
) {
  const guessed = resolveGuessedCountry(typedValue, { allCountriesById });
  if (!guessed || guessed.id === questionCountryId) return null;
  return guessed;
}
