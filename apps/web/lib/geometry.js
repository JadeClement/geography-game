import { shiftLngForOceania } from "./globeProjection.js";
import { polylabel } from "./polylabel.js";

const SMALL_BBOX_AREA_THRESHOLD = 4;

/** Show a circle while the country shape is smaller than this on screen (px). */
export const MIN_CLICK_TARGET_PX = 40;

/** Circle stroke radius when visible on screen. */
export const CIRCLE_CLICK_RADIUS_PX = 8;

/** Stroke width for small-country marker rings. */
export const CIRCLE_STROKE_WIDTH = 1;

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
  "CPV", // Cape Verde — archipelago bbox (~6.4°) exceeds the small threshold, but land is invisible at Africa zoom
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
  "TLS", // Timor-Leste (East Timor) — small and easy to miss when flashing
]);

/** Countries with a small bbox that are still easy to click without a marker. */
const SMALL_COUNTRY_EXCLUSIONS = new Set([
  "BLZ", // Belize
  "SLV", // El Salvador
  "PRI", // Puerto Rico — large enough to click without a marker
]);

/**
 * Naive coordinate averaging fails for dateline-spanning countries (e.g. Kiribati
 * lands near 37°E / Kenya) and for overseas territories. Used for framing,
 * markers, and as the label visual-center pin for these countries.
 */
export const CENTROID_OVERRIDES = {
  KIR: [173.0, 1.4], // Tarawa
  SLB: [160.2, -9.4], // Guadalcanal / Honiara
  FRA: [2.3522, 48.8566], // Paris — overseas territories skew centroid toward Spain
  NLD: [4.9041, 52.3676], // Amsterdam — Caribbean territories skew centroid north
  ESP: [-3.7038, 40.4168], // Madrid — Canaries / exclaves skew west-southwest
  PRT: [-9.1393, 38.7223], // Lisbon — Azores / Madeira skew into the Atlantic
};

/** Use a compact measure bbox around the representative centroid, not the full territory span. */
const METROPOLITAN_MEASURE_BBOX_OVERRIDES = new Set(["FRA", "NLD", "ESP", "PRT"]);
const METROPOLITAN_MEASURE_BBOX_PAD_DEG = 4;

/**
 * Drop tiny island polygons when anchoring labels on countries with a dominant
 * mainland (Portugal+Azores, Spain+Canaries, France+DOM-TOM, etc.).
 * Keep any polygon at least this fraction of the largest polygon's area.
 *
 * French Guiana is ~11% of metropolitan France — above a 10% cutoff — so the
 * threshold sits above that. Overseas scraps still get an extra distance filter
 * for METROPOLITAN_MEASURE_BBOX_OVERRIDES countries.
 */
const MAINLAND_POLYGON_AREA_FRACTION = 0.15;
/** Max degrees from the metropolitan centroid for FRA/ESP/PRT/NLD mainland parts. */
const METROPOLITAN_POLYGON_MAX_DISTANCE_DEG = 12;

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

const visualCenterCache = new WeakMap();

function visualCenterPrecision(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return 0.01;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  const span = Math.min(maxX - minX, maxY - minY);
  if (!Number.isFinite(span) || span <= 0) return 0.01;
  return Math.max(span / 80, 0.0005);
}

function visualCenterForPolygons(polygons) {
  let best = null;
  let bestDistance = -Infinity;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon?.[0]) || polygon[0].length < 4) continue;
    const result = polylabel(polygon, visualCenterPrecision(polygon[0]));
    if (!result || result.length < 2) continue;
    const distance = result.distance ?? 0;
    if (distance > bestDistance) {
      bestDistance = distance;
      best = [result[0], result[1]];
    }
  }
  return best;
}

/**
 * Interior label anchor (pole of inaccessibility). Overseas / dateline
 * overrides still win so France/Kiribati stay pinned to the metropolitan body.
 */
export function getCountryVisualCenter(feature, iso3) {
  if (iso3 && CENTROID_OVERRIDES[iso3]) {
    return CENTROID_OVERRIDES[iso3];
  }
  if (!feature?.geometry) return null;

  const cached = visualCenterCache.get(feature.geometry);
  if (cached) return cached;

  const polygons = getMainlandPolygons(feature.geometry, iso3);
  const center = visualCenterForPolygons(polygons) ?? getCentroid(feature);
  if (center) visualCenterCache.set(feature.geometry, center);
  return center;
}

