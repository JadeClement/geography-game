/**
 * Mapbox globe helpers. Markers use an internal isLngLatBehindGlobe; we mirror
 * the far-side test so HTML discover labels hide when a country rotates away.
 */

function isShowingGlobe(map) {
  if (!map) return false;
  if (typeof map._showingGlobe === "function") return map._showingGlobe();
  return map.getProjection?.()?.name === "globe";
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
