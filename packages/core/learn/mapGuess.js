/**
 * Score a borderless-map click or shape drop against the target country.
 *
 * Hits inside the polygon (or within a small km tolerance for finger/mouse
 * slop) count as correct. Misses keep a distance so EMA can penalize a
 * 10,000 km miss far more than a 20 km near-miss.
 */

import { distanceToGeometry, formatDistanceKm } from "../geo/distance.js";

/** Inside, or this close to the border, counts as a hit for map clicks. */
export const MAP_CLICK_HIT_KM = 25;
/** Shape drops are coarser — the silhouette center is a blob, not a pinpoint. */
export const SHAPE_DROP_HIT_KM = 100;

/**
 * Maps miss distance to a 0..1 scale on the wrong-answer EMA multiplier.
 * 20 km → ~0.05 (almost no penalty), 250 km → ~0.46, 3,000 km → ~1.
 */
export function distancePenaltyScale(km) {
  if (!Number.isFinite(km) || km <= 0) return 0;
  return 1 - Math.exp(-km / 400);
}

export function isBorderlessMapQuestion(question) {
  return question?.mapConfig?.display === "borderless";
}

/**
 * @param {{ lng: number, lat: number, geometry: object, hitKm?: number }} args
 * @returns {{
 *   inside: boolean,
 *   distanceKm: number,
 *   closestPoint: [number, number] | null,
 *   correct: boolean,
 *   penaltyScale: number
 * }}
 */
export function evaluateGeoGuess({ lng, lat, geometry, hitKm = MAP_CLICK_HIT_KM } = {}) {
  const result = distanceToGeometry(lng, lat, geometry);
  const correct = result.inside || result.distanceKm <= hitKm;
  return {
    ...result,
    correct,
    penaltyScale: correct ? 0 : distancePenaltyScale(result.distanceKm),
  };
}

export { formatDistanceKm };
