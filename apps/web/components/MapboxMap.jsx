"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { mapContainer } from "@/lib/ui";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "@/components/ThemeProvider";
import {
  CORRECT_COUNTRY_COLOR,
  getActiveLandColor,
  SUBJECT_COUNTRY_COLOR,
  SUBJECT_COUNTRY_OUTLINE,
  TARGET_HIGHLIGHT_COLOR,
  WRONG_COUNTRY_COLOR,
} from "@/lib/countryColors";
import {
  CIRCLE_CLICK_RADIUS_PX,
  CIRCLE_STROKE_WIDTH,
  getCountryScreenBounds,
  getCountryFillScreenBounds,
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
import { isLngLatBehindGlobe, isShowingGlobe, setGlobeHorizonShift } from "@/lib/mapboxGlobe";
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
  setGlobeHorizonShift(map, true);

  if (typeof map.setFog !== "function") return;

  // horizon-blend of 0.02 (Mapbox's "thin atmosphere" demo) leaves a hard
  // space-colored gap at the limb. Default at low zoom is ~0.2.
  if (theme === THEMES.LIGHT) {
    map.setFog({
      color: "rgb(186, 210, 235)",
      "high-color": "rgb(36, 92, 223)",
      "horizon-blend": 0.18,
      "space-color": "rgb(186, 210, 235)",
      "star-intensity": 0,
      range: [-0.5, 7],
    });
    return;
  }

  map.setFog({
    color: "rgb(186, 210, 235)",
    "high-color": "rgb(36, 92, 223)",
    "horizon-blend": 0.18,
    "space-color": "rgb(11, 17, 32)",
    "star-intensity": 0.35,
    range: [-0.5, 7],
  });
}

function applyMapProjection(map, theme) {
  const useGlobe = isMobileViewport();
  map.setProjection(useGlobe ? "globe" : "naturalEarth");
  if (typeof map.setMaxPitch === "function") {
    map.setMaxPitch(useGlobe ? 0 : 85);
  }
  if (useGlobe) {
    if (typeof map.setPitch === "function") map.setPitch(0);
    map.touchPitch?.disable();
    configureGlobeAtmosphere(map, theme);
  } else {
    setGlobeHorizonShift(map, false);
  }
}

