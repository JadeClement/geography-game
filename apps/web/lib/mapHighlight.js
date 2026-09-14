/** Normalize Mapbox/Pacific `highlightCountryId` (one id or several). */

export function highlightIdList(highlightCountryId) {
  if (Array.isArray(highlightCountryId)) {
    return highlightCountryId.filter((id) => typeof id === "string" && id);
  }
  return typeof highlightCountryId === "string" && highlightCountryId
    ? [highlightCountryId]
    : [];
}

export function isHighlightedCountry(highlightCountryId, countryId) {
  if (!countryId) return false;
  return highlightIdList(highlightCountryId).includes(countryId);
}

export function highlightIdsKey(highlightCountryId) {
  return highlightIdList(highlightCountryId).join("\0");
}

export function hasHighlight(highlightCountryId) {
  return highlightIdList(highlightCountryId).length > 0;
}
