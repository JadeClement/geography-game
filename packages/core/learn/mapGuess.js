/**
 * Score a borderless-map click or shape drop against the target country.
 *
 * Map clicks: inside the polygon (or within a small km of the border) counts
 * as a hit. Misses keep the nearest-border distance so EMA can penalize a
 * 10,000 km miss far more than a 20 km near-miss.
 *
 * Shape drops: great-circle distance from the dropped silhouette's centroid
 * to the country's centroid.
 */

import { distanceToGeometry, formatDistanceKm, haversineKm } from "../geo/distance.js";

/** Inside, or this close to the border, counts as a hit for map clicks. */
export const MAP_CLICK_HIT_KM = 20;
/** Misses closer than this get a "Close!" toast instead of a generic miss. */
export const MAP_CLICK_CLOSE_KM = 100;
/** Shape drops are coarser — centroid-to-centroid within this counts as a hit. */
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

/**
 * Shape-drop scoring: great-circle distance from the dropped silhouette's
 * centroid to the target country's centroid. Map-clicks keep evaluateGeoGuess
 * (inside / nearest border).
 */
export function evaluateShapeDrop({
  lng,
  lat,
  centroid,
  hitKm = SHAPE_DROP_HIT_KM,
} = {}) {
  const toLng = Array.isArray(centroid) ? centroid[0] : centroid?.lng;
  const toLat = Array.isArray(centroid) ? centroid[1] : centroid?.lat;
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(toLng) ||
    !Number.isFinite(toLat)
  ) {
    return {
      inside: false,
      distanceKm: Infinity,
      closestPoint: null,
      correct: false,
      penaltyScale: 1,
    };
  }
  const distanceKm = haversineKm(lng, lat, toLng, toLat);
  const correct = distanceKm <= hitKm;
  return {
    inside: false,
    distanceKm,
    closestPoint: [toLng, toLat],
    correct,
    penaltyScale: correct ? 0 : distancePenaltyScale(distanceKm),
  };
}

/**
 * Toast / continue copy for a borderless map click.
 * Inside the country → Correct. Within MAP_CLICK_HIT_KM → green "Close enough!".
 * Farther but under MAP_CLICK_CLOSE_KM → "Close!". Else the distance miss.
 *
 * @param {{
 *   correct: boolean,
 *   inside?: boolean,
 *   distanceKm?: number,
 *   clickedName?: string | null,
 * }} args
 */
export function formatMapClickDistanceFeedback({
  correct,
  inside = false,
  distanceKm = null,
  clickedName = null,
} = {}) {
  const kmLabel =
    distanceKm != null && Number.isFinite(distanceKm) ? formatDistanceKm(distanceKm) : null;
  const nearHit =
    Boolean(correct) &&
    !inside &&
    Number.isFinite(distanceKm) &&
    distanceKm > 0 &&
    distanceKm <= MAP_CLICK_HIT_KM;

  if (nearHit && kmLabel) {
    return {
      text: `${kmLabel} - Close enough!`,
      type: "correct",
      detail: null,
      continueMessage: null,
    };
  }

  if (correct) {
    return { text: "Correct", type: "correct", detail: null, continueMessage: null };
  }

  const close =
    Number.isFinite(distanceKm) && distanceKm > MAP_CLICK_HIT_KM && distanceKm < MAP_CLICK_CLOSE_KM;
  if (close) {
    const detail = kmLabel ? `${kmLabel} away` : null;
    const continueMessage = clickedName
      ? `Close! ${kmLabel} away. That is ${clickedName}.`
      : `Close!${detail ? ` ${detail}` : ""}`;
    return { text: "Close!", type: "wrong", detail, continueMessage };
  }

  const continueMessage = kmLabel
    ? clickedName
      ? `${kmLabel} away. That is ${clickedName}.`
      : `${kmLabel} away.`
    : "Not quite.";
  return {
    text: "Not quite.",
    type: "wrong",
    detail: kmLabel ? `${kmLabel} away` : null,
    continueMessage,
  };
}

export { formatDistanceKm };
