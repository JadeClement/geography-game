"use client";

import { useEffect, useRef } from "react";
import { mapContainer } from "@/lib/ui";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "@/components/ThemeProvider";
import {
  CORRECT_COUNTRY_COLOR,
  getActiveLandColor,
  TARGET_HIGHLIGHT_COLOR,
  WRONG_COUNTRY_COLOR,
} from "@/lib/countryColors";
import {
  CIRCLE_CLICK_RADIUS_PX,
  getCountryScreenBounds,
  getCountryVisibleScreenAnchor,
  MIN_CLICK_TARGET_PX,
  SMALL_COUNTRY_FLASH_RADIUS_PX,
  TUTORIAL_CIRCLE_RADIUS_PX,
  TUTORIAL_CIRCLE_STROKE_COLOR,
  TUTORIAL_CIRCLE_STROKE_WIDTH,
} from "@/lib/geometry";
import { GAME_LEVELS, isProgressiveFillLevel } from "@/lib/levels";
import { THEMES } from "@/lib/theme";
import { getCountryClickExpandEnabled } from "@/lib/countryClickExpandPrefs";
import {
  addCountryClickExpandLayers,
  playMapCountryClickExpand,
} from "@/lib/mapCountryClickExpand";
import { getDiscoverLabelScale as getDiscoverLabelScaleFromRatio } from "@/lib/discoverLabelScale";
import { isMobileViewport, MOBILE_MEDIA_QUERY } from "@/lib/viewport";

const MAP_THEME_COLORS = {
  [THEMES.LIGHT]: {
    countryFill: "#59a348",
    countryBorder: "#478a39",
    inactiveLand: "#f7f3eb",
    inactiveBorder: "#e5ddd0",
    ocean: "#bae6fd",
    smallCountryStroke: "#1e293b",
    levelBorder: "#334155",
    baseLandBg: "#ece5d6",
    baseLandLine: "#b8ab90",
  },
  [THEMES.DARK]: {
    countryFill: "#1e3a5f",
    countryBorder: "#94a3b8",
    inactiveLand: "#334155",
    inactiveBorder: "#475569",
    ocean: "#0c4a6e",
    smallCountryStroke: "#ffffff",
    levelBorder: "#e2e8f0",
    baseLandBg: "#2c3644",
    baseLandLine: "#5b6b82",
  },
};

function getMapProjection() {
  return isMobileViewport() ? "globe" : "naturalEarth";
}

function configureGlobeAtmosphere(map, theme) {
  if (typeof map.setFog !== "function") return;

  if (theme === THEMES.LIGHT) {
    map.setFog({
      color: "rgb(186, 210, 235)",
      "high-color": "rgb(36, 92, 223)",
      "horizon-blend": 0.02,
      "space-color": "rgb(186, 210, 235)",
      "star-intensity": 0,
    });
    return;
  }

  map.setFog({
    color: "rgb(186, 210, 235)",
    "high-color": "rgb(36, 92, 223)",
    "horizon-blend": 0.02,
    "space-color": "rgb(11, 11, 25)",
    "star-intensity": 0.35,
  });
}

function applyMapProjection(map, theme) {
  const useGlobe = isMobileViewport();
  map.setProjection(useGlobe ? "globe" : "naturalEarth");
  if (useGlobe) {
    configureGlobeAtmosphere(map, theme);
  }
}

function configureMobileGlobeControls(map) {
  map.touchZoomRotate.enable();
  map.dragPan.enable();
}

function setMapNavigationEnabled(map, enabled) {
  if (!map) return;
  const handlers = [
    "dragPan",
    "scrollZoom",
    "boxZoom",
    "dragRotate",
    "doubleClickZoom",
    "touchZoomRotate",
    "keyboard",
  ];
  for (const name of handlers) {
    const handler = map[name];
    if (!handler) continue;
    if (enabled) handler.enable();
    else handler.disable();
  }
}

function getMapThemeColors(theme) {
  return MAP_THEME_COLORS[theme] ?? MAP_THEME_COLORS[THEMES.DARK];
}

function getLevelFillColorExpression(level, landColor) {
  if (level === GAME_LEVELS.FIND_FILL) {
    return [
      "case",
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "flashWrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "filled"], true],
      ["coalesce", ["get", "assignedColor"], landColor],
      landColor,
    ];
  }

  if (level === GAME_LEVELS.NAME_FILL) {
    return [
      "case",
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "filled"], true],
      CORRECT_COUNTRY_COLOR,
      ["==", ["feature-state", "target"], true],
      TARGET_HIGHLIGHT_COLOR,
      landColor,
    ];
  }

  return [
    "case",
    ["==", ["feature-state", "wrong"], true],
    WRONG_COUNTRY_COLOR,
    ["==", ["feature-state", "showColor"], true],
    ["coalesce", ["get", "assignedColor"], landColor],
    landColor,
  ];
}

