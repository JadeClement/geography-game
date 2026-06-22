import countriesManifest from "@/data/countries.json";
import { displayName, GEOJSON_PATH, normalizeName, resolveIso3 } from "./constants";
import { resolveIso2 } from "./flags";
import { GAME_MODES } from "./regions";
import {
  buildSmallCountriesGeoJSON,
  getCentroid,
  isSmallCountry,
} from "./geometry";

function getManifestByIso3() {
  return new Map(
    countriesManifest.countries.map((country) => [country.iso3, country])
  );
}

export function getEnabledCountryCount() {
  return countriesManifest.countries.filter((country) => country.enabled).length;
}

export async function loadCountriesGeoJSON() {
  const manifestByIso3 = getManifestByIso3();

  const response = await fetch(GEOJSON_PATH);
  if (!response.ok) {
    throw new Error(`Country boundaries request failed (${response.status})`);
  }
  const geojson = await response.json();

  const countries = geojson.features
    .map((feature) => {
      const rawName = feature.properties?.name ?? "Unknown";
      const iso3 = resolveIso3(
        rawName,
        feature.properties?.["ISO3166-1-Alpha-3"] ??
          feature.properties?.iso_a3 ??
          feature.properties?.ISO_A3
      );

      if (!iso3) return null;

      const manifest = manifestByIso3.get(iso3);
      if (!manifest?.enabled) return null;

      const enrichedFeature = {
        ...feature,
        properties: {
          ...feature.properties,
          id: iso3,
          capital: manifest.capital,
        },
      };

      const iso2 = resolveIso2(
        iso3,
        feature.properties?.["ISO3166-1-Alpha-2"] ??
          feature.properties?.iso_a2 ??
          feature.properties?.ISO_A2
      );

      return {
        id: iso3,
        name: manifest.name || displayName(rawName),
        capital: manifest.capital,
        population: manifest.population ?? null,
        languages: Array.isArray(manifest.languages) ? manifest.languages : [],
        neighbors: Array.isArray(manifest.neighbors) ? manifest.neighbors : [],
        facts: Array.isArray(manifest.facts) ? manifest.facts : [],
        iso2,
        region: manifest.region ?? "world",
        rawName,
        isSmall: isSmallCountry(enrichedFeature, iso3),
        centroid: getCentroid(enrichedFeature),
        feature: enrichedFeature,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    countries,
    geojson: {
      type: "FeatureCollection",
      features: countries.map((c) => c.feature),
    },
    smallCountriesGeojson: buildSmallCountriesGeoJSON(countries),
    manifest: countriesManifest,
  };
}

export function pickRandomCountry(countries) {
  if (countries.length === 0) return null;
  return countries[Math.floor(Math.random() * countries.length)];
}

export function shuffleCountries(countries) {
  const copy = [...countries];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function countryFromFeature(feature, countries) {
  if (!feature?.properties) return null;
  const id = feature.properties.id ?? feature.id;
  return countries.find((c) => c.id === id) ?? null;
}

export function isCorrectCountry(clicked, target) {
  if (!clicked || !target) return false;
  return (
    clicked.id === target.id ||
    normalizeName(clicked.name) === normalizeName(target.name)
  );
}

function normalizeCapital(value) {
  return value.trim().toLowerCase();
}

export function isCorrectTextAnswer(input, target, mode) {
  if (!input || !target) return false;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return false;

  if (mode === GAME_MODES.CAPITALS) {
    return normalizeCapital(target.capital ?? "") === normalized;
  }

  return normalizeName(target.name) === normalized;
}