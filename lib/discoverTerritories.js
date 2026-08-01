/**
 * Non-playable overseas scraps that show up inside a regional Discover map.
 * Clicking them opens an informational note instead of starting a discovery.
 */

function pointInBbox(lngLat, bbox) {
  if (!lngLat || !bbox) return false;
  const lng = lngLat.lng ?? lngLat[0];
  const lat = lngLat.lat ?? lngLat[1];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  return (
    lng >= bbox.minLng &&
    lng <= bbox.maxLng &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
}

export const DISCOVER_TERRITORY_NOTES = [
  {
    id: "GUF",
    parentIso3: "FRA",
    regions: ["southAmerica"],
    // Mainland French Guiana (excludes metropolitan France).
    bbox: { minLng: -55.5, minLat: 1.5, maxLng: -50.5, maxLat: 6.5 },
    title: "French Guiana",
    message:
      "This is a French overseas territory — part of France, not a separate South American country.",
  },
];

/**
 * @returns {typeof DISCOVER_TERRITORY_NOTES[number] | null}
 */
export function matchDiscoverTerritoryNote({ countryId, lngLat, regionId }) {
  if (!countryId || !lngLat || !regionId) return null;

  for (const note of DISCOVER_TERRITORY_NOTES) {
    if (note.parentIso3 !== countryId) continue;
    if (note.regions && !note.regions.includes(regionId)) continue;
    if (!pointInBbox(lngLat, note.bbox)) continue;
    return note;
  }

  return null;
}
