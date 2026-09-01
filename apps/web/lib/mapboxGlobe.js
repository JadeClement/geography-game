/**
 * Mapbox globe helpers. Markers use an internal isLngLatBehindGlobe; we mirror
 * the far-side test so HTML discover labels hide when a country rotates away.
 */

/** Mapbox Transform default — cinematic mercator horizon, harmful on globe. */
export const MAPBOX_DEFAULT_HORIZON_SHIFT = 0.1;

export function isShowingGlobe(map) {
  if (!map) return false;
  if (typeof map._showingGlobe === "function") return map._showingGlobe();
  return map.getProjection?.()?.name === "globe";
}

/**
 * Mapbox paints atmosphere / stars in screen space, then shifts them down by
 * `_horizonShift` (default 0.1) so pitched mercator views look cinematic.
 * On a globe that shift is a static crescent of space over the bottom of the
 * sphere — it stays put while the map rotates underneath.
 */
export function setGlobeHorizonShift(map, alignedWithGlobe) {
  const transform = map?.transform;
  if (!transform || !("_horizonShift" in transform)) return false;
  transform._horizonShift = alignedWithGlobe ? 0 : MAPBOX_DEFAULT_HORIZON_SHIFT;
  if (typeof map.triggerRepaint === "function") map.triggerRepaint();
  return true;
}

/** Unit-sphere ECEF with Mapbox's Y-up convention. */
function lngLatToUnitEcef(lng, lat) {
  const λ = (lng * Math.PI) / 180;
  const φ = (lat * Math.PI) / 180;
  const cosφ = Math.cos(φ);
  return [cosφ * Math.cos(λ), Math.sin(φ), cosφ * Math.sin(λ)];
}

/**
 * True when the lng/lat is on the far side of the globe (past the horizon).
 * Uses the view-center hemisphere test with Mapbox's ~1% horizon margin.
 * Sufficient for discover-mode globe spinning; viewport checks still apply.
 */
export function isLngLatBehindGlobe(map, lng, lat) {
  if (!isShowingGlobe(map)) return false;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return true;

  const center = map.getCenter();
  const c = lngLatToUnitEcef(center.lng, center.lat);
  const p = lngLatToUnitEcef(lng, lat);
  const dot = c[0] * p[0] + c[1] * p[1] + c[2] * p[2];

  // cos(π/2 * 1.01) ≈ -0.0157 — matches Mapbox marker occlusion margin.
  return dot < -0.0157;
}
