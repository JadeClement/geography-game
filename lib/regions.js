import countriesManifest from "@/data/countries.json";

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

const REGION_COUNTRY_TOTALS = countriesManifest.countries.reduce(
  (totals, country) => {
    if (!country.enabled) return totals;
    totals.world += 1;
    const region = country.region ?? "world";
    totals[region] = (totals[region] ?? 0) + 1;
    return totals;
  },
  { world: 0 }
);

export function getRegionCountryTotal(regionId) {
  return REGION_COUNTRY_TOTALS[regionId] ?? REGION_COUNTRY_TOTALS.world;
}

export function formatGameScore(score, regionId) {
  if (score == null) return "—";
  return `${score}/${getRegionCountryTotal(regionId)}`;
}

export function filterCountriesByRegion(countries, regionId) {
  if (regionId === "world") return countries;
  return countries.filter((country) => country.region === regionId);
}

export function buildInactiveGeojson(allCountries, activeRegionId) {
  if (activeRegionId === "world") {
    return { type: "FeatureCollection", features: [] };
  }

  return buildGameGeojson(
    allCountries.filter((country) => country.region !== activeRegionId)
  );
}

export function buildGameGeojson(countries) {
  return {
    type: "FeatureCollection",
    features: countries.map((country) => country.feature),
  };
}