function getScreenSizePx(map, { minLng, minLat, maxLng, maxLat }) {
  const nw = map.project([minLng, maxLat]);
  const se = map.project([maxLng, minLat]);
  return Math.max(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y));
}

function updateSmallCountryCircles(map, smallCountriesGeojson, { forceShow = false } = {}) {
  if (!map.getSource("small-countries") || !smallCountriesGeojson?.features?.length) {
    return;
  }

  for (const feature of smallCountriesGeojson.features) {
    const { id, minLng, minLat, maxLng, maxLat } = feature.properties;
    const screenSize = getScreenSizePx(map, { minLng, minLat, maxLng, maxLat });
    const show = forceShow || screenSize < MIN_CLICK_TARGET_PX;

    map.setFeatureState(
      { source: "small-countries", id },
      {
        opacity: show ? 1 : 0,
        radius: show
          ? forceShow
            ? TUTORIAL_CIRCLE_RADIUS_PX
            : CIRCLE_CLICK_RADIUS_PX
          : 0,
      }
    );
  }
}

function applySmallCountryCirclePaintMode(
  map,
  { forceShow, level, strokeColor, landColor }
) {
  if (!map.getLayer("small-country-circles")) return;

  if (forceShow) {
    map.setPaintProperty("small-country-circles", "circle-radius", TUTORIAL_CIRCLE_RADIUS_PX);
    map.setPaintProperty("small-country-circles", "circle-stroke-opacity", 1);
    map.setPaintProperty("small-country-circles", "circle-stroke-width", TUTORIAL_CIRCLE_STROKE_WIDTH);
    map.setPaintProperty("small-country-circles", "circle-stroke-color", TUTORIAL_CIRCLE_STROKE_COLOR);
    return;
  }

  map.setPaintProperty("small-country-circles", "circle-radius", [
    "coalesce",
    ["feature-state", "radius"],
    0,
  ]);
  map.setPaintProperty("small-country-circles", "circle-stroke-opacity", [
    "coalesce",
    ["feature-state", "opacity"],
    0,
  ]);
  map.setPaintProperty("small-country-circles", "circle-stroke-width", 2);
  map.setPaintProperty(
    "small-country-circles",
    "circle-stroke-color",
    getSmallCircleStrokeColorExpression(level, strokeColor, landColor)
  );
}

function isCircleClickTarget(map, circleFeature) {
  const id = circleFeature.properties.id;
  const state = map.getFeatureState({ source: "small-countries", id });
  return (state?.opacity ?? 0) > 0;
}

function getSmallCircleStrokeColorExpression(level, defaultStrokeColor, landColor) {
  let base;
  if (!isProgressiveFillLevel(level)) {
    base = defaultStrokeColor;
  } else if (level === GAME_LEVELS.FIND_FILL) {
    base = [
      "case",
      ["==", ["feature-state", "flashWrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "filled"], true],
      ["coalesce", ["get", "assignedColor"], landColor],
      defaultStrokeColor,
    ];
  } else {
    base = [
      "case",
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "filled"], true],
      CORRECT_COUNTRY_COLOR,
      ["==", ["feature-state", "target"], true],
      TARGET_HIGHLIGHT_COLOR,
      defaultStrokeColor,
    ];
  }

  // A "highlight" (Learn anchor / "which country is highlighted") flashes the
  // circle's border red so a circled small country is easy to spot without
  // filling the whole circle. The blink is driven by toggling the feature-state.
  return [
    "case",
    ["==", ["feature-state", "highlight"], true],
    WRONG_COUNTRY_COLOR,
    base,
  ];
}

function addSmallCountryLayers(map, smallCountriesGeojson, strokeColor, level, landColor) {
  if (!smallCountriesGeojson?.features?.length) return;

  if (!map.getSource("small-countries")) {
    map.addSource("small-countries", {
      type: "geojson",
      data: smallCountriesGeojson,
      promoteId: "id",
    });

    map.addLayer({
      id: "small-country-circles",
      type: "circle",
      source: "small-countries",
      paint: {
        "circle-radius": ["coalesce", ["feature-state", "radius"], 0],
        "circle-color": [
          "case",
          ["==", ["feature-state", "target"], true],
          TARGET_HIGHLIGHT_COLOR,
          "transparent",
        ],
        "circle-stroke-color": getSmallCircleStrokeColorExpression(level, strokeColor, landColor),
        "circle-stroke-width": 2,
        "circle-stroke-opacity": ["coalesce", ["feature-state", "opacity"], 0],
      },
    });

    map.addLayer({
      id: "small-country-flash",
      type: "circle",
      source: "small-countries",
      paint: {
        "circle-radius": SMALL_COUNTRY_FLASH_RADIUS_PX,
        "circle-color": WRONG_COUNTRY_COLOR,
        "circle-opacity": 0,
        "circle-stroke-color": WRONG_COUNTRY_COLOR,
        "circle-stroke-width": 3,
        "circle-stroke-opacity": 0,
      },
      filter: ["==", ["get", "id"], ""],
    });
  } else {
    map.getSource("small-countries").setData(smallCountriesGeojson);
  }

  updateSmallCountryCircles(map, smallCountriesGeojson);
}

