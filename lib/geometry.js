const SMALL_BBOX_AREA_THRESHOLD = 4;

/** Show a circle while the country shape is smaller than this on screen (px). */
export const MIN_CLICK_TARGET_PX = 40;

/** Circle stroke radius when visible on screen. */
export const CIRCLE_CLICK_RADIUS_PX = 6;

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
]);

/** Countries with a small bbox that are still easy to click without a marker. */
const SMALL_COUNTRY_EXCLUSIONS = new Set([
  "BLZ", // Belize
  "SLV", // El Salvador
]);

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
};

function getBoundsAnchor(country, regionId) {
  const override = regionId
    ? REGION_BOUNDS_ANCHOR_OVERRIDES[regionId]?.[country.id]
    : null;
  return override ?? country.centroid;
}

export function getBoundsFromCountries(countries, regionId) {
  if (countries.length === 0) return null;

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
