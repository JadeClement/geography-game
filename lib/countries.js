import polygonClipping from "polygon-clipping";
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

/**
 * Non-country polygons whose geometry should be absorbed into a recognized
 * country instead of rendered separately (keyed by lowercased GeoJSON name).
 * e.g. the breakaway "Somaliland" feature is drawn as part of Somalia.
 */
const MERGE_INTO_ISO3 = {
  somaliland: "SOM",
};

function polygonsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function combineAsMultiPolygon(geometry, extras) {
  const polygons = [...polygonsFromGeometry(geometry)];
  for (const extra of extras) {
    polygons.push(...polygonsFromGeometry(extra));
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

function mergeGeometryWithExtras(geometry, extras) {
  if (!extras || extras.length === 0) return geometry;

  // A true union dissolves the shared border between the geometries (e.g. the
  // Somalia / Somaliland boundary) instead of leaving an internal outline.
  try {
    const [base, ...rest] = [geometry, ...extras]
      .map(polygonsFromGeometry)
      .filter((polys) => polys.length > 0);
    if (base) {
      const unioned = polygonClipping.union(base, ...rest);
      if (Array.isArray(unioned) && unioned.length > 0) {
        return { type: "MultiPolygon", coordinates: unioned };
      }
    }
  } catch {
    // Fall back to a plain combine if the union fails for any reason.
  }

  return combineAsMultiPolygon(geometry, extras);
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

  const baseLandFeatures = [];

  // First pass: collect geometries that should be merged into a parent country.
  const mergedGeomsByIso3 = new Map();
  for (const feature of geojson.features) {
    const key = (feature.properties?.name ?? "").trim().toLowerCase();
    const parent = MERGE_INTO_ISO3[key];
    if (parent) {
      const list = mergedGeomsByIso3.get(parent) ?? [];
      list.push(feature.geometry);
      mergedGeomsByIso3.set(parent, list);
    }
  }

  const countries = geojson.features
    .map((feature) => {
      const rawName = feature.properties?.name ?? "Unknown";

      // Skip polygons that get absorbed into a parent country's geometry.
      if (MERGE_INTO_ISO3[rawName.trim().toLowerCase()]) return null;

      const iso3 = resolveIso3(
        rawName,
        feature.properties?.["ISO3166-1-Alpha-3"] ??
          feature.properties?.iso_a3 ??
          feature.properties?.ISO_A3
      );

      const manifest = iso3 ? manifestByIso3.get(iso3) : null;

      if (!manifest || !manifest.enabled) {
        // Any land that isn't a playable country (disputed territories,
        // dependencies, unclaimed areas) becomes neutral base land so it can be
        // hatched rather than left as a black hole on the map.
        baseLandFeatures.push({
          ...feature,
          properties: { ...feature.properties, id: iso3 ?? rawName, playable: false },
        });
        return null;
      }

      const geometry = mergeGeometryWithExtras(
        feature.geometry,
        mergedGeomsByIso3.get(iso3)
      );

      const enrichedFeature = {
        ...feature,
        geometry,
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
        area: typeof manifest.area === "number" ? manifest.area : null,
        landlocked:
          typeof manifest.landlocked === "boolean" ? manifest.landlocked : null,
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
    baseLandGeojson: {
      type: "FeatureCollection",
      features: baseLandFeatures,
    },
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