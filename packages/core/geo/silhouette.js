/**
 * Fit a country's GeoJSON geometry into an isolated SVG silhouette.
 *
 * - Keeps every large landmass (≥ 15% of the biggest polygon) so split
 *   countries (Malaysia, USA+Alaska) stay intact.
 * - Then grows to nearby islands so archipelagos (Philippines, Japan, Greece)
 *   keep their middle islands — not just the two biggest blobs.
 * - Drops distant overseas scraps and (for FRA/ESP/PRT/NLD) DOM-TOM land
 *   so France looks like France, not France + Guiana + Réunion.
 * - Unwraps dateline-spanning rings (Russia, Fiji, USA Aleutians) so the bbox
 *   is a single continuous shape instead of a near-global box.
 * - Scales longitude by cos(mid-latitude) so a degree of lon isn't treated as
 *   equal to a degree of lat (which would stretch high-latitude countries).
 * - Always uses one uniform scale — never independent x/y scales.
 * - `fit: "square"` (default) letterboxes into a square.
 * - `fit: "aspect"` uses the country's own proportions so the outline can fill
 *   its box (wide places like Russia, tall ones like Chile).
 */

const VIEW = 400;
const PAD = 8;
const SIMPLIFY_TOLERANCE = 0.35;
const MAINLAND_AREA_FRACTION = 0.15;
/** Islands smaller than this fraction of the largest landmass are visual noise. */
const SPECK_AREA_FRACTION = 0.002;
/** Max empty gap (degrees) between bboxes to treat polygons as one cluster. */
const NEARBY_ISLAND_GAP_DEG = 4;
const METROPOLITAN_MAX_DISTANCE_DEG = 12;

const METROPOLITAN_CENTROIDS = {
  FRA: [2.3522, 48.8566],
  NLD: [4.9041, 52.3676],
  ESP: [-3.7038, 40.4168],
  PRT: [-9.1393, 38.7223],
};

function polygonsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates ? [geometry.coordinates] : [];
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  return [];
}

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

function polygonCentroid(polygon) {
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

function polygonBBox(polygon, refLng) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const ring = polygon?.[0];
  if (!Array.isArray(ring)) return null;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lng = unwrapLng(point[0], refLng);
    const lat = point[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLng)) return null;
  return { minLng, minLat, maxLng, maxLat };
}

function bboxGap(a, b) {
  const dx = Math.max(0, a.minLng - b.maxLng, b.minLng - a.maxLng);
  const dy = Math.max(0, a.minLat - b.maxLat, b.minLat - a.maxLat);
  return Math.hypot(dx, dy);
}

function mainlandPolygons(geometry, iso3) {
  const polygons = polygonsFromGeometry(geometry);
  if (polygons.length <= 1) return polygons;

  let maxArea = 0;
  const areas = polygons.map((polygon) => {
    const area = ringArea(polygon?.[0]);
    maxArea = Math.max(maxArea, area);
    return area;
  });
  if (maxArea <= 0) return polygons;

  const largestIndex = areas.indexOf(maxArea);
  const refLng = referenceLng([polygons[largestIndex]], iso3);
  const bboxes = polygons.map((polygon) => polygonBBox(polygon, refLng));

  const cores = [];
  for (let index = 0; index < polygons.length; index += 1) {
    if (areas[index] >= maxArea * MAINLAND_AREA_FRACTION) cores.push(index);
  }
  if (cores.length === 0) cores.push(largestIndex);

  const kept = new Set(cores);
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < polygons.length; index += 1) {
      if (kept.has(index) || !bboxes[index]) continue;
      for (const keptIndex of kept) {
        const keptBox = bboxes[keptIndex];
        if (!keptBox) continue;
        if (bboxGap(bboxes[index], keptBox) <= NEARBY_ISLAND_GAP_DEG) {
          kept.add(index);
          changed = true;
          break;
        }
      }
    }
  }

  const speckFloor = maxArea * SPECK_AREA_FRACTION;
  let mainland = polygons.filter(
    (_, index) => kept.has(index) && areas[index] >= speckFloor
  );
  if (mainland.length === 0) mainland = cores.map((index) => polygons[index]);

  const metro = iso3 ? METROPOLITAN_CENTROIDS[iso3] : null;
  if (metro) {
    const [baseLng, baseLat] = metro;
    const near = mainland.filter((polygon) => {
      const centroid = polygonCentroid(polygon);
      if (!centroid) return false;
      return (
        Math.hypot(centroid[0] - baseLng, centroid[1] - baseLat) <=
        METROPOLITAN_MAX_DISTANCE_DEG
      );
    });
    if (near.length > 0) mainland = near;
  }

  return mainland;
}

