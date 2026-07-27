/** Dampen zoom so labels grow a little, not 1:1 with the map. */
const SCALE_EXPONENT = 0.35;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.35;

/**
 * @param {number} zoomRatio Current zoom divided by the region's baseline zoom
 *   (Mapbox: 2^(currentZoom - refZoom); Pacific: defaultViewBox.width / currentWidth).
 */
export function getDiscoverLabelScale(zoomRatio) {
  if (!Number.isFinite(zoomRatio) || zoomRatio <= 0) return 1;

  const scale = zoomRatio ** SCALE_EXPONENT;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}