function getCircleMeasureBbox(feature, iso3, centroid) {
  if (iso3 && METROPOLITAN_MEASURE_BBOX_OVERRIDES.has(iso3) && centroid) {
    const [lng, lat] = centroid;
    const pad = METROPOLITAN_MEASURE_BBOX_PAD_DEG;
    return {
      minLng: lng - pad,
      minLat: lat - pad,
      maxLng: lng + pad,
      maxLat: lat + pad,
    };
  }

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

/** Project a measure bbox to a screen-space rect via the supplied lng/lat projector. */
export function projectMeasureBboxToScreenRect(measureBbox, projectLngLat) {
  if (!measureBbox) return null;

  const { minLng, minLat, maxLng, maxLat } = measureBbox;
  const corners = [
    [minLng, maxLat],
    [maxLng, maxLat],
    [maxLng, minLat],
    [minLng, minLat],
  ];

  const points = corners.map(([lng, lat]) => projectLngLat(lng, lat)).filter(Boolean);
  if (points.length === 0) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

export function getCountryScreenBounds(country, projectLngLat) {
  const measureBbox = getCountryMeasureBbox(country.feature, country.id, country.centroid);
  const rect = projectMeasureBboxToScreenRect(measureBbox, projectLngLat);
  if (!rect) return null;

  return {
    countryId: country.id,
    ...rect,
  };
}

/**
 * Pixel AABB of the country as it is drawn on the map (mainland / metropolitan
 * rings), not the compact circle-marker bbox. Used to size shape-drop ghosts.
 */
export function getCountryFillScreenBounds(country, projectLngLat) {
  if (!country?.feature?.geometry || typeof projectLngLat !== "function") return null;

  const mainland = getMainlandPolygons(country.feature.geometry, country.id);
  if (mainland.length === 0) return getCountryScreenBounds(country, projectLngLat);

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let count = 0;

  for (const polygon of mainland) {
    walkCoords(polygon, (lng, lat) => {
      const point = projectLngLat(lng, lat);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
      count += 1;
    });
  }

  if (count === 0 || !(right > left) || !(bottom > top)) return null;

  return {
    countryId: country.id,
    left,
    top,
    right,
    bottom,
  };
}

const VISIBLE_ANCHOR_MAX_SAMPLES = 320;
/** Use the precomputed visual center only when most of the mainland is in view. */
const VISIBLE_ANCHOR_MOSTLY_ONSCREEN = 0.45;

function ringArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function polygonExteriorArea(polygon) {
  return ringArea(polygon?.[0]);
}

function polygonCentroidLngLat(polygon) {
  const ring = polygon?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return null;

  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    sumLng += point[0];
    sumLat += point[1];
    count += 1;
  }
  if (count === 0) return null;
  return [sumLng / count, sumLat / count];
}

/**
 * Prefer the dominant mainland for label anchors. Small overseas islands that are
 * still in view (Azores, Canaries, DOM-TOM) would otherwise pull the average
 * out into the ocean. For FRA/ESP/PRT/NLD, also drop large-but-distant overseas
 * land (French Guiana) that survives the area filter.
 */
export function getMainlandPolygons(geometry, iso3) {
  if (!geometry) return [];

  if (geometry.type === "Polygon") {
    return geometry.coordinates ? [geometry.coordinates] : [];
  }

  if (geometry.type !== "MultiPolygon" || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  const polygons = geometry.coordinates;
  if (polygons.length <= 1) return polygons;

  let maxArea = 0;
  const areas = polygons.map((polygon) => {
    const area = polygonExteriorArea(polygon);
    maxArea = Math.max(maxArea, area);
    return area;
  });

  if (maxArea <= 0) return polygons;

  const threshold = maxArea * MAINLAND_POLYGON_AREA_FRACTION;
  let mainland = polygons.filter((_, index) => areas[index] >= threshold);
  if (mainland.length === 0) mainland = polygons;

  const metropolitanCentroid =
    iso3 && METROPOLITAN_MEASURE_BBOX_OVERRIDES.has(iso3)
      ? CENTROID_OVERRIDES[iso3]
      : null;
  if (metropolitanCentroid) {
    const [baseLng, baseLat] = metropolitanCentroid;
    const metro = mainland.filter((polygon) => {
      const centroid = polygonCentroidLngLat(polygon);
      if (!centroid) return false;
      const [lng, lat] = centroid;
      return (
        Math.hypot(lng - baseLng, lat - baseLat) <=
        METROPOLITAN_POLYGON_MAX_DISTANCE_DEG
      );
    });
    if (metro.length > 0) mainland = metro;
  }

  return mainland;
}

function countPolygonsVertices(polygons) {
  let count = 0;
  for (const polygon of polygons) {
    walkCoords(polygon, () => {
      count += 1;
    });
  }
  return count;
}

function pointInScreenRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function averagePoints(points) {
  if (points.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

/**
 * Anchor labels at the visual center of the country (pole of inaccessibility)
 * when that point — and most of the mainland — is on-screen. Averaging outline
 * vertices pulls C-shaped countries (Croatia) onto a neighbor's border.
 *
 * If the country is clipped by the viewport, fall back to the average of
 * visible vertices so a pan onto Dalmatia does not pin the title at off-map
 * Zagreb. Returns null when no sampled geometry is on-screen.
 */
export function getCountryVisibleScreenAnchor(country, projectLngLat, viewportRect) {
  if (!country?.feature?.geometry || !viewportRect) return null;

  const mainlandPolygons = getMainlandPolygons(
    country.feature.geometry,
    country.id
  );
  const vertexCount = countPolygonsVertices(mainlandPolygons);
  if (vertexCount === 0) return null;

  const sampleStep = Math.max(1, Math.ceil(vertexCount / VISIBLE_ANCHOR_MAX_SAMPLES));
  const visiblePoints = [];
  let sampled = 0;
  let index = 0;

  for (const polygon of mainlandPolygons) {
    walkCoords(polygon, (lng, lat) => {
      if (index % sampleStep !== 0) {
        index += 1;
        return;
      }
      index += 1;
      sampled += 1;

      const point = projectLngLat(lng, lat);
      if (point && pointInScreenRect(point.x, point.y, viewportRect)) {
        visiblePoints.push(point);
      }
    });
  }

  if (visiblePoints.length === 0) return null;

  const visualCenter =
    country.visualCenter ?? getCountryVisualCenter(country.feature, country.id);
  if (visualCenter) {
    const projected = projectLngLat(visualCenter[0], visualCenter[1]);
    const mostlyVisible =
      sampled > 0 && visiblePoints.length / sampled >= VISIBLE_ANCHOR_MOSTLY_ONSCREEN;
    if (
      projected &&
      pointInScreenRect(projected.x, projected.y, viewportRect) &&
      mostlyVisible
    ) {
      return projected;
    }
  }

  return averagePoints(visiblePoints);
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

/** How much larger the Learn focus frame is vs the sum of country areas. */
export const LEARN_FOCUS_AREA_MULTIPLIER = 3;

/**
 * Language prompts: countries at/above ~Nepal stay on the region view. Smaller
 * ones get a gentle close-up (see getLearnLanguageFocusMapView).
 */
export const LEARN_LANGUAGE_REGION_MIN_AREA_KM2 = 140_000;

/** Soft framing for small language-question subjects — lots of context, low zoom. */
export const LEARN_LANGUAGE_FOCUS_AREA_MULTIPLIER = 24;
export const LEARN_LANGUAGE_FOCUS_MAX_ZOOM = 4;

const KM_PER_DEG_LAT = 111.32;

/**
 * Subject country plus its land neighbors (for Learn focus framing).
 * @param {object} country
 * @param {Map<string, object>} allCountriesById
 */
export function getCountryWithNeighbors(country, allCountriesById) {
  if (!country) return [];
  const seen = new Set([country.id]);
  const list = [country];
  for (const id of country.neighbors ?? []) {
    if (!id || seen.has(id)) continue;
    const neighbor = allCountriesById?.get?.(id);
    if (!neighbor) continue;
    seen.add(id);
    list.push(neighbor);
  }
  return list;
}

function approximateBboxAreaKm2(bounds) {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const midLat = (minLat + maxLat) / 2;
  const heightKm = Math.max(maxLat - minLat, 0) * KM_PER_DEG_LAT;
  const widthKm =
    Math.max(maxLng - minLng, 0) *
    KM_PER_DEG_LAT *
    Math.max(Math.cos((midLat * Math.PI) / 180), 0.2);
  return widthKm * heightKm;
}

/** Mapbox fitBounds requires latitudes in [-90, 90]. */
function clampLat(lat) {
  if (!Number.isFinite(lat)) return 0;
  return Math.max(-90, Math.min(90, lat));
}

/**
 * Clamp fitBounds corners so Mapbox never sees an out-of-range latitude.
 * Keeps a tiny non-zero lat span if clamping would collapse the box.
 */
export function clampFitBoundsLatitudes(bounds) {
  if (!bounds) return bounds;
  let [[minLng, minLat], [maxLng, maxLat]] = bounds;
  minLat = clampLat(minLat);
  maxLat = clampLat(maxLat);
  if (!(maxLat > minLat)) {
    const mid = clampLat((minLat + maxLat) / 2 || 0);
    minLat = Math.max(-90, mid - 0.05);
    maxLat = Math.min(90, mid + 0.05);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function sumCountryAreasKm2(countries) {
  let sum = 0;
  for (const country of countries) {
    if (typeof country.area === "number" && country.area > 0) {
      sum += country.area;
    }
  }
  return sum;
}

/**
 * Urals (~60°E) — hard east ceiling for European Russia when Learn frames Russia
 * alone or as a neighbor of European countries. Avoids fitting to Siberia /
 * the Pacific. This is a cap, not a target: Baltic border clusters should stay
 * near the shared border, not stretch all the way to the Urals.
 */
export const RUS_EUROPE_MAX_LNG = 60;

/**
 * How far past the other countries in a cluster we still include Russian land.
 * Tight enough that Latvia/Finland stay framed on the shared border (and the
 * Caucasus cannot pull a Baltic camera south), wide enough that Asian clusters
 * (e.g. Mongolia) still show a meaningful slice of Russia.
 */
const RUS_FOCUS_COMPANION_LNG_PAD_DEG = 12;
const RUS_FOCUS_COMPANION_LAT_PAD_DEG = 6;

/**
 * Geographic bbox for a country, preferring metropolitan/mainland polygons so
 * overseas scraps (French Guiana, Réunion, Canaries, Caribbean NL, …) do not
 * pull Learn focus cameras across oceans.
 * Returns [minLng, minLat, maxLng, maxLat] or null.
 */
export function getCountryGeographicBbox(country) {
  if (!country) return null;

  if (country.feature?.geometry) {
    const mainland = getMainlandPolygons(country.feature.geometry, country.id);
    if (mainland.length > 0) {
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const polygon of mainland) {
        walkCoords(polygon, (x, y) => {
          bbox[0] = Math.min(bbox[0], x);
          bbox[1] = Math.min(bbox[1], y);
          bbox[2] = Math.max(bbox[2], x);
          bbox[3] = Math.max(bbox[3], y);
        });
      }
      if (Number.isFinite(bbox[0])) return bbox;
    }

    const full = getBbox(country.feature);
    if (Number.isFinite(full[0])) return full;
  }

  const [lng, lat] = country.centroid ?? [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat, lng, lat];
}

/**
 * Clip Russia's vast span so Learn focus cameras stay on the relevant slice.
 * With European neighbors: a padded window around that cluster, capped at the
 * Urals — not a fit of all European Russia down to the Caucasus.
 * With Asian neighbors: keep a padded lng/lat window around that cluster.
 * Rebuilds the bbox from geometry inside the window so Caucasus/Siberia do not
 * inflate the frame when those lands sit outside the clip.
 */
export function clipRussiaFocusBbox(rusBbox, companionBbox, rusCountry = null) {
  let clipMinLng = -Infinity;
  let clipMaxLng = RUS_EUROPE_MAX_LNG;
  let clipMinLat = -Infinity;
  let clipMaxLat = Infinity;

  if (companionBbox && Number.isFinite(companionBbox[0])) {
    const [cMinLng, cMinLat, cMaxLng, cMaxLat] = companionBbox;
    clipMinLng = cMinLng - RUS_FOCUS_COMPANION_LNG_PAD_DEG;
    clipMaxLng = cMaxLng + RUS_FOCUS_COMPANION_LNG_PAD_DEG;
    clipMinLat = Number.isFinite(cMinLat)
      ? cMinLat - RUS_FOCUS_COMPANION_LAT_PAD_DEG
      : -Infinity;
    clipMaxLat = Number.isFinite(cMaxLat)
      ? cMaxLat + RUS_FOCUS_COMPANION_LAT_PAD_DEG
      : Infinity;
    // European clusters: 60°E is a ceiling, not a destination.
    if (Number.isFinite(cMaxLng) && cMaxLng <= RUS_EUROPE_MAX_LNG) {
      clipMaxLng = Math.min(clipMaxLng, RUS_EUROPE_MAX_LNG);
    }
  }

  if (rusCountry?.feature?.geometry) {
    const mainland = getMainlandPolygons(rusCountry.feature.geometry, "RUS");
    const polygons =
      mainland.length > 0
        ? mainland
        : rusCountry.feature.geometry.type === "Polygon"
          ? [rusCountry.feature.geometry.coordinates]
          : rusCountry.feature.geometry.coordinates ?? [];

    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polygon of polygons) {
      walkCoords(polygon, (x, y) => {
        if (x < clipMinLng || x > clipMaxLng) return;
        if (y < clipMinLat || y > clipMaxLat) return;
        bbox[0] = Math.min(bbox[0], x);
        bbox[1] = Math.min(bbox[1], y);
        bbox[2] = Math.max(bbox[2], x);
        bbox[3] = Math.max(bbox[3], y);
      });
    }
    if (Number.isFinite(bbox[0]) && bbox[2] > bbox[0] && bbox[3] > bbox[1]) {
      return bbox;
    }
  }

  if (!rusBbox) return null;
  let [minLng, minLat, maxLng, maxLat] = rusBbox;
  minLng = Math.max(minLng, clipMinLng);
  maxLng = Math.min(maxLng, clipMaxLng);
  minLat = Math.max(minLat, clipMinLat);
  maxLat = Math.min(maxLat, clipMaxLat);

  if (!(maxLng > minLng) || !(maxLat > minLat)) {
    // Degenerate after clip — Moscow-centered European Russia fallback.
    return [37.6 - 12, 50, Math.min(RUS_EUROPE_MAX_LNG, 37.6 + 22), 70];
  }

  return [minLng, minLat, maxLng, maxLat];
}

function mergeBboxInto(target, bbox) {
  if (!bbox) return target;
  const [a, b, c, d] = bbox;
  if (!Number.isFinite(a)) return target;
  return [
    Math.min(target[0], a),
    Math.min(target[1], b),
    Math.max(target[2], c),
    Math.max(target[3], d),
  ];
}

/**
 * Tight geographic bounds from country geometries (centroid fallback).
 * Uses mainland-aware per-country bboxes so distant overseas territories do not
 * force a near-global fitBounds (e.g. Luxembourg neighbors including France).
 * Russia is clipped to the Urals / a companion-relative longitude window.
 * Returns Mapbox fitBounds corners: [[minLng, minLat], [maxLng, maxLat]].
 */
export function getGeographicBoundsFromCountries(countries) {
  if (!countries?.length) return null;

  const russia = [];
  const others = [];
  for (const country of countries) {
    if (country?.id === "RUS") russia.push(country);
    else others.push(country);
  }

  let companionBbox = [Infinity, Infinity, -Infinity, -Infinity];
  let hasCompanion = false;
  for (const country of others) {
    const bbox = getCountryGeographicBbox(country);
    if (!bbox) continue;
    companionBbox = mergeBboxInto(companionBbox, bbox);
    hasCompanion = true;
  }

  let merged = hasCompanion
    ? companionBbox
    : [Infinity, Infinity, -Infinity, -Infinity];

  for (const country of russia) {
    const raw = getCountryGeographicBbox(country);
    const clipped = clipRussiaFocusBbox(raw, hasCompanion ? companionBbox : null, country);
    merged = mergeBboxInto(merged, clipped);
  }

  let [minLng, minLat, maxLng, maxLat] = merged;
  if (!Number.isFinite(minLng)) return null;

  // Antimeridian / world-spanning junk — fall back to centroids.
  if (maxLng - minLng > 180 || maxLat - minLat > 120) {
    minLng = Infinity;
    minLat = Infinity;
    maxLng = -Infinity;
    maxLat = -Infinity;
    for (const country of countries) {
      const [lng, lat] = country.centroid ?? getBoundsAnchor(country, null);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
    if (!Number.isFinite(minLng)) return null;
  }

  // Ensure a non-zero span so expand/fitBounds have something to work with.
  if (maxLng - minLng < 0.15) {
    const pad = 0.15;
    minLng -= pad;
    maxLng += pad;
  }
  if (maxLat - minLat < 0.15) {
    const pad = 0.15;
    minLat -= pad;
    maxLat += pad;
  }

  return clampFitBoundsLatitudes([
    [minLng, minLat],
    [maxLng, maxLat],
  ]);
}

/**
 * Expand bounds about their center until approximate geographic area ≥ targetKm2.
 * Never shrinks below the tight bounds (all countries must stay visible).
 * Latitude expansion is capped so we never create a pole-to-pole frame that
 * leaves Mapbox stuck on a near-global zoom after Learn teach steps.
 */
export function expandBoundsToAreaKm2(bounds, targetKm2) {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const current = approximateBboxAreaKm2(bounds);
  if (!(targetKm2 > 0) || current >= targetKm2) {
    return clampFitBoundsLatitudes(bounds);
  }

  const scale = Math.sqrt(targetKm2 / current);
  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;
  let halfLng = ((maxLng - minLng) / 2) * scale;
  let halfLat = ((maxLat - minLat) / 2) * scale;

  // Keep expanded latitudes inside a safe band. If the target area still isn't
  // met, grow longitude instead of blowing past the poles.
  const maxHalfLat = Math.max(0.05, Math.min(midLat + 85, 85 - midLat));
  if (halfLat > maxHalfLat) {
    const latScale = maxHalfLat / halfLat;
    halfLat = maxHalfLat;
    // Compensate area on the longitude axis (area ∝ width × height).
    halfLng = halfLng / Math.max(latScale, 0.05);
  }

  return clampFitBoundsLatitudes([
    [midLng - halfLng, midLat - halfLat],
    [midLng + halfLng, midLat + halfLat],
  ]);
}

/**
 * Learn focus camera: frame `countries` so the view rectangle is ~3× the sum of
 * their land areas (while still containing every country). Used for neighbor
 * teach, language, landlocked, and other map-backed Learn prompts.
 */
export function getLearnFocusMapView(
  countries,
  { regionId, padding = 120, areaMultiplier = LEARN_FOCUS_AREA_MULTIPLIER, maxZoom = 7 } = {}
) {
  if (!countries?.length) return null;

  if (regionId === "oceania") {
    return getMapViewForRegion(countries, regionId);
  }

  const tight = getGeographicBoundsFromCountries(countries);
  if (!tight) return null;

  const landArea = sumCountryAreasKm2(countries);
  const tightArea = approximateBboxAreaKm2(tight);
  // Countries clipped in-frame (Russia east of the Urals, France overseas, …)
  // still contribute their full official area — that would re-expand the camera
  // across the continent. Cap land to the framed footprint.
  const effectiveLand =
    landArea > 0 && tightArea > 0 ? Math.min(landArea, tightArea) : landArea;
  const targetArea =
    effectiveLand > 0
      ? effectiveLand * areaMultiplier
      : tightArea * areaMultiplier;

  const bounds = expandBoundsToAreaKm2(tight, targetArea);

  return {
    type: "bounds",
    bounds,
    padding,
    maxZoom,
  };
}

/**
 * Soft Learn highlight camera (language + "which country is highlighted"):
 * Nepal-sized and larger keep the session region view (no zoom). Smaller
 * countries get a light close-up — enough to spot the yellow fill, not a tight crop.
 *
 * @returns {object|null} map view, or `null` when the caller should keep the region view
 */
export function getLearnLanguageFocusMapView(
  country,
  { regionId, padding = 140, regionMapView = null } = {}
) {
  if (!country) return null;

  const area = typeof country.area === "number" ? country.area : null;
  if (area == null || area >= LEARN_LANGUAGE_REGION_MIN_AREA_KM2) {
    return regionMapView;
  }

  return getLearnFocusMapView([country], {
    regionId,
    padding,
    areaMultiplier: LEARN_LANGUAGE_FOCUS_AREA_MULTIPLIER,
    maxZoom: LEARN_LANGUAGE_FOCUS_MAX_ZOOM,
  });
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
