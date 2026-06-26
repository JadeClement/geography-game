import { shiftLngForOceania } from "./globeProjection.js";

const SMALL_BBOX_AREA_THRESHOLD = 4;

/** Show a circle while the country shape is smaller than this on screen (px). */
export const MIN_CLICK_TARGET_PX = 40;

/** Circle stroke radius when visible on screen. */
export const CIRCLE_CLICK_RADIUS_PX = 8;

/** Larger markers while the game tutorial is open. */
export const TUTORIAL_CIRCLE_RADIUS_PX = 9;

/** Stroke width for tutorial small-country markers. */
export const TUTORIAL_CIRCLE_STROKE_WIDTH = 2;

/** High-contrast stroke for tutorial small-country markers. */
export const TUTORIAL_CIRCLE_STROKE_COLOR = "#38bdf8";

/** Larger pulsing marker when a small country is revealed / flashing. */
export const SMALL_COUNTRY_FLASH_RADIUS_PX = 22;

/** Archipelago overrides can have huge bboxes; measure a compact area instead. */
const ARCHIPELAGO_SPAN_CAP_DEG = 0.2;

/** Bbox max-axis above this is treated as a spread-out archipelago. */
const ARCHIPELAGO_SPAN_THRESHOLD_DEG = 2.5;

/** Compact countries that always get a marker (GeoJSON bbox can understate click difficulty). */
const SMALL_COUNTRY_OVERRIDES = new Set([
  "MUS", // Mauritius
  "SYC", // Seychelles
  "COM", // Comoros
  "MDV", // Maldives
  "STP", // Sao Tome and Principe
  "MHL", // Marshall Islands
  "PLW", // Palau
  "BRB", // Barbados
  "GRD", // Grenada
  "VCT", // St. Vincent and the Grenadines
  "KNA", // St. Kitts and Nevis
  "LCA", // St. Lucia
  "ATG", // Antigua and Barbuda
  "DMA", // Dominica
  "BHS", // Bahamas
  "TTO", // Trinidad and Tobago
  "SLB", // Solomon Islands — scattered archipelago, hard to spot when filled
  "FJI", // Fiji
  "VUT", // Vanuatu
  "WSM", // Samoa
  "TON", // Tonga
  "FSM", // Federated States of Micronesia
  "NRU", // Nauru
  "TUV", // Tuvalu
  "COK", // Cook Islands
  "NIU", // Niue
  "KIR", // Kiribati — spans the dateline, scattered atolls
]);

/** Countries with a small bbox that are still easy to click without a marker. */
const SMALL_COUNTRY_EXCLUSIONS = new Set([
  "BLZ", // Belize
  "SLV", // El Salvador
]);

/**
 * Naive coordinate averaging fails for dateline-spanning countries (e.g. Kiribati
 * lands near 37°E / Kenya). Use a representative anchor instead.
 */
export const CENTROID_OVERRIDES = {
  KIR: [173.0, 1.4], // Tarawa
  SLB: [160.2, -9.4], // Guadalcanal / Honiara
};

function walkCoords(coords, visit) {
  if (typeof coords[0] === "number") {
    visit(coords[0], coords[1]);
    return;
  }
  coords.forEach((part) => walkCoords(part, visit));
}

export function getBbox(feature) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];

  walkCoords(feature.geometry.coordinates, (x, y) => {
    bbox[0] = Math.min(bbox[0], x);
    bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x);
    bbox[3] = Math.max(bbox[3], y);
  });

  return bbox;
}

export function getBboxArea(feature) {
  const [minX, minY, maxX, maxY] = getBbox(feature);
  return (maxX - minX) * (maxY - minY);
}

export function getCentroid(feature) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  walkCoords(feature.geometry.coordinates, (x, y) => {
    sumX += x;
    sumY += y;
    count += 1;
  });

  if (count === 0) {
    const [minX, minY, maxX, maxY] = getBbox(feature);
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  return [sumX / count, sumY / count];
}

export function getCountryCentroid(feature, iso3) {
  if (iso3 && CENTROID_OVERRIDES[iso3]) {
    return CENTROID_OVERRIDES[iso3];
  }
  return getCentroid(feature);
}

function getCircleMeasureBbox(feature, iso3, centroid) {
  const [minLng, minLat, maxLng, maxLat] = getBbox(feature);
  const maxSpan = Math.max(maxLng - minLng, maxLat - minLat);

  if (
    iso3 &&
    SMALL_COUNTRY_OVERRIDES.has(iso3) &&
    maxSpan > ARCHIPELAGO_SPAN_THRESHOLD_DEG
  ) {
    const [lng, lat] = centroid;
    const pad = ARCHIPELAGO_SPAN_CAP_DEG;
    return {
      minLng: lng - pad,
      minLat: lat - pad,
      maxLng: lng + pad,
      maxLat: lat + pad,
    };
  }

  return { minLng, minLat, maxLng, maxLat };
}