function unwrapLng(lng, ref) {
  let shifted = lng;
  let delta = shifted - ref;
  while (delta > 180) {
    shifted -= 360;
    delta = shifted - ref;
  }
  while (delta < -180) {
    shifted += 360;
    delta = shifted - ref;
  }
  return shifted;
}

function unwrapRing(ring, refLng) {
  return ring.map((point) => {
    if (!Array.isArray(point) || point.length < 2) return point;
    return [unwrapLng(point[0], refLng), point[1]];
  });
}

function perpendicularDistance(point, start, end) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Douglas–Peucker on projected XY so coastlines keep their corners. */
function simplifyProjected(points, tolerance) {
  if (!Array.isArray(points) || points.length <= 4) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  function simplifySection(start, end) {
    if (end - start <= 1) return;
    let maxDistance = 0;
    let index = 0;
    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (maxDistance > tolerance) {
      keep[index] = true;
      simplifySection(start, index);
      simplifySection(index, end);
    }
  }

  simplifySection(0, points.length - 1);
  return points.filter((_, index) => keep[index]);
}

function referenceLng(polygons, iso3) {
  const metro = iso3 ? METROPOLITAN_CENTROIDS[iso3] : null;
  if (metro) return metro[0];
  const centroid = polygonCentroid(polygons[0]);
  return centroid ? centroid[0] : polygons[0]?.[0]?.[0]?.[0] ?? 0;
}

/**
 * @param {object} geometry - GeoJSON Polygon / MultiPolygon
 * @param {{ iso3?: string, size?: number, padding?: number, fit?: "square"|"aspect" }} [opts]
 * @returns {{ d: string, viewBox: string, width: number, height: number } | null}
 */
export function geometryToFittedPath(
  geometry,
  { iso3 = null, size = VIEW, padding = PAD, fit = "square" } = {}
) {
  const polygons = mainlandPolygons(geometry, iso3);
  if (polygons.length === 0) return null;

  const refLng = referenceLng(polygons, iso3);
  const unwrapped = polygons.map((polygon) =>
    polygon.map((ring) => unwrapRing(ring, refLng))
  );

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const polygon of unwrapped) {
    for (const ring of polygon) {
      for (const point of ring) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const [lng, lat] = point;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }

  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.max(Math.abs(Math.cos((midLat * Math.PI) / 180)), 0.05);
  const spanX = (maxLng - minLng) * lonScale;
  const spanY = maxLat - minLat;
  if (!(spanX > 0) || !(spanY > 0) || !Number.isFinite(spanX) || !Number.isFinite(spanY)) {
    return null;
  }

  let vbW = size;
  let vbH = size;
  if (fit === "aspect") {
    const aspect = spanX / spanY;
    if (aspect >= 1) {
      vbW = size;
      vbH = size / aspect;
    } else {
      vbH = size;
      vbW = size * aspect;
    }
  }

  const padX = Math.min(padding, vbW * 0.08);
  const padY = Math.min(padding, vbH * 0.08);
  const innerW = vbW - padX * 2;
  const innerH = vbH - padY * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const ox = padX + (innerW - spanX * scale) / 2;
  const oy = padY + (innerH - spanY * scale) / 2;

  const project = (lng, lat) => [
    ox + (lng - minLng) * lonScale * scale,
    oy + (maxLat - lat) * scale,
  ];

  const parts = [];
  for (const polygon of unwrapped) {
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const projected = ring
        .filter((point) => Array.isArray(point) && point.length >= 2)
        .map((point) => project(point[0], point[1]));
      const simplified = simplifyProjected(projected, SIMPLIFY_TOLERANCE);
      if (simplified.length < 3) continue;
      const commands = simplified.map((point, index) => {
        const [x, y] = point;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      });
      parts.push(`${commands.join(" ")} Z`);
    }
  }

  if (parts.length === 0) return null;
  return {
    d: parts.join(" "),
    viewBox: `0 0 ${+vbW.toFixed(1)} ${+vbH.toFixed(1)}`,
    width: vbW,
    height: vbH,
  };
}
