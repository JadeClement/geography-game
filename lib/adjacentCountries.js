export function getAdjacentCountryNames(country, countriesById) {
  if (!country?.neighbors?.length || !countriesById) return [];

  return country.neighbors
    .map((neighborId) => countriesById.get(neighborId))
    .filter(Boolean)
    .map((neighbor) => neighbor.name)
    .sort((a, b) => a.localeCompare(b));
}
