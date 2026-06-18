export const GAME_MODES = {
  COUNTRIES: "countries",
  CAPITALS: "capitals",
};

export const REGIONS = [
  { id: "world", label: "World" },
  { id: "africa", label: "Africa" },
  { id: "asia", label: "Asia" },
  { id: "europe", label: "Europe" },
  { id: "northAmerica", label: "North America" },
  { id: "southAmerica", label: "South America" },
];

export function filterCountriesByRegion(countries, regionId) {
  if (regionId === "world") return countries;
  return countries.filter((country) => country.region === regionId);
}

export function buildGameGeojson(countries) {
  return {
    type: "FeatureCollection",
    features: countries.map((country) => country.feature),
  };
}
