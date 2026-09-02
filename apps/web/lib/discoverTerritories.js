/**
 * Non-playable overseas scraps that show up on regional maps.
 *
 * Discover: clicking them opens an informational note instead of a discovery.
 * Learn/Test: the same match drives a "This is X" toast instead of
 * "wrong continent" — these places sit on the wrong-continent layer even when
 * they are territories of a European country, not a different continent.
 *
 * Disabled countries with their own GeoJSON are drawn as outlined inactive-style
 * land. French Caribbean / Guiana scraps (and Bonaire) are part of FRA / NLD
 * and only match via bbox.
 */

import countriesManifest from "@/data/countries.json";
import { getRegionLabel } from "@worldly/core/regions";

function pointInBbox(lngLat, bbox) {
  if (!lngLat || !bbox) return false;
  const lng = lngLat.lng ?? lngLat[0];
  const lat = lngLat.lat ?? lngLat[1];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  return (
    lng >= bbox.minLng &&
    lng <= bbox.maxLng &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
}

const CARIBBEAN_SA_REGIONS = ["northAmerica", "southAmerica"];

export const FALLBACK_OUT_OF_REGION_FEEDBACK = {
  text: "Oops that's not the right continent!",
  type: "wrong",
};

export function territoryClickMessage(name) {
  const label = typeof name === "string" ? name.trim() : "";
  if (!label) return "This is not a country.";
  if (/territor/i.test(label)) {
    return `This is not a country — it is the ${label}.`;
  }
  return `This is not a country — it is the ${label} territory.`;
}

function noteFromDisabledCountry(country) {
  const message = territoryClickMessage(country.name);
  return {
    id: country.iso3,
    parentIso3: country.iso3,
    displayAsTerritory: true,
    title: country.name,
    detail: message,
    message,
  };
}

/**
 * Overseas departments / municipalities that share a parent country's GeoJSON
 * (France, Netherlands) instead of having their own feature.
 */
const PARENT_SCRAP_NOTES = [
  {
    id: "GUF",
    parentIso3: "FRA",
    regions: CARIBBEAN_SA_REGIONS,
    // Mainland French Guiana (excludes metropolitan France).
    bbox: { minLng: -55.5, minLat: 1.5, maxLng: -50.5, maxLat: 6.5 },
    title: "French Guiana",
  },
  {
    id: "GLP",
    parentIso3: "FRA",
    regions: CARIBBEAN_SA_REGIONS,
    // Guadeloupe plus Marie-Galante, La Désirade, and Les Saintes.
    bbox: { minLng: -62.0, minLat: 15.7, maxLng: -60.8, maxLat: 16.65 },
    title: "Guadeloupe",
  },
  {
    id: "MTQ",
    parentIso3: "FRA",
    regions: CARIBBEAN_SA_REGIONS,
    bbox: { minLng: -61.45, minLat: 14.25, maxLng: -60.6, maxLat: 15.05 },
    title: "Martinique",
  },
  {
    id: "BES",
    parentIso3: "NLD",
    regions: CARIBBEAN_SA_REGIONS,
    // Bonaire (Caribbean Netherlands) — sits next to Curaçao on the map.
    bbox: { minLng: -68.6, minLat: 11.85, maxLng: -68.0, maxLat: 12.5 },
    title: "Bonaire",
  },
].map((note) => {
  const message = territoryClickMessage(note.title);
  return { ...note, detail: message, message };
});

export const DISABLED_TERRITORY_NOTES = countriesManifest.countries
  .filter((country) => !country.enabled)
  .map(noteFromDisabledCountry);

export const DISCOVER_TERRITORY_NOTES = [
  ...PARENT_SCRAP_NOTES,
  ...DISABLED_TERRITORY_NOTES,
];

/** ISO3 codes of disabled countries that should still be outlined on the map. */
export function getDisplayTerritoryIso3s() {
  return new Set(DISABLED_TERRITORY_NOTES.map((note) => note.id));
}

/**
 * @returns {typeof DISCOVER_TERRITORY_NOTES[number] | null}
 */
export function matchDiscoverTerritoryNote({ countryId, lngLat, regionId }) {
  if (!countryId) return null;

  for (const note of DISCOVER_TERRITORY_NOTES) {
    if (note.parentIso3 !== countryId && note.id !== countryId) continue;
    if (
      note.regions &&
      regionId &&
      regionId !== "world" &&
      !note.regions.includes(regionId)
    ) {
      continue;
    }
    if (note.bbox && !pointInBbox(lngLat, note.bbox)) continue;
    return note;
  }

  return null;
}

function countryIdFromFeature(feature) {
  return feature?.properties?.id ?? feature?.id ?? null;
}

function countryNameFromFeature(feature, allCountriesById) {
  const countryId = countryIdFromFeature(feature);
  const listed = countryId ? allCountriesById?.get(countryId) : null;
  if (listed?.name) return listed.name;
  const rawName = feature?.properties?.name;
  return typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
}

/**
 * Toast for an out-of-region / inactive land click during Learn or Test.
 * Names the place and, for overseas scraps, says what it actually is.
 *
 * @returns {{ text: string, type: string, detail?: string }}
 */
export function getOutOfRegionClickFeedback({
  feature,
  lngLat,
  regionId,
  allCountriesById,
} = {}) {
  const countryId = countryIdFromFeature(feature);
  const note = matchDiscoverTerritoryNote({ countryId, lngLat, regionId });
  if (note) {
    return {
      text: `This is ${note.title}`,
      type: "wrong",
      detail: note.detail ?? note.message,
    };
  }

  const name = countryNameFromFeature(feature, allCountriesById);
  if (name) {
    const listed = countryId ? allCountriesById?.get(countryId) : null;
    const continent = listed?.region ? getRegionLabel(listed.region) : null;
    return {
      text: `This is ${name}`,
      type: "wrong",
      detail: continent ? `It's a country in ${continent}.` : undefined,
    };
  }

  return FALLBACK_OUT_OF_REGION_FEEDBACK;
}
