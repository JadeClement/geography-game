const SMALL_BBOX_AREA_THRESHOLD = 4;

function walkCoords(coords, visit) {
  if (typeof coords[0] === "number") {
    visit(coords[0], coords[1]);
    return;
  }
  coords.forEach((part) => walkCoords(part, visit));
}

export function getBbox(feature) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];

  walkCoords(feature.geometry.coordinates, (x, y) => {
    bbox[0] = Math.min(bbox[0], x);
    bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x);
    bbox[3] = Math.max(bbox[3], y);
  });

  return bbox;
}

export function getBboxArea(feature) {
  const [minX, minY, maxX, maxY] = getBbox(feature);
  return (maxX - minX) * (maxY - minY);
}

export function getCentroid(feature) {
  const [minX, minY, maxX, maxY] = getBbox(feature);
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

export function isSmallCountry(feature) {
  return getBboxArea(feature) < SMALL_BBOX_AREA_THRESHOLD;
}

export function buildSmallCountriesGeoJSON(countries) {
  const features = countries
    .filter((country) => country.isSmall)
    .map((country) => ({
      type: "Feature",
      properties: { id: country.id, name: country.name },
      geometry: {
        type: "Point",
        coordinates: country.centroid,
      },
    }));

  return { type: "FeatureCollection", features };
}

export function getBoundsFromCountries(countries) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];

  for (const country of countries) {
    const [minX, minY, maxX, maxY] = getBbox(country.feature);
    bbox[0] = Math.min(bbox[0], minX);
    bbox[1] = Math.min(bbox[1], minY);
    bbox[2] = Math.max(bbox[2], maxX);
    bbox[3] = Math.max(bbox[3], maxY);
  }

  if (!Number.isFinite(bbox[0])) return null;

  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[3]],
  ];
}