/** Compact bbox used to decide when a small-country marker is still needed. */
export function getCountryMeasureBbox(feature, iso3, centroid) {
  return getCircleMeasureBbox(feature, iso3, centroid);
}

export function getBboxScreenSizePx({ minX, maxX, minY, maxY, viewWidth, containerWidth }) {
  if (!viewWidth || !containerWidth) return MIN_CLICK_TARGET_PX;
  const worldSize = Math.max(maxX - minX, maxY - minY);
  return (worldSize / viewWidth) * containerWidth;
}

export function shouldUseSmallCountryCircle(isSmall, screenSizePx) {
  if (!isSmall) return false;
  return screenSizePx < MIN_CLICK_TARGET_PX;
}

export function isSmallCountry(feature, iso3) {
  if (iso3 && SMALL_COUNTRY_EXCLUSIONS.has(iso3)) {
    return false;
  }
  if (iso3 && SMALL_COUNTRY_OVERRIDES.has(iso3)) {
    return true;
  }
  return getBboxArea(feature) < SMALL_BBOX_AREA_THRESHOLD;
}

export function buildSmallCountriesGeoJSON(countries) {
  const features = countries
    .filter((country) => country.isSmall)
    .map((country) => {
      const measureBbox = getCircleMeasureBbox(
        country.feature,
        country.id,
        country.centroid
      );

      return {
        type: "Feature",
        properties: {
          id: country.id,
          name: country.name,
          ...measureBbox,
        },
        geometry: {
          type: "Point",
          coordinates: country.centroid,
        },
      };
    });

  return { type: "FeatureCollection", features };
}

/** Per-region anchor overrides for countries whose centroid skews the initial map frame. */
const REGION_BOUNDS_ANCHOR_OVERRIDES = {
  europe: {
    RUS: [37.6, 55.75], // Moscow — European Russia, not Siberia
  },
  oceania: {
    KIR: CENTROID_OVERRIDES.KIR,
  },
};

function getBoundsAnchor(country, regionId) {
  const override = regionId
    ? REGION_BOUNDS_ANCHOR_OVERRIDES[regionId]?.[country.id]
    : null;
  return override ?? country.centroid;
}

function getOceaniaMapBounds(countries) {
  let minShiftedLng = Infinity;
  let maxShiftedLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const country of countries) {
    const [lng, lat] = getBoundsAnchor(country, "oceania");
    const shiftedLng = shiftLngForOceania(lng);
    minShiftedLng = Math.min(minShiftedLng, shiftedLng);
    maxShiftedLng = Math.max(maxShiftedLng, shiftedLng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minShiftedLng)) return null;

  const lngSpan = Math.max(maxShiftedLng - minShiftedLng, 12);
  const latSpan = Math.max(maxLat - minLat, 8);
  const lngPad = lngSpan * 0.12;
  const latPad = latSpan * 0.12;

  const south = minLat - latPad;
  const north = maxLat + latPad;
  const west = minShiftedLng - lngPad;

  // Mapbox treats east < west as bounds that cross the antimeridian.
  if (maxShiftedLng > 180) {
    return [
      [west, south],
      [maxShiftedLng - 360 + lngPad, north],
    ];
  }

  return [
    [west, south],
    [maxShiftedLng + lngPad, north],
  ];
}

function getOceaniaMapCamera(countries) {
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const country of countries) {
    const [, lat] = getBoundsAnchor(country, "oceania");
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minLat)) return null;

  const centerLat = (minLat + maxLat) / 2;

  return {
    type: "camera",
    // Center on the antimeridian so Australia sits left and Polynesia right.
    center: [175, centerLat],
    zoom: 2.95,
    padding: 48,
  };
}

export function getMapViewForRegion(countries, regionId) {
  if (countries.length === 0) return null;

  if (regionId === "oceania") {
    return getOceaniaMapCamera(countries);
  }

  const bounds = getBoundsFromCountries(countries, regionId);
  return bounds ? { type: "bounds", bounds, padding: 48, maxZoom: 5 } : null;
}

export function getBoundsFromCountries(countries, regionId) {
  if (countries.length === 0) return null;

  if (regionId === "oceania") {
    return getOceaniaMapBounds(countries);
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const country of countries) {
    const [lng, lat] = getBoundsAnchor(country, regionId);
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minLng)) return null;

  const lngSpan = Math.max(maxLng - minLng, 8);
  const latSpan = Math.max(maxLat - minLat, 8);
  const lngPad = lngSpan * 0.15;
  const latPad = latSpan * 0.15;

  return [
    [minLng - lngPad, minLat - latPad],
    [maxLng + lngPad, maxLat + latPad],
  ];
}