function pickClickedFeature(map, features) {
  const circleFeature = features.find((f) => f.layer.id === "small-country-circles");
  const fillFeature = features.find((f) => f.layer.id === "country-fill");

  if (circleFeature && fillFeature && !isCircleClickTarget(map, circleFeature)) {
    return fillFeature;
  }

  return circleFeature ?? fillFeature ?? features[0];
}

function applyMapView(map, mapView, { onSettled } = {}) {
  if (!mapView) return;

  const runFit = () => {
    map.resize();

    if (mapView.type === "camera") {
      map.jumpTo({
        center: mapView.center,
        zoom: mapView.zoom,
        padding: mapView.padding ?? 48,
        duration: 0,
      });
    } else {
      map.fitBounds(mapView.bounds, {
        padding: mapView.padding ?? 48,
        duration: 0,
        maxZoom: mapView.maxZoom ?? 5,
      });
    }

    if (onSettled) {
      map.once("idle", () => onSettled(map.getZoom()));
    }
  };

  if (map.isStyleLoaded() && map.loaded()) {
    map.once("idle", runFit);
  } else {
    map.once("load", () => map.once("idle", runFit));
  }
}

function configureBaseStyle(map, theme) {
  const colors = getMapThemeColors(theme);
  const layers = map.getStyle()?.layers ?? [];

  for (const layer of layers) {
    const { id, type } = layer;

    if (type === "symbol") {
      map.setLayoutProperty(id, "visibility", "none");
      continue;
    }

    if (type === "line" && (id.includes("admin-1") || id.includes("admin-2"))) {
      map.setLayoutProperty(id, "visibility", "none");
      continue;
    }

    if (colors.ocean) {
      if (type === "background") {
        map.setPaintProperty(id, "background-color", colors.ocean);
      } else if (type === "fill" && id.includes("water")) {
        map.setPaintProperty(id, "fill-color", colors.ocean);
      }
    }
  }
}

const BASE_LAND_HATCH_ID = "base-land-hatch";

