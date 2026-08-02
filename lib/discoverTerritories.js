/**
 * Non-playable overseas scraps that show up on regional Discover maps.
 * Clicking them opens an informational note instead of starting a discovery.
 *
 * Notes with `displayAsTerritory: true` are also drawn as outlined inactive-style
 * land (their own GeoJSON feature), e.g. Greenland. French Guiana is part of FRA
 * and only needs click matching via bbox.
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
  {
    id: "GRL",
    parentIso3: "GRL",
    displayAsTerritory: true,
    // Drawn as its own feature — any click on Greenland opens the note.
    title: "Greenland",
    message:
      "This is an autonomous territory within the Kingdom of Denmark — not counted as its own country in Worldly.",
  },
];

/** ISO3 codes of disabled countries that should still be outlined on the map. */
export function getDisplayTerritoryIso3s() {
  return new Set(
    DISCOVER_TERRITORY_NOTES.filter((note) => note.displayAsTerritory).map((note) => note.id)
  );
}

/**
 * @returns {typeof DISCOVER_TERRITORY_NOTES[number] | null}
 */
export function matchDiscoverTerritoryNote({ countryId, lngLat, regionId }) {
  if (!countryId) return null;

  for (const note of DISCOVER_TERRITORY_NOTES) {
    if (note.parentIso3 !== countryId) continue;
    if (note.regions && regionId && !note.regions.includes(regionId)) continue;
    if (note.bbox && !pointInBbox(lngLat, note.bbox)) continue;
    return note;
  }

  return null;
}