function configureMobileGlobeControls(map) {
  map.touchZoomRotate.enable();
  map.dragPan.enable();
  map.touchPitch?.disable();
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

/** Mapbox feature-state: 0=none, 1=prompt/yellow, 2=error/red, 3=success/white, 4=correct/green */
function highlightKindFromTone(tone) {
  if (tone === "error") return 2;
  if (tone === "success") return 3;
  if (tone === "correct") return 4;
  return 1;
}

function getLevelFillColorExpression(level, landColor) {
  // Solid Learn tones on the MAIN fill so prompts can't lose color to camera/
  // effect races. Error/red (kind 2) is intentionally omitted — Find It reveal
  // flashes via the country-highlight overlay; a solid red base hid that pulse.
  const highlightBranches = [
    ["==", ["feature-state", "highlightKind"], 3],
    SUBJECT_COUNTRY_COLOR,
    ["==", ["feature-state", "highlightKind"], 4],
    CORRECT_COUNTRY_COLOR,
    ["==", ["feature-state", "highlightKind"], 1],
    TARGET_HIGHLIGHT_COLOR,
  ];

  if (level === GAME_LEVELS.FIND_FILL) {
    return [
      "case",
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "flashWrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "secondTry"], true],
      TARGET_HIGHLIGHT_COLOR,
      ...highlightBranches,
      ["==", ["feature-state", "filled"], true],
      ["coalesce", ["get", "assignedColor"], landColor],
      ["==", ["feature-state", "showColor"], true],
      ["coalesce", ["get", "assignedColor"], landColor],
      landColor,
    ];
  }

  if (level === GAME_LEVELS.NAME_FILL) {
    return [
      "case",
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "secondTry"], true],
      TARGET_HIGHLIGHT_COLOR,
      ...highlightBranches,
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
    ["==", ["feature-state", "secondTry"], true],
    TARGET_HIGHLIGHT_COLOR,
    ...highlightBranches,
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

function smallCircleFeedbackOnlyOpacity({ fill = false } = {}) {
  const on = fill ? 0.92 : 1;
  return [
    "case",
    ["==", ["feature-state", "wrong"], true],
    on,
    ["==", ["feature-state", "highlight"], true],
    fill
      ? ["coalesce", ["feature-state", "highlightPulse"], 0.55]
      : ["coalesce", ["feature-state", "highlightPulse"], 1],
    ["==", ["feature-state", "secondTry"], true],
    on,
    ["==", ["feature-state", "filled"], true],
    on,
    [">", ["coalesce", ["feature-state", "highlightKind"], 0], 0],
    on,
    0,
  ];
}

function applySmallCountryCirclePaintMode(
  map,
  { forceShow, level, strokeColor, landColor, hideUntilFeedback = false }
) {
  if (!map.getLayer("small-country-circles")) return;

  if (forceShow && !hideUntilFeedback) {
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
  map.setPaintProperty("small-country-circles", "circle-stroke-width", CIRCLE_STROKE_WIDTH);
  map.setPaintProperty(
    "small-country-circles",
    "circle-stroke-color",
    getSmallCircleStrokeColorExpression(level, strokeColor, landColor)
  );
  // Keep highlight/target fill paint — replacing only stroke-opacity used to
  // wipe these and leave tiny countries as a plain white ring (e.g. Brunei).
  map.setPaintProperty("small-country-circles", "circle-color", [
    "case",
    ["==", ["feature-state", "highlight"], true],
    TARGET_HIGHLIGHT_COLOR,
    ["==", ["feature-state", "secondTry"], true],
    TARGET_HIGHLIGHT_COLOR,
    ["==", ["feature-state", "target"], true],
    TARGET_HIGHLIGHT_COLOR,
    ["==", ["feature-state", "filled"], true],
    ["coalesce", ["get", "assignedColor"], landColor],
    ["==", ["feature-state", "showColor"], true],
    ["coalesce", ["get", "assignedColor"], landColor],
    "transparent",
  ]);
  map.setPaintProperty("small-country-circles", "circle-opacity", [
    "case",
    ["==", ["feature-state", "highlight"], true],
    ["coalesce", ["feature-state", "highlightPulse"], 0.55],
    ["==", ["feature-state", "secondTry"], true],
    0.92,
    ["==", ["feature-state", "target"], true],
    0.85,
    ["==", ["feature-state", "filled"], true],
    0.92,
    ["==", ["feature-state", "showColor"], true],
    0.92,
    0,
  ]);
  map.setPaintProperty(
    "small-country-circles",
    "circle-stroke-opacity",
    hideUntilFeedback
      ? smallCircleFeedbackOnlyOpacity({ fill: false })
      : [
          "case",
          ["==", ["feature-state", "highlight"], true],
          ["coalesce", ["feature-state", "highlightPulse"], 1],
          ["coalesce", ["feature-state", "opacity"], 0],
        ]
  );
  if (hideUntilFeedback) {
    map.setPaintProperty(
      "small-country-circles",
      "circle-opacity",
      smallCircleFeedbackOnlyOpacity({ fill: true })
    );
  }
}

function isCircleClickTarget(map, circleFeature) {
  const id = circleFeature.properties.id;
  const state = map.getFeatureState({ source: "small-countries", id });
  return (state?.opacity ?? 0) > 0;
}

function getSmallCircleStrokeColorExpression(
  level,
  defaultStrokeColor,
  landColor,
  highlightColor = TARGET_HIGHLIGHT_COLOR
) {
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
      ["==", ["feature-state", "secondTry"], true],
      TARGET_HIGHLIGHT_COLOR,
      ["==", ["feature-state", "filled"], true],
      ["coalesce", ["get", "assignedColor"], landColor],
      ["==", ["feature-state", "showColor"], true],
      ["coalesce", ["get", "assignedColor"], landColor],
      defaultStrokeColor,
    ];
  } else {
    base = [
      "case",
      ["==", ["feature-state", "wrong"], true],
      WRONG_COUNTRY_COLOR,
      ["==", ["feature-state", "secondTry"], true],
      TARGET_HIGHLIGHT_COLOR,
      ["==", ["feature-state", "filled"], true],
      CORRECT_COUNTRY_COLOR,
      ["==", ["feature-state", "target"], true],
      TARGET_HIGHLIGHT_COLOR,
      defaultStrokeColor,
    ];
  }

  // A "highlight" (Learn "which country is highlighted") flashes the circle's
  // border so a circled small country is easy to spot without filling it.
  // Prompt tone = yellow; reveal/error tone = red.
  return [
    "case",
    ["==", ["feature-state", "highlight"], true],
    highlightColor,
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
        // Fill the marker when highlighted/targeted so tiny landmasses (Brunei,
        // etc.) stay obvious even when the polygon is only a few pixels.
        "circle-color": [
          "case",
          ["==", ["feature-state", "highlight"], true],
          TARGET_HIGHLIGHT_COLOR,
          ["==", ["feature-state", "secondTry"], true],
          TARGET_HIGHLIGHT_COLOR,
          ["==", ["feature-state", "target"], true],
          TARGET_HIGHLIGHT_COLOR,
          "transparent",
        ],
        "circle-opacity": [
          "case",
          ["==", ["feature-state", "highlight"], true],
          ["coalesce", ["feature-state", "highlightPulse"], 0.55],
          ["==", ["feature-state", "secondTry"], true],
          0.92,
          ["==", ["feature-state", "target"], true],
          0.85,
          0,
        ],
        "circle-stroke-color": getSmallCircleStrokeColorExpression(level, strokeColor, landColor),
        "circle-stroke-width": CIRCLE_STROKE_WIDTH,
        "circle-stroke-opacity": [
          "case",
          ["==", ["feature-state", "highlight"], true],
          ["coalesce", ["feature-state", "highlightPulse"], 1],
          ["coalesce", ["feature-state", "opacity"], 0],
        ],
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
    // Keep paint in sync when the layer already exists (hot reload / remount).
    if (map.getLayer("small-country-circles")) {
      map.setPaintProperty("small-country-circles", "circle-color", [
        "case",
        ["==", ["feature-state", "highlight"], true],
        TARGET_HIGHLIGHT_COLOR,
        ["==", ["feature-state", "secondTry"], true],
        TARGET_HIGHLIGHT_COLOR,
        ["==", ["feature-state", "target"], true],
        TARGET_HIGHLIGHT_COLOR,
        "transparent",
      ]);
      map.setPaintProperty("small-country-circles", "circle-opacity", [
        "case",
        ["==", ["feature-state", "highlight"], true],
        ["coalesce", ["feature-state", "highlightPulse"], 0.55],
        ["==", ["feature-state", "secondTry"], true],
        0.92,
        ["==", ["feature-state", "target"], true],
        0.85,
        0,
      ]);
      map.setPaintProperty("small-country-circles", "circle-stroke-opacity", [
        "case",
        ["==", ["feature-state", "highlight"], true],
        ["coalesce", ["feature-state", "highlightPulse"], 1],
        ["coalesce", ["feature-state", "opacity"], 0],
      ]);
    }
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

/** Extra zoom so a contain-fitted bbox covers the map stage (object-fit: cover). */
function applyCoverFit(map, geoBounds, { bleed = 1.08, maxExtraZoom = 3 } = {}) {
  if (typeof map.project !== "function" || typeof map.getZoom !== "function") {
    return;
  }
  const viewW = map.getContainer?.()?.clientWidth;
  const viewH = map.getContainer?.()?.clientHeight;
  if (!(viewW > 0 && viewH > 0)) return;

  const [[west, south], [east, north]] = geoBounds;
  const nw = map.project([west, north]);
  const se = map.project([east, south]);
  if (!nw || !se) return;
  const boundsW = Math.abs(se.x - nw.x);
  const boundsH = Math.abs(se.y - nw.y);
  if (!(boundsW > 1 && boundsH > 1)) return;

  const scale = Math.max(viewW / boundsW, viewH / boundsH) * bleed;
  if (!(scale > 1)) return;
  map.setZoom(map.getZoom() + Math.min(Math.log2(scale), maxExtraZoom));
}

function applyMapView(map, mapView, { onSettled } = {}) {
  if (!mapView) return;

  // Invalidate any earlier pending fit (e.g. a stale once("idle") from a
  // previous question). Without this, an old callback can snap the camera back.
  const token = (map.__mapViewApplyToken = (map.__mapViewApplyToken || 0) + 1);

  const runFit = () => {
    if (map.__mapViewApplyToken !== token || !map.getStyle()) return;

    // Cancel in-flight pan/zoom from a prior Learn teach step so fitBounds
    // isn't fighting an easeTo and leaving the camera mid-close-up.
    if (typeof map.stop === "function") {
      map.stop();
    }

    map.resize();

    // fitBounds/jumpTo can leave sticky global padding that compounds on the
    // next fit (e.g. after a zoomed-in learn teach step). Clear it first and
    // don't retain this call's padding as map state.
    if (typeof map.setPadding === "function") {
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    }

    const useGlobe = isShowingGlobe(map);
    if (useGlobe && typeof map.setPitch === "function") {
      map.setPitch(0);
    }

    const coverFit = mapView.fit === "cover";
    let coverBounds = null;

    if (mapView.type === "camera") {
      // jumpTo padding writes transform.padding, which on globe punches a
      // static hole through the atmosphere (mapbox-gl-js#12636).
      map.jumpTo({
        center: mapView.center,
        zoom: mapView.zoom + (Number(mapView.zoomDelta) || 0),
        ...(useGlobe ? { pitch: 0 } : { padding: coverFit ? 0 : (mapView.padding ?? 48) }),
        duration: 0,
        retainPadding: false,
      });
    } else {
      const bounds = mapView.bounds;
      const west = bounds?.[0]?.[0];
      const south = bounds?.[0]?.[1];
      const east = bounds?.[1]?.[0];
      const north = bounds?.[1]?.[1];
      if (
        !Number.isFinite(west) ||
        !Number.isFinite(south) ||
        !Number.isFinite(east) ||
        !Number.isFinite(north)
      ) {
        return;
      }
      const safeBounds = [
        [west, Math.max(-90, Math.min(90, south))],
        [east, Math.max(-90, Math.min(90, north))],
      ];
      try {
        map.fitBounds(safeBounds, {
          padding: coverFit ? 0 : (mapView.padding ?? 48),
          duration: 0,
          maxZoom: coverFit ? Math.max(mapView.maxZoom ?? 5, 8) : (mapView.maxZoom ?? 5),
          retainPadding: false,
          ...(useGlobe ? { pitch: 0 } : {}),
        });
        coverBounds = safeBounds;
      } catch (error) {
        console.warn("Mapbox fitBounds failed:", error);
        return;
      }
    }

    if (coverFit && coverBounds) {
      applyCoverFit(map, coverBounds);
    } else {
      const zoomDelta = Number(mapView.zoomDelta);
      if (
        mapView.type !== "camera" &&
        Number.isFinite(zoomDelta) &&
        zoomDelta !== 0 &&
        typeof map.getZoom === "function"
      ) {
        map.setZoom(map.getZoom() + zoomDelta);
      }
    }

    if (onSettled) {
      map.once("idle", () => {
        if (map.__mapViewApplyToken !== token) return;
        onSettled(map.getZoom());
      });
    }
  };

  // If the style is ready, fit immediately. Do NOT wait on map.loaded() — that
  // flips false while tiles load after a pan/zoom, so language→language (and
  // other navigable Learn pans) would silently skip the camera update.
  if (map.isStyleLoaded()) {
    runFit();
  } else {
    map.once("load", () => {
      if (map.__mapViewApplyToken !== token) return;
      runFit();
    });
  }
}

function isBasemapBoundaryLayer(layer) {
  const id = layer?.id ?? "";
  if (
    id.startsWith("country-") ||
    id.startsWith("inactive-") ||
    id.startsWith("small-") ||
    id.startsWith("learn-") ||
    id.startsWith("base-land")
  ) {
    return false;
  }
  return /admin|boundary|disputed/i.test(id);
}

function hideBasemapBoundaryLayers(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (!isBasemapBoundaryLayer(layer)) continue;
    if (!map.getLayer(layer.id)) continue;
    map.setLayoutProperty(layer.id, "visibility", "none");
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

    if (colors.ocean) {
      if (type === "background") {
        map.setPaintProperty(id, "background-color", colors.ocean);
      } else if (type === "fill" && id.includes("water")) {
        map.setPaintProperty(id, "fill-color", colors.ocean);
      }
    }
  }

  // Hide Mapbox admin-0/1/2 (+ disputed) lines. Custom GeoJSON borders are
  // the only outlines the game should ever show; style country boundaries
  // leak through country-fill (opacity 0.92) as faint grey seams when zoomed.
  hideBasemapBoundaryLayers(map);
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
    },
  };

  if (beforeId && map.getLayer(beforeId)) {
    map.addLayer(layer, beforeId);
  } else {
    map.addLayer(layer);
  }
}

