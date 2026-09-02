/**
 * Geographic distance helpers for Learn-mode map guesses.
 *
 * Pure functions over GeoJSON coordinates (lng, lat). Used to score
 * borderless map clicks / shape drops and to draw the miss line from the
 * click to the nearest point on the target country's border.
 */

const EARTH_RADIUS_KM = 6371;
const TO_RAD = Math.PI / 180;

export function haversineKm(lng1, lat1, lng2, lat2) {
  const dLat = (lat2 - lat1) * TO_RAD;
  const dLng = (lng2 - lng1) * TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * TO_RAD) * Math.cos(lat2 * TO_RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Unwrap `lng` so it sits in the same 360° window as `refLng`. */
export function unwrapLng(lng, refLng) {
  let result = lng;
  while (result - refLng > 180) result -= 360;
  while (result - refLng < -180) result += 360;
  return result;
}

function polygonsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates ? [geometry.coordinates] : [];
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  return [];
}

/**
 * Even-odd ray cast. Rings are unwrapped relative to the test point so
 * dateline-spanning countries (Russia, Fiji) still test correctly.
 */
export function pointInRing(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const ai = ring[i];
    const aj = ring[j];
    if (!Array.isArray(ai) || !Array.isArray(aj) || ai.length < 2 || aj.length < 2) {
      continue;
    }
    const xi = unwrapLng(ai[0], lng);
    const yi = ai[1];
    const xj = unwrapLng(aj[0], lng);
    const yj = aj[1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if the point is inside the polygon (exterior minus holes). */
export function pointInPolygon(lng, lat, polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  if (!pointInRing(lng, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h += 1) {
    if (pointInRing(lng, lat, polygon[h])) return false;
  }
  return true;
}

export function pointInGeometry(lng, lat, geometry) {
  for (const polygon of polygonsFromGeometry(geometry)) {
    if (pointInPolygon(lng, lat, polygon)) return true;
  }
  return false;
}

/**
 * Closest point on the segment AB to P, in unwrapped lng/lat space, then
 * re-wrapped. Accurate enough for country-border segments (typically << 100km).
 */
function closestPointOnSegment(px, py, ax, ay, bx, by, refLng) {
  const axu = unwrapLng(ax, refLng);
  const bxu = unwrapLng(bx, refLng);
  const dx = bxu - axu;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((px - axu) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  return [axu + t * dx, ay + t * dy];
}

function closestPointOnRing(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return null;
  let best = null;
  let bestKm = Infinity;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    const [cx, cy] = closestPointOnSegment(lng, lat, a[0], a[1], b[0], b[1], lng);
    const km = haversineKm(lng, lat, cx, cy);
    if (km < bestKm) {
      bestKm = km;
      best = [cx, cy];
    }
  }
  return best == null ? null : { point: best, distanceKm: bestKm };
}

function closestPointOnGeometry(lng, lat, geometry) {
  let best = null;
  for (const polygon of polygonsFromGeometry(geometry)) {
    for (const ring of polygon) {
      const candidate = closestPointOnRing(lng, lat, ring);
      if (!candidate) continue;
      if (!best || candidate.distanceKm < best.distanceKm) best = candidate;
    }
  }
  return best;
}

/**
 * @returns {{ inside: boolean, distanceKm: number, closestPoint: [number, number] | null }}
 * `distanceKm` is 0 when the point is inside. `closestPoint` is the nearest
 * border coordinate (still returned when inside, for callers that want it).
 */
export function distanceToGeometry(lng, lat, geometry) {
  if (!geometry || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { inside: false, distanceKm: Infinity, closestPoint: null };
  }

  const closest = closestPointOnGeometry(lng, lat, geometry);
  const inside = pointInGeometry(lng, lat, geometry);
  if (inside) {
    return {
      inside: true,
      distanceKm: 0,
      closestPoint: closest?.point ?? [lng, lat],
    };
  }
  if (!closest) {
    return { inside: false, distanceKm: Infinity, closestPoint: null };
  }
  return {
    inside: false,
    distanceKm: closest.distanceKm,
    closestPoint: closest.point,
  };
}

export function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return "unknown distance";
  if (km < 1) return "less than 1 km";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}
