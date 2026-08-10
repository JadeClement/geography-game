import {
  ACTIVE_LAND_COLORS,
  ACTIVE_LAND_COLOR,
  WRONG_COUNTRY_COLOR,
  CORRECT_COUNTRY_COLOR,
  TARGET_HIGHLIGHT_COLOR,
  SUBJECT_COUNTRY_COLOR,
  SUBJECT_COUNTRY_OUTLINE,
} from "@worldly/constants";

export {
  ACTIVE_LAND_COLORS,
  ACTIVE_LAND_COLOR,
  WRONG_COUNTRY_COLOR,
  CORRECT_COUNTRY_COLOR,
  TARGET_HIGHLIGHT_COLOR,
  SUBJECT_COUNTRY_COLOR,
  SUBJECT_COUNTRY_OUTLINE,
};

export function getActiveLandColor(theme) {
  return ACTIVE_LAND_COLORS[theme] ?? ACTIVE_LAND_COLORS.dark;
}

/** Fixed fills for specific countries (ISO3). */
const COUNTRY_COLOR_OVERRIDES = {
  CAN: "#14b8a6",
  USA: "#9333ea",
};

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getCountryColor(countryId, { saturationScale = 1 } = {}) {
  if (COUNTRY_COLOR_OVERRIDES[countryId]) {
    return COUNTRY_COLOR_OVERRIDES[countryId];
  }

  const hash = hashString(countryId);
  // Reserve red for wrong answers — keep assigned hues in orange→violet range.
  const hue = 25 + (hash % 311);
  const saturation = Math.round((55 + (hash % 20)) * saturationScale);
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
