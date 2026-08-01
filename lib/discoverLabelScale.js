/** Dampen zoom so labels grow a little, not 1:1 with the map. */
const SCALE_EXPONENT = 0.35;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.35;

/** Screen span (px) at which a Discover flag reaches full size. */
const FLAG_FULL_SPAN_PX = 52;
/** Smallest multiplier for tiny on-screen countries (flags stay readable). */
const FLAG_MIN_SIZE_FACTOR = 0.42;
/** Extra shrink for countries marked isSmall even when their bbox is inflated. */
const FLAG_SMALL_COUNTRY_CAP = 0.72;

/**
 * @param {number} zoomRatio Current zoom divided by the region's baseline zoom
 *   (Mapbox: 2^(currentZoom - refZoom); Pacific: defaultViewBox.width / currentWidth).
 */
export function getDiscoverLabelScale(zoomRatio) {
  if (!Number.isFinite(zoomRatio) || zoomRatio <= 0) return 1;

  const scale = zoomRatio ** SCALE_EXPONENT;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Extra size factor for Discover flags based on how big the country is on screen.
 * Flags always remain visible; smaller countries just get a smaller flag.
 *
 * @param {{ left: number, top: number, right: number, bottom: number } | null} countryBounds
 * @param {{ isSmall?: boolean }} [options]
 */
export function getDiscoverFlagSizeFactor(countryBounds, { isSmall = false } = {}) {
  let factor = 1;

  if (countryBounds) {
    const minSpan = Math.min(
      countryBounds.right - countryBounds.left,
      countryBounds.bottom - countryBounds.top
    );
    if (Number.isFinite(minSpan) && minSpan > 0) {
      if (minSpan < FLAG_FULL_SPAN_PX) {
        factor =
          FLAG_MIN_SIZE_FACTOR +
          (1 - FLAG_MIN_SIZE_FACTOR) * (minSpan / FLAG_FULL_SPAN_PX);
      }
    } else if (isSmall) {
      factor = FLAG_MIN_SIZE_FACTOR;
    }
  } else if (isSmall) {
    factor = FLAG_MIN_SIZE_FACTOR;
  }

  if (isSmall) {
    factor = Math.min(factor, FLAG_SMALL_COUNTRY_CAP);
  }

  return Math.min(1, Math.max(FLAG_MIN_SIZE_FACTOR, factor));
}