const TERRITORY_BORDER_FILTER = ["==", ["get", "territory"], true];

function addInactiveCountryBorders(map, mapColors) {
  if (!map.getSource("inactive-countries")) {
    return;
  }

  // Other-region countries stay borderless so only the region in play reads as
  // countries. Territory scraps (Greenland, Puerto Rico, …) keep an outline so
  // they don't look like a hole in the map.
  if (map.getLayer("inactive-country-borders")) {
    map.setFilter("inactive-country-borders", TERRITORY_BORDER_FILTER);
    return;
  }

  const layer = {
    id: "inactive-country-borders",
    type: "line",
    source: "inactive-countries",
    filter: TERRITORY_BORDER_FILTER,
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
    if (map.getLayer("inactive-country-fill")) {
      map.setPaintProperty("inactive-country-fill", "fill-antialias", false);
    }
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
        // Adjacent other-region countries should merge into one landmass
        // instead of showing hairline borders between them.
        "fill-antialias": false,
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
      "fill-color": TARGET_HIGHLIGHT_COLOR,
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
      "line-opacity": 1,
    },
  });

  if (!map.getLayer("country-feedback-outline")) {
    map.addLayer({
      id: "country-feedback-outline",
      type: "line",
      source: "countries",
      paint: {
        "line-color": [
          "case",
          ["==", ["feature-state", "wrong"], true],
          WRONG_COUNTRY_COLOR,
          CORRECT_COUNTRY_COLOR,
        ],
        "line-width": 1.75,
        "line-opacity": 0,
      },
    });
  }
}

