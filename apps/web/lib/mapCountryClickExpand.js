import { CIRCLE_CLICK_RADIUS_PX } from "@/lib/geometry";

export const COUNTRY_CLICK_EXPAND_MS = 1000;

const EXPAND_STEPS = [
  { width: 2, opacity: 0.9, radiusBoost: 2 },
  { width: 6, opacity: 0.75, radiusBoost: 5 },
  { width: 10, opacity: 0.55, radiusBoost: 8 },
  { width: 14, opacity: 0.35, radiusBoost: 10 },
  { width: 10, opacity: 0.2, radiusBoost: 7 },
  { width: 6, opacity: 0.1, radiusBoost: 4 },
  { width: 0, opacity: 0, radiusBoost: 0 },
];

const STEP_DELAYS_MS = [0, 100, 220, 380, 550, 720, 900];

export function addCountryClickExpandLayers(map) {
  if (!map.getSource("countries")) return;

  if (!map.getLayer("country-click-expand")) {
    map.addLayer({
      id: "country-click-expand",
      type: "line",
      source: "countries",
      paint: {
        "line-color": "#ffffff",
        "line-width": 0,
        "line-opacity": 0,
      },
      filter: ["==", ["get", "id"], ""],
    });
  }

  if (map.getSource("small-countries") && !map.getLayer("small-country-click-expand")) {
    map.addLayer({
      id: "small-country-click-expand",
      type: "circle",
      source: "small-countries",
      paint: {
        "circle-radius": 0,
        "circle-color": "transparent",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
        "circle-stroke-opacity": 0,
      },
      filter: ["==", ["get", "id"], ""],
    });
  }
}

function resetExpandLayers(map) {
  if (map.getLayer("country-click-expand")) {
    map.setFilter("country-click-expand", ["==", ["get", "id"], ""]);
    map.setPaintProperty("country-click-expand", "line-width", 0);
    map.setPaintProperty("country-click-expand", "line-opacity", 0);
  }

  if (map.getLayer("small-country-click-expand")) {
    map.setFilter("small-country-click-expand", ["==", ["get", "id"], ""]);
    map.setPaintProperty("small-country-click-expand", "circle-radius", 0);
    map.setPaintProperty("small-country-click-expand", "circle-stroke-opacity", 0);
  }
}

function applyExpandStep(map, countryId, step, { isSmallCircle, baseRadius }) {
  if (isSmallCircle && map.getLayer("small-country-click-expand")) {
    map.setFilter("small-country-click-expand", ["==", ["get", "id"], countryId]);
    map.setPaintProperty(
      "small-country-click-expand",
      "circle-radius",
      baseRadius + step.radiusBoost
    );
    map.setPaintProperty(
      "small-country-click-expand",
      "circle-stroke-opacity",
      step.opacity
    );
    return;
  }

  if (!map.getLayer("country-click-expand")) return;

  map.setFilter("country-click-expand", ["==", ["get", "id"], countryId]);
  map.setPaintProperty("country-click-expand", "line-width", step.width);
  map.setPaintProperty("country-click-expand", "line-opacity", step.opacity);
}

export function playMapCountryClickExpand(map, countryId, { isSmallCircle = false } = {}) {
  if (!map || !countryId) return () => {};

  addCountryClickExpandLayers(map);

  const timeouts = [];
  const baseRadius = isSmallCircle ? CIRCLE_CLICK_RADIUS_PX : 0;

  EXPAND_STEPS.forEach((step, index) => {
    const timeoutId = setTimeout(() => {
      applyExpandStep(map, countryId, step, { isSmallCircle, baseRadius });
      if (index === EXPAND_STEPS.length - 1) {
        resetExpandLayers(map);
      }
    }, STEP_DELAYS_MS[index] ?? COUNTRY_CLICK_EXPAND_MS);
    timeouts.push(timeoutId);
  });

  return () => {
    for (const timeoutId of timeouts) {
      clearTimeout(timeoutId);
    }
    resetExpandLayers(map);
  };
}
