import countriesManifest from "@/data/countries.json";
import countryHighlights from "@/data/country-highlights.json";
import capitalAlternates from "@/data/capital-alternates.json";
import { isCorrectCapitalAnswer } from "./capitals.js";
import { displayName, GEOJSON_PATH, normalizeName, resolveIso3 } from "./constants";
import { resolveIso2 } from "./flags";
import { GAME_MODES } from "./regions";
import {
  buildSmallCountriesGeoJSON,
  getCountryCentroid,
  isSmallCountry,
} from "./geometry";

function getManifestByIso3() {
  return new Map(
    countriesManifest.countries.map((country) => [country.iso3, country])
  );
}

function buildCountryFacts(manifestFacts, iso3) {
  const facts = Array.isArray(manifestFacts) ? [...manifestFacts] : [];
  const highlightText = countryHighlights.highlights?.[iso3];
  if (highlightText) {
    facts.push({ category: "highlight", text: highlightText });
  }
  return facts;
}

export function getEnabledCountryCount() {
  return countriesManifest.countries.filter((country) => country.enabled).length;
}

let cachedGeoJSONPromise = null;

async function fetchCountriesGeoJSON() {
  const manifestByIso3 = getManifestByIso3();

  let response;
  try {
    response = await fetch(GEOJSON_PATH, { signal: AbortSignal.timeout(10000) });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error("Country boundaries request timed out. Please refresh and try again.");
    }
    throw error;
  }
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
        capitalAlternates: capitalAlternates.alternates?.[iso3] ?? [],
        population: manifest.population ?? null,
        languages: Array.isArray(manifest.languages) ? manifest.languages : [],
        neighbors: Array.isArray(manifest.neighbors) ? manifest.neighbors : [],
        facts: buildCountryFacts(manifest.facts, iso3),
        iso2,
        region: manifest.region ?? "world",
        rawName,
        isSmall: isSmallCountry(enrichedFeature, iso3),
        centroid: getCountryCentroid(enrichedFeature, iso3),
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

export function loadCountriesGeoJSON() {
  if (!cachedGeoJSONPromise) {
    cachedGeoJSONPromise = fetchCountriesGeoJSON().catch((error) => {
      cachedGeoJSONPromise = null;
      throw error;
    });
  }
  return cachedGeoJSONPromise;
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

export function isCorrectTextAnswer(input, target, mode) {
  if (!input || !target) return false;

  if (mode === GAME_MODES.CAPITALS) {
    return isCorrectCapitalAnswer(input, target);
  }

  return normalizeName(input) === normalizeName(target.name);
}