function syncSmallCountryFeatureStates(
  map,
  smallCountriesGeojson,
  {
    wrongCountryIds,
    flashWrongCountryIds,
    showColorCountryIds,
    filledCountryIds,
    secondTryCountryIds = [],
  }
) {
  if (!map.getSource("small-countries") || !smallCountriesGeojson?.features?.length) {
    return;
  }

  const wrongSet = new Set(wrongCountryIds);
  const flashWrongSet = new Set(flashWrongCountryIds);
  const showColorSet = new Set(showColorCountryIds);
  const filledSet = new Set(filledCountryIds);
  const secondTrySet = new Set(secondTryCountryIds);

  for (const feature of smallCountriesGeojson.features) {
    const id = feature.properties.id;
    map.setFeatureState(
      { source: "small-countries", id },
      {
        wrong: wrongSet.has(id),
        flashWrong: flashWrongSet.has(id),
        showColor: showColorSet.has(id),
        filled: filledSet.has(id),
        secondTry: secondTrySet.has(id),
      }
    );
  }
}

function syncCountryFeatureStates(
  map,
  geojson,
  {
    wrongCountryIds,
    flashWrongCountryIds,
    showColorCountryIds,
    filledCountryIds,
    secondTryCountryIds = [],
    highlightCountryId = null,
    highlightTone = "prompt",
  }
) {
  if (!map.getSource("countries") || !geojson?.features?.length) return;

  const wrongSet = new Set(wrongCountryIds);
  const flashWrongSet = new Set(flashWrongCountryIds);
  const showColorSet = new Set(showColorCountryIds);
  const filledSet = new Set(filledCountryIds);
  const secondTrySet = new Set(secondTryCountryIds);
  const highlightKind = highlightCountryId
    ? highlightKindFromTone(highlightTone)
    : 0;

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
        secondTry: secondTrySet.has(id),
        highlightKind: id === highlightCountryId ? highlightKind : 0,
      }
    );
  }
}

const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] };