function createHatchPatternImage(bgColor, lineColor) {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.25;
  ctx.lineCap = "square";
  // Corner-to-corner diagonal tiles seamlessly; overshoot slightly so the
  // stroke joins cleanly across tile edges.
  ctx.beginPath();
  ctx.moveTo(-1, size + 1);
  ctx.lineTo(size + 1, -1);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function addBaseLandLayer(map, baseLandGeojson, mapColors, beforeId) {
  const data = baseLandGeojson ?? { type: "FeatureCollection", features: [] };
  const image = createHatchPatternImage(mapColors.baseLandBg, mapColors.baseLandLine);

  if (map.hasImage(BASE_LAND_HATCH_ID)) {
    map.updateImage(BASE_LAND_HATCH_ID, image);
  } else {
    map.addImage(BASE_LAND_HATCH_ID, image, { pixelRatio: 1 });
  }

  if (map.getSource("base-land")) {
    map.getSource("base-land").setData(data);
    return;
  }

  map.addSource("base-land", { type: "geojson", data });

  const layer = {
    id: "base-land-fill",
    type: "fill",
    source: "base-land",
    paint: {
      "fill-pattern": BASE_LAND_HATCH_ID,
      "fill-outline-color": mapColors.baseLandLine,
    },
  };

  if (beforeId && map.getLayer(beforeId)) {
    map.addLayer(layer, beforeId);
  } else {
    map.addLayer(layer);
  }
}

function addInactiveCountryBorders(map, mapColors) {
  if (map.getLayer("inactive-country-borders") || !map.getSource("inactive-countries")) {
    return;
  }

  // Same crisp border as playable countries so overseas scraps in-region
  // (e.g. French Guiana during South America) don't look cut out of the map.
  const layer = {
    id: "inactive-country-borders",
    type: "line",
    source: "inactive-countries",
    paint: {
      "line-color": mapColors.levelBorder,
      "line-width": 0.5,
      "line-opacity": 0.85,
    },
  };

  if (map.getLayer("country-fill")) {
    map.addLayer(layer, "country-fill");
  } else {
    map.addLayer(layer);
  }
}

function addCountryLayers(map, geojson, inactiveGeojson, mapColors, level, landColor) {
  if (map.getSource("inactive-countries")) {
    map.getSource("inactive-countries").setData(inactiveGeojson);
    addInactiveCountryBorders(map, mapColors);
  } else {
    map.addSource("inactive-countries", {
      type: "geojson",
      data: inactiveGeojson,
    });

    map.addLayer({
      id: "inactive-country-fill",
      type: "fill",
      source: "inactive-countries",
      paint: {
        "fill-color": mapColors.inactiveLand,
        "fill-opacity": 1,
        "fill-outline-color": mapColors.inactiveBorder,
      },
    });

    addInactiveCountryBorders(map, mapColors);
  }

  if (map.getSource("countries")) {
    map.getSource("countries").setData(geojson);
    if (map.getLayer("country-fill")) {
      map.setPaintProperty("country-fill", "fill-color", getLevelFillColorExpression(level, landColor));
    }
    return;
  }

  map.addSource("countries", {
    type: "geojson",
    data: geojson,
    promoteId: "id",
  });

  map.addLayer({
    id: "country-fill",
    type: "fill",
    source: "countries",
    paint: {
      "fill-color": getLevelFillColorExpression(level, landColor),
      "fill-opacity": 0.92,
      "fill-outline-color": mapColors.levelBorder,
    },
  });

  map.addLayer({
    id: "country-target-outline",
    type: "line",
    source: "countries",
    paint: {
      "line-color": mapColors.levelBorder,
      "line-width": 3,
      "line-opacity": 0.95,
    },
    filter: ["==", ["get", "id"], ""],
  });

  map.addLayer({
    id: "country-highlight",
    type: "fill",
    source: "countries",
    paint: {
      "fill-color": "#ef4444",
      "fill-opacity": 0.75,
    },
    filter: ["==", ["get", "id"], ""],
  });

  map.addLayer({
    id: "country-borders",
    type: "line",
    source: "countries",
    paint: {
      "line-color": mapColors.levelBorder,
      "line-width": 0.5,
    },
  });
}

function syncSmallCountryFeatureStates(
  map,
  smallCountriesGeojson,
  { wrongCountryIds, flashWrongCountryIds, filledCountryIds }
) {
  if (!map.getSource("small-countries") || !smallCountriesGeojson?.features?.length) {
    return;
  }

  const wrongSet = new Set(wrongCountryIds);
  const flashWrongSet = new Set(flashWrongCountryIds);
  const filledSet = new Set(filledCountryIds);

  for (const feature of smallCountriesGeojson.features) {
    const id = feature.properties.id;
    map.setFeatureState(
      { source: "small-countries", id },
      {
        wrong: wrongSet.has(id),
        flashWrong: flashWrongSet.has(id),
        filled: filledSet.has(id),
      }
    );
  }
}

function syncCountryFeatureStates(
  map,
  geojson,
  { wrongCountryIds, flashWrongCountryIds, showColorCountryIds, filledCountryIds }
) {
  if (!map.getSource("countries") || !geojson?.features?.length) return;

  const wrongSet = new Set(wrongCountryIds);
  const flashWrongSet = new Set(flashWrongCountryIds);
  const showColorSet = new Set(showColorCountryIds);
  const filledSet = new Set(filledCountryIds);

  for (const feature of geojson.features) {
    const id = feature.properties.id;
    // The `target` feature-state is owned by the target-flash effect so it can
    // blink; merging without it here preserves the current blink value.
    map.setFeatureState(
      { source: "countries", id },
      {
        wrong: wrongSet.has(id),
        flashWrong: flashWrongSet.has(id),
        showColor: showColorSet.has(id),
        filled: filledSet.has(id),
      }
    );
  }
}

export default function MapboxMap({
  geojson,
  inactiveGeojson,
  baseLandGeojson,
  smallCountriesGeojson,
  gameActive,
  // When false, pan/zoom/rotate are locked so a Learn card sitting on the map
  // can't be undermined by dragging the map underneath it (and so comparison
  // questions can't be answered by peeking at shapes/sizes).
  mapNavigationEnabled = true,
  level,
  wrongCountryIds,
  flashWrongCountryIds,
  showColorCountryIds,
  filledCountryIds,
  highlightTargetCountryId,
  highlightCountryId,
  flashSmallCountryId,
  mapView,
  forceShowSmallCountryCircles = false,
  /** Discover: allow clicks on out-of-region land (e.g. French Guiana in South America). */
  allowInactiveCountryClicks = false,
  onCountryClick,
  onCountryHover,
  onRegisterMapProject,
  onMapViewChange,
}) {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const referenceZoomRef = useRef(null);
  const fillFlashIntervalRef = useRef(null);
  const circleFlashIntervalRef = useRef(null);
  const targetFlashIntervalRef = useRef(null);
  const highlightSmallCircleIdRef = useRef(null);
  const expandCleanupRef = useRef(null);
  const onCountryClickRef = useRef(onCountryClick);
  const onCountryHoverRef = useRef(onCountryHover);
  const gameActiveRef = useRef(gameActive);
  const mapNavigationEnabledRef = useRef(mapNavigationEnabled);
  const smallCountriesGeojsonRef = useRef(smallCountriesGeojson);
  const forceShowSmallCountryCirclesRef = useRef(forceShowSmallCountryCircles);
  const allowInactiveCountryClicksRef = useRef(allowInactiveCountryClicks);

  onCountryClickRef.current = onCountryClick;
  onCountryHoverRef.current = onCountryHover;
  gameActiveRef.current = gameActive;
  mapNavigationEnabledRef.current = mapNavigationEnabled;
  smallCountriesGeojsonRef.current = smallCountriesGeojson;
  forceShowSmallCountryCirclesRef.current = forceShowSmallCountryCircles;
  allowInactiveCountryClicksRef.current = allowInactiveCountryClicks;

  useEffect(() => {
    if (!containerRef.current || !geojson) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    mapboxgl.accessToken = token;

    const mapStyle =
      theme === THEMES.LIGHT
        ? "mapbox://styles/mapbox/light-v11"
        : "mapbox://styles/mapbox/dark-v11";
    const mapColors = getMapThemeColors(theme);
    const landColor = getActiveLandColor(theme);
    const initialCenter =
      mapView?.type === "camera" ? mapView.center : [10, 20];
    const initialZoom = mapView?.type === "camera" ? mapView.zoom : 1.2;

    const useGlobe = isMobileViewport();

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: initialCenter,
      zoom: initialZoom,
      projection: getMapProjection(),
    });

    if (!useGlobe) {
      map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    }
    mapRef.current = map;

    const handleClick = (event) => {
      if (!gameActiveRef.current) return;

      const layers = [];
      if (map.getLayer("country-fill")) layers.push("country-fill");
      if (map.getLayer("small-country-circles")) layers.push("small-country-circles");
      if (
        allowInactiveCountryClicksRef.current &&
        map.getLayer("inactive-country-fill")
      ) {
        layers.push("inactive-country-fill");
      }
      if (layers.length === 0) return;

      const features = map.queryRenderedFeatures(event.point, { layers });
      if (features.length === 0) return;

      const feature = pickClickedFeature(map, features);
      const countryId = feature.properties?.id ?? feature.id;
      const isInactive = feature.layer?.id === "inactive-country-fill";

      if (!isInactive && getCountryClickExpandEnabled() && countryId) {
        if (expandCleanupRef.current) {
          expandCleanupRef.current();
          expandCleanupRef.current = null;
        }
        const isSmallCircle =
          feature.layer?.id === "small-country-circles" &&
          isCircleClickTarget(map, feature);
        expandCleanupRef.current = playMapCountryClickExpand(map, countryId, {
          isSmallCircle,
        });
      }

      onCountryClickRef.current(feature, {
        lngLat: event.lngLat
          ? { lng: event.lngLat.lng, lat: event.lngLat.lat }
          : null,
        layerId: feature.layer?.id ?? null,
        inactive: isInactive,
      });
    };

    const setCirclePointerCursor = (event) => {
      const feature = event.features?.[0];
      if (feature && isCircleClickTarget(map, feature)) {
        map.getCanvas().style.cursor = "pointer";
      }
    };

    const setPointerCursor = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointerCursor = () => {
      map.getCanvas().style.cursor = "";
    };

    const refreshSmallCountryCircles = () => {
      applySmallCountryCirclePaintMode(map, {
        forceShow: forceShowSmallCountryCirclesRef.current,
        level,
        strokeColor: mapColors.smallCountryStroke,
        landColor,
      });
      updateSmallCountryCircles(map, smallCountriesGeojsonRef.current, {
        forceShow: forceShowSmallCountryCirclesRef.current,
      });
    };

    const handleResize = () => {
      map.resize();
      refreshSmallCountryCircles();
    };

    const handleViewChangeForCircles = () => {
      refreshSmallCountryCircles();
    };

    map.on("load", () => {
      configureBaseStyle(map, theme);
      if (useGlobe) {
        configureGlobeAtmosphere(map, theme);
        configureMobileGlobeControls(map);
      }
      // Re-apply after mobile globe helpers (they re-enable pan/zoom).
      setMapNavigationEnabled(map, mapNavigationEnabledRef.current);
      addCountryLayers(map, geojson, inactiveGeojson, mapColors, level, landColor);
      addBaseLandLayer(map, baseLandGeojson, mapColors, "country-fill");

      if (smallCountriesGeojson?.features?.length) {
        addSmallCountryLayers(map, smallCountriesGeojson, mapColors.smallCountryStroke, level, landColor);
      }

      addCountryClickExpandLayers(map);

      map.on("zoom", handleViewChangeForCircles);
      map.on("moveend", handleViewChangeForCircles);

      map.on("click", handleClick);
      map.on("mouseenter", "country-fill", setPointerCursor);
      map.on("mouseleave", "country-fill", clearPointerCursor);
      map.on("mouseenter", "small-country-circles", setCirclePointerCursor);
      map.on("mouseleave", "small-country-circles", clearPointerCursor);
      if (map.getLayer("inactive-country-fill")) {
        const setInactivePointerCursor = () => {
          if (allowInactiveCountryClicksRef.current) {
            map.getCanvas().style.cursor = "pointer";
          }
        };
        map.on("mouseenter", "inactive-country-fill", setInactivePointerCursor);
        map.on("mouseleave", "inactive-country-fill", clearPointerCursor);
      }

      if (mapView) {
        applyMapView(map, mapView, {
          onSettled: (zoom) => {
            referenceZoomRef.current = zoom;
          },
        });
        map.once("idle", refreshSmallCountryCircles);
      } else {
        map.once("idle", () => {
          referenceZoomRef.current = map.getZoom();
        });
        refreshSmallCountryCircles();
      }

      map.resize();
    });

    window.addEventListener("resize", handleResize);

    const mobileMediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleProjectionChange = () => {
      if (!mapRef.current) return;
      applyMapProjection(mapRef.current, theme);
      mapRef.current.once("idle", () => {
        if (!mapRef.current) return;
        applySmallCountryCirclePaintMode(mapRef.current, {
          forceShow: forceShowSmallCountryCirclesRef.current,
          level,
          strokeColor: getMapThemeColors(theme).smallCountryStroke,
          landColor: getActiveLandColor(theme),
        });
        updateSmallCountryCircles(mapRef.current, smallCountriesGeojsonRef.current, {
          forceShow: forceShowSmallCountryCirclesRef.current,
        });
      });
    };
    mobileMediaQuery.addEventListener("change", handleProjectionChange);

    return () => {
      mobileMediaQuery.removeEventListener("change", handleProjectionChange);
      window.removeEventListener("resize", handleResize);
      map.off("zoom", handleViewChangeForCircles);
      map.off("moveend", handleViewChangeForCircles);
      if (fillFlashIntervalRef.current) {
        clearInterval(fillFlashIntervalRef.current);
      }
      if (circleFlashIntervalRef.current) {
        clearInterval(circleFlashIntervalRef.current);
      }
      if (expandCleanupRef.current) {
        expandCleanupRef.current();
        expandCleanupRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
    // NOTE: `mapView` is intentionally NOT a dependency. Camera/padding changes
    // (e.g. reserving room for the Learn question card) must not destroy and
    // rebuild the whole GL map — that wipes the country source/layers and the
    // active highlight during the async style reload, leaving a blank world map.
    // The dedicated effect below re-applies `mapView` live via `applyMapView`.
  }, [geojson, inactiveGeojson, baseLandGeojson, smallCountriesGeojson, theme, level]);

  // Lock / unlock camera interaction without tearing down the map.
  useEffect(() => {
    setMapNavigationEnabled(mapRef.current, mapNavigationEnabled);
  }, [mapNavigationEnabled, geojson, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onCountryHover) return undefined;

    const handleHover = (event) => {
      const feature = event.features?.[0];
      const countryId = feature?.properties?.id ?? feature?.id ?? null;
      onCountryHoverRef.current?.(countryId);
    };

    const handleLeave = () => {
      onCountryHoverRef.current?.(null);
    };

    const attach = () => {
      if (!map.getLayer("country-fill")) return;

      map.on("mousemove", "country-fill", handleHover);
      map.on("mouseleave", "country-fill", handleLeave);

      if (map.getLayer("small-country-circles")) {
        map.on("mousemove", "small-country-circles", handleHover);
        map.on("mouseleave", "small-country-circles", handleLeave);
      }
    };

    const detach = () => {
      map.off("mousemove", "country-fill", handleHover);
      map.off("mouseleave", "country-fill", handleLeave);
      map.off("mousemove", "small-country-circles", handleHover);
      map.off("mouseleave", "small-country-circles", handleLeave);
    };

    if (map.isStyleLoaded()) {
      attach();
    } else {
      map.once("load", attach);
    }

    return () => {
      map.off("load", attach);
      detach();
      onCountryHoverRef.current?.(null);
    };
  }, [onCountryHover, geojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getSource("countries")) return;

    const mapColors = getMapThemeColors(theme);
    const landColor = getActiveLandColor(theme);

    addCountryLayers(map, geojson, inactiveGeojson, mapColors, level, landColor);
    addBaseLandLayer(map, baseLandGeojson, mapColors, "country-fill");

    if (map.getLayer("inactive-country-fill")) {
      map.setPaintProperty("inactive-country-fill", "fill-color", mapColors.inactiveLand);
      map.setPaintProperty(
        "inactive-country-fill",
        "fill-outline-color",
        mapColors.inactiveBorder
      );
    }

    if (map.getLayer("inactive-country-borders")) {
      map.setPaintProperty("inactive-country-borders", "line-color", mapColors.levelBorder);
    }

    if (map.getLayer("country-fill")) {
      map.setPaintProperty("country-fill", "fill-color", getLevelFillColorExpression(level, landColor));
      map.setPaintProperty("country-fill", "fill-outline-color", mapColors.levelBorder);
      map.setPaintProperty("country-borders", "line-color", mapColors.levelBorder);
    }

    if (map.getLayer("small-country-circles")) {
      applySmallCountryCirclePaintMode(map, {
        forceShow: forceShowSmallCountryCircles,
        level,
        strokeColor: mapColors.smallCountryStroke,
        landColor,
      });
    }

    if (smallCountriesGeojson?.features?.length) {
      addSmallCountryLayers(map, smallCountriesGeojson, mapColors.smallCountryStroke, level, landColor);
    } else if (map.getSource("small-countries")) {
      map.getSource("small-countries").setData({
        type: "FeatureCollection",
        features: [],
      });
    }

    addCountryClickExpandLayers(map);

    if (mapView) {
      applyMapView(map, mapView, {
        onSettled: (zoom) => {
          referenceZoomRef.current = zoom;
          onMapViewChange?.();
        },
      });
      map.once("idle", () => {
        applySmallCountryCirclePaintMode(map, {
          forceShow: forceShowSmallCountryCircles,
          level,
          strokeColor: mapColors.smallCountryStroke,
          landColor,
        });
        updateSmallCountryCircles(map, smallCountriesGeojson, {
          forceShow: forceShowSmallCountryCircles,
        });
      });
    } else {
      applySmallCountryCirclePaintMode(map, {
        forceShow: forceShowSmallCountryCircles,
        level,
        strokeColor: mapColors.smallCountryStroke,
        landColor,
      });
      updateSmallCountryCircles(map, smallCountriesGeojson, {
        forceShow: forceShowSmallCountryCircles,
      });
    }
  }, [geojson, inactiveGeojson, baseLandGeojson, smallCountriesGeojson, mapView, theme, level, forceShowSmallCountryCircles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("small-country-circles")) return;

    const mapColors = getMapThemeColors(theme);
    const landColor = getActiveLandColor(theme);

    const refresh = () => {
      applySmallCountryCirclePaintMode(map, {
        forceShow: forceShowSmallCountryCircles,
        level,
        strokeColor: mapColors.smallCountryStroke,
        landColor,
      });
      updateSmallCountryCircles(map, smallCountriesGeojsonRef.current, {
        forceShow: forceShowSmallCountryCircles,
      });
    };

    refresh();
    if (map.isStyleLoaded()) {
      map.once("idle", refresh);
    }
  }, [forceShowSmallCountryCircles, level, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const runSync = () => {
      if (!map.getSource("countries")) return;
      syncCountryFeatureStates(map, geojson, {
        wrongCountryIds,
        flashWrongCountryIds,
        showColorCountryIds,
        filledCountryIds,
      });
      syncSmallCountryFeatureStates(map, smallCountriesGeojson, {
        wrongCountryIds,
        flashWrongCountryIds,
        filledCountryIds,
      });
    };

    if (map.isStyleLoaded()) {
      runSync();
    } else {
      map.once("load", runSync);
    }
  }, [
    geojson,
    smallCountriesGeojson,
    wrongCountryIds,
    flashWrongCountryIds,
    showColorCountryIds,
    filledCountryIds,
  ]);

  // Blinks the Name-it Level 1 target between yellow and the neutral land color
  // so it's obvious which country to name. Owns the `target` feature-state for
  // both the country fill and the small-country circle (fill + stroke).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (targetFlashIntervalRef.current) {
      clearInterval(targetFlashIntervalRef.current);
      targetFlashIntervalRef.current = null;
    }

    const targetId = highlightTargetCountryId;

    const applyTargetState = (on) => {
      const activeMap = mapRef.current;
      if (!activeMap || !targetId) return;
      if (activeMap.getSource("countries")) {
        activeMap.setFeatureState({ source: "countries", id: targetId }, { target: on });
      }
      if (activeMap.getSource("small-countries")) {
        activeMap.setFeatureState({ source: "small-countries", id: targetId }, { target: on });
      }
    };

    if (!targetId) return;

    let visible = true;
    applyTargetState(true);
    targetFlashIntervalRef.current = setInterval(() => {
      visible = !visible;
      applyTargetState(visible);
    }, 450);

    return () => {
      if (targetFlashIntervalRef.current) {
        clearInterval(targetFlashIntervalRef.current);
        targetFlashIntervalRef.current = null;
      }
      applyTargetState(false);
    };
  }, [highlightTargetCountryId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("country-highlight")) return;

    if (fillFlashIntervalRef.current) {
      clearInterval(fillFlashIntervalRef.current);
      fillFlashIntervalRef.current = null;
    }

    // Mirror the highlight onto the small-country circle marker (if the target
    // is a small country) so a circled country is easy to spot — the tiny fill
    // polygon alone is easy to miss. We only flash its border (red), not fill it.
    const setSmallCircleHighlight = (id, on) => {
      if (!id || !map.getSource("small-countries")) return;
      map.setFeatureState({ source: "small-countries", id }, { highlight: on });
    };
    if (highlightSmallCircleIdRef.current !== highlightCountryId) {
      setSmallCircleHighlight(highlightSmallCircleIdRef.current, false);
      highlightSmallCircleIdRef.current = highlightCountryId ?? null;
    }

    if (!highlightCountryId) {
      map.setFilter("country-highlight", ["==", ["get", "id"], ""]);
      return;
    }

    map.setFilter("country-highlight", [
      "==",
      ["get", "id"],
      highlightCountryId,
    ]);

    let visible = true;
    setSmallCircleHighlight(highlightCountryId, true);
    fillFlashIntervalRef.current = setInterval(() => {
      if (!mapRef.current?.getLayer("country-highlight")) return;
      visible = !visible;
      map.setPaintProperty(
        "country-highlight",
        "fill-opacity",
        visible ? 0.75 : 0.15
      );
      // Flash the small-country circle border in sync (red ↔ normal stroke).
      setSmallCircleHighlight(highlightCountryId, visible);
    }, 450);

    return () => {
      if (fillFlashIntervalRef.current) {
        clearInterval(fillFlashIntervalRef.current);
        fillFlashIntervalRef.current = null;
      }
    };
  }, [highlightCountryId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("small-country-flash")) return;

    if (circleFlashIntervalRef.current) {
      clearInterval(circleFlashIntervalRef.current);
      circleFlashIntervalRef.current = null;
    }

    if (!flashSmallCountryId) {
      map.setFilter("small-country-flash", ["==", ["get", "id"], ""]);
      return;
    }

    map.setFilter("small-country-flash", [
      "==",
      ["get", "id"],
      flashSmallCountryId,
    ]);

    let visible = true;
    const updateFlashOpacity = () => {
      if (!mapRef.current?.getLayer("small-country-flash")) return;
      map.setPaintProperty(
        "small-country-flash",
        "circle-opacity",
        visible ? 0.42 : 0.1
      );
      map.setPaintProperty(
        "small-country-flash",
        "circle-stroke-opacity",
        visible ? 1 : 0.35
      );
    };

    updateFlashOpacity();
    circleFlashIntervalRef.current = setInterval(() => {
      visible = !visible;
      updateFlashOpacity();
    }, 450);

    map.on("zoom", updateFlashOpacity);
    map.on("moveend", updateFlashOpacity);

    return () => {
      map.off("zoom", updateFlashOpacity);
      map.off("moveend", updateFlashOpacity);
      if (circleFlashIntervalRef.current) {
        clearInterval(circleFlashIntervalRef.current);
        circleFlashIntervalRef.current = null;
      }
    };
  }, [flashSmallCountryId, smallCountriesGeojson]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || !onRegisterMapProject) return undefined;

    const register = () => {
      if (!map.getSource("countries")) return;

      const projectToOverlay = (lng, lat) => {
        const point = map.project([lng, lat]);
        const overlayRoot = container.parentElement;
        if (!overlayRoot) return { x: point.x, y: point.y };

        const mapRect = container.getBoundingClientRect();
        const overlayRect = overlayRoot.getBoundingClientRect();
        return {
          x: point.x + mapRect.left - overlayRect.left,
          y: point.y + mapRect.top - overlayRect.top,
        };
      };

      onRegisterMapProject({
        projectPoint(country) {
          const centroid = country.centroid;
          if (!centroid) return null;
          const [lng, lat] = centroid;
          return projectToOverlay(lng, lat);
        },
        projectBounds(country) {
          return getCountryScreenBounds(country, projectToOverlay);
        },
        projectDiscoverAnchor(country, viewportRect) {
          return getCountryVisibleScreenAnchor(country, projectToOverlay, viewportRect);
        },
        getDiscoverLabelScale() {
          const refZoom = referenceZoomRef.current;
          if (refZoom == null) return 1;
          const zoomRatio = 2 ** (map.getZoom() - refZoom);
          return getDiscoverLabelScaleFromRatio(zoomRatio);
        },
      });
    };

    const handleViewChange = () => {
      onMapViewChange?.();
    };

    const setup = () => {
      register();
      map.on("move", handleViewChange);
      map.on("zoom", handleViewChange);
      map.on("resize", handleViewChange);
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("load", setup);
    }

    return () => {
      map.off("load", setup);
      map.off("move", handleViewChange);
      map.off("zoom", handleViewChange);
      map.off("resize", handleViewChange);
      onRegisterMapProject(null);
    };
  }, [geojson, onRegisterMapProject, onMapViewChange]);

  return <div ref={containerRef} className={mapContainer} />;
}
