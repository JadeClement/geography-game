import { getCountryOcclusionRatio, rectsOverlap } from "./discoverLabelLayout.js";

const LABEL_FIT_PADDING = 6;
/** Keep offset labels for tiny countries visible until the country span drops below this. */
const SMALL_COUNTRY_WIGGLE_MIN_SPAN = 28;
/** Country must be at least this large on screen to show any label. */
const MIN_VISIBLE_COUNTRY_SPAN = 10;
const MAX_NEARBY_COUNTRY_OCCLUSION = 0.5;
const COMPACT_OWN_COUNTRY_MAX_SPAN = 96;
const COMPACT_OWN_COUNTRY_RADIUS = 36;

function getCompactOwnCountryBounds(countryBounds, anchor) {
  if (!countryBounds || !anchor) return countryBounds;

  const span = Math.max(
    countryBounds.right - countryBounds.left,
    countryBounds.bottom - countryBounds.top
  );
  if (span <= COMPACT_OWN_COUNTRY_MAX_SPAN) return countryBounds;

  return {
    countryId: countryBounds.countryId,
    left: anchor.x - COMPACT_OWN_COUNTRY_RADIUS,
    top: anchor.y - COMPACT_OWN_COUNTRY_RADIUS,
    right: anchor.x + COMPACT_OWN_COUNTRY_RADIUS,
    bottom: anchor.y + COMPACT_OWN_COUNTRY_RADIUS,
  };
}

export function labelFitsInsideCountry(labelWidth, labelHeight, countryBounds) {
  if (!countryBounds || labelWidth <= 0 || labelHeight <= 0) return true;

  const countryWidth = countryBounds.right - countryBounds.left;
  const countryHeight = countryBounds.bottom - countryBounds.top;

  return (
    labelWidth + LABEL_FIT_PADDING <= countryWidth &&
    labelHeight + LABEL_FIT_PADDING <= countryHeight
  );
}

function isCompactCountry(labelWidth, labelHeight, ownBounds, isSmallCountry) {
  if (isSmallCountry) return true;

  const countryWidth = ownBounds.right - ownBounds.left;
  const countryHeight = ownBounds.bottom - ownBounds.top;
  const countryMaxSpan = Math.max(countryWidth, countryHeight);
  const labelMaxDim = Math.max(labelWidth, labelHeight);

  return countryMaxSpan < labelMaxDim * 1.25;
}

function overlapsOtherLabels(labelRect, countryId, otherLabelRects) {
  for (const [id, rect] of Object.entries(otherLabelRects)) {
    if (id === countryId) continue;
    if (rectsOverlap(labelRect, rect)) return true;
  }
  return false;
}

function exceedsNearbyOcclusion(labelRect, countryId, allCountryBounds) {
  for (const country of allCountryBounds) {
    if (country.countryId === countryId) continue;
    if (getCountryOcclusionRatio(labelRect, country) > MAX_NEARBY_COUNTRY_OCCLUSION) {
      return true;
    }
  }
  return false;
}

/**
 * Label won't fit inside the country, but the layout engine placed it nearby
 * without overlapping other labels or covering too much of another country.
 */
export function hasValidNearbyPlacement({
  layoutRect,
  labelWidth,
  labelHeight,
  countryBounds,
  anchor,
  isSmallCountry = false,
  countryId,
  otherLabelRects = {},
  allCountryBounds = [],
}) {
  if (!layoutRect || !countryBounds) return false;

  const ownBounds = getCompactOwnCountryBounds(countryBounds, anchor);
  if (!ownBounds) return false;

  if (labelFitsInsideCountry(labelWidth, labelHeight, ownBounds)) {
    return false;
  }

  if (!isCompactCountry(labelWidth, labelHeight, ownBounds, isSmallCountry)) {
    return false;
  }

  const minSpan = Math.min(
    ownBounds.right - ownBounds.left,
    ownBounds.bottom - ownBounds.top
  );
  if (minSpan < MIN_VISIBLE_COUNTRY_SPAN) return false;

  if (overlapsOtherLabels(layoutRect, countryId, otherLabelRects)) return false;
  if (exceedsNearbyOcclusion(layoutRect, countryId, allCountryBounds)) return false;

  return true;
}

export function shouldHideDiscoverLabel({
  labelWidth,
  labelHeight,
  countryBounds,
  anchor,
  isSmallCountry = false,
  layoutRect,
  countryId,
  otherLabelRects = {},
  allCountryBounds = [],
}) {
  if (!countryBounds) return false;

  const ownBounds = getCompactOwnCountryBounds(countryBounds, anchor);
  if (!ownBounds) return false;

  if (labelFitsInsideCountry(labelWidth, labelHeight, ownBounds)) {
    return false;
  }

  if (
    hasValidNearbyPlacement({
      layoutRect,
      labelWidth,
      labelHeight,
      countryBounds,
      anchor,
      isSmallCountry,
      countryId,
      otherLabelRects,
      allCountryBounds,
    })
  ) {
    return false;
  }

  if (isSmallCountry) {
    const countryMinSpan = Math.min(
      ownBounds.right - ownBounds.left,
      ownBounds.bottom - ownBounds.top
    );
    return countryMinSpan < SMALL_COUNTRY_WIGGLE_MIN_SPAN;
  }

  return true;
}

export function isDiscoverLabelVisible({
  labelWidth,
  labelHeight,
  countryBounds,
  anchor,
  isSmallCountry,
  layoutRect,
  countryId,
  otherLabelRects,
  allCountryBounds,
  hoveredCountryId,
  isAnimating,
  /**
   * Flags skip fit/occlusion hiding (they shrink instead), but still require
   * an on-screen country anchor — off-map countries never show a label.
   */
  alwaysShow = false,
}) {
  if (!anchor) return false;
  if (isAnimating) return true;
  if (hoveredCountryId === countryId) return true;
  if (alwaysShow) return true;

  return !shouldHideDiscoverLabel({
    labelWidth,
    labelHeight,
    countryBounds,
    anchor,
    isSmallCountry,
    layoutRect,
    countryId,
    otherLabelRects,
    allCountryBounds,
  });
}