function addLearnDistanceLayers(map) {
  if (map.getSource("learn-distance")) return;
  map.addSource("learn-distance", { type: "geojson", data: EMPTY_GEOJSON });
  map.addLayer({
    id: "learn-distance-line",
    type: "line",
    source: "learn-distance",
    filter: ["==", ["get", "kind"], "line"],
    paint: {
      "line-color": "#f8fafc",
      "line-width": 2,
      "line-dasharray": [2, 1.5],
      "line-opacity": 0.95,
    },
  });
  map.addLayer({
    id: "learn-distance-dot",
    type: "circle",
    source: "learn-distance",
    filter: ["==", ["get", "kind"], "from"],
    paint: {
      "circle-radius": 5,
      "circle-color": WRONG_COUNTRY_COLOR,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: "learn-distance-label",
    type: "symbol",
    source: "learn-distance",
    filter: ["==", ["get", "kind"], "label"],
    layout: {
      "text-field": ["get", "label"],
      "text-size": 13,
      "text-offset": [0, -1.15],
      "text-anchor": "bottom",
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#f8fafc",
      "text-halo-color": "#0f172a",
      "text-halo-width": 1.6,
    },
  });
}

function syncLearnDistanceOverlay(map, overlay) {
  const source = map.getSource("learn-distance");
  if (!source) return;
  if (!overlay?.from || !overlay?.to || overlay.correct) {
    source.setData(EMPTY_GEOJSON);
    return;
  }
  const from = [overlay.from.lng, overlay.from.lat];
  const to = [overlay.to.lng, overlay.to.lat];
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const features = [
    {
      type: "Feature",
      properties: { kind: "line" },
      geometry: { type: "LineString", coordinates: [from, to] },
    },
    {
      type: "Feature",
      properties: { kind: "label", label: overlay.label ?? "" },
      geometry: { type: "Point", coordinates: mid },
    },
  ];
  if (!overlay.hideFromMarker) {
    features.splice(1, 0, {
      type: "Feature",
      properties: { kind: "from" },
      geometry: { type: "Point", coordinates: from },
    });
  }
  source.setData({
    type: "FeatureCollection",
    features,
  });
}

function applyHideCountryBorders(map, hide, mapColors, circleOpts = {}) {
  const borderOpacity = hide ? 0 : 1;
  const borderVisibility = hide ? "none" : "visible";
  hideBasemapBoundaryLayers(map);
  if (map.getLayer("country-borders")) {
    map.setLayoutProperty("country-borders", "visibility", borderVisibility);
    map.setPaintProperty("country-borders", "line-opacity", borderOpacity);
  }
  if (map.getLayer("inactive-country-borders")) {
    map.setLayoutProperty("inactive-country-borders", "visibility", borderVisibility);
    map.setPaintProperty("inactive-country-borders", "line-opacity", hide ? 0 : 0.85);
  }
  if (map.getLayer("country-click-expand")) {
    map.setLayoutProperty("country-click-expand", "visibility", borderVisibility);
  }
  if (map.getLayer("country-target-outline")) {
    map.setLayoutProperty("country-target-outline", "visibility", borderVisibility);
  }
  // fill-outline-color strokes every polygon ring, including coasts, as broken
  // "border" segments in the ocean. Disable antialiasing so adjacent land
  // merges instead of drawing those hairlines.
  if (map.getLayer("country-fill")) {
    map.setPaintProperty("country-fill", "fill-antialias", !hide);
    map.setPaintProperty("country-fill", "fill-opacity", hide ? 1 : 0.92);
  }
  if (map.getLayer("inactive-country-fill")) {
    map.setPaintProperty("inactive-country-fill", "fill-antialias", false);
  }
  if (map.getLayer("base-land-fill")) {
    map.setPaintProperty("base-land-fill", "fill-antialias", !hide);
  }
  if (map.getLayer("country-feedback-outline")) {
    map.setPaintProperty("country-feedback-outline", "line-opacity", 0);
  }
  if (map.getLayer("small-country-circles")) {
    applySmallCountryCirclePaintMode(map, {
      forceShow: Boolean(circleOpts.forceShow),
      level: circleOpts.level,
      strokeColor: mapColors.smallCountryStroke,
      landColor: circleOpts.landColor,
      hideUntilFeedback: hide,
    });
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
  secondTryCountryIds = [],
  highlightTargetCountryId,
  highlightCountryId,
  // "prompt" = yellow (which-country-is-highlighted); "error" = red (find reveal).
  highlightTone = "prompt",
  flashSmallCountryId,
  mapView,
  forceShowSmallCountryCircles = false,
  /** Discover: allow clicks on out-of-region land (e.g. French Guiana in South America). */
  allowInactiveCountryClicks = false,
  /** Learn borderless map: hide country outlines until the answer reveal. */
  hideCountryBorders = false,
  /** Learn borderless map: a click on ocean / empty canvas still counts. */
  allowEmptyMapClicks = false,
  /** { from, to, label, correct } — miss line from click to nearest border. */
  distanceFeedback = null,
  onCountryClick,
  onCountryHover,
  onRegisterMapProject,
  onMapViewChange,
  onMapMove,
}) {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const referenceZoomRef = useRef(null);
  const fillFlashIntervalRef = useRef(null);
  const circleFlashIntervalRef = useRef(null);
  const targetFlashIntervalRef = useRef(null);
  const highlightSmallCircleIdRef = useRef(null);
  const highlightCountryIdRef = useRef(highlightCountryId);
  const highlightToneRef = useRef(highlightTone);
  const boardPaintRef = useRef({
    wrongCountryIds,
    flashWrongCountryIds,
    showColorCountryIds,
    filledCountryIds,
    secondTryCountryIds,
  });
  const expandCleanupRef = useRef(null);
  const onCountryClickRef = useRef(onCountryClick);
  const onCountryHoverRef = useRef(onCountryHover);
  const gameActiveRef = useRef(gameActive);
  const mapNavigationEnabledRef = useRef(mapNavigationEnabled);
  const smallCountriesGeojsonRef = useRef(smallCountriesGeojson);
  const geojsonRef = useRef(geojson);
  const forceShowSmallCountryCirclesRef = useRef(forceShowSmallCountryCircles);
  const allowInactiveCountryClicksRef = useRef(allowInactiveCountryClicks);
  const hideCountryBordersRef = useRef(hideCountryBorders);
  const allowEmptyMapClicksRef = useRef(allowEmptyMapClicks);
  const distanceFeedbackRef = useRef(distanceFeedback);

  onCountryClickRef.current = onCountryClick;
  onCountryHoverRef.current = onCountryHover;
  gameActiveRef.current = gameActive;
  mapNavigationEnabledRef.current = mapNavigationEnabled;
  smallCountriesGeojsonRef.current = smallCountriesGeojson;
  geojsonRef.current = geojson;
  forceShowSmallCountryCirclesRef.current = forceShowSmallCountryCircles;
  allowInactiveCountryClicksRef.current = allowInactiveCountryClicks;
  hideCountryBordersRef.current = hideCountryBorders;
  allowEmptyMapClicksRef.current = allowEmptyMapClicks;
  distanceFeedbackRef.current = distanceFeedback;
  highlightCountryIdRef.current = highlightCountryId;
  highlightToneRef.current = highlightTone;
  boardPaintRef.current = {
    wrongCountryIds,
    flashWrongCountryIds,
    showColorCountryIds,
    filledCountryIds,
    secondTryCountryIds,
  };

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
      ...(useGlobe ? { pitch: 0, maxPitch: 0 } : {}),
    });
    if (useGlobe) setGlobeHorizonShift(map, true);

    if (!useGlobe) {
      map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    }
    mapRef.current = map;

    const handleClick = (event) => {
      if (!gameActiveRef.current) return;

      const lngLat = event.lngLat
        ? { lng: event.lngLat.lng, lat: event.lngLat.lat }
        : null;

      const layers = [];
      if (map.getLayer("country-fill")) layers.push("country-fill");
      if (
        map.getLayer("small-country-circles") &&
        !hideCountryBordersRef.current
      ) {
        layers.push("small-country-circles");
      }
      if (
        allowInactiveCountryClicksRef.current &&
        map.getLayer("inactive-country-fill")
      ) {
        layers.push("inactive-country-fill");
      }
      if (layers.length === 0) {
        if (allowEmptyMapClicksRef.current) {
          onCountryClickRef.current?.(null, { lngLat, empty: true, inactive: false });
        }
        return;
      }

      const features = map.queryRenderedFeatures(event.point, { layers });
      if (features.length === 0) {
        if (allowEmptyMapClicksRef.current) {
          onCountryClickRef.current?.(null, { lngLat, empty: true, inactive: false });
        }
        return;
      }

      const feature = pickClickedFeature(map, features);
      const countryId = feature.properties?.id ?? feature.id;
      const isInactive = feature.layer?.id === "inactive-country-fill";

      if (
        !isInactive &&
        !hideCountryBordersRef.current &&
        getCountryClickExpandEnabled() &&
        countryId
      ) {
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

      onCountryClickRef.current?.(feature, {
        lngLat,
        layerId: feature.layer?.id ?? null,
        inactive: isInactive,
      });
    };

    const setCirclePointerCursor = (event) => {
      if (hideCountryBordersRef.current) return;
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
        hideUntilFeedback: hideCountryBordersRef.current,
      });
      applyHideCountryBorders(map, hideCountryBordersRef.current, mapColors, {
        forceShow: forceShowSmallCountryCirclesRef.current,
        level,
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
      const highlightId = highlightSmallCircleIdRef.current;
      if (highlightId && map.getSource("small-countries")) {
        map.setFeatureState(
          { source: "small-countries", id: highlightId },
          { highlight: true, highlightPulse: 1 }
        );
      }
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
      addLearnDistanceLayers(map);
      applyHideCountryBorders(map, hideCountryBordersRef.current, mapColors, {
        forceShow: forceShowSmallCountryCirclesRef.current,
        level,
        landColor,
      });

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
          hideUntilFeedback: hideCountryBordersRef.current,
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
    }

    if (map.getLayer("inactive-country-borders")) {
      map.setPaintProperty("inactive-country-borders", "line-color", mapColors.levelBorder);
    }

    if (map.getLayer("country-fill")) {
      map.setPaintProperty("country-fill", "fill-color", getLevelFillColorExpression(level, landColor));
      map.setPaintProperty("country-borders", "line-color", mapColors.levelBorder);
    }

    // setData clears feature-state — restore Learn yellow (and other paints) now.
    const highlightId = highlightCountryIdRef.current;
    syncCountryFeatureStates(map, geojson, {
      ...boardPaintRef.current,
      highlightCountryId: highlightId,
      highlightTone: highlightToneRef.current,
    });
    if (highlightId && map.getLayer("country-highlight")) {
      map.setFilter("country-highlight", ["==", ["get", "id"], highlightId]);
    }

    if (map.getLayer("small-country-circles")) {
      applySmallCountryCirclePaintMode(map, {
        forceShow: forceShowSmallCountryCircles,
        level,
        strokeColor: mapColors.smallCountryStroke,
        landColor,
        hideUntilFeedback: hideCountryBordersRef.current,
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

    applySmallCountryCirclePaintMode(map, {
      forceShow: forceShowSmallCountryCircles,
      level,
      strokeColor: mapColors.smallCountryStroke,
      landColor,
      hideUntilFeedback: hideCountryBordersRef.current,
    });
    updateSmallCountryCircles(map, smallCountriesGeojson, {
      forceShow: forceShowSmallCountryCircles,
    });
    addLearnDistanceLayers(map);
    syncLearnDistanceOverlay(map, distanceFeedbackRef.current);
    applyHideCountryBorders(map, hideCountryBordersRef.current, mapColors, {
      forceShow: forceShowSmallCountryCircles,
      level,
      landColor,
    });
  }, [geojson, inactiveGeojson, baseLandGeojson, smallCountriesGeojson, theme, level, forceShowSmallCountryCircles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mapColors = getMapThemeColors(theme);
    const apply = () => {
      if (!map.getStyle?.()) return;
      applyHideCountryBorders(map, hideCountryBorders, mapColors, {
        forceShow: forceShowSmallCountryCircles,
        level,
        landColor: getActiveLandColor(theme),
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
    return () => {
      map.off("idle", apply);
    };
  }, [hideCountryBorders, theme, level, forceShowSmallCountryCircles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const apply = () => {
      if (!map.getStyle?.()) return;
      addLearnDistanceLayers(map);
      syncLearnDistanceOverlay(map, distanceFeedback);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
    return () => {
      map.off("idle", apply);
      try {
        if (!map.getStyle?.()) return;
        const source = map.getSource?.("learn-distance");
        if (source) source.setData(EMPTY_GEOJSON);
      } catch {
        // Map already torn down (React Strict Mode remount / unmount).
      }
    };
  }, [distanceFeedback]);

  // Camera-only updates: never setData here — GeoJSON setData clears feature-state
  // and was wiping the yellow small-country highlight on language-question pans.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !mapView) return;

    applyMapView(map, mapView, {
      onSettled: (zoom) => {
        referenceZoomRef.current = zoom;
        onMapViewChange?.();
        updateSmallCountryCircles(map, smallCountriesGeojsonRef.current, {
          forceShow: forceShowSmallCountryCirclesRef.current,
        });
        // Camera moves must not leave Learn paints blank — re-sync subject
        // highlight and neighbor fills (setData/fit can drop feature-state).
        const paint = boardPaintRef.current;
        const highlightId = highlightCountryIdRef.current;
        const countriesData = geojsonRef.current;
        if (countriesData && map.getSource("countries")) {
          syncCountryFeatureStates(map, countriesData, {
            ...paint,
            highlightCountryId: highlightId,
            highlightTone: highlightToneRef.current,
          });
        }
        const smallData = smallCountriesGeojsonRef.current;
        if (smallData && map.getSource("small-countries")) {
          syncSmallCountryFeatureStates(map, smallData, paint);
        }
        if (highlightId && map.getLayer("country-highlight")) {
          map.setFilter("country-highlight", ["==", ["get", "id"], highlightId]);
        }
        if (highlightId && map.getSource("small-countries")) {
          map.setFeatureState(
            { source: "small-countries", id: highlightId },
            { highlight: true, highlightPulse: 1 }
          );
        }
      },
    });
  }, [mapView, onMapViewChange]);

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
        hideUntilFeedback: hideCountryBordersRef.current,
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
        secondTryCountryIds,
        highlightCountryId,
        highlightTone,
      });
      syncSmallCountryFeatureStates(map, smallCountriesGeojson, {
        wrongCountryIds,
        flashWrongCountryIds,
        showColorCountryIds,
        filledCountryIds,
        secondTryCountryIds,
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
    secondTryCountryIds,
    highlightCountryId,
    highlightTone,
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

    // Circle-marker reveal owns the red landmass+circle pulse — don't fight it
    // with the yellow prompt highlight flash on the same country.
    const circleRevealOwnsFlash =
      Boolean(flashSmallCountryId) && flashSmallCountryId === highlightCountryId;

    const highlightColor =
      highlightTone === "error"
        ? WRONG_COUNTRY_COLOR
        : highlightTone === "success"
          ? SUBJECT_COUNTRY_COLOR
          : highlightTone === "correct"
            ? CORRECT_COUNTRY_COLOR
            : TARGET_HIGHLIGHT_COLOR;
    const mapColors = getMapThemeColors(theme);
    const landColor = getActiveLandColor(theme);
    // Solid subject fill for post-wrong neighbor teaching / area-compare winner;
    // yellow/red prompts still flash.
    const shouldFlash =
      highlightTone !== "success" &&
      highlightTone !== "correct" &&
      !circleRevealOwnsFlash;

    if (!circleRevealOwnsFlash) {
      map.setPaintProperty("country-highlight", "fill-color", highlightColor);
      map.setPaintProperty(
        "country-highlight",
        "fill-opacity",
        shouldFlash ? 0.75 : 0.95
      );
    }
    if (map.getLayer("small-country-circles") && !forceShowSmallCountryCircles) {
      map.setPaintProperty(
        "small-country-circles",
        "circle-stroke-color",
        getSmallCircleStrokeColorExpression(
          level,
          mapColors.smallCountryStroke,
          landColor,
          circleRevealOwnsFlash ? WRONG_COUNTRY_COLOR : highlightColor
        )
      );
    }

    // Mirror the highlight onto the small-country circle marker (if the target
    // is a small country) so a circled country is easy to spot — fill + stroke,
    // not just a thin rim that disappears between flash frames.
    // Always read mapRef: cleanup/interval can run after the map is torn down
    // (e.g. Learn mid-session question rebuild), when the closed-over `map` is stale.
    const setSmallCircleHighlight = (id, on, pulse = 1) => {
      const activeMap = mapRef.current;
      if (!id || !activeMap?.getSource?.("small-countries")) return;
      try {
        activeMap.setFeatureState(
          { source: "small-countries", id },
          on
            ? { highlight: true, highlightPulse: pulse }
            : { highlight: false, highlightPulse: 0 }
        );
      } catch {
        // Map removed mid-update — ignore.
      }
    };
    const isSmallCountryHighlight = Boolean(
      highlightCountryId &&
        smallCountriesGeojson?.features?.some(
          (feature) => feature.properties?.id === highlightCountryId
        )
    );
    // Larger pulsing ring (same layer as wrong-answer flash) so tiny landmasses
    // stay obvious at regional language-question zoom.
    const paintSmallHighlightRing = (visible) => {
      const activeMap = mapRef.current;
      if (
        !activeMap?.getLayer?.("small-country-flash") ||
        !isSmallCountryHighlight ||
        flashSmallCountryId
      ) {
        return;
      }
      try {
        activeMap.setFilter("small-country-flash", [
          "==",
          ["get", "id"],
          highlightCountryId,
        ]);
        activeMap.setPaintProperty(
          "small-country-flash",
          "circle-color",
          highlightColor
        );
        activeMap.setPaintProperty(
          "small-country-flash",
          "circle-stroke-color",
          highlightColor
        );
        activeMap.setPaintProperty(
          "small-country-flash",
          "circle-opacity",
          visible ? 0.42 : 0.1
        );
        activeMap.setPaintProperty(
          "small-country-flash",
          "circle-stroke-opacity",
          visible ? 1 : 0.35
        );
      } catch {
        // Map removed mid-update — ignore.
      }
    };
    const clearSmallHighlightRing = () => {
      const activeMap = mapRef.current;
      if (flashSmallCountryId || !activeMap?.getLayer?.("small-country-flash")) {
        return;
      }
      try {
        activeMap.setFilter("small-country-flash", ["==", ["get", "id"], ""]);
      } catch {
        // Map removed mid-update — ignore.
      }
    };
    if (highlightSmallCircleIdRef.current !== highlightCountryId) {
      setSmallCircleHighlight(highlightSmallCircleIdRef.current, false);
      highlightSmallCircleIdRef.current = highlightCountryId ?? null;
    }

    // Clear any stale circle highlights (e.g. prior language subjects) so they
    // don't linger as white dots after the highlighted country changes.
    if (smallCountriesGeojson?.features?.length && map.getSource("small-countries")) {
      for (const feature of smallCountriesGeojson.features) {
        const id = feature.properties?.id;
        if (!id || id === highlightCountryId) continue;
        map.setFeatureState(
          { source: "small-countries", id },
          { highlight: false, highlightPulse: 0 }
        );
      }
    }

    if (!highlightCountryId) {
      if (!flashSmallCountryId) {
        map.setFilter("country-highlight", ["==", ["get", "id"], ""]);
      }
      if (map.getLayer("country-target-outline")) {
        map.setFilter("country-target-outline", ["==", ["get", "id"], ""]);
      }
      clearSmallHighlightRing();
      return;
    }

    if (!circleRevealOwnsFlash) {
      map.setFilter("country-highlight", [
        "==",
        ["get", "id"],
        highlightCountryId,
      ]);
    }

    // Keep circle fill color in sync with prompt/error/success/correct tones.
    if (map.getLayer("small-country-circles")) {
      map.setPaintProperty("small-country-circles", "circle-color", [
        "case",
        ["==", ["feature-state", "highlight"], true],
        highlightColor,
        ["==", ["feature-state", "secondTry"], true],
        TARGET_HIGHLIGHT_COLOR,
        ["==", ["feature-state", "target"], true],
        TARGET_HIGHLIGHT_COLOR,
        "transparent",
      ]);
      const hideCircles = hideCountryBordersRef.current;
      map.setPaintProperty(
        "small-country-circles",
        "circle-opacity",
        hideCircles
          ? smallCircleFeedbackOnlyOpacity({ fill: true })
          : [
              "case",
              ["==", ["feature-state", "highlight"], true],
              ["coalesce", ["feature-state", "highlightPulse"], 0.55],
              ["==", ["feature-state", "secondTry"], true],
              0.92,
              ["==", ["feature-state", "target"], true],
              0.85,
              0,
            ]
      );
      map.setPaintProperty(
        "small-country-circles",
        "circle-stroke-opacity",
        hideCircles
          ? smallCircleFeedbackOnlyOpacity({ fill: false })
          : [
              "case",
              ["==", ["feature-state", "highlight"], true],
              ["coalesce", ["feature-state", "highlightPulse"], 1],
              ["coalesce", ["feature-state", "opacity"], 0],
            ]
      );
    }

    applyHideCountryBorders(map, hideCountryBordersRef.current, mapColors, {
      forceShow: forceShowSmallCountryCircles,
      level,
      landColor,
    });

    // Outline the subject country. White fill uses a dark edge so it stays
    // defined against ocean/neighbors. While the fill is flashing (yellow/red
    // prompts), drop the rim so it doesn't sit as a static border on top.
    if (map.getLayer("country-target-outline")) {
      if (shouldFlash) {
        map.setFilter("country-target-outline", ["==", ["get", "id"], ""]);
      } else {
        map.setFilter("country-target-outline", [
          "==",
          ["get", "id"],
          highlightCountryId,
        ]);
        map.setPaintProperty(
          "country-target-outline",
          "line-color",
          highlightTone === "success" ? SUBJECT_COUNTRY_OUTLINE : mapColors.levelBorder
        );
        map.setPaintProperty(
          "country-target-outline",
          "line-width",
          highlightTone === "success" ? 2 : 3
        );
        map.setPaintProperty("country-target-outline", "line-opacity", 1);
        // Draw above the thin country borders so the outline reads clearly.
        if (map.getLayer("country-borders")) {
          map.moveLayer("country-target-outline");
        }
      }
    }

    setSmallCircleHighlight(highlightCountryId, true, 1);
    paintSmallHighlightRing(true);

    const clearCountryHighlightFilter = () => {
      if (!map.getLayer("country-highlight")) return;
      // Don't steal the layer from an active wrong-answer circle flash.
      if (flashSmallCountryId) return;
      map.setFilter("country-highlight", ["==", ["get", "id"], ""]);
      if (map.getLayer("country-target-outline")) {
        map.setFilter("country-target-outline", ["==", ["get", "id"], ""]);
      }
    };

    if (!shouldFlash) {
      return () => {
        setSmallCircleHighlight(highlightCountryId, false);
        clearSmallHighlightRing();
        // Only blank the layer when nothing should stay highlighted. Clearing on
        // every tone/geojson identity change raced with camera settles and left
        // language prompts (Israel, Georgia, …) with no yellow fill.
        if (!highlightCountryIdRef.current) {
          clearCountryHighlightFilter();
        }
      };
    }

    let visible = true;
    fillFlashIntervalRef.current = setInterval(() => {
      const activeMap = mapRef.current;
      if (!activeMap?.getLayer?.("country-highlight")) return;
      visible = !visible;
      try {
        activeMap.setPaintProperty(
          "country-highlight",
          "fill-opacity",
          visible ? 0.75 : 0.15
        );
      } catch {
        return;
      }
      // Keep highlight=true and pulse opacity — toggling highlight off made
      // tiny circled countries (e.g. Brunei) look unhighlighted (white ring).
      setSmallCircleHighlight(highlightCountryId, true, visible ? 1 : 0.3);
      paintSmallHighlightRing(visible);
    }, 450);

    return () => {
      if (fillFlashIntervalRef.current) {
        clearInterval(fillFlashIntervalRef.current);
        fillFlashIntervalRef.current = null;
      }
      setSmallCircleHighlight(highlightCountryId, false);
      clearSmallHighlightRing();
      if (!highlightCountryIdRef.current) {
        clearCountryHighlightFilter();
      }
    };
  }, [
    highlightCountryId,
    highlightTone,
    forceShowSmallCountryCircles,
    level,
    theme,
    flashSmallCountryId,
    smallCountriesGeojson,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("small-country-flash")) return;

    if (circleFlashIntervalRef.current) {
      clearInterval(circleFlashIntervalRef.current);
      circleFlashIntervalRef.current = null;
    }

    if (!flashSmallCountryId) {
      // Prompt highlights (language questions, etc.) own this layer for tiny
      // countries — don't clear their yellow ring when wrong-flash is idle.
      return;
    }

    map.setFilter("small-country-flash", [
      "==",
      ["get", "id"],
      flashSmallCountryId,
    ]);
    map.setPaintProperty("small-country-flash", "circle-color", WRONG_COUNTRY_COLOR);
    map.setPaintProperty(
      "small-country-flash",
      "circle-stroke-color",
      WRONG_COUNTRY_COLOR
    );

    // Pulse the real country polygon with the circle so the landmass is
    // visible even when the click-target circle is drawn on top.
    if (map.getLayer("country-highlight")) {
      map.setFilter("country-highlight", [
        "==",
        ["get", "id"],
        flashSmallCountryId,
      ]);
      map.setPaintProperty("country-highlight", "fill-color", WRONG_COUNTRY_COLOR);
    }

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
      if (mapRef.current.getLayer("country-highlight")) {
        mapRef.current.setPaintProperty(
          "country-highlight",
          "fill-opacity",
          visible ? 0.75 : 0.15
        );
      }
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
      if (map.getLayer("small-country-flash")) {
        map.setFilter("small-country-flash", ["==", ["get", "id"], ""]);
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
        // Globe projects far-side coords into the canvas; reject them so labels
        // disappear when a country rotates behind the horizon.
        if (isLngLatBehindGlobe(map, lng, lat)) return null;

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
        projectBoundsClient(country) {
          const projectToClient = (lng, lat) => {
            if (isLngLatBehindGlobe(map, lng, lat)) return null;
            const point = map.project([lng, lat]);
            const mapRect = container.getBoundingClientRect();
            return {
              x: point.x + mapRect.left,
              y: point.y + mapRect.top,
            };
          };
          const bounds = getCountryFillScreenBounds(country, projectToClient);
          if (!bounds) return null;
          const width = bounds.right - bounds.left;
          const height = bounds.bottom - bounds.top;
          if (!(width > 2) || !(height > 2)) return null;
          return {
            left: bounds.left,
            top: bounds.top,
            width,
            height,
          };
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
        unprojectClient(clientX, clientY) {
          const rect = container.getBoundingClientRect();
          const point = map.unproject([clientX - rect.left, clientY - rect.top]);
          if (!point || !Number.isFinite(point.lng) || !Number.isFinite(point.lat)) {
            return null;
          }
          return { lng: point.lng, lat: point.lat };
        },
      });
    };

    // Continuous pan/zoom: cheap label follow (no parent React tree update).
    const handleMove = () => {
      onMapMove?.();
    };
    // Settled view: full label collision layout + scale refresh.
    const handleViewSettled = () => {
      onMapViewChange?.();
    };

    const setup = () => {
      register();
      map.on("move", handleMove);
      map.on("moveend", handleViewSettled);
      map.on("zoomend", handleViewSettled);
      map.on("resize", handleViewSettled);
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("load", setup);
    }

    return () => {
      map.off("load", setup);
      map.off("move", handleMove);
      map.off("moveend", handleViewSettled);
      map.off("zoomend", handleViewSettled);
      map.off("resize", handleViewSettled);
      onRegisterMapProject(null);
    };
  }, [geojson, onRegisterMapProject, onMapViewChange, onMapMove]);

  return (
    <div
      ref={containerRef}
      className={cn(
        mapContainer,
        !mapNavigationEnabled && "[&_.mapboxgl-ctrl-bottom-right]:hidden"
      )}
    />
  );
}
