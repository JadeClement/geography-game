export const ACTIVE_LAND_COLOR = "#b3d1a1";
export const WRONG_COUNTRY_COLOR = "#ff2222";
export const CORRECT_COUNTRY_COLOR = "#22c55e";
export const TARGET_HIGHLIGHT_COLOR = "#ffe600";

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getCountryColor(countryId) {
  const hash = hashString(countryId);
  const hue = hash % 360;
  const saturation = 55 + (hash % 20);
  const lightness = 45 + (hash % 15);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function getCountryColorMap(countries) {
  const map = {};
  for (const country of countries) {
    map[country.id] = getCountryColor(country.id);
  }
  return map;
}

export function enrichGeojsonWithColors(geojson, colorMap) {
  return {
    ...geojson,
    features: geojson.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        assignedColor: colorMap[feature.properties.id] ?? ACTIVE_LAND_COLOR,
      },
    })),
  };
}
