import countriesManifest from "@/data/countries.json";

export const GAME_MODES = {
  COUNTRIES: "countries",
  CAPITALS: "capitals",
  FLAGS: "flags",
};

export function getModeLabel(mode) {
  if (mode === GAME_MODES.CAPITALS) return "Capitals";
  if (mode === GAME_MODES.FLAGS) return "Flags";
  return "Countries";
}

export const REGIONS = [
  { id: "world", label: "World" },
  { id: "africa", label: "Africa" },
  { id: "asia", label: "Asia" },
  { id: "europe", label: "Europe" },
  { id: "northAmerica", label: "North America" },
  { id: "oceania", label: "Oceania" },
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

const ENABLED_COUNTRY_IDS = countriesManifest.countries
  .filter((country) => country.enabled)
  .map((country) => country.iso3);

const REGION_COUNTRY_IDS = countriesManifest.countries.reduce((map, country) => {
  if (!country.enabled) return map;
  const region = country.region ?? "world";
  if (!map[region]) map[region] = [];
  map[region].push(country.iso3);
  return map;
}, {});

export function getCountryIdsForRegion(regionId) {
  if (regionId === "world") return ENABLED_COUNTRY_IDS;
  return REGION_COUNTRY_IDS[regionId] ?? [];
}

const COUNTRY_REGION = countriesManifest.countries.reduce((map, country) => {
  if (country.enabled) map[country.iso3] = country.region ?? "world";
  return map;
}, {});

export function getRegionForCountry(iso3) {
  return COUNTRY_REGION[iso3] ?? null;
}

export function getRegionLabel(regionId) {
  return REGIONS.find((region) => region.id === regionId)?.label ?? null;
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
